class Engine {
    constructor(trips, passengers) {
        this.trips = trips || [];
        this.passengers = passengers || [];
    }
    
    reconcile() {
        const statusParaProcessar = [...APP_CONFIG.engine.statusViagensValidas, ...APP_CONFIG.engine.statusOmissoes];
        
        this.trips = this.trips.filter(trip => statusParaProcessar.includes(String(trip.statusViagem)));
        
        this.trips.forEach((trip, idx) => {
            trip.id = `trip_${idx}`;
            trip.paxEfetivos = [];
            trip.isOmissao = APP_CONFIG.engine.statusOmissoes.includes(String(trip.statusViagem));
            
            // --- Lógica de Virada de Dia ---
            trip.mInicio = this._timeToMinutes(trip.partidaReal);
            let mFim = this._timeToMinutes(trip.chegadaReal);
            
            if (mFim < trip.mInicio) { 
                // Se o fim é menor que o início, virou o dia (ex: 23:50 -> 00:20)
                mFim += 1440; 
                trip.pernoite = true;
            } else {
                trip.pernoite = false;
            }
            trip.mFim = mFim;
        });
        
        const tripsByVehicle = this._groupBy(this.trips, 'veiculo');
        const paxByVehicle = this._groupBy(this.passengers, 'veiculo');
        
        for (let veiculo in paxByVehicle) {
            const passageiros = paxByVehicle[veiculo];
            const viagens = tripsByVehicle[veiculo] || [];
            viagens.sort((a, b) => a.mInicio - b.mInicio);
            
            passageiros.forEach(p => {
                p.assigned = false;
                let pMin = this._timeToMinutes(p.horario);
                
                for (let i = 0; i < viagens.length; i++) {
                    const v = viagens[i];
                    const sentido = v.sentido || "UNICO";
                    const tol = APP_CONFIG.engine.tolerancias[sentido] || { inicio: 15, fim: 5 };
                    
                    // Testamos o passageiro no horário normal E no horário + 24h (caso a viagem seja pós-meia-noite)
                    const checkAssignment = (minuto) => {
                        // Regra 1: Dentro da viagem
                        if (minuto >= (v.mInicio - tol.inicio) && minuto <= (v.mFim + tol.fim)) {
                            return true;
                        }
                        // Regra 2: GAP (Passageiro esperando a próxima viagem no terminal)
                        const vProx = viagens[i+1];
                        if (vProx && APP_CONFIG.engine.atribuirAoProximoNoGap) {
                            if (minuto > (v.mFim + tol.fim) && minuto < vProx.mInicio) {
                                const gap = vProx.mInicio - v.mFim;
                                if (gap <= (APP_CONFIG.engine.limiteGapMinutos || 30)) {
                                    // Atribui à vProx em vez de v (pax está no terminal)
                                    return "NEXT"; 
                                }
                            }
                        }
                        return false;
                    };
                    
                    let res = checkAssignment(pMin);
                    if (!res) res = checkAssignment(pMin + 1440); // Tenta considerar passageiro na virada do dia
                    
                    if (res === true) {
                        this._assign(p, v, "engine_range");
                        break;
                    } else if (res === "NEXT") {
                        this._assign(p, viagens[i+1], "engine_gap");
                        break;
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
    _assign(pax, trip, metodo = "engine_range") {
        pax.assigned = true;
        pax.tripId = trip.id;
        pax.atribuicaoMetodo = metodo; // "engine_range", "engine_gap" ou "manual"
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
        if (!timeStr) return 0;
        // Extrai apenas HH:mm caso venha com data (Bilhetagem)
        const match = timeStr.match(/(\d{2}):(\d{2})/);
        if (!match) return 0;
        const h = parseInt(match[1], 10);
        const m = parseInt(match[2], 10);
        return (h * 60) + m;
    }
    
    
    // Auxiliar: Extrai apenas o tempo de uma string "DD/MM/AAAA HH:mm:ss"
    _extractTime(val) {
        if (!val) return "00:00";
        const str = String(val).trim();
        return str.includes(' ') ? str.split(' ')[1] : str;
    }
}