// Gerenciamento de Upload por clique
document.getElementById('drop-gps').onclick = () => document.getElementById('input-gps').click();
document.getElementById('drop-pax').onclick = () => document.getElementById('input-pax').click();

// Captura de arquivos
document.getElementById('input-gps').onchange = (e) => handleFile(e.target.files[0], 'gps');
document.getElementById('input-pax').onchange = (e) => handleFile(e.target.files[0], 'pax');


async function handleFile(file, type) {
    if(!file) return;
    
    // Feedback visual
    const badge = document.getElementById('status-badge');
    badge.innerText = `Lido: ${file.name}`;
    badge.classList.add('text-blue-400');

    // Se ambos os arquivos estiverem carregados, o main.js dispara o processamento
    Main.checkAndProcess(); 
}