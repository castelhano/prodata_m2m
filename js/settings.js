const APP_CONFIG = {
    gps: {
        colunas: {
            data: "A",
            linha: "B",
            veiculo: "D",
            motorista: "E",
            partidaPlanejada: "G",
            partidaReal: "H",
            chegadaPlanejada: "K",
            chegadaReal: "L",
            statusViagem: "U",
            viagemEditada: "V",
            empresa: "Y"
        },
        normalizacao: {
            empresa: {
                "Rápido Cuiabá": "Rapido",
                "VPAR TRANSPORTES": "Vpar",
            },
            linha: { "A14 - UNICO": "A14" }
        }
    },
    bilhetagem: {
        colunas: {
            horario: "F",
            empresa: "G",
            linha: "H",
            veiculo: "I",
            tipo: "K",
            tarifa: "L",
        },
        normalizacao: {
            empresa: {
                "CARIBUS TRANSPORTES E SERVIÇOS": "Caribus",
                "CMT URBANO": "CMT",
                "CONSORCIO METROPOLITANO TRANSP": "Consorcio Met",
                "INTEGRAÇÃO TRANSPORTES": "Integracao",
                "MTU-CUIABA": "Term Cuiaba",
                "MTU-VARZEA GRANDE": "Term VG",
                "RAPIDO CUIABA": "Rapido",
                "UNIAO (VZG) TRANSPORTES E TURISMO LTDA": "Uniao",
                "VPAR TRANSPORTES": "Vpar"
            },
            linha: { "922": "A22", "103": "103-A" }
        }
    },
    engine: {
        // Tolerâncias por sentido
        tolerancias: {
            "IDA": { inicio: 20, fim: 5 },
            "VOLTA": { inicio: 20, fim: 5 },
            "UNICO": { inicio: 15, fim: 15 }
        },
        // se passageiro esta entre duas viagens deve ser atribuido a proxima
        statusViagensValidas: ["1", "3"],
        statusOmissoes: ["2"],
        atribuirAoProximoNoGap: true,
        limiteGapMinutos: 30 // limite maximo para atribuicao
    },
    anomalies: {
        pesos: {
            matchVeiculo: 40,        // Carro planejado na omissão = Carro do passageiro
            matchLinha: 20,          // Linha planejada na omissão = Linha do passageiro
            gapEntreRegistros: 50,   // Omissão entre duas viagens produtivas do mesmo carro
            densidadeAlta: 30,       // Mais de 60% dos órfãos do carro estão nesta janela
            foraTolerancia: 15,      // Passageiros detectados na "beirada" da janela de auditoria
        },
        criterios: {
            minPassageirosSuspeitos: 1,  // 0 ignora filtro, 1+ exige ao menos N pax
            minPontuacaoSuspeita: 20,    // Pontuação minima para carro ser tratado como suspeito
            janelaAuditoriaMinutos: 25,  // Raio de busca em torno do planejado
            thresholdAlto: 80,
            thresholdMedio: 45
        }
    }

};