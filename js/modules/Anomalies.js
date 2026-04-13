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
        const omissoes = AppState.results.trips.filter(t => t.isOmissao);
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

    /**
     * Exibe os resultados da auditoria na tela via modal
     */
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
};