// ============================================================
// Anomalies.js — Análise pós-conciliação de anomalias
//
// Fluxo:
//   openModal() → overlay full-screen com filtros fixos no topo
//   _processar() → popula #anomalies-resultados abaixo dos filtros
//
// Análises:
//   • Omissões com passageiro — passageiros não conciliados na janela da omissão
//   • Editadas suspeitas      — viagens editadas com padrões inconsistentes
//
// Não altera o Session — exceto via _atribuirTodosOmissao (delega ao Engine).
// ============================================================

const Anomalies = {

    _pendentes: {},


    // ==========================================================
    // MODAL FULL-SCREEN
    // ==========================================================

    openModal() {
        const session = AppState.session;
        if (!session) return alert("Nenhum dado processado.");

        document.getElementById('anomalies-overlay')?.remove();
        document.body.classList.add('modal-open');

        const empresas = [...new Set(session.viagens.map(v => v.empresa).filter(Boolean))].sort();

        const checkboxesEmpresas = empresas.map(emp => `
            <label style="display:flex; align-items:center; gap:7px; padding:3px 0;
                          cursor:pointer; font-size:0.84rem; white-space:nowrap;">
                <input type="checkbox" name="anomalies-empresa" value="${emp}" checked
                    style="width:14px; height:14px; cursor:pointer; accent-color:var(--accent);">
                ${emp}
            </label>
        `).join("");

        document.body.insertAdjacentHTML('beforeend', `
            <div id="anomalies-overlay"
                style="position:fixed; inset:0; z-index:2000; background:var(--bg); overflow-y:auto;">

                <div style="max-width:1100px; margin:0 auto; padding:24px 32px 48px;">

                    <!-- Cabeçalho -->
                    <div style="display:flex; justify-content:space-between; align-items:center;
                                margin-bottom:20px; padding-bottom:16px; border-bottom:1px solid var(--border);">
                        <h2 style="font-size:1.1rem; color:var(--primary); margin:0;">
                            Análise de Anomalias
                        </h2>
                        <button onclick="Anomalies._fecharModal()" class="btn btn-ghost">✕ Fechar</button>
                    </div>

                    <!-- Filtros -->
                    <div style="background:var(--bg-2); border:1px solid var(--border); border-radius:8px;
                                padding:20px 24px; margin-bottom:28px;">
                        <div style="display:flex; gap:32px; align-items:flex-end; flex-wrap:wrap;">

                            <div>
                                <div style="font-size:0.7rem; text-transform:uppercase; letter-spacing:0.08em;
                                            color:var(--text-3); font-weight:600; margin-bottom:10px;">Empresas</div>
                                <div style="display:flex; flex-wrap:wrap; gap:2px 18px;">
                                    ${checkboxesEmpresas}
                                </div>
                            </div>

                            <div style="flex:1; min-width:220px;">
                                <div style="font-size:0.7rem; text-transform:uppercase; letter-spacing:0.08em;
                                            color:var(--text-3); font-weight:600; margin-bottom:10px;">Análises</div>
                                <div style="display:flex; flex-direction:column; gap:8px;">
                                    <label style="display:flex; align-items:center; gap:8px;
                                                  cursor:pointer; font-size:0.84rem;">
                                        <input type="checkbox" id="anomalies-chk-omissoes" checked
                                            style="width:14px; height:14px; cursor:pointer; accent-color:var(--accent);">
                                        Omissões com passageiro
                                    </label>
                                    <label style="display:flex; align-items:center; gap:8px;
                                                  cursor:pointer; font-size:0.84rem;">
                                        <input type="checkbox" id="anomalies-chk-editadas" checked
                                            style="width:14px; height:14px; cursor:pointer; accent-color:var(--accent);">
                                        Editadas suspeitas
                                    </label>
                                </div>
                            </div>

                            <button onclick="Anomalies._processar()"
                                class="btn btn-primary" style="height:36px; padding:0 24px;">
                                Processar
                            </button>

                        </div>
                    </div>

                    <!-- Resultados (preenchido pelo _processar) -->
                    <div id="anomalies-resultados"></div>

                </div>
            </div>
        `);
    },

    _fecharModal() {
        document.getElementById('anomalies-overlay')?.remove();
        document.body.classList.remove('modal-open');
    },


    // ==========================================================
    // PROCESSAMENTO
    // ==========================================================

    _processar() {
        const empresasSel = [
            ...document.querySelectorAll('input[name="anomalies-empresa"]:checked')
        ].map(el => el.value);

        const fazerOmissoes = document.getElementById('anomalies-chk-omissoes')?.checked;
        const fazerEditadas = document.getElementById('anomalies-chk-editadas')?.checked;

        if (empresasSel.length === 0) return alert("Selecione ao menos uma empresa.");
        if (!fazerOmissoes && !fazerEditadas) return alert("Selecione ao menos uma análise.");

        const session     = AppState.session;
        const empresasSet = new Set(empresasSel);

        const omissoesResult = fazerOmissoes ? this._analisarOmissoes(session, empresasSet) : null;
        const editadasResult = fazerEditadas ? this._analisarEditadas(session, empresasSet) : null;

        this._renderResultados(omissoesResult, editadasResult);
    },


    // ==========================================================
    // ANÁLISE 1 — Omissões com passageiro
    // ==========================================================

    _analisarOmissoes(session, empresasSet) {
        const cfg      = APP_CONFIG.anomalies.omissoesComPax;
        const pesos    = cfg.pesos;
        const janelaMax = cfg.janelaAuditoriaMax;

        const ignoradosIds = new Set((session.paxIgnorados || []).map(p => p.id));
        const orfaos = session.passageiros.filter(p =>
            !p.assigned && !ignoradosIds.has(p.id) && empresasSet.has(p.empresa) && p.veiculo
        );

        // Índice de órfãos por "empresa::veiculo"
        const orfaosPorChave = {};
        for (const p of orfaos) {
            const k = `${p.empresa}::${p.veiculo}`;
            (orfaosPorChave[k] = orfaosPorChave[k] || []).push(p);
        }

        const produtivas = session.viagens.filter(v => !v.isOmissao && empresasSet.has(v.empresa));
        const omissoes   = session.viagens.filter(v => v.isOmissao  && empresasSet.has(v.empresa));

        // Passo 1: inferir veículo e intervalo de cada omissão
        const omissoesEnriquecidas = omissoes.map(omissao => {
            const mInicio = this._toMin(omissao.partidaPlanejada);
            const mFim    = this._toMin(omissao.chegadaPlanejada);

            const vizinhas = produtivas
                .filter(v => v.tabela === omissao.tabela && v.empresa === omissao.empresa)
                .sort((a, b) => a.mInicio - b.mInicio);
            const anterior      = vizinhas.filter(v => v.mFim   <= mInicio).pop();
            const proxima       = vizinhas.find(v  => v.mInicio >= mInicio);
            const veiculoInferido = anterior?.veiculo || proxima?.veiculo || null;

            return { omissao, mInicio, mFim, veiculoInferido, anterior, proxima };
        });

        // Passo 2: atribuir cada passageiro à omissão mais adequada do seu veículo
        // (evita contar o mesmo passageiro em duas omissões sobrepostas)
        const paxPorOmissao = {}; // omissao.id → [pax]

        for (const [chave, orfaosDoVeiculo] of Object.entries(orfaosPorChave)) {
            const omissoesDoVeiculo = omissoesEnriquecidas.filter(e => {
                return e.veiculoInferido && `${e.omissao.empresa}::${e.veiculoInferido}` === chave;
            });
            if (omissoesDoVeiculo.length === 0) continue;

            for (const p of orfaosDoVeiculo) {
                let melhor      = null;
                let melhorDelta = Infinity;

                for (const e of omissoesDoVeiculo) {
                    const { mInicio, mFim } = e;
                    if (p.mHorario < mInicio - janelaMax || p.mHorario > mFim + janelaMax) continue;
                    // Distância ao intervalo planejado (0 se o passageiro está dentro)
                    const delta = p.mHorario < mInicio ? mInicio - p.mHorario
                                : p.mHorario > mFim    ? p.mHorario - mFim
                                : 0;
                    if (delta < melhorDelta) { melhorDelta = delta; melhor = e; }
                }

                if (melhor) {
                    (paxPorOmissao[melhor.omissao.id] = paxPorOmissao[melhor.omissao.id] || []).push(p);
                }
            }
        }

        // Passo 3: pontuar cada omissão
        const linhasIgnoradas = new Set(
            (APP_CONFIG.fontes.bilhetagem.linhasIgnoradas || []).map(l => String(l).trim())
        );

        const suspeitos = [];

        for (const { omissao, mInicio, mFim, veiculoInferido, anterior, proxima } of omissoesEnriquecidas) {
            if (!veiculoInferido) continue;

            const paxNaJanela = paxPorOmissao[omissao.id] || [];
            if (paxNaJanela.length < cfg.minPassageirosSuspeitos) continue;

            let score = 0;
            const criterios = [];

            // Linha planejada bate com linha dos passageiros
            const paxDaLinha = paxNaJanela.filter(p => p.linha_consolidada === omissao.linha_base);
            if (paxDaLinha.length > 0) {
                score += pesos.matchLinha;
                criterios.push({ label: `Linha ${omissao.linha_base} compatível (${paxDaLinha.length} pax)`, pts: pesos.matchLinha });
            }

            // Omissão entre duas viagens produtivas da mesma tabela
            if (anterior && proxima) {
                score += pesos.gapEntreViagens;
                criterios.push({
                    label: `Entre viagens produtivas da tabela ${omissao.tabela} ` +
                           `(${anterior.partidaReal || anterior.partidaPlanejada} → ${proxima.partidaReal || proxima.partidaPlanejada})`,
                    pts: pesos.gapEntreViagens
                });
            }

            // Densidade: % de TODOS os órfãos do veículo presentes na janela
            const chaveVeiculo    = `${omissao.empresa}::${veiculoInferido}`;
            const totalOrfaosVeic = (orfaosPorChave[chaveVeiculo] || []).length;
            if (totalOrfaosVeic > 0) {
                const perc = (paxNaJanela.length / totalOrfaosVeic) * 100;
                if (perc >= cfg.densidadePercentualMinimo) {
                    score += pesos.densidadeAlta;
                    criterios.push({
                        label: `${Math.round(perc)}% dos ${totalOrfaosVeic} órfãos do veículo ${veiculoInferido} estão nesta janela`,
                        pts: pesos.densidadeAlta
                    });
                }
            }

            // Passageiros na zona de tolerância (fora do intervalo planejado mas dentro da janelaMax)
            const paxNaBorda = paxNaJanela.filter(p => p.mHorario < mInicio || p.mHorario > mFim);
            if (paxNaBorda.length > 0) {
                score += pesos.foraTolerancia;
                criterios.push({
                    label: `${paxNaBorda.length} passageiro(s) na zona de tolerância (fora do intervalo planejado)`,
                    pts: pesos.foraTolerancia
                });
            }

            // Penalidade por passageiros de linhas ignoradas na janela
            const paxIgnoradosJanela = paxNaJanela.filter(p => linhasIgnoradas.has(p.linha_consolidada));
            if (paxIgnoradosJanela.length > 0) {
                const proporcao  = paxIgnoradosJanela.length / paxNaJanela.length;
                const penalidade = Math.round(pesos.penalidadeLinhaIgnorada * proporcao);
                score += penalidade;
                criterios.push({
                    label: `${paxIgnoradosJanela.length} pax de linha(s) ignorada(s) na janela`,
                    pts: penalidade
                });
            }

            if (score < cfg.pontuacaoMinima) continue;

            let nivel = "baixo";
            if      (score >= cfg.thresholds.alto)  nivel = "alto";
            else if (score >= cfg.thresholds.medio) nivel = "medio";

            suspeitos.push({
                omissao, veiculoInferido, paxNaJanela,
                totalOrfaosVeiculo: totalOrfaosVeic,
                score, nivel, mInicio, mFim, criterios
            });
        }

        suspeitos.sort((a, b) => b.score - a.score);
        return suspeitos;
    },


    // ==========================================================
    // ANÁLISE 2 — Editadas suspeitas
    // ==========================================================

    _analisarEditadas(session, empresasSet) {
        const cfg   = APP_CONFIG.anomalies.editadasSuspeitas;
        const tol   = cfg.tolerancias;
        const pesos = cfg.pesos;

        const editadas = session.viagens.filter(v =>
            v.isEditada && empresasSet.has(v.empresa)
        );

        const suspeitas = [];

        for (const v of editadas) {
            let score = 0;
            const criterios = [];

            if (v.paxEfetivos.length === 0) {
                score += pesos.semPassageiro;
                criterios.push({ label: "Sem passageiros após conciliação", pts: pesos.semPassageiro });
            }

            const mPartPlan = this._toMin(v.partidaPlanejada);
            const mChegPlan = this._toMin(v.chegadaPlanejada);
            const mPartReal = this._toMin(v.partidaReal);
            const mChegReal = this._toMin(v.chegadaReal);

            if (mPartPlan > 0 && mPartReal > 0) {
                const delta = Math.abs(mPartReal - mPartPlan);
                if (delta > tol.deltaInicioMin) {
                    score += pesos.deltaInicio;
                    criterios.push({ label: `Desvio de partida: ${delta} min (tolerância ${tol.deltaInicioMin} min)`, pts: pesos.deltaInicio });
                }
            }

            if (mChegPlan > 0 && mChegReal > 0) {
                const delta = Math.abs(mChegReal - mChegPlan);
                if (delta > tol.deltaFimMin) {
                    score += pesos.deltaFim;
                    criterios.push({ label: `Desvio de chegada: ${delta} min (tolerância ${tol.deltaFimMin} min)`, pts: pesos.deltaFim });
                }
            }

            if (mPartPlan > 0 && mChegPlan > 0 && mPartReal > 0 && mChegReal > 0) {
                const cicloPlan = mChegPlan - mPartPlan;
                const cicloReal = mChegReal - mPartReal;
                if (cicloPlan > 0 && cicloReal > 0) {
                    const delta = Math.abs(cicloReal - cicloPlan);
                    if (delta > tol.deltaCicloMin) {
                        score += pesos.deltaCiclo;
                        criterios.push({
                            label: `Desvio de ciclo: ${delta} min (plan ${cicloPlan} min → real ${cicloReal} min)`,
                            pts: pesos.deltaCiclo
                        });
                    }
                }
            }

            if (score < cfg.indiceMinimo) continue;

            let nivel = "baixo";
            if      (score >= cfg.thresholds.alto)  nivel = "alto";
            else if (score >= cfg.thresholds.medio) nivel = "medio";

            suspeitas.push({ viagem: v, score, nivel, criterios });
        }

        suspeitas.sort((a, b) => b.score - a.score);
        return suspeitas;
    },


    // ==========================================================
    // RENDER — preenche #anomalies-resultados
    // ==========================================================

    _renderResultados(omissoesResult, editadasResult) {
        this._pendentes = {};

        let html = "";

        if (omissoesResult !== null) {
            html += this._htmlSecao(
                `Omissões com passageiro`,
                omissoesResult.length,
                omissoesResult.length === 0
                    ? `<p style="color:var(--text-3); font-size:0.88rem;">Nenhuma omissão suspeita identificada.</p>`
                    : omissoesResult.map((s, i) => {
                        this._pendentes[`o_${i}`] = s;
                        return this._htmlCardOmissao(s, i);
                    }).join("")
            );
        }

        if (editadasResult !== null) {
            html += this._htmlSecao(
                `Editadas suspeitas`,
                editadasResult.length,
                editadasResult.length === 0
                    ? `<p style="color:var(--text-3); font-size:0.88rem;">Nenhuma viagem editada suspeita identificada.</p>`
                    : editadasResult.map((s, i) => this._htmlCardEditada(s, i)).join("")
            );
        }

        const el = document.getElementById('anomalies-resultados');
        if (el) el.innerHTML = html;
    },

    _htmlSecao(titulo, count, conteudo) {
        return `
            <div style="margin-bottom:32px;">
                <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px;">
                    <span style="font-size:0.95rem; font-weight:600; color:var(--text);">${titulo}</span>
                    <span style="font-size:0.78rem; color:var(--text-3); font-family:var(--mono);">(${count})</span>
                    <div style="flex:1; height:1px; background:var(--border);"></div>
                </div>
                ${conteudo}
            </div>
        `;
    },


    // ----------------------------------------------------------
    // Card — omissão suspeita
    // ----------------------------------------------------------
    _htmlCardOmissao(s, idx) {
        const corNivel = { alto: "var(--danger)", medio: "var(--warning)", baixo: "var(--text-2)" };
        const cor      = corNivel[s.nivel];
        const label    = s.nivel.charAt(0).toUpperCase() + s.nivel.slice(1);
        const key      = `o_${idx}`;

        const badges = s.criterios.map(c => {
            const ptsCor   = c.pts < 0 ? "var(--danger)" : cor;
            const ptsLabel = c.pts >= 0 ? `+${c.pts}` : `${c.pts}`;
            return `
                <span style="display:inline-flex; align-items:center; justify-content:space-between; gap:5px;
                             background:var(--bg-4); border:1px solid var(--border); border-radius:4px;
                             padding:3px 8px; font-size:0.76rem; color:var(--text-2); white-space:nowrap;">
                    ${c.label}
                    <span style="font-weight:600; color:${ptsCor}; margin-left:6px;">${ptsLabel}</span>
                </span>
            `;
        }).join("");

        // Linhas da tabela de passageiros (para o collapse)
        const paxRows = s.paxNaJanela.map(p => {
            const hIni    = this._toMin(s.omissao.partidaPlanejada);
            const dentroIntervalo = p.mHorario >= s.mInicio && p.mHorario <= s.mFim;
            const bordaStyle = !dentroIntervalo
                ? `color:var(--text-3); font-style:italic;`
                : `color:var(--text-2);`;
            return `
                <tr>
                    <td style="padding:4px 10px; ${bordaStyle} font-family:var(--mono);">${p.horario}</td>
                    <td style="padding:4px 10px; ${bordaStyle}">${p.linha_consolidada}</td>
                    <td style="padding:4px 10px; ${bordaStyle}">${p.tipo || "—"}</td>
                </tr>
            `;
        }).join("");

        const labelClosed = `Ver ${s.paxNaJanela.length} passageiro${s.paxNaJanela.length !== 1 ? 's' : ''} ▼`;

        return `
            <div id="anomalies-card-${key}"
                style="border:1px solid var(--border); border-radius:6px; padding:14px; margin-bottom:10px;">

                <!-- Cabeçalho do card -->
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                    <div>
                        <span style="font-weight:600;">${s.omissao.linha}</span>
                        <span style="color:var(--text-3); font-size:0.82rem; margin-left:8px;">${s.omissao.empresa}</span>
                        <span style="font-family:var(--mono); font-size:0.82rem; color:var(--text-2); margin-left:12px;">
                            ${s.omissao.partidaPlanejada} → ${s.omissao.chegadaPlanejada}
                        </span>
                        <span style="font-size:0.82rem; color:var(--text-3); margin-left:12px;">
                            Veículo inferido: <strong style="color:var(--text-2);">${s.veiculoInferido}</strong>
                        </span>
                    </div>
                    <span style="color:${cor}; font-weight:700; font-size:0.82rem; white-space:nowrap; margin-left:12px;">
                        ${label} &nbsp;${s.score} pts
                    </span>
                </div>

                <!-- Critérios -->
                <div style="display:flex; flex-wrap:wrap; gap:5px; margin-bottom:12px;">
                    ${badges}
                </div>

                <!-- Ações + toggle collapse -->
                <div style="display:flex; gap:8px; align-items:center;">
                    <button id="anomalies-col-btn-${key}"
                        data-label-closed="${labelClosed}"
                        onclick="Anomalies._toggleCollapse('${key}')"
                        class="btn btn-ghost" style="font-size:0.78rem;">
                        ${labelClosed}
                    </button>
                    <button onclick="Anomalies._atribuirTodosOmissao('${key}')"
                        class="btn btn-primary" style="font-size:0.78rem;">
                        Atribuir Todos
                    </button>
                    <button onclick="Anomalies._ignorarCard('anomalies-card-${key}')"
                        class="btn btn-ghost" style="font-size:0.78rem;">
                        Ignorar
                    </button>
                </div>

                <!-- Collapse: lista de passageiros -->
                <div id="anomalies-col-${key}" style="display:none; margin-top:12px;
                     border-top:1px solid var(--border); padding-top:12px;">
                    <div style="max-height:240px; overflow-y:auto; border:1px solid var(--border); border-radius:4px;">
                        <table style="width:100%; font-size:0.8rem; border-collapse:collapse;">
                            <thead>
                                <tr style="background:var(--bg-3); text-align:left;">
                                    <th style="padding:5px 10px; color:var(--text-3); font-size:0.7rem; border-bottom:1px solid var(--border);">Horário</th>
                                    <th style="padding:5px 10px; color:var(--text-3); font-size:0.7rem; border-bottom:1px solid var(--border);">Linha</th>
                                    <th style="padding:5px 10px; color:var(--text-3); font-size:0.7rem; border-bottom:1px solid var(--border);">Tipo</th>
                                </tr>
                            </thead>
                            <tbody>${paxRows}</tbody>
                        </table>
                    </div>
                    <p style="font-size:0.74rem; color:var(--text-3); margin:6px 0 0; font-style:italic;">
                        Passageiros em itálico estão fora do intervalo planejado mas dentro da janela de tolerância.
                    </p>
                </div>

            </div>
        `;
    },


    // ----------------------------------------------------------
    // Card — editada suspeita
    // ----------------------------------------------------------
    _htmlCardEditada(s, idx) {
        const corNivel = { alto: "var(--danger)", medio: "var(--warning)", baixo: "var(--text-2)" };
        const { viagem: v, score, nivel, criterios } = s;
        const cor   = corNivel[nivel];
        const label = nivel.charAt(0).toUpperCase() + nivel.slice(1);
        const key   = `e_${idx}`;

        const badges = criterios.map(c => `
            <span style="display:inline-flex; align-items:center; justify-content:space-between; gap:5px;
                         background:var(--bg-4); border:1px solid var(--border); border-radius:4px;
                         padding:3px 8px; font-size:0.76rem; color:var(--text-2); white-space:nowrap;">
                ${c.label}
                <span style="font-weight:600; color:${cor}; margin-left:6px;">+${c.pts}</span>
            </span>
        `).join("");

        return `
            <div id="anomalies-card-${key}"
                style="border:1px solid var(--border); border-radius:6px; padding:14px; margin-bottom:10px;">

                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                    <div>
                        <span style="font-weight:600;">${v.linha}</span>
                        <span style="color:var(--text-3); font-size:0.82rem; margin-left:8px;">${v.empresa}</span>
                        <span style="font-family:var(--mono); font-size:0.82rem; color:var(--text-3); margin-left:12px;">
                            ${v.veiculo || "—"}
                        </span>
                    </div>
                    <span style="color:${cor}; font-weight:700; font-size:0.82rem; white-space:nowrap; margin-left:12px;">
                        ${label} &nbsp;${score} pts
                    </span>
                </div>

                <div style="font-size:0.82rem; color:var(--text-2); margin-bottom:10px; font-family:var(--mono);">
                    Plan: ${v.partidaPlanejada} → ${v.chegadaPlanejada}
                    &nbsp;|&nbsp;
                    Real: ${v.partidaReal} → ${v.chegadaReal}
                    &nbsp;|&nbsp;
                    Pax: <strong>${v.paxEfetivos.length}</strong>
                </div>

                <div style="display:flex; flex-wrap:wrap; gap:5px; margin-bottom:12px;">
                    ${badges}
                </div>

                <button onclick="Anomalies._ignorarCard('anomalies-card-${key}')"
                    class="btn btn-ghost" style="font-size:0.78rem;">
                    Ignorar
                </button>

            </div>
        `;
    },


    // ==========================================================
    // AÇÕES
    // ==========================================================

    _toggleCollapse(key) {
        const el  = document.getElementById(`anomalies-col-${key}`);
        const btn = document.getElementById(`anomalies-col-btn-${key}`);
        if (!el) return;
        const open = el.style.display !== 'none';
        el.style.display = open ? 'none' : 'block';
        if (btn) btn.textContent = open ? btn.dataset.labelClosed : 'Recolher ▲';
    },

    _atribuirTodosOmissao(key) {
        const s = this._pendentes[key];
        if (!s) return;
        const paxIds = s.paxNaJanela.map(p => p.id);
        Engine.atribuirManualmente(AppState.session, paxIds, s.omissao.id);
        UIController.updateDashboard(AppState.session);
        this._ignorarCard(`anomalies-card-${key}`);
        delete this._pendentes[key];
    },

    _ignorarCard(cardId) {
        document.getElementById(cardId)?.remove();
    },


    // ==========================================================
    // AUXILIAR
    // ==========================================================

    _toMin(str) {
        if (!str) return 0;
        const match = String(str).match(/(\d{2}):(\d{2})/);
        if (!match) return 0;
        return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
    }

};
