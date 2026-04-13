// js/modules/Anomalies.js

const Anomalies = {
    /**
     * Analisa viagens marcadas como Omissão (Status 2) que possuem passageiros órfãos.
     * Busca veículos que tiveram embarques significativos na janela de tempo da omissão.
     */
    checkOmissions() {
        if (!AppState.results) return alert("Processe os dados primeiro.");

        console.log("--- INICIANDO AUDITORIA DE OMISSÕES ---");
        
        // 1. Filtra apenas as omissões (Status 2)
        const omissoes = AppState.results.trips.filter(t => t.isOmissao && !t.tratada);
        console.log(`Viagens com Status Omissão (2) encontradas: ${omissoes.length}`);

        const unassigned = AppState.results.unassigned || [];
        console.log(`Total de passageiros órfãos para analisar: ${unassigned.length}`);

        const engineTemp = new Engine();
        const suspeitas = [];

        omissoes.forEach(trip => {
            // LÓGICA DE FALLBACK: 
            // Em omissões, o GPS não registra o "Real". Usamos o "Planejado" como âncora.
            const pHoraRef = (trip.partidaReal && trip.partidaReal !== "" && trip.partidaReal !== "-") 
                             ? trip.partidaReal 
                             : trip.partidaPlanejada;
                             
            const cHoraRef = (trip.chegadaReal && trip.chegadaReal !== "" && trip.chegadaReal !== "-") 
                             ? trip.chegadaReal 
                             : trip.chegadaPlanejada;

            // Se nem o planejado existir (erro de arquivo), pulamos
            if (!pHoraRef || pHoraRef === "" || pHoraRef === "-") {
                console.warn(`   X Pulando omissão ${trip.linha}: Sem horários de referência (Real ou Planejado).`);
                return;
            }

            const tInicio = engineTemp._timeToMinutes(pHoraRef);
            const tFim = engineTemp._timeToMinutes(cHoraRef);
            
            console.log(`Analisando Omissão: ${trip.linha} (Janela Ref: ${pHoraRef} às ${cHoraRef})`);

            // 2. Buscar passageiros órfãos que passaram o cartão nesta janela de tempo
            // Adicionamos uma margem de 10 minutos para cobrir variações de terminal
            const paxNoHorario = unassigned.filter(p => {
                const pHoraStr = engineTemp._extractTime(p.horario);
                const pMinutos = engineTemp._timeToMinutes(pHoraStr);
                return pMinutos >= (tInicio - 10) && pMinutos <= (tFim + 10);
            });

            if (paxNoHorario.length > 0) {
                // 3. Agrupar esses passageiros por VEÍCULO
                const agrupadoPorCarro = paxNoHorario.reduce((acc, p) => {
                    const idCarro = String(p.veiculo).trim();
                    acc[idCarro] = (acc[idCarro] || 0) + 1;
                    return acc;
                }, {});

                // 4. Se um carro teve 3 ou mais passageiros "soltos" nessa hora, ele é um forte suspeito
                for (let carro in agrupadoPorCarro) {
                    const qtd = agrupadoPorCarro[carro];
                    
                    if (qtd >= 3) {
                        console.log(`      ⭐ SUSPEITA: Carro ${carro} teve ${qtd} passageiros na janela da omissão.`);
                        suspeitas.push({
                            viagemOmitida: trip,
                            carroCandidato: carro,
                            qtdPax: qtd,
                            linhaNoPax: paxNoHorario.find(p => String(p.veiculo).trim() === carro).linha
                        });
                    }
                }
            }
        });

        console.log("Auditoria concluída. Suspeitas encontradas:", suspeitas.length);
        this._renderAnomaliesResult(suspeitas);
    },

    /**
     * Analisa viagens marcadas como "Editadas" no GPS que estão sem passageiros.
     * Pode indicar edição indevida para cumprimento de meta.
     */
    checkEditedTrips() {
        if (!AppState.results) return alert("Processe os dados primeiro.");

        // Filtra viagens marcadas como editada="nao" (ou sim, dependendo do seu arquivo) 
        // mas que o motor de sincronismo deixou com 0 passageiros
        const casos = AppState.results.trips.filter(t => 
            String(t.viagemEditada).toLowerCase() === "sim" && (t.paxEfetivos || []).length === 0
        );

        if (casos.length === 0) {
            alert("Nenhuma inconsistência encontrada em viagens editadas.");
        } else {
            let msg = "AUDITORIA DE EDIÇÕES (Sem Passageiros)\n\n";
            casos.forEach(t => {
                msg += `⚠️ Veículo: ${t.veiculo} | Linha: ${t.linha} | Horário: ${t.partidaReal}\n`;
            });
            alert(msg);
        }
    },

    _renderAnomaliesResult(lista) {
        if (lista.length === 0) {
            alert("Nenhuma omissão suspeita encontrada.");
            return;
        }

        let tableHtml = `
            <p style="margin-bottom: 15px; font-size: 0.9rem; color: var(--text-muted);">
                Abaixo estão os carros que tiveram passageiros embarcados no horário em que o GPS registrou uma Omissão.
            </p>
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
                                        style="background: var(--bg-input); color: var(--primary); border: 1px solid var(--primary); padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 0.7rem;">
                                    Verificar
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        UIController.showModal(`Auditoria de Omissões (${lista.length} casos)`, tableHtml);
    },

    manageOmissions() {
        if (!AppState.results) return alert("Processe os dados primeiro.");

        const todasOmissoes = AppState.results.trips.filter(t => t.isOmissao);

        let html = `
            <div style="margin-bottom: 15px; display: flex; gap: 10px;">
                <input type="text" id="omissao-search-linha" placeholder="Filtrar Linha" oninput="Anomalies.filterOmissionList()" style="padding: 5px; background: var(--bg-input); color: white; border: 1px solid var(--border);">
            </div>
            <div id="omissao-list-container" style="max-height: 400px; overflow-y: auto;">
                ${this._renderOmissionList(todasOmissoes)}
            </div>
        `;

        UIController.showModal("Gerenciar Omissões (GPS Status 2)", html);
    },

    _renderOmissionList(lista) {
        return `
            <table style="width: 100%; border-collapse: collapse; font-size: 0.8rem;">
                <thead style="background: var(--bg-input); position: sticky; top: 0;">
                    <tr>
                        <th style="padding: 8px; border: 1px solid var(--border);">Empresa</th>
                        <th style="padding: 8px; border: 1px solid var(--border);">Linha</th>
                        <th style="padding: 8px; border: 1px solid var(--border);">Hora Planejada</th>
                        <th style="padding: 8px; border: 1px solid var(--border);">Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${lista.map(t => `
                        <tr class="omissao-row" data-linha="${t.linha}">
                            <td style="padding: 8px; border: 1px solid var(--border);">${t.empresa}</td>
                            <td style="padding: 8px; border: 1px solid var(--border);">${t.linha}</td>
                            <td style="padding: 8px; border: 1px solid var(--border); text-align: center;">${t.partidaPlanejada}</td>
                            <td style="padding: 8px; border: 1px solid var(--border); text-align: center;">
                                <button onclick="Anomalies.toggleOmissionStatus('${t.id}')" 
                                        style="background: ${t.tratada ? 'var(--success)' : 'var(--bg-input)'}; border: 1px solid var(--border); color: white; cursor: pointer; padding: 2px 10px; border-radius: 4px;">
                                    ${t.tratada ? 'Tratada ✓' : 'Pendente'}
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
            // Re-renderiza a lista dentro do modal
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