class Engine {
    constructor(trips, passengers) {
        this.trips = trips || [];
        this.passengers = passengers || [];
    }

    reconcile() {

        // 1. Definição de quais status vamos processar (Válidas + Omissões)
        const statusParaProcessar = [...APP_CONFIG.engine.statusViagensValidas, ...APP_CONFIG.engine.statusOmissoes];


        // 1. Filtragem por status (conforme pedido: apenas 1 e 3)
        // Usamos o filter e já criamos um novo array para evitar problemas de referência
        this.trips = this.trips.filter(trip => {
            return statusParaProcessar.includes(String(trip.statusViagem));
        });

        // 2. Inicialização
        this.trips.forEach((trip, idx) => {
            trip.id = `trip_${idx}`;
            trip.paxEfetivos = [];
            // Marca se é uma omissão para facilitar filtros na UI
            trip.isOmissao = APP_CONFIG.engine.statusOmissoes.includes(String(trip.statusViagem));
        });

        // 2. Organizar viagens por veículo e ORDENAR por horário para a lógica de GAP
        const tripsByVehicle = this._groupBy(this.trips, 'veiculo');
        
        for (let v in tripsByVehicle) {
            tripsByVehicle[v].sort((a, b) => {
                return this._timeToMinutes(a.partidaReal) - this._timeToMinutes(b.partidaReal);
            });
        }

        // 3. Organizar passageiros por veículo para performance
        const paxByVehicle = this._groupBy(this.passengers, 'veiculo');

        // 4. Processar cada veículo
        for (let veiculo in paxByVehicle) {
            const passageiros = paxByVehicle[veiculo];
            const viagens = tripsByVehicle[veiculo] || [];

            passageiros.forEach(p => {
                p.id = p.id || `pax_${Math.random().toString(36).substr(2, 9)}`;
                p.assigned = false;

                const pHora = this._timeToMinutes(this._extractTime(p.horario));
                
                // Tenta encontrar a viagem ideal para este passageiro
                for (let i = 0; i < viagens.length; i++) {
                    const vAtual = viagens[i];
                    const vProxima = viagens[i + 1];

                    // Identifica sentido: "105 - IDA" -> "IDA"
                    let sentido = "UNICO";
                    if (vAtual.linha && vAtual.linha.includes(' - ')) {
                        sentido = vAtual.linha.split(' - ')[1].trim().toUpperCase();
                    }

                    // Busca tolerâncias no settings (ou usa padrão UNICO se não achar)
                    const configTol = APP_CONFIG.engine.tolerancias || {};
                    const tol = configTol[sentido] || { inicio: 15, fim: 5 };

                    const vInicio = this._timeToMinutes(vAtual.partidaReal);
                    const vFim = this._timeToMinutes(vAtual.chegadaReal);

                    // REGRA 1: Dentro da janela da viagem (com tolerância de início/fim)
                    if (pHora >= (vInicio - tol.inicio) && pHora <= (vFim + tol.fim)) {
                        this._assign(p, vAtual);
                        break;
                    }

                    // REGRA 2: Passageiro no "GAP" (Entre o fim desta e o início da próxima)
                    if (vProxima && APP_CONFIG.engine.atribuirAoProximoNoGap) {
                        const proxInicio = this._timeToMinutes(vProxima.partidaReal);
                        const gapEmMinutos = proxInicio - vFim;

                        // Se o passageiro está entre as viagens e o intervalo é razoável
                        if (pHora > (vFim + tol.fim) && pHora < proxInicio) {
                            if (gapEmMinutos <= (APP_CONFIG.engine.limiteGapMinutos || 30)) {
                                // Conforme sua regra: passageiro no terminal aguardando a próxima
                                this._assign(p, vProxima); 
                                break;
                            }
                        }
                    }
                }
            });
        }

        return {
            trips: this.trips,
            unassigned: this.passengers.filter(p => !p.assigned)
        };
    }

    // Auxiliar: Marca atribuição e vincula objetos
    _assign(pax, trip) {
        pax.assigned = true;
        pax.tripId = trip.id;
        if (!trip.paxEfetivos) trip.paxEfetivos = [];
        trip.paxEfetivos.push(pax);
    }

    // Auxiliar: O método que estava faltando
    _groupBy(array, key) {
        return array.reduce((rv, x) => {
            (rv[x[key]] = rv[x[key]] || []).push(x);
            return rv;
        }, {});
    }

    // Auxiliar: Converte HH:mm ou HH:mm:ss em minutos totais do dia
    _timeToMinutes(timeStr) {
        if (!timeStr || typeof timeStr !== 'string') return 0;
        const parts = timeStr.trim().split(':');
        if (parts.length < 2) return 0;
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        return (h * 60) + m;
    }

    // Auxiliar: Extrai apenas o tempo de uma string "DD/MM/AAAA HH:mm:ss"
    _extractTime(val) {
        if (!val) return "00:00";
        const str = String(val).trim();
        return str.includes(' ') ? str.split(' ')[1] : str;
    }
}