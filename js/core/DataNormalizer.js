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
            // Trim remove espaços vazios no início e fim que bugam a comparação
            const rawValue = rawRow[this.mapping[field]];
            clean[field] = rawValue ? String(rawValue).trim() : "";
        }

        // Normaliza Empresa usando o dicionário
        if (clean.empresa) {
            const empresaNormalizada = this.config.normalizacao.empresa[clean.empresa];
            if (empresaNormalizada) {
                clean.empresa = empresaNormalizada;
            }
        }

        // Normaliza Linha
        if (clean.linha && this.config.normalizacao.linha) {
            const linhaNormalizada = this.config.normalizacao.linha[clean.linha];
            if (linhaNormalizada) {
                clean.linha = linhaNormalizada;
            }
        }

        return clean;
    }
}