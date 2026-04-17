// ============================================================
// Engine.js — Motor de conciliação do TransSync Pro
//
// Responsabilidades:
//   1. Receber os dados brutos normalizados (GPS + Bilhetagem)
//   2. Construir o Session — objeto central com todos os dados organizados
//   3. Executar as etapas de conciliação (A, B, C)
//   4. Devolver o Session populado para consumo de qualquer módulo
//
// O Engine não toca na UI. Não altera AppState diretamente.
// Quem chama o Engine é o main.js, que recebe o Session e o armazena.
// ============================================================

class Engine {

    // ----------------------------------------------------------
    // Construtor
    // rawGps e rawPax são arrays de linhas já normalizadas pelo DataNormalizer
    // Ambos são opcionais — o Engine opera com o que receber
    // ----------------------------------------------------------
    constructor(rawGps = [], rawPax = []) {
        this._rawGps = rawGps;
        this._rawPax = rawPax;
    }


    // ----------------------------------------------------------
    // PONTO DE ENTRADA PÚBLICO
    // Retorna o Session completo após todas as etapas
    // ----------------------------------------------------------
    process(empresasConciliacao = null) {
        const session = this._buildSession(empresasConciliacao);
        if (session.temGps && session.temBilhetagem) {
            this._etapaA(session);
            this._etapaB(session);
            this._etapaC(session);
        }
        // Registra quais empresas passaram pelo engine nesta execução
        if (empresasConciliacao) {
            session.empresasConciliadas = [...empresasConciliacao];
        } else {
            session.empresasConciliadas = [...new Set(session.viagens.map(v => v.empresa).filter(Boolean))];
        }
        this._calcularResumo(session);
        return session;
    }


    // ==========================================================
    // CONSTRUÇÃO DO SESSION
    // ==========================================================

    _buildSession(empresasConciliacao = null) {
        const cfg = APP_CONFIG;

        // --- Viagens (GPS) ---
        const statusAtivos = [
            ...cfg.engine.statusProdutivo,
            ...cfg.engine.statusExtra,
            ...cfg.engine.statusOmissao
            // statusOcioso é ignorado aqui intencionalmente
        ];

        const viagens = this._rawGps
            .filter(r => statusAtivos.includes(String(r.statusViagem)))
            .map((r, idx) => this._buildViagem(r, idx));

        // --- Passageiros (Bilhetagem) ---
        // Linhas ignoradas são excluídas da conciliação mas preservadas no modelo
        const linhasIgnoradas = new Set(
            (cfg.fontes.bilhetagem.linhasIgnoradas || []).map(l => String(l))
        );

        const passageiros = this._rawPax.map((r, idx) => this._buildPassageiro(r, idx));
        const [paxConciliaveis, paxIgnorados] = this._partition(
            passageiros,
            p => !linhasIgnoradas.has(p.linha)
        );

        // --- Índices para performance ---
        // paxPorVeiculo considera apenas as empresas selecionadas para conciliação
        const empresasSet       = empresasConciliacao ? new Set(empresasConciliacao) : null;
        const paxParaConciliar  = empresasSet
            ? paxConciliaveis.filter(p => empresasSet.has(p.empresa))
            : paxConciliaveis;

        const viagensPorVeiculo  = this._groupBy(viagens,          'veiculo');
        const paxPorVeiculo      = this._groupBy(paxParaConciliar,  'veiculo');

        // Agrupa viagens por tabela para uso no Anomalies (identificar carro de omissões)
        const viagensPorTabela   = this._groupBy(viagens, 'tabela');

        return {
            // Dados
            viagens,
            passageiros,          // todos — incluindo ignorados e não conciliáveis
            paxIgnorados,         // linhas sem correspondência no GPS (preservados para outros usos)

            // Data de operação extraída do primeiro registro GPS (formato bruto do arquivo)
            dataOperacao: this._rawGps[0]?.data || "",

            // Índices internos (usados pelo Engine e módulos — não exportados)
            _idx: { viagensPorVeiculo, paxPorVeiculo, viagensPorTabela },

            // Flags de presença
            temGps:        viagens.length > 0,
            temBilhetagem: passageiros.length > 0,

            // Empresas que já passaram pelo engine (define o escopo das exceções)
            empresasConciliadas: [],

            // Resultado da conciliação — populado pelas etapas
            resumo: null,

            // Sugestões da etapa C — aguardando confirmação do usuário
            sugestoes: []
        };
    }

    _buildViagem(r, idx) {
        const cfg    = APP_CONFIG.engine;
        const status = String(r.statusViagem);

        const isOmissao  = cfg.statusOmissao.includes(status);
        const isExtra    = cfg.statusExtra.includes(status);
        const isEditada  = String(r.viagemEditada).toLowerCase() === "sim";

        // Omissões não têm horário real — usa planejado para fins de indexação temporal
        const hIni = isOmissao ? r.partidaPlanejada  : r.partidaReal;
        const hFim = isOmissao ? r.chegadaPlanejada  : r.chegadaReal;

        let mInicio = this._toMin(hIni);
        let mFim    = this._toMin(hFim);

        // Virada de dia: chegada menor que partida = passou da meia-noite
        const pernoite = mFim > 0 && mFim < mInicio;
        if (pernoite) mFim += 1440;

        return {
            // Identificação
            id:               `trip_${idx}`,
            veiculo:          r.veiculo          || "",
            linha:            r.linha            || "",
            linha_base:       r.linha_base       || r.linha || "",
            sentido:          r.sentido          || "UNICO",
            empresa:          r.empresa          || "",
            tabela:           r.tabela           || "",
            motorista:        r.motorista        || "",

            // Horários (strings originais preservadas para exibição)
            partidaPlanejada:  r.partidaPlanejada  || "",
            chegadaPlanejada:  r.chegadaPlanejada  || "",
            partidaReal:       r.partidaReal       || "",
            chegadaReal:       r.chegadaReal       || "",

            // Horários em minutos (usados pelo Engine)
            mInicio,
            mFim,
            pernoite,

            // Flags de estado
            isOmissao,
            isExtra,
            isEditada,
            convertidaDeOmissao: false,  // true quando omissão recebe pax manualmente
            editadaManualmente:  false,  // true quando usuário altera via UI

            // Conciliação — populado pelas etapas A/B ou confirmação do usuário
            paxEfetivos: []
        };
    }

    _buildPassageiro(r, idx) {
        return {
            // Identificação
            id:      `pax_${idx}`,
            veiculo: r.veiculo  || "",
            linha:   r.linha    || "",
            empresa: r.empresa  || "",
            horario: r.horario  || "",
            tipo:    r.tipo     || "",
            tarifa:  r.tarifa   || "",

            // Horário em minutos (usado pelo Engine)
            mHorario: this._toMin(r.horario),

            // Conciliação
            assigned:          false,
            tripId:            null,
            atribuicaoMetodo:  null,  // "etapa_a" | "etapa_b" | "etapa_c" | "manual"
            deltaMinutos:      null   // distância em minutos até o início da viagem atribuída
        };
    }


    // ==========================================================
    // ETAPA A — Match direto
    // Critério duro: veiculo + linha + passageiro dentro de [mInicio, mFim]
    // Sem tolerância.
    // ==========================================================

    _etapaA(session) {
        const { _idx } = session;

        for (const veiculo in _idx.paxPorVeiculo) {
            const passageiros = _idx.paxPorVeiculo[veiculo];
            const viagens     = this._viagensConciliaveis(_idx.viagensPorVeiculo[veiculo] || []);

            for (const p of passageiros) {
                if (p.assigned) continue;

                for (const v of viagens) {
                    if (p.linha !== v.linha_base) continue;
                    const pMin = this._ajustarPernoite(p.mHorario, v);
                    if (pMin >= v.mInicio && pMin <= v.mFim) {
                        this._atribuir(p, v, "etapa_a");
                        break;
                    }
                }
            }
        }
    }


    // ==========================================================
    // ETAPA B — Match por tolerância
    // Para passageiros fora da janela exata mas dentro das margens do settings.
    // ==========================================================

    _etapaB(session) {
        const { _idx } = session;
        const tolCfg = APP_CONFIG.engine.tolerancias;

        for (const veiculo in _idx.paxPorVeiculo) {
            const passageiros = _idx.paxPorVeiculo[veiculo];
            const viagens     = this._viagensConciliaveis(_idx.viagensPorVeiculo[veiculo] || []);

            for (const p of passageiros) {
                if (p.assigned) continue;

                // Ordena candidatos por proximidade ao passageiro (menor delta primeiro)
                // Resolve empate quando o passageiro cabe em duas janelas sobrepostas
                const candidatos = viagens
                    .filter(v => p.linha === v.linha_base)
                    .map(v => {
                        const pMin = this._ajustarPernoite(p.mHorario, v);
                        const tol  = tolCfg[v.sentido] || tolCfg["UNICO"];
                        const dentro = pMin >= (v.mInicio - tol.inicioMin)
                                    && pMin <= (v.mFim    + tol.fimMin);
                        const delta  = Math.abs(pMin - v.mInicio);
                        return { v, dentro, delta };
                    })
                    .filter(c => c.dentro)
                    .sort((a, b) => a.delta - b.delta);

                if (candidatos.length > 0) {
                    const melhor = candidatos[0];
                    this._atribuir(p, melhor.v, "etapa_b", melhor.delta);
                }
            }
        }
    }


    // ==========================================================
    // ETAPA C — Análise de remanescentes
    // Classifica passageiros não atribuídos e gera sugestões para revisão.
    // Nenhuma atribuição automática — o usuário confirma.
    // ==========================================================

    _etapaC(session) {
        const { _idx } = session;
        const gapMax  = APP_CONFIG.engine.gapCurtoMax;
        const pesos   = APP_CONFIG.engine.pesos;
        const confMin = APP_CONFIG.engine.confiancaMinima;

        const sugestoes = [];

        for (const veiculo in _idx.paxPorVeiculo) {
            const passageiros = _idx.paxPorVeiculo[veiculo].filter(p => !p.assigned);
            if (passageiros.length === 0) continue;

            // Todas as viagens do veículo (incluindo omissões), ordenadas por início
            const todasViagens = (_idx.viagensPorVeiculo[veiculo] || [])
                .filter(v => !APP_CONFIG.engine.statusOcioso.includes(String(v.statusViagem)))
                .sort((a, b) => a.mInicio - b.mInicio);

            if (todasViagens.length === 0) continue;

            for (const p of passageiros) {
                const pMin = p.mHorario;
                let melhorSugestao = null;

                for (let i = 0; i < todasViagens.length; i++) {
                    const v    = todasViagens[i];
                    const vAnt = todasViagens[i - 1] || null;
                    const vPrx = todasViagens[i + 1] || null;

                    // --- Detecta o contexto do passageiro em relação a esta viagem ---

                    // Caso: passageiro dentro da viagem mas linha divergente (3.3)
                    const pMinAjust = this._ajustarPernoite(pMin, v);
                    const dentroJanela = pMinAjust >= v.mInicio && pMinAjust <= v.mFim;
                    const linhaBate    = p.linha === v.linha_base;

                    // Caso: passageiro no gap após esta viagem
                    const aposViagem   = pMin > v.mFim;
                    const antesProxima = vPrx ? pMin < vPrx.mInicio : false;
                    const gap          = vPrx ? vPrx.mInicio - v.mFim : Infinity;
                    const gapCurto     = gap <= gapMax;

                    // --- Calcula confiança para candidatura desta viagem ---
                    let confianca = 0;
                    let motivo    = null;

                    if (dentroJanela) {
                        // Linha divergente (carro e horário batem, linha não)
                        if (!linhaBate) {
                            confianca += pesos.matchVeiculo;  // carro bate (já estamos iterando por veículo)
                            // linha não bate — não soma matchLinha
                            confianca += pesos.matchSentido * (p.sentido === v.sentido ? 1 : 0);
                            motivo = "linha_divergente";
                        }
                        // Se linha bate e está dentro, já deveria ter sido pego na B — skip
                    } else if (aposViagem && antesProxima) {
                        // Passageiro no gap entre esta viagem e a próxima
                        if (gapCurto) {
                            // Gap curto → terminal → candidato é a PRÓXIMA viagem
                            if (vPrx) {
                                confianca += pesos.matchVeiculo;
                                confianca += linhaBate || p.linha === vPrx.linha_base ? pesos.matchLinha : 0;
                                confianca += pesos.dentroGapCurto;
                                motivo = "gap_curto";
                                // Registra sugestão para a PRÓXIMA viagem, não a atual
                                const score = Math.min(confianca, 100);
                                if (score >= confMin) {
                                    sugestoes.push(this._buildSugestao(p, vPrx, motivo, score));
                                }
                                break; // Encontrou o gap — não precisa continuar
                            }
                        } else {
                            // Gap longo → entrepico → candidato é a viagem ANTERIOR
                            if (vAnt) {
                                confianca += pesos.matchVeiculo;
                                confianca += p.linha === vAnt.linha_base ? pesos.matchLinha : 0;
                                confianca += pesos.foraGapLongo;
                                motivo = "gap_longo";
                                const score = Math.min(confianca, 100);
                                if (score >= confMin) {
                                    sugestoes.push(this._buildSugestao(p, vAnt, motivo, score));
                                }
                                break;
                            }
                        }
                    }

                    // Registra sugestão de linha divergente se passou o threshold
                    if (motivo === "linha_divergente") {
                        const score = Math.min(confianca, 100);
                        if (score >= confMin) {
                            sugestoes.push(this._buildSugestao(p, v, motivo, score));
                        }
                        break;
                    }
                }
            }
        }

        // Acumula (modo incremental preserva sugestões de outras empresas já processadas)
        session.sugestoes = [...(session.sugestoes || []), ...sugestoes];
        session.sugestoes.sort((a, b) => b.confianca - a.confianca || a.mHorario - b.mHorario);
    }

    _buildSugestao(pax, viagem, motivo, confianca) {
        return {
            paxId:      pax.id,
            tripId:     viagem.id,
            motivo,     // "gap_curto" | "gap_longo" | "linha_divergente"
            confianca,  // 0–100
            confirmada: false,
            mHorario:   pax.mHorario,  // para ordenação (não requer ref ao objeto)
            pax,        // referência — facilita renderização sem re-busca (stripped on export)
            viagem      // referência (stripped on export)
        };
    }


    // ==========================================================
    // RESUMO
    // Calculado após todas as etapas — usado pelo dashboard e exportação
    // ==========================================================

    _calcularResumo(session) {
        const { viagens, passageiros, paxIgnorados, sugestoes } = session;

        // Restringe ao escopo das empresas conciliadas
        const conciliadas  = new Set(session.empresasConciliadas || []);
        const paxScope     = conciliadas.size > 0 ? passageiros.filter(p => conciliadas.has(p.empresa)) : passageiros;
        const viagensScope = conciliadas.size > 0 ? viagens.filter(v => conciliadas.has(v.empresa))     : viagens;

        const ignoradosIds  = new Set(paxIgnorados.map(p => p.id));
        const totalPax      = paxScope.length;
        const atribuidos    = paxScope.filter(p => p.assigned).length;
        const naoAtribuidos = paxScope.filter(p => !p.assigned && !ignoradosIds.has(p.id)).length;
        const ignorados     = paxScope.filter(p => ignoradosIds.has(p.id)).length;

        const totalViagens  = viagensScope.length;
        const omissoes      = viagensScope.filter(v => v.isOmissao).length;
        const extras        = viagensScope.filter(v => v.isExtra).length;
        const editadas      = viagensScope.filter(v => v.isEditada).length;

        const sugeridosC     = sugestoes.length;
        const autoSelecionaveis = sugestoes.filter(
            s => s.confianca >= APP_CONFIG.ui.confiancaAutoSelecionavel
        ).length;

        session.resumo = {
            totalPax,
            atribuidos,
            naoAtribuidos,
            ignorados,
            totalViagens,
            omissoes,
            extras,
            editadas,
            sugeridosC,
            autoSelecionaveis,
            taxaConciliacao: totalPax > 0
                ? Math.round((atribuidos / (totalPax - ignorados)) * 100)
                : 0
        };
    }


    // ==========================================================
    // CONFIRMAÇÃO DE SUGESTÕES (etapa C)
    // Chamado pela UI quando o usuário confirma uma ou mais sugestões
    // Retorna o session atualizado
    // ==========================================================

    static confirmarSugestoes(session, sugestaoIds) {
        const ids = new Set(sugestaoIds);

        for (const s of session.sugestoes) {
            if (!ids.has(s.paxId)) continue;
            s.confirmada = true;

            const pax    = session.passageiros.find(p => p.id === s.paxId);
            const viagem = session.viagens.find(v => v.id === s.tripId);
            if (!pax || !viagem) continue;

            // Atribuição
            pax.assigned         = true;
            pax.tripId           = viagem.id;
            pax.atribuicaoMetodo = "etapa_c";
            viagem.paxEfetivos.push(pax.id);

            // Se a viagem era omissão, converte para produtiva
            if (viagem.isOmissao) {
                viagem.isOmissao           = false;
                viagem.convertidaDeOmissao = true;
                viagem.editadaManualmente  = true;
                viagem.partidaReal         = viagem.partidaPlanejada;
                viagem.chegadaReal         = viagem.chegadaPlanejada;
                // Veículo vem do passageiro (omissão não tem carro no GPS)
                if (!viagem.veiculo) viagem.veiculo = pax.veiculo;
            }
        }

        // Remove sugestões confirmadas da lista de pendentes
        session.sugestoes = session.sugestoes.filter(s => !s.confirmada);

        // Recalcula resumo
        const engine = new Engine();
        engine._calcularResumo(session);

        return session;
    }


    // ==========================================================
    // ATRIBUIÇÃO MANUAL (UI — passageiro arrastado para viagem)
    // Chamado pela UI diretamente, fora do fluxo de etapas
    // ==========================================================

    static atribuirManualmente(session, paxIds, tripId) {
        const viagem = session.viagens.find(v => v.id === tripId);
        if (!viagem) return session;

        for (const paxId of paxIds) {
            const pax = session.passageiros.find(p => p.id === paxId);
            if (!pax) continue;

            // Remove de viagem anterior se já estava atribuído
            if (pax.assigned && pax.tripId) {
                const anterior = session.viagens.find(v => v.id === pax.tripId);
                if (anterior) {
                    anterior.paxEfetivos = anterior.paxEfetivos.filter(id => id !== pax.id);
                }
            }

            pax.assigned         = true;
            pax.tripId           = viagem.id;
            pax.atribuicaoMetodo = "manual";
            viagem.paxEfetivos.push(pax.id);

            // Converte omissão se necessário
            if (viagem.isOmissao) {
                viagem.isOmissao           = false;
                viagem.convertidaDeOmissao = true;
                viagem.editadaManualmente  = true;
                viagem.partidaReal         = viagem.partidaPlanejada;
                viagem.chegadaReal         = viagem.chegadaPlanejada;
                if (!viagem.veiculo) viagem.veiculo = pax.veiculo;
            }
        }

        // Remove sugestões pendentes dos passageiros que acabaram de ser atribuídos
        const idsAtribuidos = new Set(paxIds);
        session.sugestoes = session.sugestoes.filter(s => !idsAtribuidos.has(s.paxId));

        const engine = new Engine();
        engine._calcularResumo(session);

        return session;
    }


    // ==========================================================
    // CONCILIAÇÃO INCREMENTAL (pós-import)
    // Processa apenas empresas selecionadas, preservando tudo
    // que já foi conciliado nas demais.
    // ==========================================================

    static conciliarIncremental(session, empresasConciliacao) {
        const empresasSet = new Set(empresasConciliacao);
        const engine = new Engine();

        // Re-aplica normalizações do settings atual sobre os dados do session
        // Seguro: valores canônicos não são chaves no mapeamento, então é idempotente.
        // Permite que mapeamentos adicionados após a última rodada sejam aproveitados.
        Engine.reNormalizarSession(session);

        // Remove sugestões pendentes das empresas selecionadas — serão regeneradas
        session.sugestoes = (session.sugestoes || []).filter(s => {
            const pax = session.passageiros.find(p => p.id === s.paxId);
            return !pax || !empresasSet.has(pax.empresa);
        });

        // Reconstrói _idx: todas as viagens (contexto completo), pax filtrado
        const paxParaConciliar = session.passageiros.filter(
            p => !p.assigned && empresasSet.has(p.empresa)
        );
        session._idx = {
            viagensPorVeiculo: engine._groupBy(session.viagens,       'veiculo'),
            paxPorVeiculo:     engine._groupBy(paxParaConciliar,      'veiculo'),
            viagensPorTabela:  engine._groupBy(session.viagens,       'tabela')
        };

        engine._etapaA(session);
        engine._etapaB(session);
        engine._etapaC(session);

        // Acumula empresas conciliadas (preserva rodadas anteriores)
        session.empresasConciliadas = [
            ...new Set([...(session.empresasConciliadas || []), ...empresasConciliacao])
        ];

        engine._calcularResumo(session);

        return session;
    }


    // ==========================================================
    // RE-NORMALIZAÇÃO DE SESSION EXISTENTE
    // Re-aplica os mapeamentos do settings atual sobre viagens e
    // passageiros já no session. Útil quando normalizacao.linha ou
    // normalizacao.empresa é atualizado após a primeira rodada.
    // ==========================================================

    static reNormalizarSession(session) {
        const cfgGps = APP_CONFIG.fontes.gps.normalizacao;
        const cfgPax = APP_CONFIG.fontes.bilhetagem.normalizacao;

        const aplicar = (valor, mapa) => mapa?.[valor] || valor;

        const derivarLinha = (obj, novaLinha) => {
            obj.linha = novaLinha;
            if (novaLinha.includes(' - ')) {
                const [base, sentido] = novaLinha.split(' - ');
                obj.linha_base = base.trim();
                obj.sentido    = sentido.trim().toUpperCase();
            } else {
                obj.linha_base = novaLinha;
            }
        };

        for (const v of session.viagens) {
            v.empresa = aplicar(v.empresa, cfgGps.empresa);
            v.veiculo = aplicar(v.veiculo, cfgGps.veiculo);
            const linhaNorm = aplicar(v.linha, cfgGps.linha);
            if (linhaNorm !== v.linha) derivarLinha(v, linhaNorm);
        }

        for (const p of session.passageiros) {
            p.empresa = aplicar(p.empresa, cfgPax.empresa);
            p.veiculo = aplicar(p.veiculo, cfgPax.veiculo);
            const linhaNorm = aplicar(p.linha, cfgPax.linha);
            if (linhaNorm !== p.linha) derivarLinha(p, linhaNorm);
        }
    }


    // ==========================================================
    // AUXILIARES INTERNOS
    // ==========================================================

    // Retorna apenas viagens que recebem passageiros automaticamente (etapas A e B)
    _viagensConciliaveis(viagens = []) {
        const { statusProdutivo, statusExtra } = APP_CONFIG.engine;
        return viagens
            .filter(v => !v.isOmissao)
            .sort((a, b) => a.mInicio - b.mInicio);
    }

    // Atribui passageiro a viagem e registra metadados
    // paxEfetivos guarda apenas o ID — objeto completo vive em session.passageiros
    _atribuir(pax, viagem, metodo, delta = null) {
        pax.assigned         = true;
        pax.tripId           = viagem.id;
        pax.atribuicaoMetodo = metodo;
        pax.deltaMinutos     = delta !== null ? Math.round(delta) : null;
        viagem.paxEfetivos.push(pax.id);
    }

    // Ajusta minutos do passageiro para comparação com viagem de pernoite
    _ajustarPernoite(pMin, viagem) {
        if (viagem.pernoite && pMin < viagem.mInicio) return pMin + 1440;
        return pMin;
    }

    // Converte "HH:mm", "HH:mm:ss" ou "DD/MM/AAAA HH:mm:ss" em minutos do dia
    _toMin(str) {
        if (!str) return 0;
        const match = String(str).match(/(\d{2}):(\d{2})/);
        if (!match) return 0;
        return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
    }

    // Agrupa array de objetos por valor de uma chave
    _groupBy(array, key) {
        return array.reduce((acc, item) => {
            const k = item[key] || "";
            (acc[k] = acc[k] || []).push(item);
            return acc;
        }, {});
    }

    // Particiona array em [passa, nãoPassa] por predicado
    _partition(array, pred) {
        const a = [], b = [];
        for (const item of array) (pred(item) ? a : b).push(item);
        return [a, b];
    }
}
