// ============================================================
// settings.js — Configuração central do TransSync Pro
// Toda lógica de negócio parametrizável vive aqui.
// O Engine, os módulos e a UI leem deste objeto.
// ============================================================

const APP_CONFIG = {

    // ----------------------------------------------------------
    // 1. FONTES DE DADOS
    // Cada fonte define como seu arquivo é lido e normalizado.
    // O valor canônico de cada campo é o usado em todo o app.
    // Adicionar nova fonte no futuro = novo bloco aqui.
    // ----------------------------------------------------------
    fontes: {

        gps: {
            colunas: {
                data:             { coluna: "A", regex: /\d{2}\/\d{2}\/\d{4}/, descricao: "DD/MM/AAAA (data de operação)" },
                linha:              "B",
                veiculo:            "D",
                motorista:          "E",
                partidaPlanejada:   "G",
                partidaReal:        "H",
                chegadaPlanejada:   "K",
                chegadaReal:        "L",
                statusViagem:       "U",
                viagemEditada:      "W",
                tabela:             "X",
                empresa:          { coluna: "Y", regex: /.+/, descricao: "nome da empresa" }
            },
            // De como vem no arquivo → valor canônico usado no app
            normalizacao: {
                empresa: {
                    "Rápido Cuiabá":    "Rapido",
                    "VPAR TRANSPORTES": "Vpar"
                },
                linha: {
                    // Adicionar exceções conforme identificado
                    // Ex: "A14 - UNICO": "A14"
                },
                veiculo: {
                    // Exceções de numeração de frota entre arquivos
                    // Ex: "01077": "1077"
                }
            }
        },

        bilhetagem: {
            colunas: {
                horario:  { coluna: "F", regex: /\d{2}:\d{2}/, descricao: "HH:MM (horário de validação)" },
                empresa:  { coluna: "G", regex: /.+/,           descricao: "nome da empresa" },
                linha:      "H",
                veiculo:    "I",
                tipo:       "K",
                tarifa:     "L"
            },
            normalizacao: {
                empresa: {
                    "CARIBUS TRANSPORTES E SERVIÇOS":           "Caribus",
                    "CMT URBANO":                               "CMT",
                    "CONSORCIO METROPOLITANO TRANSP":           "Consorcio Met",
                    "INTEGRAÇÃO TRANSPORTES":                   "Integracao",
                    "MTU-CUIABA":                               "Term Cuiaba",
                    "MTU-VARZEA GRANDE":                        "Term VG",
                    "RAPIDO CUIABA":                            "Rapido",
                    "UNIAO (VZG) TRANSPORTES E TURISMO LTDA":   "Uniao",
                    "VPAR TRANSPORTES":                         "Vpar"
                },
                linha: {
                    // Bilhetagem usa código numérico, GPS usa alfanumérico
                    // Ambos convergem para o valor canônico (padrão GPS)
                    "902":  "A02",
                    "906":  "A06",
                    "907":  "A07",
                    "908":  "A08",
                    "910":  "A10",
                    "914":  "A14",
                    "915":  "A15",
                    "922":  "A22",
                    "922B":  "A22B",
                },
                veiculo: {
                    // Exceções de numeração entre arquivos
                }
            },

            // Linhas presentes na bilhetagem que não existem no GPS.
            // Passageiros dessas linhas são preservados no modelo de dados
            // mas ignorados pelo Engine — sem tentativa de conciliação.
            linhasIgnoradas: ["F01", "032", "033", "034"]
        }
    },

    // ----------------------------------------------------------
    // 2. EMPRESAS — Cadastro canônico de operadoras
    // A chave é o slug da empresa (imutável).
    // nome: valor canônico produzido pela normalizacao acima.
    // abbr: usado na nomenclatura dos arquivos exportados.
    // ----------------------------------------------------------
    empresas: {
        rapido:      { id: 1, nome: "Rapido",        abbr: "RC", defCorte: true , defConciliacao: true ,  nomeCompleto: "Rápido Cuiabá"                   },
        vpar:        { id: 2, nome: "Vpar",          abbr: "VP", defCorte: true , defConciliacao: true ,  nomeCompleto: "VPAR Transportes"                },
        caribus:     { id: 3, nome: "Caribus",       abbr: "CB", defCorte: true , defConciliacao: false,  nomeCompleto: "Caribus Transportes"             },
        cmt:         { id: 4, nome: "CMT",           abbr: "CM", defCorte: false, defConciliacao: false,  nomeCompleto: "CMT Urbano"                      },
        consorcio:   { id: 5, nome: "Consorcio Met", abbr: "CO", defCorte: false, defConciliacao: false,  nomeCompleto: "Consórcio Metropolitano Transp"  },
        integracao:  { id: 6, nome: "Integracao",    abbr: "IN", defCorte: true , defConciliacao: false,  nomeCompleto: "Integração Transportes"          },
        termCuiaba:  { id: 7, nome: "Term Cuiaba",   abbr: "TC", defCorte: true , defConciliacao: false,  nomeCompleto: "MTU-Cuiabá"                      },
        termVG:      { id: 8, nome: "Term VG",       abbr: "TV", defCorte: false, defConciliacao: false,  nomeCompleto: "MTU-Várzea Grande"               },
        uniao:       { id: 9, nome: "Uniao",         abbr: "UN", defCorte: false, defConciliacao: false,  nomeCompleto: "União VZG Transportes"           }
    },

    // ----------------------------------------------------------
    // 3. ENGINE — Regras de conciliação
    // ----------------------------------------------------------
    engine: {

        // Classificação dos status de viagem no GPS
        // value    : código bruto que vem no arquivo
        // concilia : participa das etapas A e B (recebe passageiros automaticamente)
        // isOmissao: entra no modelo mas sem pax automático; usa horário planejado
        // isExtra  : viagem realizada sem horário planejado (extra operacional)
        // ignorar  : excluído do modelo completamente pelo Engine
        // abbr     : rótulo exibido na interface
        //
        // viagemEditada (col. W "Sim"/"Nao"): atributo da viagem, não é status
        status: {
            produtivo: { value: "1", concilia: true,  isOmissao: false, isExtra: false, ignorar: false, abbr: "P" },
            extra:     { value: "3", concilia: true,  isOmissao: false, isExtra: true,  ignorar: false, abbr: "X" },
            omissao:   { value: "2", concilia: false, isOmissao: true,  isExtra: false, ignorar: false, abbr: "O" },
            ocioso:    { value: "6", concilia: false, isOmissao: false, isExtra: false, ignorar: true,  abbr: "-" },
        },

        // --- Etapa A: Match direto ---
        // Critério duro: veiculo + linha + passageiro dentro de [mInicio, mFim]
        // Sem tolerância. Nenhum parâmetro necessário.

        // --- Etapa B: Match por tolerância ---
        // Para passageiros fora da janela exata mas dentro das margens abaixo.
        // Modelado por sentido para refletir embarque antecipado e desembarque tardio.
        tolerancias: {
            "IDA":   { inicioMin: 20, fimMin: 20 },
            "VOLTA": { inicioMin: 20, fimMin: 20 },
            "UNICO": { inicioMin: 20, fimMin: 20 }
        },

        // --- Etapa C: Análise de remanescentes ---
        // O Engine classifica cada passageiro não atribuído e gera sugestões.
        // Nenhuma atribuição automática — o usuário confirma antes de qualquer mudança.

        // Limites de gap entre viagens do mesmo veículo:
        // gap <= gapCurtoMax           → passageiro no terminal → sugerir PRÓXIMA viagem
        // gapCurtoMax < gap <= gapLongoMax → passageiro no entrepico → sugerir viagem ANTERIOR
        // gap > gapLongoMax            → gap excessivo → sem sugestão
        gapCurtoMax:  15,  // minutos
        gapLongoMax:  30,  // minutos — acima deste valor a confiança vai a zero

        // Pesos para cálculo de confiança das sugestões (soma define score 0–N)
        // Veículo pesa mais que linha: troca de carro é rara, linha errada é operacionalmente possível
        pesos: {
            matchVeiculo:   40,   // Carro do passageiro bate com o carro da viagem candidata
            matchLinha:     25,   // Linha canônica bate (após normalização)
            matchSentido:   10,   // Sentido bate quando disponível
            dentroGapCurto: 25,   // Passageiro dentro da janela estendida por gapCurtoMax
            dentroGapLongo: 15    // Passageiro dentro da janela estendida por gapLongoMax (menor confiança)
        },

        // Confiança mínima para uma sugestão aparecer na interface
        confiancaMinima: 50
    },

    // ----------------------------------------------------------
    // 4. ANOMALIES — Parâmetros por módulo de análise
    // Cada chave corresponde a um arquivo em js/modules/
    // ----------------------------------------------------------
    anomalies: {

        omissoesComPax: {
            ativo: true,

            // Janela de busca em torno do horário planejado da omissão
            janelaAuditoriaMin: 25,

            // Mínimo de passageiros órfãos na janela para considerar a omissão como candidata.
            // Garante que casos sem nenhuma evidência de passageiro sejam descartados antes da pontuação.
            minPassageirosSuspeitos: 2,

            // Pontuação mínima para reportar a omissão como suspeita
            pontuacaoMinima: 20,

            // Percentual mínimo dos passageiros órfãos do veículo (no dia inteiro)
            // concentrados na janela da omissão para ativar o critério densidadeAlta.
            // Calculado sobre TODOS os órfãos do veículo — não por viagem isolada.
            // Ex: veículo com 125 órfãos no dia, 100 na janela = 80% → critério ativo
            densidadePercentualMinimo: 80,

            pesos: {
                matchVeiculo:           40,   // Carro planejado da omissão bate com carro do passageiro
                matchLinha:             20,   // Linha planejada bate com linha do passageiro
                gapEntreViagens:        50,   // Omissão está entre duas viagens produtivas da mesma tabela
                densidadeAlta:          30,   // Concentração de órfãos acima de densidadePercentualMinimo
                foraTolerancia:         15,   // Passageiros detectados na borda da janela de auditoria
                penalidadeLinhaIgnorada:-20   // Penalidade proporcional quando pax na janela são de linhas ignoradas
            },

            thresholds: {
                alto:  80,
                medio: 45
            }
        },

        editadasSemPax: {
            ativo: true
            // Lógica: viagemEditada === "Sim" + paxEfetivos.length === 0
            // Sem parâmetros adicionais por enquanto
        }

        // Novos módulos entram aqui:
        // intervalosLongos:  { ativo: true, ... }
        // linhasDivergentes: { ativo: true, ... }
    },

    // ----------------------------------------------------------
    // 5. UI — Comportamento de apresentação
    // ----------------------------------------------------------
    ui: {
        excecoesPorPagina: 100,

        // Sugestões da etapa C com confiança >= este valor
        // chegam pré-marcadas na interface para confirmação em lote
        confiancaAutoSelecionavel: 70
    }

};
