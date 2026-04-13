// js/modules/Anomalies.js

const Anomalies = {
    /**
     * AUDITORIA: Localiza passageiros órfãos que indicam que uma omissão (Status 2) 
     * na verdade foi uma viagem realizada. Utiliza sistema de pesos do settings.js.
     */
    checkOmissions() {
        if (!AppState.results) return alert("Processe os dados primeiro.");

        const config = APP_CONFIG.anomalies;
        const engine = new Engine();
        const omissoes = AppState.results.trips.filter(t => t.isOmissao && !t.tratada);
        const unassigned = AppState.results.unassigned || [];
        
        const orfaosPorCarro = unassigned.reduce((acc, p) => {
            const v = String(p.veiculo).trim();
            acc[v] = (acc[v] || []);
            acc[v].push(p);
            return acc;
        }, {});

        const produtivasPorCarro = AppState.results.trips
            .filter(t => !t.isOmissao)
            .reduce((acc, t) => {
                const v = String(t.veiculo).trim();
                acc[v] = (acc[v] || []);
                acc[v].push(t);
                return acc;
            }, {});

        const suspeitas = [];

        omissoes.forEach(trip => {
            const hIniPlan = engine._timeToMinutes(trip.partidaPlanejada);
            const hFimPlan = engine._timeToMinutes(trip.chegadaPlanejada);
            const janela = config.criterios.janelaAuditoriaMinutos;

            for (let carro in orfaosPorCarro) {
                let pontos = 0;
                let evidencias = [];
                const paxDoCarro = orfaosPorCarro[carro];

                const paxNaJanela = paxDoCarro.filter(p => {
                    const pMin = engine._timeToMinutes(engine._extractTime(p.horario));
                    return pMin >= (hIniPlan - janela) && pMin <= (hFimPlan + janela);
                });

                if (paxNaJanela.length === 0) continue;
                if (config.criterios.minPassageirosSuspeitos > 0 && 
                    paxNaJanela.length < config.criterios.minPassageirosSuspeitos) continue;

                // --- CÁLCULO DE PONTOS ---
                if (String(trip.veiculo).trim() === carro) {
                    pontos += config.pesos.matchVeiculo;
                    evidencias.push("Veículo Match");
                }
                const linhaPax = paxNaJanela[0].linha.split(' ')[0];
                const linhaTrip = trip.linha.split(' ')[0];
                if (linhaPax === linhaTrip) {
                    pontos += config.pesos.matchLinha;
                    evidencias.push("Linha Match");
                }
                const prod = produtivasPorCarro[carro] || [];
                const temAntes = prod.some(t => engine._timeToMinutes(t.chegadaReal) <= hIniPlan);
                const temDepois = prod.some(t => engine._timeToMinutes(t.partidaReal) >= hFimPlan);
                if (temAntes && temDepois) {
                    pontos += config.pesos.gapEntreRegistros;
                    evidencias.push("Gap (Sanduíche)");
                }
                const densidade = paxNaJanela.length / paxDoCarro.length;
                if (densidade >= 0.6) {
                    pontos += config.pesos.densidadeAlta;
                    evidencias.push(`Densidade ${Math.round(densidade*100)}%`);
                }

                // --- FILTRO DE CORTE ---
                // Se não atingiu a pontuação mínima do settings, descarta a suspeita
                if (pontos < (config.criterios.minPontuacaoSuspeita || 0)) continue;

                const isFantasma = !produtivasPorCarro[carro];

                suspeitas.push({
                    trip, carro, qtdPax: paxNaJanela.length, pontos, evidencias, isFantasma,
                    nivel: pontos >= config.criterios.thresholdAlto ? 'ALTO' : 
                           (pontos >= config.criterios.thresholdMedio ? 'MÉDIO' : 'BAIXO')
                });
            }
        });

        suspeitas.sort((a, b) => b.pontos - a.pontos);
        this._renderAnomaliesResult(suspeitas);
    },


    _renderAnomaliesResult(lista) {
        if (lista.length === 0) return alert("Nenhuma suspeita relevante encontrada.");

        // REMOVEMOS A DIV DE MAX-HEIGHT PARA ELIMINAR O SCROLL DUPLO
        const html = `
            <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
                <thead>
                    <tr style="background: var(--bg-input); position: sticky; top: -21px; z-index: 50; box-shadow: 0 2px 2px rgba(0,0,0,0.5);">
                        <th style="padding: 12px; border-bottom: 2px solid var(--primary);">Probabilidade</th>
                        <th style="padding: 12px; border-bottom: 2px solid var(--primary);">Viagem Omitida</th>
                        <th style="padding: 12px; border-bottom: 2px solid var(--primary); text-align:center;">Carro</th>
                        <th style="padding: 12px; border-bottom: 2px solid var(--primary); text-align:center;">Pax</th>
                        <th style="padding: 12px; border-bottom: 2px solid var(--primary);">Evidências</th>
                        <th style="padding: 12px; border-bottom: 2px solid var(--primary); text-align:center;">Ação</th>
                    </tr>
                </thead>
                <tbody>
                    ${lista.map(item => {
                        const corNivel = item.nivel === 'ALTO' ? 'var(--success)' : (item.nivel === 'MÉDIO' ? 'var(--warning)' : 'var(--text-muted)');
                        const ghostIcon = item.isFantasma ? '<i data-lucide="ghost" style="width:14px; color:var(--danger); margin-right:4px;"></i>' : '';
                        
                        return `
                        <tr style="border-bottom: 1px solid var(--border);">
                            <td style="padding: 10px; text-align: center;">
                                <span style="background: ${corNivel}; color: white; padding: 2px 8px; border-radius: 10px; font-size: 0.65rem; font-weight: bold;">
                                    ${item.nivel} (${item.pontos})
                                </span>
                            </td>
                            <td style="padding: 10px;">
                                <strong>${item.trip.linha}</strong><br>
                                <small style="color: var(--text-muted);">${item.trip.partidaPlanejada}</small>
                            </td>
                            <td style="padding: 10px; text-align: center; font-weight: bold;">
                                ${ghostIcon}${item.carro}
                            </td>
                            <td style="padding: 10px; text-align: center; font-weight:bold;">${item.qtdPax}</td>
                            <td style="padding: 10px;">
                                <small style="display: block; font-size: 0.7rem; color: var(--text-muted);">
                                    ${item.evidencias.join(' • ')}
                                </small>
                            </td>
                            <td style="padding: 10px; text-align: center;">
                                <button onclick="UIController.autoFillAudit('${item.carro}', '${item.trip.id}')" 
                                        class="btn-action-small" style="font-size:0.65rem; padding: 3px 8px;">
                                    Verificar
                                </button>
                            </td>
                        </tr>
                    `}).join('')}
                </tbody>
            </table>
        `;
        UIController.showModal(`Auditoria de Omissões (${lista.length} suspeitas)`, html);
        lucide.createIcons();
    },

    /**
     * GESTÃO: Abre interface para marcar viagens Status 2 como tratadas.
     */
    manageOmissions() {
        if (!AppState.results) return alert("Processe os dados primeiro.");
        const todasOmissoes = AppState.results.trips.filter(t => t.isOmissao);
        const empresas = [...new Set(AppState.results.trips.map(t => t.empresa))];

        const html = `
            <div class="filter-bar" style="background: var(--bg-input); border-radius: 8px; margin-bottom: 15px; border: 1px solid var(--border); padding: 15px; display: flex; flex-wrap: wrap; gap: 15px; align-items: flex-end;">
                <div class="filter-group">
                    <label>Empresa</label>
                    <select id="omissao-filter-empresa" style="width: 140px; background: var(--bg-card); color: white; border: 1px solid var(--border); padding: 8px;">
                        <option value="">Todas</option>
                        ${empresas.map(e => `<option value="${e}">${e}</option>`).join('')}
                    </select>
                </div>
                <div class="filter-group">
                    <label>Linha</label>
                    <input type="text" id="omissao-filter-linha" placeholder="Ex: A14" style="width: 100px; background: var(--bg-card); color: white; border: 1px solid var(--border); padding: 8px;">
                </div>
                <div class="filter-group">
                    <label>Status</label>
                    <select id="omissao-filter-status" style="width: 120px; background: var(--bg-card); color: white; border: 1px solid var(--border); padding: 8px;">
                        <option value="todos">Todos</option>
                        <option value="pendente">Pendentes</option>
                        <option value="tratada">Tratados</option>
                    </select>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button onclick="Anomalies.applyOmissionFilters()" class="action-card" style="width: auto; padding: 0 15px; font-size: 0.75rem; background: var(--primary); height: 36px; justify-content: center; border:none; color:white; font-weight:bold; cursor:pointer;">Filtrar</button>
                    <button onclick="Anomalies.clearOmissionFilters()" class="action-card" style="width: auto; padding: 0 15px; font-size: 0.75rem; background: var(--bg-card); height: 36px; justify-content: center; border: 1px solid var(--border); color:white; cursor:pointer;">Limpar</button>
                    <button onclick="Anomalies.validateAllFiltered()" class="action-card" style="width: auto; padding: 0 15px; font-size: 0.75rem; background: var(--success); height: 36px; justify-content: center; border: none; color:white; font-weight:bold; cursor:pointer;">Validar Todos</button>
                </div>
            </div>
            <div id="omissao-list-container" style="max-height: 400px; overflow-y: auto; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-input);">
                ${this._renderOmissionList(todasOmissoes)}
            </div>
        `;
        UIController.showModal("Gestão de Omissões (Status 2)", html);
    },

    applyOmissionFilters() {
        const empresa = document.getElementById('omissao-filter-empresa')?.value.toLowerCase() || "";
        const linha = document.getElementById('omissao-filter-linha')?.value.toLowerCase() || "";
        const status = document.getElementById('omissao-filter-status')?.value || "todos";
        
        const rows = document.querySelectorAll('.omissao-row');
        rows.forEach(row => {
            const rowLinha = row.getAttribute('data-linha').toLowerCase();
            const rowEmpresa = row.getAttribute('data-empresa').toLowerCase();
            const isTratada = row.getAttribute('data-tratada') === 'true';
            
            const matchLinha = !linha || rowLinha.includes(linha);
            const matchEmpresa = !empresa || rowEmpresa === empresa;
            let matchStatus = true;
            if (status === 'pendente') matchStatus = !isTratada;
            else if (status === 'tratada') matchStatus = isTratada;
            
            row.style.display = (matchLinha && matchEmpresa && matchStatus) ? 'table-row' : 'none';
        });
    },

    clearOmissionFilters() {
        document.getElementById('omissao-filter-empresa').value = "";
        document.getElementById('omissao-filter-linha').value = "";
        document.getElementById('omissao-filter-status').value = "todos";
        this.applyOmissionFilters();
    },

    toggleOmissionStatus(tripId) {
        const trip = AppState.results.trips.find(t => t.id === tripId);
        if (trip) {
            trip.tratada = !trip.tratada;
            Anomalies._refreshOmissionView();
        }
    },

    validateAllFiltered() {
        const visiveis = Array.from(document.querySelectorAll('.omissao-row'))
                              .filter(row => row.style.display !== 'none');
        visiveis.forEach(row => {
            const tripId = row.getAttribute('data-id');
            const trip = AppState.results.trips.find(t => t.id === tripId);
            if (trip) trip.tratada = true;
        });
        Anomalies._refreshOmissionView();
    },

    _refreshOmissionView() {
        const container = document.getElementById('omissao-list-container');
        if (!container) return;
        const scrollPos = container.scrollTop;
        const todasOmissoes = AppState.results.trips.filter(t => t.isOmissao);
        container.innerHTML = this._renderOmissionList(todasOmissoes);
        
        setTimeout(() => {
            Anomalies.applyOmissionFilters();
            container.scrollTop = scrollPos;
        }, 0);
    },

    _renderOmissionList(lista) {
        if (lista.length === 0) return '<p style="padding: 20px;">Nenhuma omissão encontrada.</p>';
        return `
            <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
                <thead style="background: var(--bg-card); position: sticky; top: 0; z-index: 10;">
                    <tr>
                        <th style="padding: 12px; border-bottom: 2px solid var(--border); text-align:left;">Empresa</th>
                        <th style="padding: 12px; border-bottom: 2px solid var(--border); text-align:left;">Linha</th>
                        <th style="padding: 12px; border-bottom: 2px solid var(--border); text-align:center;">Planejado</th>
                        <th style="padding: 12px; border-bottom: 2px solid var(--border); text-align:center;">Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${lista.map(t => `
                        <tr class="omissao-row" data-id="${t.id}" data-linha="${t.linha}" data-empresa="${t.empresa}" data-tratada="${t.tratada || false}">
                            <td style="padding: 10px; border-bottom: 1px solid var(--border);">${t.empresa}</td>
                            <td style="padding: 10px; border-bottom: 1px solid var(--border);">${t.linha}</td>
                            <td style="padding: 10px; border-bottom: 1px solid var(--border); text-align:center;">${t.partidaPlanejada}</td>
                            <td style="padding: 10px; border-bottom: 1px solid var(--border); text-align:center;">
                                <button onclick="Anomalies.toggleOmissionStatus('${t.id}')" 
                                        style="background: ${t.tratada ? 'var(--success)' : 'rgba(255,255,255,0.05)'}; 
                                               border: 1px solid ${t.tratada ? 'var(--success)' : 'var(--border)'}; 
                                               color: ${t.tratada ? 'white' : 'var(--text-muted)'}; 
                                               cursor: pointer; padding: 5px 10px; border-radius: 4px; font-size: 0.7rem; font-weight: bold; min-width: 90px;">
                                    ${t.tratada ? 'TRATADA ✓' : 'PENDENTE'}
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    },

    /**
     * AUDITORIA: Verifica viagens Status 1/3 editadas manualmente que ficaram sem passageiros.
     */
    checkEditedTrips() {
        if (!AppState.results) return alert("Processe os dados primeiro.");
        const casos = AppState.results.trips.filter(t => 
            String(t.viagemEditada).toLowerCase() === "sim" && (t.paxEfetivos || []).length === 0
        );
        if (casos.length === 0) return alert("Nenhuma inconsistência encontrada em viagens editadas.");
        
        const html = `
            <table style="width: 100%; border-collapse: collapse; font-size:0.85rem;">
                <thead style="background: var(--bg-input);">
                    <tr>
                        <th style="padding: 10px; border: 1px solid var(--border);">Carro</th>
                        <th style="padding: 10px; border: 1px solid var(--border);">Linha</th>
                        <th style="padding: 10px; border: 1px solid var(--border); text-align:center;">Horário Saída</th>
                    </tr>
                </thead>
                <tbody>
                    ${casos.map(t => `
                        <tr>
                            <td style="padding: 10px; border: 1px solid var(--border);">${t.veiculo}</td>
                            <td style="padding: 10px; border: 1px solid var(--border);">${t.linha}</td>
                            <td style="padding: 10px; border: 1px solid var(--border); text-align:center;">${t.partidaReal}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        UIController.showModal("Viagens Editadas sem Passageiros", html);
    }
};