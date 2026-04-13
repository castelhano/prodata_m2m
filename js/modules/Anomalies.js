// js/modules/Anomalies.js

const Anomalies = {
    /**
     * Auditoria: Localiza passageiros órfãos que embarcaram em horários de viagens omitidas.
     * Prioriza horários planejados, já que omissões não possuem horários reais.
     */
    checkOmissions() {
        if (!AppState.results) return alert("Processe os dados primeiro.");

        // Filtra apenas omissões que ainda não foram marcadas como tratadas pelo usuário
        const omissoes = AppState.results.trips.filter(t => t.isOmissao && !t.tratada);
        const unassigned = AppState.results.unassigned || [];
        const engine = new Engine();
        const suspeitas = [];

        omissoes.forEach(trip => {
            // Nas omissões, usamos diretamente o Planejado (conforme sua observação)
            const hInicio = trip.partidaPlanejada;
            const hFim = trip.chegadaPlanejada;

            if (!hInicio || hInicio === "") return;

            const tInicio = engine._timeToMinutes(hInicio);
            const tFim = engine._timeToMinutes(hFim);

            // Busca passageiros órfãos na janela da omissão (+/- 10 min de margem)
            const paxNaJanela = unassigned.filter(p => {
                const pMin = engine._timeToMinutes(engine._extractTime(p.horario));
                return pMin >= (tInicio - 10) && pMin <= (tFim + 10);
            });

            if (paxNaJanela.length > 0) {
                // Agrupa passageiros por veículo para identificar qual carro fez a viagem
                const agrupado = paxNaJanela.reduce((acc, p) => {
                    const id = String(p.veiculo).trim();
                    acc[id] = (acc[id] || 0) + 1;
                    return acc;
                }, {});

                for (let carro in agrupado) {
                    // Se o carro teve 3 ou mais passageiros, é uma suspeita forte
                    if (agrupado[carro] >= 3) {
                        suspeitas.push({
                            viagemOmitida: trip,
                            carroCandidato: carro,
                            qtdPax: agrupado[carro],
                            linhaNoPax: paxNaJanela.find(p => String(p.veiculo).trim() === carro).linha
                        });
                    }
                }
            }
        });

        this._renderAnomaliesResult(suspeitas);
    },

    /**
     * Interface: Abre o modal de gestão de omissões para marcar como "Tratadas".
     */
    manageOmissions() {
        if (!AppState.results) return alert("Processe os dados primeiro.");

        const todasOmissoes = AppState.results.trips.filter(t => t.isOmissao);

        const html = `
            <div style="margin-bottom: 15px; display: flex; gap: 10px; align-items: center;">
                <label style="font-size: 0.8rem; color: var(--text-muted);">BUSCAR LINHA:</label>
                <input type="text" id="omissao-search-linha" placeholder="Ex: A14" oninput="Anomalies.filterOmissionList()" 
                       style="padding: 6px; background: var(--bg-input); color: white; border: 1px solid var(--border); border-radius: 4px;">
            </div>
            <div id="omissao-list-container" style="max-height: 450px; overflow-y: auto; border: 1px solid var(--border); border-radius: 8px;">
                ${this._renderOmissionList(todasOmissoes)}
            </div>
        `;

        UIController.showModal("Gestão de Omissões (Status 2)", html);
    },

    /**
     * Auditoria: Verifica viagens editadas que não possuem passageiros.
     */
    checkEditedTrips() {
        if (!AppState.results) return alert("Processe os dados primeiro.");

        const casos = AppState.results.trips.filter(t => 
            String(t.viagemEditada).toLowerCase() === "sim" && (t.paxEfetivos || []).length === 0
        );

        if (casos.length === 0) return alert("Nenhuma inconsistência encontrada em viagens editadas.");

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
                    ${casos.map(t => `
                        <tr>
                            <td style="padding: 10px; border: 1px solid var(--border);">${t.veiculo}</td>
                            <td style="padding: 10px; border: 1px solid var(--border);">${t.linha}</td>
                            <td style="padding: 10px; border: 1px solid var(--border);">${t.partidaReal}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        UIController.showModal("Viagens Editadas sem Passageiros", html);
    },

    // --- MÉTODOS AUXILIARES E RENDERIZAÇÃO ---

    _renderAnomaliesResult(lista) {
        if (lista.length === 0) return alert("Nenhuma omissão suspeita encontrada.");

        const html = `
            <div style="max-height: 450px; overflow-y: auto;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead style="background: var(--bg-input);">
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

    _renderOmissionList(lista) {
        if (lista.length === 0) return '<p style="padding: 20px;">Nenhuma omissão encontrada.</p>';
        return `
            <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
                <thead>
                    <tr style="background: var(--bg-input);">
                        <th style="padding: 10px; border: 1px solid var(--border);">Empresa</th>
                        <th style="padding: 10px; border: 1px solid var(--border);">Linha</th>
                        <th style="padding: 10px; border: 1px solid var(--border); text-align:center;">Planejado</th>
                        <th style="padding: 10px; border: 1px solid var(--border); text-align:center;">Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${lista.map(t => `
                        <tr class="omissao-row" data-linha="${t.linha}">
                            <td style="padding: 10px; border: 1px solid var(--border);">${t.empresa}</td>
                            <td style="padding: 10px; border: 1px solid var(--border);">${t.linha}</td>
                            <td style="padding: 10px; border: 1px solid var(--border); text-align:center;">${t.partidaPlanejada}</td>
                            <td style="padding: 10px; border: 1px solid var(--border); text-align:center;">
                                <button onclick="Anomalies.toggleOmissionStatus('${t.id}')" 
                                        style="background: ${t.tratada ? 'var(--success)' : 'var(--bg-input)'}; border: 1px solid var(--border); color: white; cursor: pointer; padding: 4px 10px; border-radius: 4px; font-size: 0.7rem;">
                                    ${t.tratada ? 'TRATADA ✓' : 'PENDENTE'}
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    },

    toggleOmissionStatus(tripId) {
        const trip = AppState.results.trips.find(t => t.id === tripId);
        if (trip) {
            trip.tratada = !trip.tratada;
            const todasOmissoes = AppState.results.trips.filter(t => t.isOmissao);
            document.getElementById('omissao-list-container').innerHTML = this._renderOmissionList(todasOmissoes);
        }
    },

    filterOmissionList() {
        const termo = document.getElementById('omissao-search-linha').value.toLowerCase();
        document.querySelectorAll('.omissao-row').forEach(row => {
            const linha = row.getAttribute('data-linha').toLowerCase();
            row.style.display = linha.includes(termo) ? 'table-row' : 'none';
        });
    }
};