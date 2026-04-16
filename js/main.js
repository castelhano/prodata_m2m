// ============================================================
// main.js — Orquestração central
//
// Responsabilidade: conectar eventos da UI com as classes do core.
// Não contém lógica de negócio — apenas coordena chamadas.
//
// Fluxo principal:
//   1. Usuário carrega arquivo(s) CSV
//   2. Parser lê → DataNormalizer limpa → Engine processa → Session gerado
//   3. UIController renderiza o Session
//   4. Usuário interage (confirma sugestões, atribuição manual)
//   5. Engine.confirmarSugestoes / Engine.atribuirManualmente atualiza Session
//   6. UIController re-renderiza
// ============================================================


// ----------------------------------------------------------
// Estado global da aplicação
// session: objeto Session gerado pelo Engine (única fonte de verdade)
// rawGps / rawPax: linhas brutas dos CSVs (usados apenas para processar)
// ----------------------------------------------------------
const AppState = {
    rawGps:  null,
    rawPax:  null,
    session: null
};


// ----------------------------------------------------------
// Carregamento de arquivos
// Chamado pelo evento onchange dos inputs de arquivo
// ----------------------------------------------------------
async function handleFileSelect(tipo, file) {
    try {
        UIController.setStatusBadge("Lendo arquivo...", "muted");

        if (tipo === "gps") {
            AppState.rawGps = await Parser.readCSV(file);
        } else {
            AppState.rawPax = await Parser.readCSV(file);
        }

        // Atualiza badge e exibe botão de processar quando ambos estiverem prontos
        if (AppState.rawGps && AppState.rawPax) {
            UIController.setStatusBadge("Arquivos prontos!", "success");
            UIController.showElement("btn-processar");
        } else {
            UIController.setStatusBadge(
                `${tipo.toUpperCase()} carregado. Aguardando o outro arquivo...`,
                "muted"
            );
        }

        // Se apenas um arquivo foi carregado, exibe as funcionalidades disponíveis
        UIController.atualizarFuncionalidadesDisponiveis();

    } catch (err) {
        UIController.setStatusBadge("Erro ao ler arquivo.", "danger");
        alert(`Erro: ${err.message}`);
    }
}


// ----------------------------------------------------------
// Detecção de empresas presentes nos dados
// Chamado ao clicar em "Processar"
// ----------------------------------------------------------
function detectarEmpresas() {
    if (!AppState.rawGps) return;

    const norm     = new DataNormalizer(APP_CONFIG.fontes.gps);
    const empresas = [
        ...new Set(AppState.rawGps.map(row => norm.normalize(row).empresa).filter(Boolean))
    ];

    UIController.showSeletorEmpresas(empresas, (selecionadas) => {
        executarProcessamento(selecionadas);
    });
}


// ----------------------------------------------------------
// Execução do processamento principal
// ----------------------------------------------------------
function executarProcessamento(empresasFiltro) {
    UIController.showLoader("Processando...");

    // setTimeout garante que o loader renderiza antes do processamento bloquear a thread
    setTimeout(() => {
        try {
            const normGps = new DataNormalizer(APP_CONFIG.fontes.gps);
            const normPax = new DataNormalizer(APP_CONFIG.fontes.bilhetagem);

            const gpsLimpo = AppState.rawGps
                .map(r => normGps.normalize(r))
                .filter(r => empresasFiltro.includes(r.empresa));

            const paxLimpo = AppState.rawPax
                ? AppState.rawPax
                    .map(r => normPax.normalize(r))
                    .filter(r => empresasFiltro.includes(r.empresa))
                : [];

            const engine        = new Engine(gpsLimpo, paxLimpo);
            AppState.session    = engine.process();

            UIController.updateDashboard(AppState.session);
            UIController.hideLoader();

        } catch (err) {
            UIController.hideLoader();
            alert(`Erro no processamento: ${err.message}`);
            console.error(err);
        }
    }, 80);
}


// ----------------------------------------------------------
// Confirmação de sugestões da etapa C
// Chamado pelo botão "Atribuir selecionados" na seção de sugestões
// ----------------------------------------------------------
function confirmarSugestoesSelecionadas() {
    const selecionados = Array.from(
        document.querySelectorAll(".sugestao-checkbox:checked")
    ).map(cb => cb.value);

    if (selecionados.length === 0) return alert("Nenhuma sugestão selecionada.");

    AppState.session = Engine.confirmarSugestoes(AppState.session, selecionados);
    UIController.updateDashboard(AppState.session);
}


// ----------------------------------------------------------
// Atribuição manual (tabela de exceções → viagem destino)
// Chamado pelo botão "Atribuir" no rodapé da tabela
// ----------------------------------------------------------
function atribuirManualmente() {
    const tripId   = document.getElementById("select-target-trip").value;
    const marcados = Array.from(
        document.querySelectorAll(".pax-checkbox:checked")
    ).map(cb => cb.value);

    if (!tripId || marcados.length === 0) {
        return alert("Selecione a viagem de destino e ao menos um passageiro.");
    }

    AppState.session = Engine.atribuirManualmente(AppState.session, marcados, tripId);
    UIController.updateDashboard(AppState.session);
    document.getElementById("omissao-alert").style.display = "none";
}


// ----------------------------------------------------------
// Inicialização
// ----------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
    lucide.createIcons();

    UIController.initFiltros();
    UIController.initSelectAll();

    // Inputs de arquivo
    document.getElementById("input-gps")
        .addEventListener("change", e => handleFileSelect("gps", e.target.files[0]));
    document.getElementById("input-pax")
        .addEventListener("change", e => handleFileSelect("pax", e.target.files[0]));

    // Botões principais
    document.getElementById("btn-processar")
        .addEventListener("click", detectarEmpresas);
    document.getElementById("btn-atribuir")
        .addEventListener("click", atribuirManualmente);
    document.getElementById("btn-confirmar-sugestoes")
        .addEventListener("click", confirmarSugestoesSelecionadas);

    // Filtros da tabela de exceções
    document.getElementById("filter_btn")
        .addEventListener("click", () => UIController.aplicarFiltros());
    document.getElementById("clear_btn")
        .addEventListener("click", () => UIController.limparFiltros());

    // Busca de viagens no seletor manual
    document.getElementById("btn-buscar-viagens")
        .addEventListener("click", () => UIController.atualizarSeletorViagens());
});
