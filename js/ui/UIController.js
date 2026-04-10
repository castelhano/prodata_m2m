const UIController = {
    showLoader(text) {
        const loader = document.getElementById('loader');
        loader.querySelector('p').innerText = text;
        loader.classList.remove('hidden');
    },

    hideLoader() {
        document.getElementById('loader').classList.add('hidden');
    },

    // Novo Seletor de Empresas
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
        
        // Cálculo seguro de conciliados
        const conciliados = results.trips.reduce((acc, t) => {
            // Usa [] se paxEfetivos for undefined por algum motivo
            const lista = t.paxEfetivos || [];
            return acc + lista.length;
        }, 0);
        
        const pendentes = (results.unassigned || []).length;
        const total = conciliados + pendentes;
        
        document.getElementById('stat-total-pax').innerText = total.toLocaleString();
        document.getElementById('stat-assigned-pax').innerText = conciliados.toLocaleString();
        document.getElementById('stat-unassigned-pax').innerText = pendentes.toLocaleString();
        document.getElementById('stat-total-trips').innerText = (results.trips || []).length;
        
        this.renderExceptions(results.unassigned);
        this.updateTripSelector(results.trips);
    },


    renderExceptions(list) {
        const tbody = document.getElementById('table-exceptions-body');
        // Renderiza apenas os 100 primeiros para performance
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

        // Listener para contagem
        tbody.querySelectorAll('.pax-checkbox').forEach(cb => {
            cb.onclick = () => this._updateSelectedCount();
        });
    },

    _updateSelectedCount() {
        const count = document.querySelectorAll('.pax-checkbox:checked').length;
        document.getElementById('count-selected').innerText = `${count} selecionados`;
    },

    updateTripSelector(trips) {
        const select = document.getElementById('select-target-trip');
        if (!trips || !Array.isArray(trips)) return;
        
        select.innerHTML = '<option value="">Atribuir à viagem...</option>' + 
        trips.map(t => {
            // Proteção: se paxEfetivos não existir, usa um array vazio para não dar erro no .length
            const qtdPax = (t.paxEfetivos || []).length;
            const label = `[${t.veiculo}] ${t.linha} - ${t.partidaReal} às ${t.chegadaReal} (${qtdPax} pax)`;
            return `<option value="${t.id}">${label}</option>`;
        }).join('');
    },


    applyLocalFilters() {
        // Captura os valores dos inputs da interface
        const veiculo = document.getElementById('filter-veiculo').value.trim();
        const linha = document.getElementById('filter-linha').value.toLowerCase().trim();
        const horaInicio = document.getElementById('filter-inicio').value; // Formato "HH:mm"
        const horaFim = document.getElementById('filter-fim').value;     // Formato "HH:mm"
        
        // Se não houver resultados no AppState, nem tenta filtrar
        if (!AppState.results || !AppState.results.unassigned) return;

        const filtrados = AppState.results.unassigned.filter(p => {
            // Filtro de Veículo (Exato ou Parcial)
            const matchVeiculo = !veiculo || p.veiculo.includes(veiculo);
            
            // Filtro de Linha
            const matchLinha = !linha || p.linha.toLowerCase().includes(linha);
            
            // Filtro de Horário
            let matchHorario = true;
            if (horaInicio || horaFim) {
                // Usamos a função auxiliar do Engine para converter HH:mm em minutos
                const engineTemp = new Engine(); 
                const pMinutos = engineTemp._timeToMinutes(engineTemp._extractTime(p.horario));
                
                if (horaInicio) {
                    const minInicio = engineTemp._timeToMinutes(horaInicio);
                    if (pMinutos < minInicio) matchHorario = false;
                }
                if (horaFim) {
                    const minFim = engineTemp._timeToMinutes(horaFim);
                    if (pMinutos > minFim) matchHorario = false;
                }
            }

            return matchVeiculo && matchLinha && matchHorario;
        });
        
        // Re-renderiza a tabela apenas com os filtrados
        this.renderExceptions(filtrados);
        
        // Atualiza o contador de quantos foram encontrados no filtro
        document.getElementById('count-selected').innerText = `Encontrados ${filtrados.length} passageiros no filtro`;

        // Após filtrar, vamos atualizar as sugestões de viagem no select
        this.updateSmartTripSuggestions(filtrados);
    },
    updateSmartTripSuggestions(paxFiltrados) {
        const select = document.getElementById('select-target-trip');
        
        // Se não houver passageiros filtrados, mostra a mensagem padrão
        if (!paxFiltrados || paxFiltrados.length === 0) {
            select.innerHTML = '<option value="">Filtre para ver sugestões...</option>';
            return;
        }
        
        const vAlvo = paxFiltrados[0].veiculo;
        const lAlvo = (paxFiltrados[0].linha || "").toLowerCase();
        
        // Filtra as viagens para sugestão
        const sugestoes = (AppState.results.trips || []).filter(t => 
            String(t.veiculo) === String(vAlvo) || 
            String(t.linha).toLowerCase().includes(lAlvo)
        ).sort((a,b) => (a.partidaReal || "").localeCompare(b.partidaReal || ""));
        
        select.innerHTML = '<option value="">Selecionar viagem destino...</option>' + 
        sugestoes.map(t => {
            const estrela = String(t.veiculo) === String(vAlvo) ? '⭐ ' : '';
            const qtdPax = (t.paxEfetivos || []).length; // Proteção aqui também
            const label = `${estrela}[${t.veiculo}] ${t.linha} - ${t.partidaReal} às ${t.chegadaReal} (${qtdPax} pax)`;
            return `<option value="${t.id}">${label}</option>`;
        }).join('');
    },

    clearFilters() {
        // 1. Limpa os valores de todos os campos de input
        document.getElementById('filter-veiculo').value = "";
        document.getElementById('filter-linha').value = "";
        document.getElementById('filter-inicio').value = "";
        document.getElementById('filter-fim').value = "";

        // 2. Volta a exibir a lista original de exceções (sem filtros)
        // Usamos o AppState.results.unassigned que contém todos os órfãos
        if (AppState.results && AppState.results.unassigned) {
            this.renderExceptions(AppState.results.unassigned);
        }

        // 3. Reseta o contador de selecionados
        this._updateSelectedCount();
    },
    confirmBatchAssignment() {
        const tripId = document.getElementById('select-target-trip').value;
        if (!tripId) {
            alert("Selecione uma viagem de destino.");
            return;
        }
        
        // 1. Pega os IDs dos passageiros marcados no checkbox
        const selectedCheckboxes = document.querySelectorAll('.pax-checkbox:checked');
        const idsParaMover = Array.from(selectedCheckboxes).map(cb => cb.value);
        
        if (idsParaMover.length === 0) {
            alert("Selecione ao menos um passageiro na tabela.");
            return;
        }
        
        // 2. Localiza a viagem alvo no AppState
        const viagemAlvo = AppState.results.trips.find(t => t.id === tripId);
        
        // 3. Move os passageiros
        // Filtra os que saem das exceções e os que entram na viagem
        const passageirosMovidos = AppState.results.unassigned.filter(p => idsParaMover.includes(p.id));
        
        // Remove das exceções
        AppState.results.unassigned = AppState.results.unassigned.filter(p => !idsParaMover.includes(p.id));
        
        // Adiciona na viagem
        passageirosMovidos.forEach(p => {
            p.assigned = true;
            p.tripId = tripId;
            viagemAlvo.paxEfetivos.push(p);
        });
        
        // 4. Feedback e Atualização da Tela
        alert(`${passageirosMovidos.length} passageiros atribuídos com sucesso!`);
        this.updateDashboard(AppState.results); // Atualiza os números e a tabela
    }


};