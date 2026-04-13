class Parser {
    static readCSV(file) {
        
        return new Promise((resolve, reject) => {
            Papa.parse(file, {
                header: false,
                skipEmptyLines: true,
                encoding: "ISO-8859-1",
                complete: (results) => {
                    let data = results.data;
                    if (data.length > 0) data.shift(); // Remove cabeçalho
                    resolve(data);
                },
                error: (err) => reject(err)
            });
        });
    }

    static readXLSX(file) {
        
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    // raw: false garante que horas venham como strings formatadas
                    const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1, raw: false, defval: "" });
                    if (jsonData.length > 0) jsonData.shift(); // Remove cabeçalho
                    resolve(jsonData);
                } catch (err) { reject(err); }
            };
            reader.readAsArrayBuffer(file);
        });
    }
}