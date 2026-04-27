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

        const cfg         = APP_CONFIG.anomalies.omissoesComPax;
        const pesos       = cfg.pesos;
        const conciliadas = new Set(session.empresasConciliadas || []);
        const ignoradosIds = new Set((session.paxIgnorados || []).map(p => p.id));
        const orphaos  = session.passageiros.filter(p =>
            !p.assigned &&
            !ignoradosIds.has(p.id) &&
            (conciliadas.size === 0 || conciliadas.has(p.empresa))
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
                return p.empresa === omissao.empresa && delta <= janela;
            });

            if (paxNaJanela.length < cfg.minPassageirosSuspeitos) continue;

            // Viagens vizinhas da mesma tabela — ordenadas por horário
            const vizinhas = produtivas
                .filter(v => v.tabela === omissao.tabela && v.empresa === omissao.empresa)
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

            // Penalidade proporcional por passageiros de linhas ignoradas na janela
            const linhasIgnoradas = new Set((APP_CONFIG.fontes.bilhetagem.linhasIgnoradas || []).map(l => String(l).trim()));
            const paxIgnoradosNaJanela = paxNaJanela.filter(p => linhasIgnoradas.has(p.linha));
            if (paxIgnoradosNaJanela.length > 0) {
                const proporcao  = paxIgnoradosNaJanela.length / paxNaJanela.length;
                const penalidade = Math.round(pesos.penalidadeLinhaIgnorada * proporcao);
                score += penalidade;
                criterios.push({ label: `${paxIgnoradosNaJanela.length} pax de linha(s) ignorada(s) na janela`, pts: penalidade });
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
                totalOrfaosVeiculo: veiculoInferido ? (orphaosPorVeiculo[veiculoInferido] || []).length : 0,
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

        // Armazena referências para o botão Atribuir Todos
        Anomalies._pendentes = {};
        suspeitos.forEach((s, i) => { Anomalies._pendentes[i] = s; });

        const corNivel = { alto: "var(--danger)", medio: "var(--warning)", baixo: "var(--text-2)" };

        const blocos = suspeitos.map((s, idx) => {
            const cor   = corNivel[s.nivel];
            const label = s.nivel.charAt(0).toUpperCase() + s.nivel.slice(1);

            const badgesCriterios = s.criterios.map(c => {
                const ptsCor = c.pts < 0 ? "var(--danger)" : cor;
                const ptsLabel = c.pts >= 0 ? `+${c.pts}` : `${c.pts}`;
                return `
                    <span style="display:inline-flex; align-items:center; justify-content:space-between; gap:5px;
                                 background:var(--bg-4); border:1px solid var(--border);
                                 border-radius:4px; padding:3px 8px; font-size:0.76rem;
                                 color:var(--text-2); white-space:nowrap; width:100%;">
                        ${c.label}
                        <span style="font-weight:600; color:${ptsCor};">${ptsLabel}</span>
                    </span>
                `;
            }).join("");

            // Viagens do veículo inferido (coluna direita)
            const viagensVeiculo = s.veiculoInferido
                ? (AppState.session?.viagens.filter(v => v.veiculo === s.veiculoInferido) || [])
                    .sort((a, b) => a.mInicio - b.mInicio)
                : [];

            const viagensRows = viagensVeiculo.map(v => {
                const hIni = v.isOmissao ? v.partidaPlanejada : v.partidaReal;
                const hFim = v.isOmissao ? v.chegadaPlanejada : v.chegadaReal;
                const editado = v.isEditada
                    ? `<span style="color:var(--warning); font-weight:600;">Sim</span>`
                    : `<span style="color:var(--text-3);">—</span>`;
                const tipoBadge = v.isOmissao
                    ? `<span style="color:var(--danger); font-size:0.7rem;">[O]</span>`
                    : v.convertidaDeOmissao
                    ? `<span style="color:var(--success); font-size:0.7rem;">[C]</span>`
                    : "";
                const rowStyle = v.isEditada
                    ? `background:rgba(245,158,11,0.08);`
                    : "";
                return `<tr style="${rowStyle}">
                    <td style="padding:4px 8px;">${v.linha_base} ${tipoBadge}</td>
                    <td style="padding:4px 8px;">${(hIni || "").substring(0, 5)}</td>
                    <td style="padding:4px 8px;">${(hFim || "").substring(0, 5)}</td>
                    <td style="padding:4px 8px;">${editado}</td>
                    <td style="padding:4px 8px;">${v.paxEfetivos.length}</td>
                </tr>`;
            }).join("");

            const viagensTableHtml = viagensVeiculo.length > 0
                ? `<div style="max-height:220px; overflow-y:auto; border:1px solid var(--border); border-radius:4px;">
                    <table style="width:100%; font-size:0.78rem; border-collapse:collapse; font-family:var(--mono);">
                        <thead>
                            <tr style="text-align:left; background:var(--bg-3);">
                                <th style="padding:5px 8px; color:var(--text-3); font-size:0.7rem; border-bottom:1px solid var(--border);">Linha</th>
                                <th style="padding:5px 8px; color:var(--text-3); font-size:0.7rem; border-bottom:1px solid var(--border);">Início</th>
                                <th style="padding:5px 8px; color:var(--text-3); font-size:0.7rem; border-bottom:1px solid var(--border);">Fim</th>
                                <th style="padding:5px 8px; color:var(--text-3); font-size:0.7rem; border-bottom:1px solid var(--border);">Editado</th>
                                <th style="padding:5px 8px; color:var(--text-3); font-size:0.7rem; border-bottom:1px solid var(--border);">Pax</th>
                            </tr>
                        </thead>
                        <tbody style="color:var(--text-2);">${viagensRows}</tbody>
                    </table>
                </div>`
                : `<p style="font-size:0.78rem; color:var(--text-3);">Nenhuma viagem encontrada.</p>`;

            return `
                <div id="omissao-card-${idx}" style="border:1px solid var(--border); border-radius:6px;
                            padding:14px; margin-bottom:12px;">
                    <div style="display:flex; gap:16px; align-items:flex-start;">

                        <!-- Coluna esquerda: análise -->
                        <div style="flex:1; min-width:0;">
                            <div style="display:flex; justify-content:space-between; align-items:center;
                                        margin-bottom:6px;">
                                <strong>${s.omissao.linha} — ${s.omissao.partidaPlanejada}
                                    às ${s.omissao.chegadaPlanejada}</strong>
                                <span style="color:${cor}; font-weight:bold; font-size:0.8rem;">
                                    ${label} (${s.score} pts)
                                </span>
                            </div>
                            <div style="font-size:0.82rem; color:var(--text-2); margin-bottom:10px;">
                                Veículo inferido: <strong>${s.veiculoInferido || "não identificado"}</strong>
                                &nbsp;|&nbsp;
                                Passageiros na janela: <strong>${s.paxNaJanela.length}</strong>
                            </div>
                            <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px;">
                                ${badgesCriterios}
                            </div>
                            <div style="display:flex; gap:8px;">
                                <button onclick="UIController.autoFillAudit('${s.veiculoInferido}', '${s.omissao.id}')"
                                    class="btn btn-success">
                                    Investigar
                                </button>
                                <button onclick="Anomalies._atribuirTodosOmissao(${idx})"
                                    class="btn btn-primary">
                                    Atribuir Todos
                                </button>
                            </div>
                        </div>

                        <!-- Coluna direita: viagens do carro inferido -->
                        <div style="width:360px; flex-shrink:0; border-left:1px solid var(--border); padding-left:16px;">
                            <div style="font-size:0.82rem; margin-bottom:6px; color:var(--text-2);">
                                Viagens carro inferido: <strong style="color:var(--text);">${s.veiculoInferido || "—"}</strong>
                            </div>
                            <div style="font-size:0.78rem; color:var(--text-3); margin-bottom:8px; font-family:var(--mono);">
                                Pax TT: <strong style="color:var(--text-2);">${s.totalOrfaosVeiculo}</strong>
                                &nbsp;|&nbsp;
                                Pax Alvo: <strong style="color:var(--text-2);">${s.paxNaJanela.length}</strong>
                            </div>
                            ${viagensTableHtml}
                        </div>

                    </div>
                </div>
            `;
        }).join("");

        UIController.showModal(
            `Omissões suspeitas (${suspeitos.length})`,
            blocos,
            { maxWidth: "1100px" }
        );
    },


    // ----------------------------------------------------------
    // Atribui todos os passageiros da janela à omissão e remove
    // o card do modal sem fechar a janela
    // ----------------------------------------------------------
    _atribuirTodosOmissao(idx) {
        const s = Anomalies._pendentes?.[idx];
        if (!s) return;

        const paxIds = s.paxNaJanela.map(p => p.id);
        Engine.atribuirManualmente(AppState.session, paxIds, s.omissao.id);
        UIController.updateDashboard(AppState.session);

        document.getElementById(`omissao-card-${idx}`)?.remove();
        delete Anomalies._pendentes[idx];
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
