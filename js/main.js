const AppState = { rawGps: null, rawPax: null, results: null };

async function handleFileSelect(type, file) {
    const badge = document.getElementById('status-badge');
    const btn = document.getElementById('btn-processar-geral');
    try {
        if (type === 'gps') AppState.rawGps = await Parser.readCSV(file);
        else {
            UIController.showLoader("Lendo Excel...");
            AppState.rawPax = await Parser.readXLSX(file);
            UIController.hideLoader();
        }
        if (AppState.rawGps && AppState.rawPax) {
            badge.innerText = "Arquivos prontos!";
            badge.style.color = "var(--success)";
            btn.classList.remove('hidden');
        } else {
            badge.innerText = `Carregado: ${type.toUpperCase()}. Aguardando outro...`;
        }
    } catch (e) { alert(e); }
}

function detectarEmpresas() {
    const gpsNorm = new DataNormalizer(APP_CONFIG.gps);
    const empresas = [...new Set(AppState.rawGps.map(row => gpsNorm.normalize(row).empresa))].filter(e => e);
    UIController.showCompanySelector(empresas, () => {
        const selecionadas = Array.from(document.querySelectorAll('.company-select:checked')).map(cb => cb.value);
        executarSincronizacao(selecionadas);
    });
}

function executarSincronizacao(empresasFiltro) {
    UIController.showLoader("Sincronizando...");
    setTimeout(() => {
        const gpsNorm = new DataNormalizer(APP_CONFIG.gps);
        const paxNorm = new DataNormalizer(APP_CONFIG.bilhetagem);
        const cleanGps = AppState.rawGps.map(r => gpsNorm.normalize(r)).filter(t => empresasFiltro.includes(t.empresa));
        const cleanPax = AppState.rawPax.map(r => paxNorm.normalize(r)).filter(p => empresasFiltro.includes(p.empresa));
        
        const engine = new Engine(cleanGps, cleanPax);
        AppState.results = engine.reconcile();
        UIController.updateDashboard(AppState.results);
        UIController.hideLoader();
    }, 100);
}

document.addEventListener('DOMContentLoaded', () => {
    UIController.initFooterFilters();
    UIController.initSelectAll();
    lucide.createIcons();
    
    document.getElementById('input-gps').onchange = (e) => handleFileSelect('gps', e.target.files[0]);
    document.getElementById('input-pax').onchange = (e) => handleFileSelect('pax', e.target.files[0]);
    document.getElementById('btn-processar-geral').onclick = () => detectarEmpresas();
    document.getElementById('btn-assign').onclick = () => UIController.confirmBatchAssignment();
    document.getElementById('filter_btn').onclick = () => UIController.applyLocalFilters();
    document.getElementById('clear_btn').onclick = () => UIController.clearFilters();
});