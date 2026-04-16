// ============================================================
// Storage.js — Persistência do Session
//
// Responsabilidade: exportar e importar o Session como JSON.
// O arquivo gerado é o "trabalho salvo" — carregá-lo restaura
// o estado completo sem necessidade de reimportar os CSVs.
//
// Não conhece o Engine, não conhece a UI diretamente.
// Chama UIController apenas para atualizar a interface após importação.
// ============================================================

const Storage = {

    // ----------------------------------------------------------
    // Exporta o Session atual para um arquivo JSON
    // ----------------------------------------------------------
    exportJSON() {
        if (!AppState.session) {
            return alert("Não há dados processados para exportar.");
        }

        const payload = {
            versao:        "2.0",
            dataGeracao:   new Date().toLocaleString("pt-BR"),
            config:        APP_CONFIG.engine,
            session:       AppState.session
        };

        const blob = new Blob(
            [JSON.stringify(payload)],
            { type: "application/json" }
        );

        const url = URL.createObjectURL(blob);
        const a   = document.createElement("a");
        a.href     = url;
        a.download = `TransSync_${new Date().toISOString().split("T")[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    },


    // ----------------------------------------------------------
    // Importa um JSON gerado anteriormente e restaura o AppState
    // ----------------------------------------------------------
    importJSON(file) {
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const imported = JSON.parse(e.target.result);

                // Validação mínima de estrutura
                if (!imported.session || !imported.versao) {
                    return alert("Arquivo inválido: não é um trabalho TransSync.");
                }

                AppState.session = imported.session;

                UIController.updateDashboard(AppState.session);
                UIController.setStatusBadge("Trabalho restaurado", "primary");

            } catch {
                alert("Erro ao ler o arquivo. Verifique se o JSON não está corrompido.");
            }
        };
        reader.readAsText(file);
    }
};
