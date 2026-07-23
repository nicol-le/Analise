
const Utils = {
  
    toYMD(d) {
        if (!d) return null;
        try {
            let date;
            
           
            if (typeof d === 'string') {
               
                if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
                    return d;
                }
              
                if (/^\d+$/.test(d.trim())) {
                    date = new Date(parseInt(d));
                } else {
                    date = new Date(d);
                }
            } else {
                date = new Date(d);
            }
            
            if (isNaN(date.getTime())) return null;
            
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            
            return `${year}-${month}-${day}`;
        } catch (e) {
            return null;
        }
    },

  
    formatCurrency(val) {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(val);
    },

   
    getPearson(pts) {
        const n = pts.length;
        if (n < 2) return 0;

        let x = pts.map(p => p.x);
        let y = pts.map(p => p.y);

        let sx = x.reduce((a, b) => a + b, 0);
        let sy = y.reduce((a, b) => a + b, 0);
        let sxy = x.reduce((a, b, i) => a + b * y[i], 0);
        let sx2 = x.reduce((a, b) => a + b * b, 0);
        let sy2 = y.reduce((a, b) => a + b * b, 0);

        let num = n * sxy - sx * sy;
        let den = Math.sqrt((n * sx2 - sx * sx) * (n * sy2 - sy * sy));

        return den === 0 ? 0 : num / den;
    },

    interpretarPearson(r) {
        const abs_r = Math.abs(r);
        if (abs_r < 0.3) return "Nenhuma correlação aparente";
        if (abs_r < 0.5) return "Correlação fraca";
        if (abs_r < 0.7) return "Correlação moderada";
        if (abs_r < 0.9) return "Correlação forte";
        return "Correlação muito forte";
    },

  
    descricaoPearson(r) {
        if (r > 0.3) return "positiva (quando X aumenta, Y aumenta)";
        if (r < -0.3) return "negativa (quando X aumenta, Y diminui)";
        return "nenhuma relação linear clara";
    },
   
    getRegLine(pts) {
        if (pts.length < 2) return [];

        let x = pts.map(p => p.x);
        let y = pts.map(p => p.y);
        let n = pts.length;

        let sx = x.reduce((a, b) => a + b, 0);
        let sy = y.reduce((a, b) => a + b, 0);
        let sxy = x.reduce((a, b, i) => a + b * y[i], 0);
        let sx2 = x.reduce((a, b) => a + b * b, 0);

        let m = (n * sxy - sx * sy) / (n * sx2 - sx * sx);
        let b = (sy - m * sx) / n;

        let minX = Math.min(...x);
        let maxX = Math.max(...x);

        return [
            { x: minX, y: m * minX + b },
            { x: maxX, y: m * maxX + b }
        ];
    },

    
    average(arr) {
        if (!arr.length) return 0;
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    },

    
    stdDev(arr) {
        if (arr.length < 2) return 0;
        const avg = this.average(arr);
        const squaredDiffs = arr.map(x => Math.pow(x - avg, 2));
        return Math.sqrt(this.average(squaredDiffs));
    },


    
    coefficientOfVariation(arr) {
        if (arr.length < 2) return 0;
        const avg = this.average(arr);
        if (avg === 0) return 0;
        const std = this.stdDev(arr);
        return (std / avg) * 100;
    },

    percentualMudanca(valor1, valor2) {
        if (valor1 === 0) return 0;
        return ((valor2 - valor1) / valor1) * 100;
    },

  
    findMin(arr) {
        if (!arr.length) return { val: 0, date: null };
        return arr.reduce((min, curr) => curr.val < min.val ? curr : min);
    },

  
    
    findMax(arr) {
        if (!arr.length) return { val: 0, date: null };
        return arr.reduce((max, curr) => curr.val > max.val ? curr : max);
    },

    
    formatDate(dateStr) {
        if (!dateStr) return '-';
        const date = new Date(dateStr + 'T00:00:00');
        return date.toLocaleDateString('pt-BR');
    },

    
    getDaysToFeb2026(startDateStr) {
        const start = new Date(startDateStr + 'T00:00:00');
        const end = new Date('2026-02-28T23:59:59');
        const diff = end - start;
        return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    },

    
    parseBrazilFloat(val) {
        if (!val) return 0;
        if (typeof val === 'number') return val;
    
        const clean = val.toString().replace(/\./g, '').replace(/,/g, '.').trim();
        return parseFloat(clean) || 0;
    }
};