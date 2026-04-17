// ============================================================
// Anomalies.js — Módulos de análise pós-conciliação
//
// Responsabilidade: analisar o Session após as etapas A/B/C
// e identificar padrões suspeitos ou inconsistências.
//
// Cada análise é um método independente que:
//   - Lê AppState.session
//   - Produz um relatório estruturado
//   - Exibe via UIController.showModal
//
// Não altera o Session — apenas lê e reporta.
// ============================================================

const Anomalies = {

    // ----------------------------------------------------------
    // Omissões com passageiros
    //
    // Identifica viagens marcadas como omissão no GPS que
    // possivelmente ocorreram — detectadas por passageiros
    // que deveriam pertencer a elas.
    //
    // Usa o campo "tabela" para inferir o veículo da omissão
    // (omissões não têm carro no GPS — só horário planejado).
    // ----------------------------------------------------------
    checkOmissoes() {
        const session = AppState.session;
        if (!session) return alert("Nenhum dado processado.");

        const cfg      = APP_CONFIG.anomalies.omissoesComPax;
        const pesos    = cfg.pesos;
        const conciliadas = new Set(session.empresasConciliadas || []);
        const orphaos  = session.passageiros.filter(p =>
            !p.assigned && (conciliadas.size === 0 || conciliadas.has(p.empresa))
        );

        // Indexa órfãos por veículo para cálculo de densidade
        const orphaosPorVeiculo = {};
        for (const p of orphaos) {
            (orphaosPorVeiculo[p.veiculo] = orphaosPorVeiculo[p.veiculo] || []).push(p);
        }

        // Viagens produtivas no escopo — usadas para inferir veículo por proximidade
        const produtivas = session.viagens.filter(v =>
            !v.isOmissao && (conciliadas.size === 0 || conciliadas.has(v.empresa))
        );

        const omissoes = session.viagens.filter(v =>
            v.isOmissao && (conciliadas.size === 0 || conciliadas.has(v.empresa))
        );
        const suspeitos = [];

        for (const omissao of omissoes) {
            // Passageiros na janela de auditoria ao redor do horário planejado
            const mPlanejado = this._toMin(omissao.partidaPlanejada);
            const janela     = cfg.janelaAuditoriaMin;

            const paxNaJanela = orphaos.filter(p => {
                const delta = Math.abs(p.mHorario - mPlanejado);
                return delta <= janela;
            });

            if (paxNaJanela.length < cfg.minPassageirosSuspeitos) continue;

            // Viagens vizinhas da mesma tabela — ordenadas por horário
            const vizinhas = produtivas
                .filter(v => v.tabela === omissao.tabela)
                .sort((a, b) => a.mInicio - b.mInicio);
            const anterior = vizinhas.filter(v => v.mFim   <= mPlanejado).pop();
            const proxima  = vizinhas.find(v  => v.mInicio >= mPlanejado);

            // Inferência de veículo: usa viagens VIZINHAS à omissão (por proximidade temporal),
            // não um mapa global tabela→veículo que pode trazer veículos de outros turnos
            const veiculoInferido = anterior?.veiculo || proxima?.veiculo || null;

            // --- Cálculo de pontuação ---
            let score = 0;
            const criterios = [];

            // Carro planejado da omissão bate com carro dos passageiros
            if (veiculoInferido) {
                const paxDoCarro = paxNaJanela.filter(p => p.veiculo === veiculoInferido);
                if (paxDoCarro.length > 0) {
                    score += pesos.matchVeiculo;
                    criterios.push({ label: `Veículo ${veiculoInferido} identificado nos passageiros`, pts: pesos.matchVeiculo });
                }
            }

            // Linha planejada bate com linha dos passageiros
            const paxDaLinha = paxNaJanela.filter(p => p.linha === omissao.linha_base);
            if (paxDaLinha.length > 0) {
                score += pesos.matchLinha;
                criterios.push({ label: `Linha ${omissao.linha_base} compatível (${paxDaLinha.length} pax)`, pts: pesos.matchLinha });
            }

            // Omissão está entre duas viagens produtivas da mesma tabela
            if (anterior && proxima) {
                score += pesos.gapEntreViagens;
                criterios.push({ label: `Entre viagens produtivas da tabela ${omissao.tabela} (${anterior.partidaReal || anterior.partidaPlanejada} → ${proxima.partidaReal || proxima.partidaPlanejada})`, pts: pesos.gapEntreViagens });
            }

            // Densidade: % dos órfãos do veículo concentrada nesta janela
            if (veiculoInferido) {
                const totalOrfaosVeiculo = (orphaosPorVeiculo[veiculoInferido] || []).length;
                if (totalOrfaosVeiculo > 0) {
                    const paxDoCarro = paxNaJanela.filter(p => p.veiculo === veiculoInferido);
                    const perc = (paxDoCarro.length / totalOrfaosVeiculo) * 100;
                    if (perc >= cfg.densidadePercentualMinimo) {
                        score += pesos.densidadeAlta;
                        criterios.push({ label: `${Math.round(perc)}% dos órfãos do veículo ${veiculoInferido} concentrados nesta janela`, pts: pesos.densidadeAlta });
                    }
                }
            }

            // Passageiros na borda da janela (foraTolerancia)
            const paxNaBorda = paxNaJanela.filter(p => {
                const delta = Math.abs(p.mHorario - mPlanejado);
                return delta > (janela * 0.7); // últimos 30% da janela = "borda"
            });
            if (paxNaBorda.length > 0) {
                score += pesos.foraTolerancia;
                criterios.push({ label: `${paxNaBorda.length} passageiro(s) detectados na borda da janela de auditoria`, pts: pesos.foraTolerancia });
            }

            if (score < cfg.pontuacaoMinima) continue;

            // Classifica nível de suspeita
            let nivel = "baixo";
            if (score >= cfg.thresholds.alto)  nivel = "alto";
            else if (score >= cfg.thresholds.medio) nivel = "medio";

            suspeitos.push({
                omissao,
                veiculoInferido,
                paxNaJanela,
                score,
                nivel,
                mPlanejado,
                criterios
            });
        }

        // Ordena por pontuação decrescente
        suspeitos.sort((a, b) => b.score - a.score);

        this._renderOmissoes(suspeitos);
    },


    // ----------------------------------------------------------
    // Viagens editadas sem passageiros
    //
    // Viagens com viagemEditada = "Sim" que não receberam nenhum
    // passageiro após a conciliação — podem indicar edições indevidas.
    // ----------------------------------------------------------
    checkEditadas() {
        const session = AppState.session;
        if (!session) return alert("Nenhum dado processado.");

        const conciliadas = new Set(session.empresasConciliadas || []);
        const editadasSemPax = session.viagens.filter(v =>
            v.isEditada && v.paxEfetivos.length === 0 &&
            (conciliadas.size === 0 || conciliadas.has(v.empresa))
        );

        if (editadasSemPax.length === 0) {
            return UIController.showModal(
                "Editadas sem passageiros",
                "<p>Nenhuma viagem editada sem passageiros encontrada.</p>"
            );
        }

        const linhas = editadasSemPax.map(v => `
            <tr>
                <td>${v.empresa}</td>
                <td>${v.linha}</td>
                <td>${v.veiculo || "—"}</td>
                <td>${v.partidaReal || v.partidaPlanejada}</td>
                <td>${v.chegadaReal  || v.chegadaPlanejada}</td>
                <td>
                    <button onclick="UIController.autoFillAudit('${v.veiculo}', '${v.id}')"
                        style="font-size:0.75rem; padding:3px 10px; cursor:pointer;">
                        Investigar
                    </button>
                </td>
            </tr>
        `).join("");

        UIController.showModal(
            `Editadas sem passageiros (${editadasSemPax.length})`,
            `<table style="width:100%; font-size:0.85rem; border-collapse:collapse;">
                <thead>
                    <tr style="text-align:left; border-bottom:1px solid var(--border);">
                        <th>Empresa</th><th>Linha</th><th>Veículo</th>
                        <th>Partida</th><th>Chegada</th><th></th>
                    </tr>
                </thead>
                <tbody>${linhas}</tbody>
            </table>`
        );
    },


    // ----------------------------------------------------------
    // Gerenciar omissões
    // Lista todas as omissões com status de tratamento
    // ----------------------------------------------------------
    gerenciarOmissoes() {
        const session = AppState.session;
        if (!session) return alert("Nenhum dado processado.");

        const conciliadas = new Set(session.empresasConciliadas || []);
        const omissoes = session.viagens.filter(v =>
            (v.isOmissao || v.convertidaDeOmissao) &&
            (conciliadas.size === 0 || conciliadas.has(v.empresa))
        );

        if (omissoes.length === 0) {
            return UIController.showModal(
                "Gerenciar omissões",
                "<p>Nenhuma omissão encontrada nos dados.</p>"
            );
        }

        const linhas = omissoes.map(v => {
            const status = v.convertidaDeOmissao
                ? `<span style="color:var(--success)">Convertida</span>`
                : `<span style="color:var(--warning)">Pendente</span>`;

            return `
                <tr>
                    <td>${v.empresa}</td>
                    <td>${v.linha_base}</td>
                    <td>${v.tabela || "—"}</td>
                    <td>${v.partidaPlanejada}</td>
                    <td>${v.chegadaPlanejada}</td>
                    <td>${v.paxEfetivos.length}</td>
                    <td>${status}</td>
                </tr>
            `;
        }).join("");

        UIController.showModal(
            `Omissões (${omissoes.length})`,
            `<table style="width:100%; font-size:0.85rem; border-collapse:collapse;">
                <thead>
                    <tr style="text-align:left; border-bottom:1px solid var(--border);">
                        <th>Empresa</th><th>Linha</th><th>Tabela</th>
                        <th>Partida Pl.</th><th>Chegada Pl.</th><th>Pax</th><th>Status</th>
                    </tr>
                </thead>
                <tbody>${linhas}</tbody>
            </table>`
        );
    },


    // ----------------------------------------------------------
    // Render interno — relatório de omissões suspeitas
    // ----------------------------------------------------------
    _renderOmissoes(suspeitos) {
        if (suspeitos.length === 0) {
            return UIController.showModal(
                "Omissões com passageiros",
                "<p>Nenhuma omissão suspeita identificada.</p>"
            );
        }

        const corNivel = { alto: "var(--danger)", medio: "var(--warning)", baixo: "var(--text-muted)" };

        const blocos = suspeitos.map(s => {
            const cor   = corNivel[s.nivel];
            const label = s.nivel.charAt(0).toUpperCase() + s.nivel.slice(1);

            const badgesCriterios = s.criterios.map(c => `
                <span style="display:inline-flex; align-items:center; justify-content: space-between; gap:5px;
                             background:var(--bg-4); border:1px solid var(--border);
                             border-radius:4px; padding:3px 8px; font-size:0.76rem;
                             color:var(--text-muted); white-space:nowrap;width: 100%;">
                    ${c.label}
                    <span style="font-weight:600; color:${cor};">+${c.pts}</span>
                </span>
            `).join("");

            return `
                <div style="border:1px solid var(--border); border-radius:6px;
                            padding:14px; margin-bottom:12px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;
                                margin-bottom:6px;">
                        <strong>${s.omissao.linha} — ${s.omissao.partidaPlanejada}
                            às ${s.omissao.chegadaPlanejada}</strong>
                        <span style="color:${cor}; font-weight:bold; font-size:0.8rem;">
                            ${label} (${s.score} pts)
                        </span>
                    </div>
                    <div style="font-size:0.82rem; color:var(--text-muted); margin-bottom:10px;">
                        Veículo inferido: <strong>${s.veiculoInferido || "não identificado"}</strong>
                        &nbsp;|&nbsp;
                        Passageiros na janela: <strong>${s.paxNaJanela.length}</strong>
                    </div>
                    <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px;">
                        ${badgesCriterios}
                    </div>
                    <button onclick="UIController.autoFillAudit('${s.veiculoInferido}', '${s.omissao.id}')"
                        class="btn btn-success">
                        Investigar
                    </button>
                </div>
            `;
        }).join("");

        UIController.showModal(
            `Omissões suspeitas (${suspeitos.length})`,
            blocos
        );
    },


    // ----------------------------------------------------------
    // Auxiliar: converte string de hora em minutos
    // ----------------------------------------------------------
    _toMin(str) {
        if (!str) return 0;
        const match = String(str).match(/(\d{2}):(\d{2})/);
        if (!match) return 0;
        return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
    }
};
