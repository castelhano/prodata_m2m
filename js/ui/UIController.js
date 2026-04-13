const UIController = {
    showLoader(text) {
        const loader = document.getElementById('loader');
        loader.querySelector('p').innerText = text;
        loader.classList.remove('hidden');
    },

    hideLoader() {
        document.getElementById('loader').classList.add('hidden');
    },

    showCompanySelector(empresas, onConfirm) {
        const section = document.getElementById('company-selector-section');
        const container = document.getElementById('company-checkboxes');
        section.classList.remove('hidden');
        container.innerHTML = empresas.map(emp => `
            <label style="display: flex; gap: 8px; cursor: pointer;">
                <input type="checkbox" class="company-select" value="${emp}" checked> ${emp}
            </label>
        `).join('');
        document.getElementById('btn-iniciar-processamento').onclick = () => {
            section.classList.add('hidden');
            onConfirm();
        };
    },

    updateDashboard(results) {
        document.getElementById('summary-section').classList.remove('hidden');
        document.getElementById('exception-section').classList.remove('hidden');
        document.getElementById('actions-section').classList.remove('hidden');
        
        const conciliados = results.trips.reduce((acc, t) => acc + (t.paxEfetivos || []).length, 0);
        const pendentes = (results.unassigned || []).length;
        
        document.getElementById('stat-total-pax').innerText = (conciliados + pendentes).toLocaleString();
        document.getElementById('stat-assigned-pax').innerText = conciliados.toLocaleString();
        document.getElementById('stat-unassigned-pax').innerText = pendentes.toLocaleString();
        document.getElementById('stat-total-trips').innerText = results.trips.length;
        
        this.renderExceptions(results.unassigned);
    },

    renderExceptions(list) {
        const tbody = document.getElementById('table-exceptions-body');
        tbody.innerHTML = list.slice(0, 100).map(p => `
            <tr>
                <td><input type="checkbox" class="pax-checkbox" value="${p.id}"></td>
                <td>${p.horario}</td>
                <td style="color: var(--primary)">${p.empresa}</td>
                <td>${p.veiculo}</td>
                <td>${p.linha}</td>
                <td>${p.tipo}</td>
            </tr>
        `).join('');
        tbody.querySelectorAll('.pax-checkbox').forEach(cb => {
            cb.onclick = () => this._updateSelectedCount();
        });
    },

    _updateSelectedCount() {
        const count = document.querySelectorAll('.pax-checkbox:checked').length;
        document.getElementById('count-selected').innerText = `${count} selecionados`;
    },

    _pad(str, length) {
        str = String(str || "");
        return str.length >= length ? str.substring(0, length) : str + " ".repeat(length - str.length);
    },
    
    isPreferredTrip(trip) { return false; },

    updateTripSelector() {
        const select = document.getElementById('select-target-trip');
        const fVeiculo = document.getElementById('target-filter-veiculo').value.trim();
        const fLinha = document.getElementById('target-filter-linha').value.toLowerCase().trim();

        if (!AppState.results) return;
        if (!fVeiculo && !fLinha) {
            select.innerHTML = '<option value="">Use os filtros ao lado para buscar...</option>';
            return;
        }

        let trips = AppState.results.trips.filter(t => {
            const matchV = !fVeiculo || String(t.veiculo).includes(fVeiculo);
            const matchL = !fLinha || String(t.linha).toLowerCase().includes(fLinha);
            return matchV && matchL;
        });

        trips.sort((a, b) => {
            // 1. Extrair base da linha (ex: "308") para agrupar IDA e VOLTA juntas
            const linhaA = a.linha.split(' - ')[0];
            const linhaB = b.linha.split(' - ')[0];
            
            // 2. Primeiro critério: Linha (Base)
            if (linhaA !== linhaB) return linhaA.localeCompare(linhaB);
            
            // 3. Segundo critério: Carro
            if (String(a.veiculo) !== String(b.veiculo)) {
                return String(a.veiculo).localeCompare(String(b.veiculo));
            }         
            
            // 4. Terceiro critério: Sentido (IDA vem antes de VOLTA)
            if (a.linha !== b.linha) return a.linha.localeCompare(b.linha);
            
            // 5. Quarto critério: Horário de Partida
            return a.partidaReal.localeCompare(b.partidaReal);
        });


        if (trips.length === 0) {
            select.innerHTML = '<option value="">Nenhuma viagem encontrada.</option>';
            return;
        }

        select.innerHTML = '<option value="">Selecione a viagem destino...</option>' + 
            trips.map(t => {
                const icone = this.isPreferredTrip(t) ? '★' : '☆';
                const carro = this._pad(t.veiculo, 6);
                let lin = t.linha, sen = "";
                if(t.linha.includes(' - ')) {
                    const partes = t.linha.split(' - ');
                    lin = partes[0]; sen = partes[1];
                }
                const linha = this._pad(lin, 5);
                const sentido = this._pad(sen, 5);
                const pax = String((t.paxEfetivos || []).length).padStart(3, ' ');
                const label = `${icone} [${carro}] ${linha} | ${sentido} | ${t.partidaReal.substring(0,5)} às ${t.chegadaReal.substring(0,5)} (${pax} pax)`;
                return `<option value="${t.id}">${label.replace(/ /g, '\u00A0')}</option>`;
            }).join('');
    },

    initFooterFilters() {
        document.getElementById('btn-buscar-viagens').onclick = () => this.updateTripSelector();
        ['target-filter-veiculo', 'target-filter-linha'].forEach(id => {
            document.getElementById(id).onkeypress = (e) => { if (e.key === 'Enter') this.updateTripSelector(); };
        });
    },

    applyLocalFilters() {
        const veiculo = document.getElementById('filter-veiculo').value.trim();
        const linha = document.getElementById('filter-linha').value.toLowerCase().trim();
        const horaInicio = document.getElementById('filter-inicio').value;
        const horaFim = document.getElementById('filter-fim').value;
        
        if (!AppState.results) return;

        const filtrados = AppState.results.unassigned.filter(p => {
            const matchVeiculo = !veiculo || p.veiculo.includes(veiculo);
            const matchLinha = !linha || p.linha.toLowerCase().includes(linha);
            let matchHorario = true;
            if (horaInicio || horaFim) {
                const engineTemp = new Engine(); 
                const pMinutos = engineTemp._timeToMinutes(engineTemp._extractTime(p.horario));
                if (horaInicio && pMinutos < engineTemp._timeToMinutes(horaInicio)) matchHorario = false;
                if (horaFim && pMinutos > engineTemp._timeToMinutes(horaFim)) matchHorario = false;
            }
            return matchVeiculo && matchLinha && matchHorario;
        });
        
        this.renderExceptions(filtrados);
        document.getElementById('count-selected').innerText = `Encontrados ${filtrados.length} no filtro`;
        this.resetSelectAll(); // limpa itens marcados se existirem
        this.updateSmartTripSuggestions(filtrados);
    },

    updateSmartTripSuggestions(paxFiltrados) {
        // Esta função agora serve apenas para sugerir quando o usuário está filtrando a tabela de cima
        // Não carrega o combo automaticamente no dashboard
    },
    initSelectAll() {
        const selectAllCb = document.getElementById('select-all-pax');
        selectAllCb.onclick = () => {
            const isChecked = selectAllCb.checked;
            // Marca apenas os checkboxes que estão VISÍVEIS na tabela agora
            document.querySelectorAll('.pax-checkbox').forEach(cb => {
                cb.checked = isChecked;
            });
            this._updateSelectedCount();
        };
    },
    resetSelectAll() {
        const selectAllCb = document.getElementById('select-all-pax');
        if (selectAllCb) selectAllCb.checked = false;
        this._updateSelectedCount();
    },

    clearFilters() {
        ['filter-veiculo', 'filter-linha', 'filter-inicio', 'filter-fim'].forEach(id => document.getElementById(id).value = "");
        if (AppState.results) this.renderExceptions(AppState.results.unassigned);
        this.resetSelectAll(); // limpa itens marcados se existirem
        this._updateSelectedCount();
    },

    confirmBatchAssignment() {
        const tripId = document.getElementById('select-target-trip').value;
        const selectedCheckboxes = document.querySelectorAll('.pax-checkbox:checked');
        if (!tripId || selectedCheckboxes.length === 0) return alert("Selecione a viagem e os passageiros.");
        
        const idsParaMover = Array.from(selectedCheckboxes).map(cb => cb.value);
        const viagemAlvo = AppState.results.trips.find(t => t.id === tripId);
        const movidos = AppState.results.unassigned.filter(p => idsParaMover.includes(p.id));
        
        AppState.results.unassigned = AppState.results.unassigned.filter(p => !idsParaMover.includes(p.id));
        movidos.forEach(p => { p.assigned = true; p.tripId = tripId; viagemAlvo.paxEfetivos.push(p); });
        
        this.updateDashboard(AppState.results);
        alert(`${movidos.length} passageiros atribuídos!`);
    },

    showModal(titulo, htmlContent) {
        const oldModal = document.querySelector('.modal-overlay');
        if (oldModal) oldModal.remove();

        const modalHtml = `
            <div class="modal-overlay" id="modal-container">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2 style="font-size: 1.1rem; color: var(--primary); margin:0;">${titulo}</h2>
                        <button class="btn-close-modal" onclick="document.getElementById('modal-container').remove()">✕</button>
                    </div>
                    <div class="modal-body" style="position:relative;">${htmlContent}</div>
                    <div class="modal-footer">
                        <button class="action-card" style="width:auto; padding: 8px 20px; background: var(--bg-card);" onclick="document.getElementById('modal-container').remove()">Fechar</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    },


    autoFillAudit(veiculo, tripId) {
        // 1. Fecha o modal imediatamente
        const modal = document.getElementById('modal-container');
        if (modal) modal.remove();

        // 2. Preenche os filtros (Topo e Rodapé)
        document.getElementById('filter-veiculo').value = veiculo;
        document.getElementById('target-filter-veiculo').value = veiculo;
        document.getElementById('target-filter-linha').value = ""; // Limpa linha para não conflitar

        // 3. Aplica os filtros na tabela de passageiros
        this.applyLocalFilters();

        // 4. Carrega o combo de viagens
        this.updateTripSelector();

        // 5. Seleciona a viagem alvo após um micro-delay para o DOM processar as opções
        setTimeout(() => {
            const select = document.getElementById('select-target-trip');
            
            // Verifica se a viagem realmente está no combo antes de selecionar
            if (Array.from(select.options).some(opt => opt.value === tripId)) {
                select.value = tripId;
            } else {
                console.warn("Viagem alvo não encontrada no combo filtrado.");
            }
            
            // Dá um scroll suave até a seção de exceções para o usuário ver o resultado
            document.getElementById('exception-section').scrollIntoView({ behavior: 'smooth' });
        }, 100);
    },


};