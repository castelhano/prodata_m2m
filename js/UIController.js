// ============================================================
// UIController.js — Camada de apresentação
//
// Responsabilidade: ler o Session e atualizar o DOM.
// Não contém lógica de negócio — não conhece o Engine.
//
// Todos os métodos são puros do ponto de vista de dados:
// recebem o que precisam renderizar como parâmetro.
// Leem AppState.session apenas quando necessário para filtros
// e buscas que operam sobre o estado atual.
// ============================================================

const UIController = {

    // ==========================================================
    // LOADER
    // ==========================================================

    showLoader(texto = "Processando...") {
        const loader = document.getElementById("loader");
        loader.querySelector("p").innerText = texto;
        loader.classList.remove("hidden");
    },

    hideLoader() {
        document.getElementById("loader").classList.add("hidden");
    },


    // ==========================================================
    // STATUS BADGE
    // ==========================================================

    // tipo: "muted" | "success" | "danger" | "primary"
    setStatusBadge(texto, tipo = "muted") {
        const badge = document.getElementById("status-badge");
        badge.innerText = texto;
        badge.style.color = `var(--${tipo})`;
    },


    // ==========================================================
    // VISIBILIDADE DE ELEMENTOS
    // ==========================================================

    showElement(id) {
        document.getElementById(id)?.classList.remove("hidden");
    },

    hideElement(id) {
        document.getElementById(id)?.classList.add("hidden");
    },


    // ==========================================================
    // FUNCIONALIDADES DISPONÍVEIS
    // Exibe/oculta seções conforme arquivos carregados
    // ==========================================================

    atualizarFuncionalidadesDisponiveis() {
        const temGps = !!AppState.rawGps;
        const temPax = !!AppState.rawPax;

        // Botão processar só aparece com GPS (bilhetagem é opcional)
        if (temGps) this.showElement("btn-processar");

        // Seção de operações só com GPS processado
        // (será exibida pelo updateDashboard após processamento)
    },


    // ==========================================================
    // SELETOR DE EMPRESAS
    // ==========================================================

    // Modo primeiro carregamento: dois paineis (pax + conciliação)
    showSeletorEmpresas({ empresasPax, empresasGps, onConciliar }) {
        const section = document.getElementById("company-selector-section");

        document.getElementById("selector-etapa-num").innerText   = "ETAPA 01";
        document.getElementById("selector-etapa-title").innerText = "Configurar operadoras";
        document.getElementById("painel-pax-corte").classList.remove("hidden");

        const empresasCfg = APP_CONFIG.empresas || {};

        const checkItem = (cls, val, checked) =>
            `<label style="display:flex;gap:8px;cursor:pointer;align-items:center;">
                <input type="checkbox" class="${cls}" value="${val}"${checked ? " checked" : ""}> ${val}
             </label>`;

        document.getElementById("checkboxes-pax").innerHTML =
            empresasPax.map(e => {
                const cfg = Object.values(empresasCfg).find(c => c.nome === e);
                const checked = cfg ? cfg.defCorte !== false : true;
                return checkItem("company-pax-select", e, checked);
            }).join("");

        document.getElementById("checkboxes-conciliacao").innerHTML =
            empresasGps.map(e => {
                const cfg = Object.values(empresasCfg).find(c => c.nome === e);
                const checked = cfg ? cfg.defConciliacao !== false : true;
                return checkItem("company-conc-select", e, checked);
            }).join("");

        section.classList.remove("hidden");
        lucide.createIcons();

        document.getElementById("btn-conciliar").onclick = () => {
            const empresasPaxSel = Array.from(
                document.querySelectorAll(".company-pax-select:checked")
            ).map(cb => cb.value);

            const empresasConcSel = Array.from(
                document.querySelectorAll(".company-conc-select:checked")
            ).map(cb => cb.value);

            if (empresasPaxSel.length === 0)
                return alert("Selecione ao menos uma empresa no bloco de passageiros.");
            if (empresasConcSel.length === 0)
                return alert("Selecione ao menos uma empresa para conciliar.");

            // Esconde só o painel de corte — painel de conciliação fica visível
            document.getElementById("painel-pax-corte").classList.add("hidden");
            document.getElementById("selector-etapa-num").innerText   = "CONCILIAÇÃO";
            document.getElementById("selector-etapa-title").innerText = "Selecionar empresas para conciliar";
            onConciliar({ empresasPax: empresasPaxSel, empresasConciliacao: empresasConcSel });
        };
    },

    // Modo pós-import: apenas painel de conciliação
    showSeletorConciliacao(empresas, onConciliar) {
        const section = document.getElementById("company-selector-section");

        document.getElementById("selector-etapa-num").innerText   = "CONCILIAÇÃO";
        document.getElementById("selector-etapa-title").innerText = "Selecionar empresas para conciliar";
        document.getElementById("painel-pax-corte").classList.add("hidden");

        const empresasCfg = APP_CONFIG.empresas || {};

        const checkItem = (val) => {
            const cfg = Object.values(empresasCfg).find(c => c.nome === val);
            const checked = cfg ? cfg.defConciliacao !== false : true;
            return `<label style="display:flex;gap:8px;cursor:pointer;align-items:center;">
                <input type="checkbox" class="company-conc-select" value="${val}"${checked ? " checked" : ""}> ${val}
             </label>`;
        };

        document.getElementById("checkboxes-conciliacao").innerHTML =
            empresas.map(e => checkItem(e)).join("");

        section.classList.remove("hidden");
        lucide.createIcons();

        document.getElementById("btn-conciliar").onclick = () => {
            const selecionadas = Array.from(
                document.querySelectorAll(".company-conc-select:checked")
            ).map(cb => cb.value);

            if (selecionadas.length === 0)
                return alert("Selecione ao menos uma empresa para conciliar.");

            // Seção permanece visível para permitir novas conciliações
            onConciliar(selecionadas);
        };
    },


    // ==========================================================
    // DASHBOARD PRINCIPAL
    // Ponto de entrada após processamento ou importação
    // ==========================================================

    updateDashboard(session) {
        const r = session.resumo;

        // Estatísticas
        document.getElementById("stat-total-pax").innerText      = r.totalPax.toLocaleString();
        document.getElementById("stat-assigned-pax").innerText   = r.atribuidos.toLocaleString();
        document.getElementById("stat-unassigned-pax").innerText = r.naoAtribuidos.toLocaleString();
        document.getElementById("stat-total-trips").innerText    = r.totalViagens.toLocaleString();
        document.getElementById("stat-total-omissoes").innerText = r.omissoes.toLocaleString();

        // Exibe seções
        ["section-resumo", "section-excecoes", "suggestions-section", "section-operacoes"]
            .forEach(id => this.showElement(id));

        // Popula filtro de empresas
        this._popularFiltroEmpresas(session);

        // Renderiza tabelas — exceções apenas de empresas já conciliadas
        const conciliadas = new Set(session.empresasConciliadas || []);
        this.renderExcecoes(session.passageiros.filter(p =>
            !p.assigned && (conciliadas.size === 0 || conciliadas.has(p.empresa))
        ));
        this.renderSugestoes(session.sugestoes);
        this.atualizarSeletorViagens();

        // Atualiza ícones lucide (caso a seção estivesse oculta)
        lucide.createIcons();
    },


    // ==========================================================
    // TABELA DE EXCEÇÕES (passageiros não atribuídos)
    // ==========================================================

    renderExcecoes(lista) {
        const tbody = document.getElementById("table-exceptions-body");
        const limite = APP_CONFIG.ui.excecoesPorPagina;

        tbody.innerHTML = lista.slice(0, limite).map(p => `
            <tr>
                <td class="p-4">
                    <input type="checkbox" class="pax-checkbox" value="${p.id}">
                </td>
                <td>${p.horario}</td>
                <td style="color:var(--primary)">${p.empresa}</td>
                <td>${p.veiculo}</td>
                <td>${p.linha}</td>
                <td>${p.tipo}</td>
            </tr>
        `).join("");

        // Atualiza contador ao marcar/desmarcar
        tbody.querySelectorAll(".pax-checkbox").forEach(cb => {
            cb.addEventListener("change", () => this._atualizarContadorSelecionados());
        });

        // Aviso de truncamento
        if (lista.length > limite) {
            tbody.insertAdjacentHTML("beforeend", `
                <tr>
                    <td colspan="6" style="text-align:center; color:var(--text-muted);
                        font-size:0.8rem; padding:8px;">
                        Exibindo ${limite} de ${lista.length.toLocaleString()} registros.
                        Use os filtros para refinar.
                    </td>
                </tr>
            `);
        }
    },


    // ==========================================================
    // TABELA DE SUGESTÕES (etapa C)
    // ==========================================================

    renderSugestoes(sugestoes) {
        const section = document.getElementById("suggestions-section");
        if (!sugestoes || sugestoes.length === 0) {
            section.classList.add("hidden");
            return;
        }

        section.classList.remove("hidden");

        // Popula e limpa filtros ao re-renderizar a lista completa
        ["sug-filter-veiculo", "sug-filter-linha"].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = "";
        });

        const empresasSel = document.getElementById("sug-filter-empresa");
        if (empresasSel) {
            const empresas = [...new Set(sugestoes.map(s => s.pax?.empresa).filter(Boolean))].sort();
            empresasSel.innerHTML = "<option value=''>Empresa (Todas)</option>"
                + empresas.map(e => `<option value="${e}">${e}</option>`).join("");
        }

        document.getElementById("stat-sugestoes").innerText = sugestoes.length;
        const badge = document.getElementById("badge-sugestoes");
        if (badge) badge.innerText = `${sugestoes.length} pendentes`;

        this._renderSugestoesTabela(sugestoes);
    },

    _renderSugestoesTabela(sugestoes) {
        const selectAll = document.getElementById("select-all-sugestoes");
        if (selectAll) selectAll.checked = false;

        const autoMin = APP_CONFIG.ui.confiancaAutoSelecionavel;
        const tbody   = document.getElementById("table-suggestions-body");

        const motivoLabel = {
            gap_curto:       "Terminal (gap curto)",
            gap_longo:       "Entrepico (gap longo)",
            linha_divergente:"Linha divergente"
        };

        tbody.innerHTML = sugestoes.map(s => {
            const autoCheck  = s.confianca >= autoMin ? "checked" : "";
            const corBarra   = s.confianca >= 70 ? "var(--success)"
                             : s.confianca >= 45 ? "var(--warning)"
                             : "var(--text-muted)";

            return `
                <tr>
                    <td class="p-4">
                        <input type="checkbox" class="sugestao-checkbox"
                            value="${s.paxId}" ${autoCheck}>
                    </td>
                    <td>${s.pax.horario}</td>
                    <td style="color:var(--primary)">${s.pax.empresa}</td>
                    <td>${s.pax.veiculo}</td>
                    <td>${s.pax.linha}</td>
                    <td>${motivoLabel[s.motivo] || s.motivo}</td>
                    <td>
                        <div style="display:flex; align-items:center; gap:6px;">
                            <div style="width:50px; height:6px; background:var(--bg-input);
                                        border-radius:3px; overflow:hidden;">
                                <div style="width:${s.confianca}%; height:100%;
                                            background:${corBarra};"></div>
                            </div>
                            <span style="font-size:0.78rem; color:var(--text-muted);">
                                ${s.confianca}%
                            </span>
                        </div>
                    </td>
                    <td style="font-size:0.8rem; color:var(--text-muted);">
                        ${this._formatarViagemSugestao(s.viagem)}
                    </td>
                </tr>
            `;
        }).join("");
    },

    // ==========================================================
    // FILTROS DA TABELA DE SUGESTÕES
    // ==========================================================

    aplicarFiltrosSugestoes() {
        if (!AppState.session) return;

        const fEmp   = document.getElementById("sug-filter-empresa")?.value || "";
        const fVeic  = document.getElementById("sug-filter-veiculo")?.value.trim() || "";
        const fLinha = document.getElementById("sug-filter-linha")?.value.trim().toLowerCase() || "";

        const filtradas = AppState.session.sugestoes.filter(s => {
            if (fEmp   && s.pax?.empresa !== fEmp)                        return false;
            if (fVeic  && !String(s.pax?.veiculo).includes(fVeic))        return false;
            if (fLinha && !s.pax?.linha.toLowerCase().includes(fLinha))   return false;
            return true;
        });

        this._renderSugestoesTabela(filtradas);
    },

    limparFiltrosSugestoes() {
        ["sug-filter-empresa", "sug-filter-veiculo", "sug-filter-linha"].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = "";
        });

        if (AppState.session) {
            this._renderSugestoesTabela(AppState.session.sugestoes);
        }
    },

    _formatarViagemSugestao(v) {
        const hi = v.isOmissao ? v.partidaPlanejada : v.partidaReal;
        const hf = v.isOmissao ? v.chegadaPlanejada : v.chegadaReal;
        return `${v.linha_base} | ${v.veiculo || "—"} | ${hi ? hi.substring(0, 5) : "—"} | ${hf ? hf.substring(0, 5) : "—"}`;
    },


    // ==========================================================
    // SELETOR DE VIAGEM (atribuição manual)
    // ==========================================================

    atualizarSeletorViagens() {
        const select  = document.getElementById("select-target-trip");
        const fVeic   = document.getElementById("target-filter-veiculo")?.value.trim() || "";
        const fLinha  = document.getElementById("target-filter-linha")?.value.toLowerCase().trim() || "";

        if (!AppState.session) return;
        if (!fVeic && !fLinha) {
            select.innerHTML = "<option value=''>Use os filtros ao lado para buscar...</option>";
            return;
        }

        const viagens = AppState.session.viagens
            .filter(v => {
                const matchV = !fVeic  || String(v.veiculo).includes(fVeic);
                const matchL = !fLinha || v.linha.toLowerCase().includes(fLinha);
                return matchV && matchL;
            })
            .sort((a, b) => {
                if (a.linha_base !== b.linha_base) return a.linha_base.localeCompare(b.linha_base);
                if (a.veiculo    !== b.veiculo)    return String(a.veiculo).localeCompare(String(b.veiculo));
                const hA = a.isOmissao ? a.partidaPlanejada : a.partidaReal;
                const hB = b.isOmissao ? b.partidaPlanejada : b.partidaReal;
                return (hA || "").localeCompare(hB || "");
            });

        if (viagens.length === 0) {
            select.innerHTML = "<option value=''>Nenhuma viagem encontrada.</option>";
            return;
        }

        select.innerHTML = "<option value=''>Selecione a viagem destino...</option>"
            + viagens.map(v => {
                // Ícone de estado
                let icone = "[P]";
                if (v.isOmissao)            icone = "[O]";
                else if (v.convertidaDeOmissao) icone = "[C]";
                else if (v.isExtra)             icone = "[X]";
                else if (v.isEditada)           icone = "[E]";

                const hIni = v.isOmissao ? v.partidaPlanejada  : v.partidaReal;
                const hFim = v.isOmissao ? v.chegadaPlanejada  : v.chegadaReal;
                const veic = this._pad(v.veiculo || "------", 6);
                const lin  = this._pad(v.linha_base, 5);
                const sen  = this._pad(v.sentido,    5);
                const pax  = String(v.paxEfetivos.length).padStart(3, " ");

                const label = `${icone} [${veic}] ${lin} | ${sen} | `
                    + `${(hIni || "").substring(0, 5)} às ${(hFim || "").substring(0, 5)} `
                    + `(${pax} pax)`;

                return `<option value="${v.id}">${label.replace(/ /g, "\u00A0")}</option>`;
            }).join("");

        // Alerta de omissão ao selecionar viagem do tipo [O]
        select.onchange = () => {
            const vid   = select.value;
            const alert = document.getElementById("omissao-alert");
            if (!vid || !alert) return;
            const v = AppState.session.viagens.find(t => t.id === vid);
            alert.style.display = v?.isOmissao ? "flex" : "none";
        };
    },


    // ==========================================================
    // FILTROS DA TABELA DE EXCEÇÕES
    // ==========================================================

    initFiltros() {
        // Inicialização: nada especial por enquanto
    },

    aplicarFiltros() {
        if (!AppState.session) return;

        const fEmp   = document.getElementById("filter-empresa")?.value || "";
        const fVeic  = document.getElementById("filter-veiculo")?.value.trim() || "";
        const fLinha = document.getElementById("filter-linha")?.value.trim().toLowerCase() || "";
        const fIni   = document.getElementById("filter-inicio")?.value || "";
        const fFim   = document.getElementById("filter-fim")?.value || "";

        const toMin = (hhmm) => {
            if (!hhmm) return null;
            const [h, m] = hhmm.split(":").map(Number);
            return h * 60 + m;
        };
        const mIni = toMin(fIni);
        const mFim = toMin(fFim);

        const conciliadas = new Set(AppState.session.empresasConciliadas || []);
        const orphaos = AppState.session.passageiros.filter(p =>
            !p.assigned && (conciliadas.size === 0 || conciliadas.has(p.empresa))
        );

        const filtrados = orphaos.filter(p => {
            if (fEmp   && p.empresa !== fEmp)                          return false;
            if (fVeic  && !String(p.veiculo).includes(fVeic))         return false;
            if (fLinha && !p.linha.toLowerCase().includes(fLinha))     return false;
            if (mIni !== null && p.mHorario < mIni)                   return false;
            if (mFim !== null && p.mHorario > mFim)                   return false;
            return true;
        });

        this.renderExcecoes(filtrados);
        this.resetSelectAll();
        document.getElementById("count-selected").innerText =
            `${filtrados.length} encontrados`;
    },

    limparFiltros() {
        ["filter-empresa", "filter-veiculo", "filter-linha",
         "filter-inicio", "filter-fim"].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = "";
        });

        if (AppState.session) {
            const conciliadas = new Set(AppState.session.empresasConciliadas || []);
            this.renderExcecoes(AppState.session.passageiros.filter(p =>
                !p.assigned && (conciliadas.size === 0 || conciliadas.has(p.empresa))
            ));
        }

        this.resetSelectAll();
        this._atualizarContadorSelecionados();
    },


    // ==========================================================
    // SELECT ALL / CONTADOR
    // ==========================================================

    initSelectAll() {
        const cb = document.getElementById("select-all-pax");
        if (!cb) return;
        cb.addEventListener("change", () => {
            document.querySelectorAll(".pax-checkbox")
                .forEach(c => c.checked = cb.checked);
            this._atualizarContadorSelecionados();
        });
    },

    resetSelectAll() {
        const cb = document.getElementById("select-all-pax");
        if (cb) cb.checked = false;
        this._atualizarContadorSelecionados();
    },

    _atualizarContadorSelecionados() {
        const n = document.querySelectorAll(".pax-checkbox:checked").length;
        document.getElementById("count-selected").innerText = `${n} selecionados`;
    },


    // ==========================================================
    // MODAL GENÉRICO
    // ==========================================================

    showModal(titulo, htmlContent) {
        document.getElementById("modal-container")?.remove();
        document.body.classList.add("modal-open");

        document.body.insertAdjacentHTML("beforeend", `
            <div class="modal-overlay" id="modal-container">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2 style="font-size:1.1rem; color:var(--primary); margin:0;">
                            ${titulo}
                        </h2>
                        <button class="btn-close-modal" id="btn-close-modal-top">✕</button>
                    </div>
                    <div class="modal-body">${htmlContent}</div>
                    <div class="modal-footer">
                        <button class="action-card btn btn-ghost"
                            id="btn-close-modal-bottom">
                            Fechar
                        </button>
                    </div>
                </div>
            </div>
        `);

        const fechar = () => {
            document.getElementById("modal-container")?.remove();
            document.body.classList.remove("modal-open");
        };

        document.getElementById("btn-close-modal-top").onclick    = fechar;
        document.getElementById("btn-close-modal-bottom").onclick  = fechar;
        document.getElementById("modal-container").onclick = (e) => {
            if (e.target.id === "modal-container") fechar();
        };
    },


    // ==========================================================
    // AUTO FILL AUDIT
    // Preenche filtros e seletor a partir do módulo Anomalies
    // ==========================================================

    autoFillAudit(veiculo, tripId) {
        document.getElementById("modal-container")?.remove();
        document.body.classList.remove("modal-open");

        // Preenche filtro de passageiros por veículo
        const fVeic = document.getElementById("filter-veiculo");
        if (fVeic) fVeic.value = veiculo;
        this.aplicarFiltros();

        // Preenche o seletor de viagens pela linha da viagem alvo
        const viagem = AppState.session?.viagens.find(v => v.id === tripId);
        if (viagem) {
            const fLinha = document.getElementById("target-filter-linha");
            if (fLinha) fLinha.value = viagem.linha_base;
        }

        document.getElementById("target-filter-veiculo").value = "";
        this.atualizarSeletorViagens();

        // Seleciona a viagem alvo no combo
        setTimeout(() => {
            const select = document.getElementById("select-target-trip");
            if (select && Array.from(select.options).some(o => o.value === tripId)) {
                select.value = tripId;
                select.dispatchEvent(new Event("change"));
            }
            document.getElementById("exception-section")?.scrollIntoView({ behavior: "smooth" });
        }, 150);
    },


    // ==========================================================
    // AUXILIARES INTERNOS
    // ==========================================================

    _popularFiltroEmpresas(session) {
        const select      = document.getElementById("filter-empresa");
        const conciliadas = new Set(session.empresasConciliadas || []);
        const empresas    = [...new Set(
            session.passageiros
                .filter(p => !p.assigned && (conciliadas.size === 0 || conciliadas.has(p.empresa)))
                .map(p => p.empresa).filter(Boolean)
        )].sort();
        select.innerHTML = "<option value=''>Empresa (Todas)</option>"
            + empresas.map(e => `<option value="${e}">${e}</option>`).join("");
    },

    // Pad de string para alinhamento monospaced no seletor de viagens
    _pad(str, length) {
        str = String(str || "");
        return str.length >= length
            ? str.substring(0, length)
            : str + "\u00A0".repeat(length - str.length);
    }
};
