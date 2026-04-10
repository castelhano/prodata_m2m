const APP_CONFIG = {
    gps: {
        colunas: {
            data: "A",
            linha: "B",
            veiculo: "D",
            motorista: "E",
            partidaReal: "H",
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
            empresa: "G"
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
        atribuirAoProximoNoGap: true,
        limiteGapMinutos: 30 // limite maximo para atribuicao
    }

};