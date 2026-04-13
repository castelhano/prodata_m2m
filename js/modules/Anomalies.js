// js/modules/Anomalies.js

const Anomalies = {
    checkOmissions() {
        if (!AppState.results) return alert("Processe os dados primeiro.");

        const omissoes = AppState.results.trips.filter(t => t.isOmissao);
        const engineTemp = new Engine();
        const suspeitas = [];

        omissoes.forEach(trip => {
            const tInicio = engineTemp._timeToMinutes(trip.partidaReal);
            const tFim = engineTemp._timeToMinutes(trip.chegadaReal);

            // 1. Pegamos todos os passageiros órfãos que embarcaram na janela desta omissão
            const paxNoHorario = AppState.results.unassigned.filter(p => {
                const pHora = engineTemp._timeToMinutes(engineTemp._extractTime(p.horario));
                return pHora >= (tInicio - 5) && pHora <= (tFim + 5);
            });

            // 2. Agrupamos esses passageiros por VEÍCULO para ver quem mais embarcou
            const agrupadoPorCarro = paxNoHorario.reduce((acc, p) => {
                acc[p.veiculo] = (acc[p.veiculo] || 0) + 1;
                return acc;
            }, {});

            // 3. Se um carro teve, por exemplo, mais de 10 passageiros nesse horário, ele é um candidato forte
            for (let carro in agrupadoPorCarro) {
                if (agrupadoPorCarro[carro] >= 5) { // Mínimo de 5 passageiros para ser suspeito
                    suspeitas.push({
                        viagemOmitida: trip,
                        carroCandidato: carro,
                        qtdPax: agrupadoPorCarro[carro],
                        linhaNoPax: paxNoHorario.find(p => p.veiculo === carro).linha
                    });
                }
            }
        });

        this._renderAnomaliesResult(suspeitas);
    },

    _renderAnomaliesResult(lista) {
        if (lista.length === 0) return alert("Nenhuma omissão suspeita encontrada.");

        let msg = "AUDITORIA DE OMISSÕES\n\n";
        lista.forEach(item => {
            msg += `⚠️ OMISSÃO GPS: Linha ${item.viagemOmitida.linha} às ${item.viagemOmitida.partidaReal}\n`;
            msg += `   PROVÁVEL CARRO: ${item.carroCandidato} (Encontrados ${item.qtdPax} passageiros)\n`;
            msg += `   LINHA NO VALIDADOR: ${item.linhaNoPax}\n`;
            msg += `------------------------------------------\n`;
        });
        msg += "\nUse o filtro de veículo no rodapé para associar manualmente o carro à viagem omitida.";
        alert(msg);
    }
};