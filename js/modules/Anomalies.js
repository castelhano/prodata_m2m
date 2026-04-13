// js/modules/Anomalies.js

const Anomalies = {
    // Auditoria: Cruza Omissões com Passageiros sem viagem
    checkOmissions() {
        if (!AppState.results) return alert("Processe os dados primeiro.");
        const omissoes = AppState.results.trips.filter(t => t.isOmissao && !t.tratada);
        const unassigned = AppState.results.unassigned || [];
        const engine = new Engine();
        const suspeitas = [];

        console.log(`Analisando ${omissoes.length} omissões contra ${unassigned.length} passageiros...`);

        omissoes.forEach(trip => {
            const hInicio = trip.partidaPlanejada;
            const hFim = trip.chegadaPlanejada;
            if (!hInicio) return;

            const tInicio = engine._timeToMinutes(hInicio);
            const tFim = engine._timeToMinutes(hFim);

            // Busca passageiros na janela da omissão (+/- 10 min)
            const paxNaJanela = unassigned.filter(p => {
                const pMin = engine._timeToMinutes(engine._extractTime(p.horario));
                return pMin >= (tInicio - 10) && pMin <= (tFim + 10);
            });

            if (paxNaJanela.length > 0) {
                const agrupado = paxNaJanela.reduce((acc, p) => {
                    const id = String(p.veiculo).trim();
                    acc[id] = (acc[id] || 0) + 1;
                    return acc;
                }, {});

                for (let carro in agrupado) {
                    if (agrupado[carro] >= 3) { // Se o carro teve 3+ pax no horário
                        suspeitas.push({
                            viagemOmitida: trip,
                            carroCandidato: carro,
                            qtdPax: agrupado[carro]
                        });
                    }
                }
            }
        });

        this._renderAnomaliesResult(suspeitas);
    },

    _renderAnomaliesResult(lista) {
        if (lista.length === 0) return alert("Nenhuma omissão suspeita encontrada.");

        const html = `
            <div style="max-height: 450px; overflow-y: auto;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead style="background: var(--bg-input); position: sticky; top: 0; z-index: 10;">
                        <tr>
                            <th style="padding: 10px; border: 1px solid var(--border);">Linha Omitida</th>
                            <th style="padding: 10px; border: 1px solid var(--border);">H. Planejado</th>
                            <th style="padding: 10px; border: 1px solid var(--border);">Carro Suspeito</th>
                            <th style="padding: 10px; border: 1px solid var(--border);">Qtd Pax</th>
                            <th style="padding: 10px; border: 1px solid var(--border);">Ação</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${lista.map(item => `
                            <tr>
                                <td style="padding: 10px; border: 1px solid var(--border);">${item.viagemOmitida.linha}</td>
                                <td style="padding: 10px; border: 1px solid var(--border); text-align:center;">${item.viagemOmitida.partidaPlanejada}</td>
                                <td style="padding: 10px; border: 1px solid var(--border); text-align:center; color: var(--warning); font-weight:bold;">${item.carroCandidato}</td>
                                <td style="padding: 10px; border: 1px solid var(--border); text-align:center;">${item.qtdPax}</td>
                                <td style="padding: 10px; border: 1px solid var(--border); text-align:center;">
                                    <button onclick="UIController.autoFillAudit('${item.carroCandidato}', '${item.viagemOmitida.id}')" 
                                            class="btn-action-small">Verificar</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
        UIController.showModal(`Omissões com Passageiros Detectados (${lista.length})`, html);
    },

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
                    <button onclick="Anomalies.applyOmissionFilters()" class="action-card" style="width: auto; padding: 0 15px; font-size: 0.75rem; background: var(--primary); height: 36px; justify-content: center; color:white; border:none; cursor:pointer;">Filtrar</button>
                    <button onclick="Anomalies.clearOmissionFilters()" class="action-card" style="width: auto; padding: 0 15px; font-size: 0.75rem; background: var(--bg-card); height: 36px; justify-content: center; border: 1px solid var(--border); color:white; cursor:pointer;">Limpar</button>
                    <button onclick="Anomalies.validateAllFiltered()" class="action-card" style="width: auto; padding: 0 15px; font-size: 0.75rem; background: var(--success); height: 36px; justify-content: center; color:white; border:none; cursor:pointer;">Validar Todos</button>
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
        
        console.log("Executando Filtro Omissões:", {linha, status});

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
            this._refreshOmissionView();
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
        this._refreshOmissionView();
    },

    _refreshOmissionView() {
        const container = document.getElementById('omissao-list-container');
        if (!container) return;
        const scrollPos = container.scrollTop;
        const todasOmissoes = AppState.results.trips.filter(t => t.isOmissao);
        container.innerHTML = this._renderOmissionList(todasOmissoes);
        
        setTimeout(() => {
            this.applyOmissionFilters();
            container.scrollTop = scrollPos;
        }, 0);
    },

    _renderOmissionList(lista) {
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

    checkEditedTrips() {
        if (!AppState.results) return alert("Processe os dados primeiro.");
        const casos = AppState.results.trips.filter(t => 
            String(t.viagemEditada).toLowerCase() === "sim" && (t.paxEfetivos || []).length === 0
        );
        if (casos.length === 0) return alert("Nenhuma inconsistência encontrada.");
        const html = `
            <table style="width: 100%; border-collapse: collapse;">
                <thead style="background: var(--bg-input);">
                    <tr>
                        <th style="padding: 10px; border: 1px solid var(--border);">Carro</th>
                        <th style="padding: 10px; border: 1px solid var(--border);">Linha</th>
                        <th style="padding: 10px; border: 1px solid var(--border);">Horário Saída</th>
                    </tr>
                </thead>
                <tbody>
                    ${casos.map(t => `<tr><td>${t.veiculo}</td><td>${t.linha}</td><td>${t.partidaReal}</td></tr>`).join('')}
                </tbody>
            </table>`;
        UIController.showModal("Viagens Editadas sem Passageiros", html);
    }
};