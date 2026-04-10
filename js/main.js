const AppState = {
    rawGps: null,
    rawPax: null,
    results: null
};

async function handleFileSelect(type, file) {
    try {
        if (type === 'gps') AppState.rawGps = await Parser.readCSV(file);
        else {
            UIController.showLoader("Lendo Excel...");
            AppState.rawPax = await Parser.readXLSX(file);
            UIController.hideLoader();
        }

        if (AppState.rawGps && AppState.rawPax) {
            detectarEmpresas();
        }
    } catch (e) { alert("Erro: " + e); }
}

function detectarEmpresas() {
    const gpsNorm = new DataNormalizer(APP_CONFIG.gps);
    
    // Pegamos todas as empresas do GPS, normalizamos e removemos duplicadas
    const empresasNormalizadas = [...new Set(
        AppState.rawGps.map(row => {
            const clean = gpsNorm.normalize(row);
            return clean.empresa;
        })
    )].filter(e => e); // Remove vazios

    UIController.showCompanySelector(empresasNormalizadas, () => {
        const selecionadas = Array.from(document.querySelectorAll('.company-select:checked')).map(cb => cb.value);
        executarSincronizacao(selecionadas);
    });
}

function executarSincronizacao(empresasFiltro) {
    UIController.showLoader("Sincronizando dados...");
    
    setTimeout(() => {
        const gpsNorm = new DataNormalizer(APP_CONFIG.gps);
        const paxNorm = new DataNormalizer(APP_CONFIG.bilhetagem);

        // Agora filtramos pelo nome JÁ NORMALIZADO
        const cleanGps = AppState.rawGps
            .map(row => gpsNorm.normalize(row))
            .filter(t => empresasFiltro.includes(t.empresa));

        const cleanPax = AppState.rawPax
            .map(row => paxNorm.normalize(row))
            .filter(p => empresasFiltro.includes(p.empresa));

        const engine = new Engine(cleanGps, cleanPax);
        AppState.results = engine.reconcile();

        UIController.updateDashboard(AppState.results);
        UIController.hideLoader();
    }, 100);
}

const btnFiltrar = document.getElementById('filter_btn');
if (btnFiltrar) {
    btnFiltrar.addEventListener('click', () => UIController.applyLocalFilters());
}

const btnLimpar = document.getElementById('clear_btn');
if (btnLimpar) {
    btnLimpar.addEventListener('click', () => UIController.clearFilters());
}


// Eventos de Input
document.getElementById('input-gps').addEventListener('change', (e) => handleFileSelect('gps', e.target.files[0]));
document.getElementById('input-pax').addEventListener('change', (e) => handleFileSelect('pax', e.target.files[0]));
document.getElementById('btn-assign').onclick = () => UIController.confirmBatchAssignment();