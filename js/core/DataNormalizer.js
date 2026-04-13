class DataNormalizer {
    constructor(configOrigem) {
        this.config = configOrigem;
        this.mapping = this._convertLettersToIndices(configOrigem.colunas);
    }

    _convertLettersToIndices(cols) {
        const map = {};
        for (let key in cols) {
            let s = cols[key].toUpperCase(), n = 0;
            for (let i = 0; i < s.length; i++) {
                n = n * 26 + s.charCodeAt(i) - 64;
            }
            map[key] = n - 1;
        }
        return map;
    }
    
    normalize(rawRow) {
        const clean = {};
        for (let field in this.mapping) {
            const rawValue = rawRow[this.mapping[field]];
            clean[field] = rawValue ? String(rawValue).trim() : "";
        }
        
        // --- Tratamento Específico de Data/Hora para GPS (Campos separados) ---
        // Se houver campo de partidaReal mas não houver data nele, tentamos manter a estrutura
        // O Engine cuidará de converter para minutos.
        
        // Normaliza Empresa
        if (clean.empresa && this.config.normalizacao.empresa[clean.empresa]) {
            clean.empresa = this.config.normalizacao.empresa[clean.empresa];
        }
        
        // Normaliza Linha e Sentido
        if (clean.linha && clean.linha.includes(' - ')) {
            const partes = clean.linha.split(' - ');
            clean.linha_base = partes[0].trim();
            clean.sentido = partes[1].trim().toUpperCase();
        } else {
            clean.linha_base = clean.linha;
            clean.sentido = "UNICO";
        }
        
        return clean;
    }

}