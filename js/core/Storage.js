// js/core/Storage.js

const Storage = {
    // Exporta tudo que está no AppState para um arquivo JSON
    exportJSON() {
        if (!AppState.results) return alert("Não há dados para exportar.");

        const dataExport = {
            versao: "1.0",
            dataGeracao: new Date().toLocaleString(),
            configOriginal: APP_CONFIG.engine,
            results: AppState.results // Contém trips (com pax) e unassigned
        };

        const blob = new Blob([JSON.stringify(dataExport)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `Sincronismo_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
    },

    // Importa um JSON gerado anteriormente e restaura o AppState
    importJSON(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const imported = JSON.parse(e.target.result);
                // Restaura o AppState
                AppState.results = imported.results;

                // ATIVA A INTERFACE
                UIController.updateDashboard(AppState.results);
                
                // Feedback visual
                document.getElementById('status-badge').innerText = "Trabalho Restaurado";
                document.getElementById('status-badge').style.color = "var(--primary)";
            } catch (err) {
                alert("Erro ao ler JSON: Arquivo corrompido ou inválido.");
            }
        };
        reader.readAsText(file);
    }
};