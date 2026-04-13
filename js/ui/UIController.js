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
            const omissoesTotais = results.trips.filter(t => t.isOmissao).length;
            
            document.getElementById('stat-total-pax').innerText = (conciliados + pendentes).toLocaleString();
            document.getElementById('stat-assigned-pax').innerText = conciliados.toLocaleString();
            document.getElementById('stat-unassigned-pax').innerText = pendentes.toLocaleString();
            document.getElementById('stat-total-trips').innerText = results.trips.length;
            document.getElementById('stat-total-omissoes').innerText = omissoesTotais;
            
            this.populateCompanyFilter();
            this.renderExceptions(results.unassigned);
            this.updateTripSelector();
            
        },
        
        populateCompanyFilter() {
            const select = document.getElementById('filter-empresa');
            const empresasNoProcesso = [...new Set(AppState.results.trips.map(t => t.empresa))];
            select.innerHTML = '<option value="">Empresa (Todas)</option>' + 
            empresasNoProcesso.map(e => `<option value="${e}">${e}</option>`).join('');
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
                    const linhaA = a.linha.split(' - ')[0];
                    const linhaB = b.linha.split(' - ')[0];
                    if (linhaA !== linhaB) return linhaA.localeCompare(linhaB);
                    if (String(a.veiculo) !== String(b.veiculo)) return String(a.veiculo).localeCompare(String(b.veiculo));
                    return a.partidaReal.localeCompare(b.partidaReal);
                });
                
                if (trips.length === 0) {
                    select.innerHTML = '<option value="">Nenhuma viagem encontrada.</option>';
                    return;
                }
                
                select.innerHTML = '<option value="">Selecione a viagem destino...</option>' + 
                trips.map(t => {
                    const prefIcon = this.isPreferredTrip(t) ? '★' : '☆';
                    
                    // Definição do Ícone de Estado
                    let stateIcon = "[P]"; 
                    if (t.isOmissao) stateIcon = "[O]"; 
                    else if (t.convertidaDeOmissao) stateIcon = "[C]";
                    else if (String(t.statusViagem) === "3") stateIcon = "[E]";
                    
                    // Definição do Horário (Planejado vs Real)
                    const usarPlanejado = t.isOmissao || !t.partidaReal || t.partidaReal === "" || t.partidaReal === "--";
                    const hIni = usarPlanejado ? t.partidaPlanejada : t.partidaReal;
                    const hFim = usarPlanejado ? t.chegadaPlanejada : t.chegadaReal;
                    
                    // Tratamento do Veículo: Se for vazio ou omissão, mostra traços padronizados
                    let vDisplay = t.veiculo;
                    if (!vDisplay || vDisplay === "" || vDisplay === "--" || t.isOmissao) {
                        vDisplay = "------";
                    }
                    const carro = this._pad(vDisplay, 6);
                    
                    // Tratamento da Linha e Sentido
                    let lin = t.linha, sen = "";
                    if(t.linha.includes(' - ')) {
                        const partes = t.linha.split(' - ');
                        lin = partes[0]; sen = partes[1];
                    }
                    const linha = this._pad(lin, 5);
                    const sentido = this._pad(sen, 5);
                    const pax = String((t.paxEfetivos || []).length).padStart(3, ' ');
                    
                    const label = `${prefIcon} ${stateIcon} [${carro}] ${linha} | ${sentido} | ${hIni.substring(0,5)} às ${hFim.substring(0,5)} (${pax} pax)`;
                    
                    return `<option value="${t.id}">${label.replace(/ /g, '\u00A0')}</option>`;
                }).join('');
            },

            
            
            initFooterFilters() {
                document.getElementById('btn-buscar-viagens').onclick = () => this.updateTripSelector();
                ['target-filter-veiculo', 'target-filter-linha'].forEach(id => {
                    document.getElementById(id).onkeypress = (e) => { if (e.key === 'Enter') this.updateTripSelector(); };
                });
                
                document.getElementById('select-target-trip').addEventListener('change', (e) => {
                    const tripId = e.target.value;
                    const alertBox = document.getElementById('omissao-alert');
                    const trip = AppState.results.trips.find(t => t.id === tripId);
                    
                    if (trip && trip.isOmissao) {
                        alertBox.style.display = 'flex'; // Usamos flex em vez de block para alinhar o ícone lucide
                    } else {
                        alertBox.style.display = 'none';
                    }
                });
            },
            
            applyLocalFilters() {
                const veiculo = document.getElementById('filter-veiculo').value.trim();
                const linha = document.getElementById('filter-linha').value.toLowerCase().trim();
                const empresa = document.getElementById('filter-empresa').value;
                const horaInicio = document.getElementById('filter-inicio').value;
                const horaFim = document.getElementById('filter-fim').value;
                
                if (!AppState.results) return;
                
                const filtrados = AppState.results.unassigned.filter(p => {
                    const matchVeiculo = !veiculo || p.veiculo.includes(veiculo);
                    const matchLinha = !linha || p.linha.toLowerCase().includes(linha);
                    const matchEmpresa = !empresa || p.empresa === empresa;
                    let matchHorario = true;
                    if (horaInicio || horaFim) {
                        const engineTemp = new Engine(); 
                        const pMinutos = engineTemp._timeToMinutes(engineTemp._extractTime(p.horario));
                        if (horaInicio && pMinutos < engineTemp._timeToMinutes(horaInicio)) matchHorario = false;
                        if (horaFim && pMinutos > engineTemp._timeToMinutes(horaFim)) matchHorario = false;
                    }
                    return matchVeiculo && matchLinha && matchEmpresa && matchHorario;
                });
                
                this.renderExceptions(filtrados);
                this.resetSelectAll(); // limpa itens marcados se existirem
                document.getElementById('count-selected').innerText = `Encontrados ${filtrados.length} no filtro`;
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
                ['filter-empresa', 'filter-veiculo', 'filter-linha', 'filter-inicio', 'filter-fim'].forEach(id => document.getElementById(id).value = "");
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
                
                // REGRA 1 & 2: Se for omissão, converte para produtiva
                if (viagemAlvo.isOmissao) {
                    viagemAlvo.statusViagem = "1"; // Torna produtiva
                    viagemAlvo.isOmissao = false;
                    viagemAlvo.convertidaDeOmissao = true; // Rastreio (Flag)
                    viagemAlvo.partidaReal = viagemAlvo.partidaPlanejada;
                    viagemAlvo.chegadaReal = viagemAlvo.chegadaPlanejada;
                    // Pega o veículo do primeiro passageiro selecionado para a viagem
                    viagemAlvo.veiculo = movidos[0].veiculo;
                    viagemAlvo.editadaManualmente = true;
                }
                
                AppState.results.unassigned = AppState.results.unassigned.filter(p => !idsParaMover.includes(p.id));
                
                movidos.forEach(p => { 
                    p.assigned = true; 
                    p.tripId = tripId; 
                    p.atribuicaoMetodo = "manual"; // Rastreio (Flag)
                    viagemAlvo.paxEfetivos.push(p); 
                });
                
                this.updateDashboard(AppState.results);
                document.getElementById('omissao-alert').style.display = 'none';
                alert(`${movidos.length} passageiros atribuídos e viagem atualizada!`);
            },
            
            showModal(titulo, htmlContent) {
                const oldModal = document.getElementById('modal-container');
                if (oldModal) oldModal.remove();
                
                // BLOQUEIA SCROLL
                document.body.classList.add('modal-open');
                
                const modalHtml = `
            <div class="modal-overlay" id="modal-container">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2 style="font-size: 1.1rem; color: var(--primary); margin:0;">${titulo}</h2>
                        <button class="btn-close-modal" id="btn-close-modal-main">✕</button>
                    </div>
                    <div class="modal-body">${htmlContent}</div>
                    <div class="modal-footer">
                        <button class="action-card" style="width:auto; padding: 8px 20px; background: var(--bg-card);" id="btn-close-modal-footer">Fechar</button>
                    </div>
                </div>
            </div>
        `;
                document.body.insertAdjacentHTML('beforeend', modalHtml);
                
                // Função para fechar e liberar o scroll
                const closeModal = () => {
                    document.getElementById('modal-container').remove();
                    document.body.classList.remove('modal-open'); // LIBERA SCROLL
                };
                
                document.getElementById('btn-close-modal-main').onclick = closeModal;
                document.getElementById('btn-close-modal-footer').onclick = closeModal;
                
                // Fechar ao clicar fora do conteúdo (na overlay)
                document.getElementById('modal-container').onclick = (e) => {
                    if (e.target.id === 'modal-container') closeModal();
                };
            },
            
            
            
            autoFillAudit(carroSuspeito, tripIdAlvo) {
                // 1. Fecha o modal de auditoria
                const modal = document.getElementById('modal-container');
                if (modal) {
                    modal.remove();
                    document.body.classList.remove('modal-open');
                }
                
                // 2. Preenche os filtros de passageiros (Topo) para ver quem estava no carro
                document.getElementById('filter-veiculo').value = carroSuspeito;
                this.applyLocalFilters();
                
                // 3. Preenche o filtro de busca de viagens (Rodapé), mas ATENÇÃO:
                // Não filtramos por veículo aqui, para que a viagem omitida (que está sem carro) apareça.
                document.getElementById('target-filter-veiculo').value = ""; 
                
                // Pegamos a viagem alvo para saber qual a linha dela e facilitar a busca
                const viagemAlvo = AppState.results.trips.find(t => t.id === tripIdAlvo);
                if (viagemAlvo) {
                    // Filtramos pela linha da omissão para o seletor não ficar gigante
                    document.getElementById('target-filter-linha').value = viagemAlvo.linha.split(' - ')[0];
                }
                
                // 4. Atualiza o seletor de viagens
                this.updateTripSelector();
                
                // 5. Seleciona a viagem alvo
                setTimeout(() => {
                    const select = document.getElementById('select-target-trip');
                    if (Array.from(select.options).some(opt => opt.value === tripIdAlvo)) {
                        select.value = tripIdAlvo;
                        // Dispara o evento de change para mostrar o alerta de omissão
                        select.dispatchEvent(new Event('change'));
                    } else {
                        console.warn("Viagem alvo não encontrada no combo. Verifique se os filtros de rodapé estão muito restritivos.");
                    }
                    document.getElementById('exception-section').scrollIntoView({ behavior: 'smooth' });
                }, 150);
            },
            
        };