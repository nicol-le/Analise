/**
 * TREC – Teoria da Resiliência Econômico-Climática
 * Módulo científico integrado ao dashboard CEAGESP.
 * Utiliza exclusivamente os dados já importados (preços, clima, volumes, cidades).
 * Não altera tabelas nem funcionalidades existentes.
 */
const Trec = {
    /** Cores das quatro dimensões do Fingerprint */
    colors: {
        R: '#16a34a',
        S: '#ca8a04',
        I: '#2563eb',
        A: '#9333ea',
        index: '#8b0000'
    },

    /**
     * Categorias de cultura para agrupamento TREC.
     * Classificação por palavras-chave no nome do produto.
     */
    categories: {
        'Frutas': ['BANANA', 'MACA', 'MAÇA', 'LARANJA', 'MAMAO', 'MAMÃO', 'MELANCIA', 'MELAO', 'MELÃO', 'UVA', 'MORANGO', 'ABACAXI', 'LIMAO', 'LIMÃO', 'GOIABA', 'MANGA', 'PERA', 'PESSEGO', 'PÊSSEGO', 'KIWI', 'COCO', 'MARACUJA', 'MARACUJÁ', 'FIGO', 'CAQUI', 'AMEIXA', 'TANGERINA', 'MEXERICA'],
        'Folhosas': ['ALFACE', 'COUVE', 'RUCULA', 'RÚCULA', 'AGRIAO', 'AGRIÃO', 'ESPINAFRE', 'REPOLHO', 'ACELGA', 'CHICORIA', 'CHICÓRIA', 'ALMEIRAO', 'ALMEIRÃO', 'RABANETE'],
        'Leguminosas': ['FEIJAO', 'FEIJÃO', 'ERVILHA', 'LENTILHA', 'GRÃO', 'GRAO', 'SOJA', 'FAVA', 'VAGEM'],
        'Raízes e Tubérculos': ['BATATA', 'CENOURA', 'MANDIOCA', 'INHAME', 'BETERRABA', 'NABO', 'GERGELIM', 'BATATA DOCE', 'CARA', 'CARÁ'],
        'Frutos e Legumes': ['TOMATE', 'PEPINO', 'ABOBORA', 'ABÓBORA', 'ABOBRINHA', 'BERINJELA', 'PIMENTAO', 'PIMENTÃO', 'QUIABO', 'CHUCHU', 'JILO', 'JILÓ', 'MILHO', 'BROCOLIS', 'BRÓCOLIS', 'COUVE-FLOR', 'ALHO', 'CEBOLA', 'PIMENTA'],
        'Peixes e Frutos do Mar': ['PEIXE', 'CAMARAO', 'CAMARÃO', 'TILAPIA', 'TILÁPIA', 'SALMAO', 'SALMÃO', 'BACALHAU', 'SARDINHA', 'ATUM', 'POLVO', 'LOULA', 'MEXILHAO', 'MEXILHÃO', 'OSTRA', 'LAGOSTA'],
        'Temperos e Ervas': ['SALSA', 'CEBOLINHA', 'COENTRO', 'MANJERICAO', 'MANJERICÃO', 'HORTELA', 'HORTELÃ', 'ALECRIM', 'ORÉGANO', 'OREGANO', 'GENGIBRE', 'GENGIBRE'],
        'Outros': []
    },

    /** Estado interno do módulo (comparações, ordenação, mapa) */
    state: {
        profiles: {},
        currentKey: null,
        compareKeys: [],
        sortKey: 'trec',
        sortAsc: false,
        filterText: '',
        categoryFilter: 'Todas',
        studyList: [],
        map: null,
        markersGroup: null,
        lastSeries: null,
        lastResult: null,
        mapRendered: false,
        mapPending: false
    },

    /** Carrega cesta de estudo salva no navegador. */
    loadStudyList() {
        try {
            const raw = localStorage.getItem('trec:studyList');
            this.state.studyList = raw ? JSON.parse(raw) : [];
        } catch (_) {
            this.state.studyList = [];
        }
        return this.state.studyList;
    },

    /** Persiste cesta de estudo. */
    saveStudyList() {
        try { localStorage.setItem('trec:studyList', JSON.stringify(this.state.studyList)); } catch (_) {}
    },

    /** Classifica um produto em categoria TREC. */
    classifyProduct(produto) {
        const n = (produto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
        for (const [cat, keys] of Object.entries(this.categories)) {
            if (cat === 'Outros') continue;
            if (keys.some(k => n.includes(k.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()))) {
                return cat;
            }
        }
        return 'Outros';
    },

    /** Adiciona cultura atual (ou informada) à cesta de estudo TREC. */
    addToStudy(produto, variedade) {
        const p = (produto || appState.currentProduto || document.getElementById('prodInp')?.value || '').trim();
        if (!p) return alert('Selecione um produto primeiro.');
        const v = (variedade != null ? variedade : (document.getElementById('varInp')?.value || '')).trim();
        const key = this._profileKey(p, v);
        if (this.state.studyList.some(i => i.key === key)) {
            alert('Esta cultura já está na cesta TREC.');
            return;
        }
        this.state.studyList.push({
            key, produto: p, variedade: v, categoria: this.classifyProduct(p)
        });
        this.saveStudyList();
        this._renderStudyList();
        this._renderCategoryChips();
    },

    /** Remove item da cesta. */
    removeFromStudy(key) {
        this.state.studyList = this.state.studyList.filter(i => i.key !== key);
        this.saveStudyList();
        this._renderStudyList();
    },

    /** Filtra perfis por categoria. */
    setCategoryFilter(cat) {
        this.state.categoryFilter = cat || 'Todas';
        this._renderComparisonTable();
        this._renderRankings();
        this._renderFingerprint();
        this._renderBiplot();
        this._renderCategoryChips();
    },

    /** Analisa todas as culturas da cesta (com cache de preços). */
    async analyzeStudyList() {
        this.loadStudyList();
        if (!this.state.studyList.length) {
            alert('Adicione culturas à cesta TREC antes de analisar.');
            return;
        }
        if (!appState.rawClima?.length) {
            alert('Execute ao menos uma análise para carregar o clima de referência.');
            return;
        }
        const status = document.getElementById('status-label');
        const list = this.state.studyList;
        for (let i = 0; i < list.length; i++) {
            const item = list[i];
            if (status) status.innerText = `TREC cesta: ${i + 1}/${list.length}`;
            try {
                const precos = await Api.fetchPrecos(item.produto, item.variedade || '');
                if (precos.length < 15) continue;
                this.analyze(precos, appState.rawClima, {
                    produto: item.produto,
                    variedade: item.variedade,
                    dateRef: appState.dateRef,
                    categoria: item.categoria
                });
            } catch (err) {
                console.warn('TREC study item falhou', item, err);
            }
        }
        this._renderSummary(this.state.lastResult || Object.values(this.state.profiles)[0]);
        if (this.state.lastResult) {
            this._renderGauge(this.state.lastResult);
            this._renderNarrative(this.state.lastResult);
            this._renderComponentPanels(this.state.lastResult);
            this._renderDashboardCharts(this.state.lastResult);
        }
        this._renderComparisonTable();
        this._renderRankings();
        this._renderFingerprint();
        this._renderBiplot();
        this._populateCompareSelect();
        this._renderCategorySummary();
        if (status) status.innerText = 'SISTEMA ONLINE';
    },

    _renderStudyList() {
        const el = document.getElementById('trecStudyList');
        if (!el) return;
        this.loadStudyList();
        if (!this.state.studyList.length) {
            el.innerHTML = '<p class="text-xs text-slate-400">Nenhuma cultura na cesta. Use “Adicionar à cesta TREC”.</p>';
            return;
        }
        el.innerHTML = this.state.studyList.map(i => `
            <div class="flex items-center justify-between gap-2 py-2 border-b border-slate-50 last:border-0">
                <div class="min-w-0">
                    <p class="text-xs font-semibold text-slate-800 truncate">${i.produto}${i.variedade ? ` / ${i.variedade}` : ''}</p>
                    <p class="text-[10px] text-slate-400">${i.categoria}</p>
                </div>
                <button onclick="Trec.removeFromStudy('${i.key.replace(/'/g, "\\'")}')" class="text-red-600 text-xs font-bold hover:underline">remover</button>
            </div>
        `).join('');
    },

    _renderCategoryChips() {
        const el = document.getElementById('trecCategoryChips');
        if (!el) return;
        const cats = ['Todas', ...Object.keys(this.categories)];
        el.innerHTML = cats.map(c => {
            const active = this.state.categoryFilter === c;
            return `<button onclick="Trec.setCategoryFilter('${c}')" class="px-3 py-1 rounded-full text-[10px] font-bold border transition-all ${active ? 'bg-primary-container text-white border-primary-container' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}">${c}</button>`;
        }).join('');
    },

    /** Resumo agregado por tipo de cultura (média dos fingerprints na cesta/perfis). */
    _renderCategorySummary() {
        const el = document.getElementById('trecCategorySummary');
        if (!el) return;
        const profiles = Object.values(this.state.profiles);
        if (!profiles.length) {
            el.innerHTML = '<p class="text-xs text-slate-400">Analise a cesta para ver o resumo por tipo de cultura.</p>';
            return;
        }
        const byCat = {};
        profiles.forEach(p => {
            const cat = p.categoria || this.classifyProduct(p.produto);
            if (!byCat[cat]) byCat[cat] = [];
            byCat[cat].push(p);
        });
        el.innerHTML = Object.entries(byCat).map(([cat, list]) => {
            const avgR = this._mean(list.map(p => p.R.value));
            const avgS = this._mean(list.map(p => p.S.value));
            const avgA = this._mean(list.map(p => p.A.value));
            const avgT = this._mean(list.map(p => p.index.score));
            return `
                <div class="p-4 bg-slate-50 rounded-xl">
                    <p class="text-xs font-bold text-slate-800">${cat} <span class="text-slate-400 font-normal">(${list.length})</span></p>
                    <p class="text-[10px] text-slate-500 mt-1">TREC médio: <strong class="text-primary font-mono">${avgT.toFixed(0)}</strong></p>
                    <p class="text-[10px] font-mono text-slate-600 mt-1">R ${avgR.toFixed(2)} · S ${avgS.toFixed(2)} · A ${avgA.toFixed(2)}</p>
                </div>`;
        }).join('');
    },

    _filteredProfiles() {
        let rows = Object.values(this.state.profiles);
        const cat = this.state.categoryFilter;
        if (cat && cat !== 'Todas') {
            rows = rows.filter(r => (r.categoria || this.classifyProduct(r.produto)) === cat);
        }
        const q = (this.state.filterText || '').toLowerCase();
        if (q) {
            rows = rows.filter(r =>
                (r.produto || '').toLowerCase().includes(q) ||
                (r.variedade || '').toLowerCase().includes(q) ||
                (r.categoria || '').toLowerCase().includes(q)
            );
        }
        return rows;
    },

    // -------------------------------------------------------------------------
    // Utilitários estatísticos internos
    // -------------------------------------------------------------------------

    /** Clamp numérico entre lo e hi. */
    _clamp(v, lo, hi) {
        return Math.max(lo, Math.min(hi, v));
    },

    /** Média aritmética segura. */
    _mean(arr) {
        if (!arr || !arr.length) return 0;
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    },

    /** Desvio padrão amostral. */
    _std(arr) {
        if (!arr || arr.length < 2) return 0;
        const m = this._mean(arr);
        return Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1));
    },

    /** Z-score de um valor em relação a um vetor. */
    _z(val, arr) {
        const s = this._std(arr);
        if (!s) return 0;
        return (val - this._mean(arr)) / s;
    },

    /** Regressão linear simples y ~ x; retorna slope, intercept, r2, r. */
    _ols(xs, ys) {
        const n = Math.min(xs.length, ys.length);
        if (n < 3) return { slope: 0, intercept: 0, r2: 0, r: 0, n };
        let sx = 0, sy = 0, sxy = 0, sx2 = 0, sy2 = 0;
        for (let i = 0; i < n; i++) {
            sx += xs[i]; sy += ys[i];
            sxy += xs[i] * ys[i];
            sx2 += xs[i] * xs[i];
            sy2 += ys[i] * ys[i];
        }
        const den = n * sx2 - sx * sx;
        const slope = den === 0 ? 0 : (n * sxy - sx * sy) / den;
        const intercept = (sy - slope * sx) / n;
        const numR = n * sxy - sx * sy;
        const denR = Math.sqrt(Math.max(0, (n * sx2 - sx * sx) * (n * sy2 - sy * sy)));
        const r = denR === 0 ? 0 : numR / denR;
        return { slope, intercept, r2: r * r, r, n };
    },

    /** Correlação de Pearson entre dois vetores alinhados. */
    _pearson(xs, ys) {
        return this._ols(xs, ys).r;
    },

    /** Quantil linear (p em 0–1). */
    _quantile(arr, p) {
        if (!arr.length) return 0;
        const a = [...arr].sort((x, y) => x - y);
        const idx = (a.length - 1) * p;
        const lo = Math.floor(idx);
        const hi = Math.ceil(idx);
        if (lo === hi) return a[lo];
        return a[lo] * (hi - idx) + a[hi] * (idx - lo);
    },

    /** Diferença em dias entre duas datas YYYY-MM-DD. */
    _dayDiff(a, b) {
        return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
    },

    /** Formata número no padrão brasileiro. */
    _fmt(n, digits = 2) {
        if (n == null || Number.isNaN(n)) return '—';
        return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    },

    // -------------------------------------------------------------------------
    // Índice de Estresse Climático (CSI)
    // -------------------------------------------------------------------------

    /**
     * Calcula o Índice de Estresse Climático diário.
     * Combina temperatura, precipitação extrema, baixa umidade, ET0 e vento
     * via z-scores padronizados no período.
     */
    computeCSISeries(climaRows) {
        const parsed = (climaRows || []).map(c => {
            const data = Utils.toYMD(c.data);
            if (!data) return null;
            return {
                data,
                temp: parseFloat(c.temperatura) || parseFloat(c.temperatura_media) || 0,
                chuva: parseFloat(c.chuva) || parseFloat(c.chuva_mm) || 0,
                umidade: parseFloat(c.humidade) || parseFloat(c.umidade) || parseFloat(c.umidade_relativa) || 0,
                et0: parseFloat(c.evapotranspiracao) || parseFloat(c.evapotranpiracao) || 0,
                vento: parseFloat(c.velocidadedevento) || parseFloat(c.velocidadevento) || 0,
                tempSolo: parseFloat(c.temperaturasolo) || parseFloat(c.temperatura_solo) || 0
            };
        }).filter(Boolean);

        if (parsed.length < 5) return [];

        const temps = parsed.map(d => d.temp);
        const chuvas = parsed.map(d => d.chuva);
        const umids = parsed.map(d => d.umidade);
        const et0s = parsed.map(d => d.et0);
        const ventos = parsed.map(d => d.vento);

        return parsed.map((d, i) => {
            // Estresse térmico + demanda evaporativa + vento − umidade + chuva extrema (|z|)
            const raw =
                0.30 * this._z(d.temp, temps) +
                0.25 * this._z(d.et0, et0s) +
                0.15 * this._z(d.vento, ventos) -
                0.15 * this._z(d.umidade, umids) +
                0.15 * Math.abs(this._z(d.chuva, chuvas));
            return { ...d, csi: raw };
        });
    },

    /**
     * Cruza preços (e quantidade, se existir) com o CSI diário.
     * Retorna série temporal alinhada por data.
     */
    buildAlignedSeries(precos, climaRows, dateRef) {
        const csiSeries = this.computeCSISeries(climaRows);
        const csiMap = {};
        csiSeries.forEach(d => { csiMap[d.data] = d; });

        const series = (precos || []).map(p => {
            const date = Utils.toYMD(p.data);
            if (!date) return null;
            if (dateRef && date > dateRef) return null;
            const price = parseFloat(p.comum);
            if (!Number.isFinite(price)) return null;
            const clima = csiMap[date];
            if (!clima) return null;
            const qty = parseFloat(p.quantidade ?? p.qtd ?? p.volume ?? p.qtde);
            return {
                date,
                price,
                qty: Number.isFinite(qty) && qty > 0 ? qty : null,
                csi: clima.csi,
                temp: clima.temp,
                chuva: clima.chuva,
                umidade: clima.umidade,
                et0: clima.et0,
                vento: clima.vento
            };
        }).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));

        return series;
    },

    // -------------------------------------------------------------------------
    // Componente 1 – Resiliência (R)
    // -------------------------------------------------------------------------

    /**
     * Resiliência: estabilidade produtiva frente ao CSI.
     * Preferência: regressão quantidade ~ CSI (elasticidade).
     * Fallback: estabilidade de preço sob estresse (CV_estresse / CV_calmo)
     * e 1 − R² do modelo preço ~ CSI.
     */
    computeResilience(series) {
        if (!series || series.length < 12) {
            return { value: 0.5, classification: 'Moderada', detail: {}, interpretation: 'Amostra insuficiente para estimar resiliência com robustez.' };
        }

        const csi = series.map(d => d.csi);
        const hasQty = series.filter(d => d.qty != null).length >= 12;
        let elasticityAbs = 0;
        let r2 = 0;
        let method = '';

        if (hasQty) {
            const qty = series.map(d => Math.log(Math.max(d.qty, 1e-6)));
            const model = this._ols(csi, qty);
            elasticityAbs = Math.abs(model.slope);
            r2 = model.r2;
            method = 'elasticidade quantidade~CSI';
        } else {
            // Proxy de oferta: preços elevados sob estresse sugerem choque de oferta
            const price = series.map(d => Math.log(Math.max(d.price, 1e-6)));
            const model = this._ols(csi, price);
            elasticityAbs = Math.abs(model.slope);
            r2 = model.r2;
            method = 'estabilidade preço~CSI (proxy de oferta)';
        }

        const p75 = this._quantile(csi, 0.75);
        const p25 = this._quantile(csi, 0.25);
        const stressPrices = series.filter(d => d.csi >= p75).map(d => d.price);
        const calmPrices = series.filter(d => d.csi <= p25).map(d => d.price);
        const cvStress = stressPrices.length > 2 ? (this._std(stressPrices) / (this._mean(stressPrices) || 1)) : 0;
        const cvCalm = calmPrices.length > 2 ? (this._std(calmPrices) / (this._mean(calmPrices) || 1)) : 0;
        const cvRatio = cvCalm > 0 ? cvStress / cvCalm : 1;

        // R alto = baixa elasticidade + baixo R² clima→mercado + CV estável sob estresse
        const rFromElast = 1 / (1 + elasticityAbs * 8);
        const rFromFit = 1 - this._clamp(r2, 0, 1);
        const rFromCv = 1 / (1 + Math.max(0, cvRatio - 1));
        const value = this._clamp(0.45 * rFromElast + 0.35 * rFromFit + 0.20 * rFromCv, 0, 1);
        const classification = this.classifyLevel(value);

        return {
            value,
            classification,
            detail: { elasticityAbs, r2, cvRatio, cvStress, cvCalm, method, n: series.length },
            interpretation: this.interpretResilience(value, classification, { elasticityAbs, r2, cvRatio, method })
        };
    },

    /** Texto interpretativo da resiliência com base nos números calculados. */
    interpretResilience(value, classification, d) {
        const r2pct = (d.r2 * 100).toFixed(1);
        const elast = d.elasticityAbs.toFixed(3);
        if (value >= 0.75) {
            return `A variedade apresentou ${classification.toLowerCase()} estabilidade produtiva mesmo durante períodos de elevado estresse climático (R² clima–mercado de ${r2pct}%, elasticidade |β|=${elast} via ${d.method}), indicando elevada capacidade de resiliência.`;
        }
        if (value >= 0.55) {
            return `Resiliência ${classification.toLowerCase()}: a produção/oferta responde parcialmente ao Índice de Estresse Climático (R²=${r2pct}%, |β|=${elast}). Há capacidade de manter o padrão, porém com oscilações sob choques.`;
        }
        if (value >= 0.35) {
            return `Resiliência ${classification.toLowerCase()}: a série revela redução relevante da estabilidade quando o CSI se eleva (razão CV estresse/calmo ≈ ${d.cvRatio.toFixed(2)}; R²=${r2pct}%).`;
        }
        return `Resiliência ${classification.toLowerCase()}: forte acoplamento entre estresse climático e desorganização da oferta (R²=${r2pct}%, |β|=${elast}), sugerindo baixa capacidade de manter a produção sob condições adversas.`;
    },

    // -------------------------------------------------------------------------
    // Componente 2 – Sensibilidade Econômica (S)
    // -------------------------------------------------------------------------

    /**
     * Sensibilidade: magnitude da resposta do preço às variações climáticas (CSI).
     * Usa |r| de Pearson e elasticidade padronizada do OLS preço ~ CSI.
     */
    computeSensitivity(series) {
        if (!series || series.length < 12) {
            return { value: 0.5, classification: 'Moderada', detail: {}, interpretation: 'Amostra insuficiente para estimar sensibilidade econômica.', scatter: [] };
        }
        const xs = series.map(d => d.csi);
        const ys = series.map(d => d.price);
        const model = this._ols(xs, ys);
        const stdCsi = this._std(xs) || 1;
        const stdPrice = this._std(ys) || 1;
        const betaStd = Math.abs(model.slope) * stdCsi / stdPrice; // elasticidade padronizada
        const value = this._clamp(0.55 * Math.abs(model.r) + 0.45 * (1 - Math.exp(-betaStd)), 0, 1);
        const classification = this.classifyLevel(value);
        const scatter = series.map(d => ({ x: d.csi, y: d.price, date: d.date }));

        return {
            value,
            classification,
            detail: { r: model.r, r2: model.r2, slope: model.slope, betaStd, n: model.n },
            scatter,
            interpretation: this.interpretSensitivity(value, classification, model)
        };
    },

    interpretSensitivity(value, classification, model) {
        const dir = model.r >= 0 ? 'positiva' : 'negativa';
        const r = model.r.toFixed(2);
        if (value >= 0.7) {
            return `O preço apresenta elevada resposta às mudanças climáticas (r=${r}, direção ${dir}), indicando alta volatilidade econômica e classificação ${classification.toLowerCase()}.`;
        }
        if (value >= 0.45) {
            return `Sensibilidade ${classification.toLowerCase()}: o mercado responde às alterações climáticas (r=${r}), porém sem volatilidade extrema. Aproximadamente ${(model.r2 * 100).toFixed(1)}% da variação de preço associa-se linearmente ao CSI.`;
        }
        return `Sensibilidade ${classification.toLowerCase()}: o preço reage de forma limitada ao CSI (r=${r}), sugerindo menor transmissão imediata dos choques ambientais ao valor de mercado.`;
    },

    // -------------------------------------------------------------------------
    // Componente 3 – Inércia Econômica (I)
    // -------------------------------------------------------------------------

    /**
     * Inércia: defasagem (lag) que maximiza |corr(CSI_t, preço_{t+lag})|.
     * Varre lags de 0 a 45 dias.
     */
    computeInertia(series, maxLag = 30) {
        if (!series || series.length < 20) {
            return { valueDays: 0, valueNorm: 0.5, classification: 'Moderada', lagCorrs: [], interpretation: 'Série curta demais para estimar inércia por defasagens.' };
        }

        const byDate = {};
        series.forEach(d => { byDate[d.date] = d; });
        const dates = series.map(d => d.date);
        const lagCorrs = [];

        for (let lag = 0; lag <= maxLag; lag++) {
            const xs = [];
            const ys = [];
            dates.forEach(d0 => {
                const future = this._addDays(d0, lag);
                if (byDate[d0] && byDate[future]) {
                    xs.push(byDate[d0].csi);
                    ys.push(byDate[future].price);
                }
            });
            if (xs.length < 15) {
                lagCorrs.push({ lag, r: 0, n: xs.length });
                continue;
            }
            lagCorrs.push({ lag, r: this._pearson(xs, ys), n: xs.length });
        }

        let best = lagCorrs[0] || { lag: 0, r: 0 };
        lagCorrs.forEach(row => {
            if (Math.abs(row.r) > Math.abs(best.r)) best = row;
        });

        const valueDays = best.lag;
        // Normalização 0–1: inércia baixa (resposta rápida) → valor alto no fingerprint invertido depois
        const valueNorm = this._clamp(1 - valueDays / maxLag, 0, 1);
        const classification = this.classifyInertiaDays(valueDays);

        return {
            valueDays,
            valueNorm,
            bestR: best.r,
            classification,
            lagCorrs,
            interpretation: this.interpretInertia(valueDays, best.r, classification)
        };
    },

    _addDays(dateStr, days) {
        const d = new Date(dateStr + 'T00:00:00');
        d.setDate(d.getDate() + days);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    },

    classifyInertiaDays(days) {
        if (days <= 5) return 'Muito Baixa';
        if (days <= 12) return 'Baixa';
        if (days <= 21) return 'Moderada';
        if (days <= 30) return 'Alta';
        return 'Muito Alta';
    },

    interpretInertia(days, r, classification) {
        const semanas = (days / 7).toFixed(1);
        const rAbs = Math.abs(r).toFixed(2);
        if (days <= 7) {
            return `O mercado respondeu ao sinal climático em aproximadamente ${days} dia(s) (corr. defasada |r|=${rAbs}), indicando inércia ${classification.toLowerCase()} e transmissão rápida.`;
        }
        return `O mercado respondeu ao evento climático aproximadamente ${days} dias após sua ocorrência (~${semanas} semanas; |r| máx=${rAbs}), caracterizando inércia ${classification.toLowerCase()}.`;
    },

    // -------------------------------------------------------------------------
    // Componente 4 – Adaptabilidade (A)
    // -------------------------------------------------------------------------

    /**
     * Adaptabilidade: tempo médio de retorno de preço (e quantidade, se houver)
     * ao comportamento esperado após eventos extremos de CSI (|z| > 1.8).
     */
    computeAdaptability(series) {
        if (!series || series.length < 30) {
            return { value: 0.5, recoveryDays: null, classification: 'Moderada', events: [], interpretation: 'Histórico insuficiente para detectar recuperação pós-evento.', timeline: [] };
        }

        const csiVals = series.map(d => d.csi);
        const csiMean = this._mean(csiVals);
        const csiStd = this._std(csiVals) || 1;
        const prices = series.map(d => d.price);
        const priceMean = this._mean(prices);
        const priceStd = this._std(prices) || 1;

        const events = [];
        const timeline = series.map(d => ({
            date: d.date,
            csi: d.csi,
            price: d.price,
            extreme: Math.abs((d.csi - csiMean) / csiStd) > 1.8
        }));

        for (let i = 14; i < series.length - 5; i++) {
            const z = (series[i].csi - csiMean) / csiStd;
            if (Math.abs(z) < 1.8) continue;
            // Evita eventos consecutivos: exige calma nos 5 dias anteriores
            const prevExtreme = series.slice(i - 5, i).some(d => Math.abs((d.csi - csiMean) / csiStd) > 1.8);
            if (prevExtreme) continue;

            const baselineWindow = series.slice(Math.max(0, i - 14), i);
            const baseline = this._mean(baselineWindow.map(d => d.price));
            const band = 0.5 * priceStd;
            let recovery = null;
            let stable = 0;
            for (let j = i + 1; j < Math.min(series.length, i + 60); j++) {
                if (Math.abs(series[j].price - baseline) <= band) {
                    stable++;
                    if (stable >= 3) {
                        recovery = this._dayDiff(series[i].date, series[j].date);
                        break;
                    }
                } else {
                    stable = 0;
                }
            }

            // Recuperação de quantidade, se disponível
            let qtyRecovery = null;
            const qtyCount = baselineWindow.filter(d => d.qty != null).length;
            if (qtyCount >= 5 && series[i].qty != null) {
                const qBase = this._mean(baselineWindow.filter(d => d.qty != null).map(d => d.qty));
                const qStd = this._std(baselineWindow.filter(d => d.qty != null).map(d => d.qty)) || qBase * 0.1;
                let qs = 0;
                for (let j = i + 1; j < Math.min(series.length, i + 60); j++) {
                    if (series[j].qty == null) continue;
                    if (Math.abs(series[j].qty - qBase) <= 0.5 * qStd) {
                        qs++;
                        if (qs >= 3) {
                            qtyRecovery = this._dayDiff(series[i].date, series[j].date);
                            break;
                        }
                    } else qs = 0;
                }
            }

            events.push({
                date: series[i].date,
                z: z,
                recoveryDays: recovery,
                qtyRecoveryDays: qtyRecovery,
                baseline
            });
            i += 7; // espaça eventos
        }

        const recovered = events.filter(e => e.recoveryDays != null);
        const meanRecovery = recovered.length
            ? this._mean(recovered.map(e => e.recoveryDays))
            : 35;
        // Quanto menor o tempo de recuperação, maior A
        const value = this._clamp(1 / (1 + meanRecovery / 24), 0, 1);
        const classification = this.classifyLevel(value);

        return {
            value,
            recoveryDays: Math.round(meanRecovery),
            classification,
            events,
            timeline,
            interpretation: this.interpretAdaptability(value, meanRecovery, classification, recovered.length)
        };
    },

    interpretAdaptability(value, days, classification, nEvents) {
        const d = Math.round(days);
        if (!nEvents) {
            return `Não foram identificados eventos extremos suficientes no período; a adaptabilidade estimada (${classification.toLowerCase()}, índice ${value.toFixed(2)}) baseia-se na dinâmica geral da série.`;
        }
        if (value >= 0.7) {
            return `A cultura recuperou seu padrão produtivo/preço em aproximadamente ${d} dias após eventos extremos (n=${nEvents}), indicando elevada capacidade adaptativa (${classification}).`;
        }
        if (value >= 0.45) {
            return `Adaptabilidade ${classification.toLowerCase()}: o retorno ao comportamento esperado após choques climáticos ocorreu em cerca de ${d} dias (com base em ${nEvents} evento(s)).`;
        }
        return `Adaptabilidade ${classification.toLowerCase()}: a recuperação pós-evento foi lenta (~${d} dias em ${nEvents} evento(s)), sugerindo maior persistência dos desvios de preço/oferta.`;
    },

    // -------------------------------------------------------------------------
    // Classificação e Índice TREC
    // -------------------------------------------------------------------------

    /** Classifica valor contínuo 0–1 em cinco níveis. */
    classifyLevel(v) {
        if (v < 0.2) return 'Muito Baixa';
        if (v < 0.4) return 'Baixa';
        if (v < 0.6) return 'Moderada';
        if (v < 0.8) return 'Alta';
        return 'Muito Alta';
    },

    /** Classifica índice 0–100. */
    classifyTrecIndex(score) {
        if (score >= 85) return { label: 'Excelente', color: '#16a34a' };
        if (score >= 70) return { label: 'Alta estabilidade', color: '#22c55e' };
        if (score >= 55) return { label: 'Moderada', color: '#ca8a04' };
        if (score >= 40) return { label: 'Baixa estabilidade', color: '#ea580c' };
        return { label: 'Crítica', color: '#dc2626' };
    },

    /**
     * Índice geral TREC (0–100).
     * Premia resiliência e adaptabilidade; penaliza sensibilidade e inércia longa.
     */
    computeTrecIndex(R, S, I, A) {
        const r = R.value;
        const s = S.value;
        const inertiaNorm = I.valueNorm; // alto = resposta rápida
        const a = A.value;
        const score = 100 * (0.30 * r + 0.20 * (1 - s) + 0.20 * inertiaNorm + 0.30 * a);
        const clamped = this._clamp(score, 0, 100);
        const cls = this.classifyTrecIndex(clamped);
        return {
            score: clamped,
            classification: cls.label,
            color: cls.color,
            interpretation: this.interpretIndex(clamped, cls.label, R, S, I, A)
        };
    },

    interpretIndex(score, label, R, S, I, A) {
        return `No índice geral TREC a cultura apresentou ${Math.round(score)} pontos (${label}). ` +
            `Fingerprint: R=${R.value.toFixed(2)} (${R.classification}), S=${S.value.toFixed(2)} (${S.classification}), ` +
            `I=${I.valueDays}d (${I.classification}), A=${A.value.toFixed(2)} (${A.classification}). ` +
            (score >= 70
                ? 'Excelente estabilidade econômico-climática.'
                : score >= 55
                    ? 'Estabilidade intermediária sob condições climáticas variáveis.'
                    : 'Estabilidade econômico-climática limitada; maior exposição a choques.');
    },

    /** Gera narrativa técnica completa e específica aos números. */
    buildNarrative(meta, R, S, I, A, index) {
        const nome = [meta.produto, meta.variedade].filter(Boolean).join(' — ') || 'Cultura';
        return (
            `${nome}\n\n` +
            `A análise TREC indica resiliência produtiva ${R.classification.toLowerCase()} (${R.value.toFixed(2)}), ` +
            `${R.value >= 0.6 ? 'demonstrando baixa redução da oferta durante períodos climáticos adversos' : 'revelando vulnerabilidade da oferta sob estresse climático'}.\n\n` +
            `A sensibilidade econômica foi considerada ${S.classification.toLowerCase()} (S=${S.value.toFixed(2)}; r=${(S.detail.r || 0).toFixed(2)}), ` +
            `${S.value >= 0.55 ? 'indicando que o mercado responde às alterações climáticas com volatilidade relevante' : 'indicando que o mercado responde às alterações climáticas, porém sem elevada volatilidade'}.\n\n` +
            `A inércia econômica observada foi de aproximadamente ${I.valueDays} dias (corr. máx |r|=${Math.abs(I.bestR || 0).toFixed(2)}), ` +
            `sugerindo que os efeitos climáticos levam cerca de ${Math.max(1, Math.round(I.valueDays / 7))} semana(s) para serem refletidos no preço.\n\n` +
            `A adaptabilidade apresentou desempenho ${A.classification.toLowerCase()} (A=${A.value.toFixed(2)}` +
            `${A.recoveryDays != null ? `, recuperação média ~${A.recoveryDays} dias` : ''}), ` +
            `${A.value >= 0.6 ? 'indicando rápida recuperação após eventos extremos' : 'indicando recuperação mais lenta após eventos extremos'}.\n\n` +
            `No índice geral TREC a cultura apresentou ${Math.round(index.score)} pontos, sendo classificada como ${index.classification.toLowerCase()} sob condições climáticas variáveis.`
        );
    },

    // -------------------------------------------------------------------------
    // Análise completa de uma cultura/variedade
    // -------------------------------------------------------------------------

    /**
     * Executa o pipeline TREC completo e armazena o perfil no cache.
     */
    analyze(precos, clima, meta = {}) {
        const series = this.buildAlignedSeries(precos, clima, meta.dateRef || appState.dateRef);
        this.state.lastSeries = series;

        const R = this.computeResilience(series);
        const S = this.computeSensitivity(series);
        const I = this.computeInertia(series);
        const A = this.computeAdaptability(series);
        const index = this.computeTrecIndex(R, S, I, A);
        const narrative = this.buildNarrative(meta, R, S, I, A, index);

        const key = this._profileKey(meta.produto, meta.variedade);
        const profile = {
            key,
            produto: meta.produto || appState.currentProduto || '—',
            variedade: meta.variedade || '',
            categoria: meta.categoria || this.classifyProduct(meta.produto || appState.currentProduto),
            R, S, I, A, index, narrative,
            seriesLength: series.length,
            fingerprint: [R.value, S.value, I.valueNorm, A.value],
            updatedAt: new Date().toISOString()
        };

        this.state.profiles[key] = profile;
        this.state.currentKey = key;
        this.state.lastResult = profile;
        if (!this.state.compareKeys.includes(key)) {
            this.state.compareKeys.push(key);
        }
        return profile;
    },

    _profileKey(produto, variedade) {
        return `${(produto || '').trim()}||${(variedade || '').trim()}`;
    },

    // -------------------------------------------------------------------------
    // PCA / Biplot
    // -------------------------------------------------------------------------

    /**
     * PCA 2D sobre matriz de fingerprints [R,S,I,A] das culturas em cache.
     * Retorna escores das amostras e loadings (setas) para o biplot.
     */
    computePCABiplot(profiles) {
        const vars = ['R', 'S', 'I', 'A'];
        const rows = profiles.map(p => ({
            label: p.variedade ? `${p.produto} (${p.variedade})` : p.produto,
            key: p.key,
            values: [p.R.value, p.S.value, p.I.valueNorm, p.A.value]
        }));
        if (rows.length < 2) {
            return { scores: [], loadings: [], explained: [0, 0] };
        }

        const n = rows.length;
        const p = 4;
        // Padronização (z-score por coluna)
        const means = Array(p).fill(0);
        const stds = Array(p).fill(0);
        for (let j = 0; j < p; j++) {
            means[j] = this._mean(rows.map(r => r.values[j]));
            stds[j] = this._std(rows.map(r => r.values[j])) || 1;
        }
        const X = rows.map(r => r.values.map((v, j) => (v - means[j]) / stds[j]));

        // Matriz de covariância p×p
        const C = Array.from({ length: p }, () => Array(p).fill(0));
        for (let i = 0; i < p; i++) {
            for (let j = 0; j < p; j++) {
                let s = 0;
                for (let k = 0; k < n; k++) s += X[k][i] * X[k][j];
                C[i][j] = s / (n - 1);
            }
        }

        // Autovetores via power iteration + deflação (2 componentes)
        const eigen = this._topEigen(C, 2);
        const loadings = eigen.vectors; // p×2
        const scores = X.map((row, idx) => {
            const pc1 = row[0] * loadings[0][0] + row[1] * loadings[1][0] + row[2] * loadings[2][0] + row[3] * loadings[3][0];
            const pc2 = row[0] * loadings[0][1] + row[1] * loadings[1][1] + row[2] * loadings[2][1] + row[3] * loadings[3][1];
            return { x: pc1, y: pc2, label: rows[idx].label, key: rows[idx].key };
        });

        const totalVar = eigen.values.reduce((a, b) => a + b, 0) || 1;
        // Variância total da covariância ≈ traço
        const trace = C[0][0] + C[1][1] + C[2][2] + C[3][3];
        const explained = eigen.values.map(v => (trace ? v / trace : 0));

        const loadingArrows = vars.map((name, j) => ({
            name,
            x: loadings[j][0],
            y: loadings[j][1]
        }));

        return { scores, loadings: loadingArrows, explained };
    },

    /** Extrai os k maiores autovalores/autovetores de matriz simétrica (power + deflação). */
    _topEigen(M, k) {
        const size = M.length;
        const values = [];
        const vectors = Array.from({ length: size }, () => Array(k).fill(0));
        let A = M.map(row => [...row]);

        for (let comp = 0; comp < k; comp++) {
            let v = Array(size).fill(0).map(() => Math.random() - 0.5);
            let norm = Math.hypot(...v) || 1;
            v = v.map(x => x / norm);
            let lambda = 0;
            for (let iter = 0; iter < 80; iter++) {
                const Av = Array(size).fill(0);
                for (let i = 0; i < size; i++) {
                    for (let j = 0; j < size; j++) Av[i] += A[i][j] * v[j];
                }
                norm = Math.hypot(...Av) || 1;
                v = Av.map(x => x / norm);
                lambda = 0;
                for (let i = 0; i < size; i++) {
                    for (let j = 0; j < size; j++) lambda += v[i] * A[i][j] * v[j];
                }
            }
            values.push(lambda);
            for (let i = 0; i < size; i++) vectors[i][comp] = v[i];
            // Deflação
            for (let i = 0; i < size; i++) {
                for (let j = 0; j < size; j++) {
                    A[i][j] -= lambda * v[i] * v[j];
                }
            }
        }
        return { values, vectors };
    },

    // -------------------------------------------------------------------------
    // Análise por cidade (mapa)
    // -------------------------------------------------------------------------

    /**
     * Estima fingerprint local usando clima da cidade e a série de preços do produto.
     */
    analyzeCity(city, precos, dateRef) {
        const daily = city.weather?.daily;
        if (!daily?.time?.length) return null;
        const climaRows = daily.time.map((data, i) => ({
            data,
            temperatura: daily.temperature_2m_mean?.[i],
            chuva: daily.precipitation_sum?.[i],
            umidade: daily.relative_humidity_2m_mean?.[i],
            evapotranspiracao: daily.et0_fao_evapotranspiration?.[i],
            velocidadedevento: daily.wind_speed_10m_max?.[i],
            temperaturasolo: daily.soil_temperature_0_to_7cm_mean?.[i]
        }));
        const series = this.buildAlignedSeries(precos, climaRows, dateRef);
        if (series.length < 12) return null;
        const R = this.computeResilience(series);
        const S = this.computeSensitivity(series);
        const I = this.computeInertia(series);
        const A = this.computeAdaptability(series);
        const index = this.computeTrecIndex(R, S, I, A);
        return {
            municipio: city.municipio,
            uf: city.uf,
            latitude: city.latitude,
            longitude: city.longitude,
            volume: city.volume,
            R, S, I, A, index,
            seriesLength: series.length,
            narrative: `${city.municipio}/${city.uf}: TREC ${Math.round(index.score)} (${index.classification}). R=${R.value.toFixed(2)}, S=${S.value.toFixed(2)}, I=${I.valueDays}d, A=${A.value.toFixed(2)}.`
        };
    },

    // -------------------------------------------------------------------------
    // Renderização da UI
    // -------------------------------------------------------------------------

    /** Ponto de entrada chamado após renderDashboard / processar. */
    render() {
        if (!appState.rawPrecos?.length) {
            this._setPlaceholder();
            return;
        }
        this.loadStudyList();
        const variedade = document.getElementById('varInp')?.value || '';
        const profile = this.analyze(appState.rawPrecos, appState.rawClima, {
            produto: appState.currentProduto,
            variedade,
            dateRef: appState.dateRef
        });
        this._renderSummary(profile);
        this._renderGauge(profile);
        this._renderNarrative(profile);
        this._renderComponentPanels(profile);
        this._renderFingerprint();
        this._renderComparisonTable();
        this._renderRankings();
        this._renderDashboardCharts(profile);
        this._renderBiplot();
        this._populateCompareSelect();
        this._renderStudyList();
        this._renderCategoryChips();
        this._renderCategorySummary();
        // Mapa TREC é pesado (recalcula por cidade) — só sob demanda
        this.state.mapPending = true;
        const mapHint = document.getElementById('trec-map-hint');
        if (mapHint) mapHint.classList.remove('hidden');
    },

    /** Calcula marcadores do mapa TREC sob demanda (botão). */
    renderMapNow() {
        const mapHint = document.getElementById('trec-map-hint');
        if (mapHint) mapHint.classList.add('hidden');
        this._renderMap();
        this.state.mapPending = false;
        this.invalidateMapSizeOnly();
    },

    invalidateMapSizeOnly() {
        if (this.state.map) {
            setTimeout(() => this.state.map.invalidateSize(), 120);
        }
    },

    _setPlaceholder() {
        const el = document.getElementById('trec-narrative');
        if (el) el.textContent = 'Execute uma análise (produto/variedade) para calcular o Fingerprint TREC.';
    },

    _renderSummary(profile) {
        const cards = [
            { id: 'R', title: 'Resiliência', obj: profile.R, color: this.colors.R, emoji: '🟢' },
            { id: 'S', title: 'Sensibilidade', obj: profile.S, color: this.colors.S, emoji: '🟡' },
            { id: 'I', title: 'Inércia', obj: profile.I, color: this.colors.I, emoji: '🔵', isInertia: true },
            { id: 'A', title: 'Adaptabilidade', obj: profile.A, color: this.colors.A, emoji: '🟣' }
        ];
        cards.forEach(c => {
            const valEl = document.getElementById(`trec-card-${c.id}-value`);
            const clsEl = document.getElementById(`trec-card-${c.id}-class`);
            const txtEl = document.getElementById(`trec-card-${c.id}-text`);
            if (!valEl) return;
            if (c.isInertia) {
                valEl.textContent = `${c.obj.valueDays} d`;
            } else {
                valEl.textContent = this._fmt(c.obj.value, 2);
            }
            clsEl.textContent = c.obj.classification;
            clsEl.style.color = c.color;
            txtEl.textContent = c.obj.interpretation;
        });
    },

    _renderGauge(profile) {
        const score = profile.index.score;
        const scoreEl = document.getElementById('trec-index-score');
        const barEl = document.getElementById('trec-index-bar');
        const clsEl = document.getElementById('trec-index-class');
        const txtEl = document.getElementById('trec-index-text');
        const gaugeEl = document.getElementById('trec-gauge-fill');
        if (scoreEl) scoreEl.textContent = Math.round(score);
        if (barEl) {
            barEl.style.width = `${score}%`;
            barEl.style.backgroundColor = profile.index.color;
        }
        if (clsEl) {
            clsEl.textContent = profile.index.classification;
            clsEl.style.color = profile.index.color;
        }
        if (txtEl) txtEl.textContent = profile.index.interpretation;
        if (gaugeEl) {
            // semicírculo via conic-gradient
            const deg = Math.round(score * 1.8);
            gaugeEl.style.background = `conic-gradient(${profile.index.color} 0deg ${deg}deg, #e2e8f0 ${deg}deg 180deg, transparent 180deg 360deg)`;
        }
    },

    _renderNarrative(profile) {
        const el = document.getElementById('trec-narrative');
        if (!el) return;
        el.innerHTML = profile.narrative.split('\n\n').map(p => `<p class="mb-3">${p.replace(/\n/g, '<br>')}</p>`).join('');
    },

    _renderComponentPanels(profile) {
        // Sensibilidade – dispersão
        this._chartScatter('chTrecSens', profile.S.scatter || [], 'CSI', 'Preço (R$)', this.colors.S);
        const sensStat = document.getElementById('trec-sens-stat');
        if (sensStat) {
            sensStat.textContent = `S=${this._fmt(profile.S.value)} · r=${this._fmt(profile.S.detail.r || 0)} · ${profile.S.classification}`;
        }

        // Inércia – correlação por lag
        const lags = profile.I.lagCorrs || [];
        this._chartBar('chTrecInertia', lags.map(l => l.lag), lags.map(l => l.r), 'Correlação', this.colors.I);
        const inStat = document.getElementById('trec-inertia-stat');
        if (inStat) {
            inStat.textContent = `Lag ótimo: ${profile.I.valueDays} dias · |r|=${this._fmt(Math.abs(profile.I.bestR || 0))} · ${profile.I.classification}`;
        }

        // Adaptabilidade – linha temporal CSI/preço com extremos
        const tl = profile.A.timeline || [];
        this._chartDualLine('chTrecAdapt', tl);
        const adStat = document.getElementById('trec-adapt-stat');
        if (adStat) {
            adStat.textContent = profile.A.recoveryDays != null
                ? `Recuperação média: ${profile.A.recoveryDays} dias · eventos: ${(profile.A.events || []).length} · ${profile.A.classification}`
                : profile.A.interpretation;
        }

        // Resiliência – dispersão CSI × preço (ou qty)
        const series = this.state.lastSeries || [];
        const resPts = series.map(d => ({ x: d.csi, y: d.qty != null ? d.qty : d.price }));
        this._chartScatter('chTrecRes', resPts, 'CSI', series.some(d => d.qty != null) ? 'Quantidade' : 'Preço (proxy oferta)', this.colors.R);
        const resStat = document.getElementById('trec-res-stat');
        if (resStat) {
            resStat.textContent = `R=${this._fmt(profile.R.value)} · método: ${profile.R.detail.method || '—'} · ${profile.R.classification}`;
        }
    },

    _renderFingerprint() {
        const keys = this.state.compareKeys.filter(k => this.state.profiles[k]);
        const filteredKeys = keys.filter(k => {
            if (this.state.categoryFilter === 'Todas') return true;
            const p = this.state.profiles[k];
            return (p.categoria || this.classifyProduct(p.produto)) === this.state.categoryFilter;
        });
        const useKeys = filteredKeys.length ? filteredKeys : keys;
        const canvas = document.getElementById('chTrecRadar');
        if (!canvas) return;
        if (appState.charts.chTrecRadar) appState.charts.chTrecRadar.destroy();

        const palette = ['#8b0000', '#2563eb', '#16a34a', '#ca8a04', '#9333ea', '#0891b2', '#dc2626'];
        const datasets = useKeys.map((k, i) => {
            const p = this.state.profiles[k];
            const label = p.variedade ? `${p.produto} (${p.variedade})` : p.produto;
            const color = palette[i % palette.length];
            return {
                label,
                data: [p.R.value, p.S.value, p.I.valueNorm, p.A.value],
                borderColor: color,
                backgroundColor: color + '33',
                pointBackgroundColor: color,
                borderWidth: 2
            };
        });

        appState.charts.chTrecRadar = new Chart(canvas.getContext('2d'), {
            type: 'radar',
            data: {
                labels: ['Resiliência', 'Sensibilidade', 'Inércia (resp. rápida)', 'Adaptabilidade'],
                datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
                scales: {
                    r: {
                        min: 0,
                        max: 1,
                        ticks: { display: true, backdropColor: 'transparent', font: { size: 9 } },
                        grid: { color: '#e2e8f0' },
                        pointLabels: { font: { size: 11, weight: '600' }, color: '#475569' }
                    }
                }
            }
        });
    },

    _renderComparisonTable() {
        const tbody = document.getElementById('trecCompareBody');
        if (!tbody) return;
        let rows = this._filteredProfiles();
        const key = this.state.sortKey;
        const asc = this.state.sortAsc;
        rows.sort((a, b) => {
            const map = {
                cultura: (a.produto + a.variedade).localeCompare(b.produto + b.variedade),
                categoria: (a.categoria || '').localeCompare(b.categoria || ''),
                R: a.R.value - b.R.value,
                S: a.S.value - b.S.value,
                I: a.I.valueDays - b.I.valueDays,
                A: a.A.value - b.A.value,
                trec: a.index.score - b.index.score
            };
            const cmp = map[key] ?? map.trec;
            return asc ? cmp : -cmp;
        });

        if (!rows.length) {
            tbody.innerHTML = '<tr><td class="p-4 text-slate-500" colspan="7">Nenhum perfil TREC calculado ainda.</td></tr>';
            return;
        }
        tbody.innerHTML = rows.map(r => `
            <tr class="hover:bg-slate-50 transition-colors cursor-pointer" data-trec-key="${r.key.replace(/"/g, '&quot;')}" onclick="Trec.focusProfile(this.dataset.trecKey)">
                <td class="p-4 font-semibold text-slate-800">${r.produto}${r.variedade ? ` <span class="text-slate-400 font-normal">/ ${r.variedade}</span>` : ''}</td>
                <td class="p-4 text-[10px] text-slate-500">${r.categoria || this.classifyProduct(r.produto)}</td>
                <td class="p-4 text-right font-mono" style="color:${this.colors.R}">${this._fmt(r.R.value)}</td>
                <td class="p-4 text-right font-mono" style="color:${this.colors.S}">${this._fmt(r.S.value)}</td>
                <td class="p-4 text-right font-mono" style="color:${this.colors.I}">${r.I.valueDays}d</td>
                <td class="p-4 text-right font-mono" style="color:${this.colors.A}">${this._fmt(r.A.value)}</td>
                <td class="p-4 text-right font-mono font-bold" style="color:${r.index.color}">${Math.round(r.index.score)}</td>
            </tr>
        `).join('');
    },

    _renderRankings() {
        const profiles = this._filteredProfiles();
        this._fillRanking('trecRankRes', [...profiles].sort((a, b) => b.R.value - a.R.value).slice(0, 10), p => `${this._fmt(p.R.value)}`, this.colors.R);
        this._fillRanking('trecRankSens', [...profiles].sort((a, b) => b.S.value - a.S.value).slice(0, 10), p => `${this._fmt(p.S.value)}`, this.colors.S);
        this._fillRanking('trecRankAdapt', [...profiles].sort((a, b) => b.A.value - a.A.value).slice(0, 10), p => `${this._fmt(p.A.value)}`, this.colors.A);
        this._fillRanking('trecRankInertia', [...profiles].sort((a, b) => a.I.valueDays - b.I.valueDays).slice(0, 10), p => `${p.I.valueDays}d`, this.colors.I);
    },

    _fillRanking(elId, list, fmt, color) {
        const el = document.getElementById(elId);
        if (!el) return;
        if (!list.length) {
            el.innerHTML = '<li class="text-slate-400 text-xs">Sem dados — execute análises ou o ranking multi-cultura.</li>';
            return;
        }
        el.innerHTML = list.map((p, i) => `
            <li class="flex justify-between items-center py-1.5 border-b border-slate-50 last:border-0">
                <span class="text-xs text-slate-700"><span class="font-mono text-slate-400 mr-2">${i + 1}.</span>${p.produto}${p.variedade ? ` (${p.variedade})` : ''}</span>
                <span class="font-mono text-xs font-bold" style="color:${color}">${fmt(p)}</span>
            </li>
        `).join('');
    },

    _renderDashboardCharts(profile) {
        const series = this.state.lastSeries || [];
        // Linha temporal preço × CSI
        this._chartDualAxis('chTrecTemporal', series);
        // Distribuição CSI
        this._chartHistogram('chTrecDist', series.map(d => d.csi), 'CSI', '#8b0000');
        // Boxplot preços sob baixo/médio/alto CSI
        this._chartBoxGroups('chTrecBox', series);
        // Heatmap correlação climática × preço
        this._renderHeatmap(series);
        // Dispersão já coberta nos painéis; reforço no dashboard
        this._chartScatter('chTrecScatter', series.map(d => ({ x: d.csi, y: d.price })), 'CSI', 'Preço', '#8b0000');
    },

    _renderHeatmap(series) {
        const container = document.getElementById('trecHeatmap');
        if (!container || series.length < 10) {
            if (container) container.innerHTML = '<p class="text-xs text-slate-400 p-4">Dados insuficientes para heatmap.</p>';
            return;
        }
        const factors = [
            { key: 'csi', label: 'CSI' },
            { key: 'temp', label: 'Temp' },
            { key: 'chuva', label: 'Chuva' },
            { key: 'umidade', label: 'Umidade' },
            { key: 'et0', label: 'ET0' },
            { key: 'vento', label: 'Vento' }
        ];
        const price = series.map(d => d.price);
        const cells = factors.map(f => {
            const xs = series.map(d => d[f.key]);
            return { label: f.label, r: this._pearson(xs, price) };
        });
        // Matriz fator × fator
        let html = '<div class="overflow-x-auto"><table class="text-[10px] font-mono w-full"><thead><tr><th class="p-2"></th>';
        cells.forEach(c => { html += `<th class="p-2 text-slate-500">${c.label}</th>`; });
        html += '<th class="p-2 text-primary">Preço</th></tr></thead><tbody>';
        factors.forEach((fi, i) => {
            html += `<tr><td class="p-2 font-bold text-slate-600">${fi.label}</td>`;
            factors.forEach((fj, j) => {
                const r = this._pearson(series.map(d => d[fi.key]), series.map(d => d[fj.key]));
                html += `<td class="p-2 text-center" style="background:${this._heatColor(r)}">${r.toFixed(2)}</td>`;
            });
            const rp = cells[i].r;
            html += `<td class="p-2 text-center font-bold" style="background:${this._heatColor(rp)}">${rp.toFixed(2)}</td></tr>`;
        });
        html += '</tbody></table></div>';
        container.innerHTML = html;
    },

    _heatColor(r) {
        // azul (neg) → branco → vermelho (pos)
        const v = this._clamp(r, -1, 1);
        if (v >= 0) {
            const a = v;
            return `rgba(139,0,0,${0.15 + a * 0.7})`;
        }
        return `rgba(37,99,235,${0.15 + (-v) * 0.7})`;
    },

    _renderBiplot() {
        const profiles = this._filteredProfiles();
        const pca = this.computePCABiplot(profiles);
        const canvas = document.getElementById('chTrecBiplot');
        const info = document.getElementById('trec-biplot-info');
        if (!canvas) return;
        if (appState.charts.chTrecBiplot) appState.charts.chTrecBiplot.destroy();

        if (pca.scores.length < 2) {
            if (info) info.textContent = 'É necessário analisar ao menos 2 culturas/variedades para o biplot PCA.';
            return;
        }

        const scoreData = pca.scores.map(s => ({ x: s.x, y: s.y, label: s.label }));
        const arrowDatasets = pca.loadings.map((ld, i) => {
            const colors = [this.colors.R, this.colors.S, this.colors.I, this.colors.A];
            return {
                type: 'line',
                label: ld.name,
                data: [{ x: 0, y: 0 }, { x: ld.x * 2.2, y: ld.y * 2.2 }],
                borderColor: colors[i],
                borderWidth: 2,
                pointRadius: [0, 4],
                pointBackgroundColor: colors[i],
                showLine: true,
                fill: false
            };
        });

        appState.charts.chTrecBiplot = new Chart(canvas.getContext('2d'), {
            type: 'scatter',
            data: {
                datasets: [
                    {
                        type: 'scatter',
                        label: 'Culturas',
                        data: scoreData,
                        backgroundColor: '#8b0000',
                        pointRadius: 6,
                        pointHoverRadius: 8
                    },
                    ...arrowDatasets
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } },
                    tooltip: {
                        callbacks: {
                            label(ctx) {
                                if (ctx.dataset.label === 'Culturas') {
                                    const pt = scoreData[ctx.dataIndex];
                                    return `${pt.label}: (PC1=${pt.x.toFixed(2)}, PC2=${pt.y.toFixed(2)})`;
                                }
                                return ctx.dataset.label;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        title: { display: true, text: `PC1 (${(pca.explained[0] * 100).toFixed(1)}%)`, font: { weight: 'bold' } },
                        grid: { color: '#e2e8f0' }
                    },
                    y: {
                        title: { display: true, text: `PC2 (${(pca.explained[1] * 100).toFixed(1)}%)`, font: { weight: 'bold' } },
                        grid: { color: '#e2e8f0' }
                    }
                }
            }
        });
        if (info) {
            info.textContent = `Biplot PCA: amostras (pontos) e variáveis R/S/I/A (setas). Variância explicada: PC1 ${(pca.explained[0] * 100).toFixed(1)}% · PC2 ${(pca.explained[1] * 100).toFixed(1)}%.`;
        }
    },

    _renderMap() {
        const container = document.getElementById('trec-map');
        if (!container || typeof L === 'undefined') return;

        if (!this.state.map) {
            this.state.map = L.map('trec-map').setView([-14.235, -51.9253], 4);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; OpenStreetMap &copy; CARTO',
                subdomains: 'abcd',
                maxZoom: 18
            }).addTo(this.state.map);
            this.state.markersGroup = L.layerGroup().addTo(this.state.map);
            window.trecMap = this.state.map;
        }

        this.state.markersGroup.clearLayers();
        const cities = (appState.cityClimate || []).filter(c => Number.isFinite(c.latitude) && Number.isFinite(c.longitude)).slice(0, 5);
        if (!cities.length) {
            return;
        }

        const cityProfiles = [];
        cities.forEach(city => {
            const local = this.analyzeCity(city, appState.rawPrecos, appState.dateRef);
            if (!local) return;
            cityProfiles.push(local);
            const color = local.index.color;
            const marker = L.circleMarker([local.latitude, local.longitude], {
                radius: 10,
                fillColor: color,
                color: '#610000',
                weight: 1.5,
                fillOpacity: 0.75
            });
            marker.bindPopup(`
                <div class="p-3 font-[Inter] text-slate-800" style="min-width:240px;max-width:300px;">
                    <h4 class="font-bold text-sm text-primary border-b border-slate-100 pb-1 mb-2">${local.municipio} — ${local.uf}</h4>
                    <p class="text-xs mb-1"><strong>Índice TREC:</strong> <span style="color:${color}">${Math.round(local.index.score)}</span> (${local.index.classification})</p>
                    <p class="text-[11px] text-slate-600 mb-2">R=${local.R.value.toFixed(2)} · S=${local.S.value.toFixed(2)} · I=${local.I.valueDays}d · A=${local.A.value.toFixed(2)}</p>
                    <canvas id="trecMiniRadar_${local.municipio.replace(/\W/g, '')}" width="200" height="160"></canvas>
                    <p class="text-[10px] text-slate-500 mt-2 leading-relaxed">${local.narrative}</p>
                </div>
            `, { maxWidth: 320 });
            marker.on('popupopen', () => {
                const id = `trecMiniRadar_${local.municipio.replace(/\W/g, '')}`;
                const cv = document.getElementById(id);
                if (!cv) return;
                // eslint-disable-next-line no-new
                new Chart(cv.getContext('2d'), {
                    type: 'radar',
                    data: {
                        labels: ['R', 'S', 'I*', 'A'],
                        datasets: [{
                            data: [local.R.value, local.S.value, local.I.valueNorm, local.A.value],
                            borderColor: color,
                            backgroundColor: color + '44',
                            borderWidth: 2,
                            pointRadius: 2
                        }]
                    },
                    options: {
                        plugins: { legend: { display: false } },
                        scales: { r: { min: 0, max: 1, ticks: { display: false }, pointLabels: { font: { size: 9 } } } }
                    }
                });
            });
            this.state.markersGroup.addLayer(marker);
        });

        if (cityProfiles.length) {
            const bounds = L.latLngBounds(cityProfiles.map(c => [c.latitude, c.longitude]));
            this.state.map.fitBounds(bounds, { padding: [40, 40] });
        }
    },

    // -------------------------------------------------------------------------
    // Helpers de gráficos Chart.js
    // -------------------------------------------------------------------------

    _destroy(id) {
        if (appState.charts[id]) {
            appState.charts[id].destroy();
            delete appState.charts[id];
        }
    },

    _chartScatter(id, pts, xLabel, yLabel, color) {
        const el = document.getElementById(id);
        if (!el) return;
        this._destroy(id);
        if (!pts || pts.length < 2) return;
        const reg = Utils.getRegLine(pts);
        appState.charts[id] = new Chart(el.getContext('2d'), {
            type: 'scatter',
            data: {
                datasets: [
                    { data: pts, backgroundColor: color, pointRadius: 4 },
                    { type: 'line', data: reg, borderColor: '#64748b', borderDash: [5, 5], pointRadius: 0, border: false }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { title: { display: true, text: xLabel, font: { weight: 'bold' } }, grid: { color: '#e2e8f0' } },
                    y: { title: { display: true, text: yLabel, font: { weight: 'bold' } }, grid: { color: '#e2e8f0' } }
                }
            }
        });
    },

    _chartBar(id, labels, data, label, color) {
        const el = document.getElementById(id);
        if (!el) return;
        this._destroy(id);
        appState.charts[id] = new Chart(el.getContext('2d'), {
            type: 'bar',
            data: {
                labels,
                datasets: [{ label, data, backgroundColor: color, borderRadius: 3 }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { title: { display: true, text: 'Lag (dias)' }, ticks: { maxTicksLimit: 16 } },
                    y: { title: { display: true, text: 'r de Pearson' }, suggestedMin: -1, suggestedMax: 1 }
                }
            }
        });
    },

    _chartDualLine(id, timeline) {
        const el = document.getElementById(id);
        if (!el) return;
        this._destroy(id);
        if (!timeline.length) return;
        const step = Math.max(1, Math.floor(timeline.length / 120));
        const sliced = timeline.filter((_, i) => i % step === 0);
        appState.charts[id] = new Chart(el.getContext('2d'), {
            type: 'line',
            data: {
                labels: sliced.map(d => d.date),
                datasets: [
                    {
                        label: 'Preço',
                        data: sliced.map(d => d.price),
                        borderColor: '#8b0000',
                        yAxisID: 'y',
                        tension: 0.2,
                        pointRadius: sliced.map(d => d.extreme ? 4 : 0),
                        pointBackgroundColor: sliced.map(d => d.extreme ? '#dc2626' : '#8b0000')
                    },
                    {
                        label: 'CSI',
                        data: sliced.map(d => d.csi),
                        borderColor: '#9333ea',
                        yAxisID: 'y1',
                        tension: 0.2,
                        pointRadius: 0,
                        borderDash: [4, 3]
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } },
                scales: {
                    y: { position: 'left', title: { display: true, text: 'Preço' } },
                    y1: { position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'CSI' } },
                    x: { ticks: { maxTicksLimit: 8 } }
                }
            }
        });
    },

    _chartDualAxis(id, series) {
        this._chartDualLine(id, series.map(d => ({
            date: d.date,
            price: d.price,
            csi: d.csi,
            extreme: false
        })));
    },

    _chartHistogram(id, values, label, color) {
        const el = document.getElementById(id);
        if (!el) return;
        this._destroy(id);
        if (!values.length) return;
        const min = Math.min(...values);
        const max = Math.max(...values);
        const bins = 12;
        const width = (max - min) / bins || 1;
        const counts = Array(bins).fill(0);
        const labels = [];
        for (let i = 0; i < bins; i++) {
            labels.push((min + width * (i + 0.5)).toFixed(2));
        }
        values.forEach(v => {
            let idx = Math.floor((v - min) / width);
            if (idx >= bins) idx = bins - 1;
            if (idx < 0) idx = 0;
            counts[idx]++;
        });
        appState.charts[id] = new Chart(el.getContext('2d'), {
            type: 'bar',
            data: { labels, datasets: [{ data: counts, backgroundColor: color, borderRadius: 3 }] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false }, title: { display: false } },
                scales: {
                    x: { title: { display: true, text: label } },
                    y: { title: { display: true, text: 'Frequência' }, beginAtZero: true }
                }
            }
        });
    },

    /** Boxplot simplificado: min, Q1, mediana, Q3, max por faixa de CSI. */
    _chartBoxGroups(id, series) {
        const el = document.getElementById(id);
        if (!el) return;
        this._destroy(id);
        if (series.length < 15) return;

        const csi = series.map(d => d.csi);
        const q1 = this._quantile(csi, 0.33);
        const q2 = this._quantile(csi, 0.66);
        const groups = [
            { label: 'CSI baixo', vals: series.filter(d => d.csi <= q1).map(d => d.price) },
            { label: 'CSI médio', vals: series.filter(d => d.csi > q1 && d.csi <= q2).map(d => d.price) },
            { label: 'CSI alto', vals: series.filter(d => d.csi > q2).map(d => d.price) }
        ];

        const stats = groups.map(g => {
            const v = g.vals;
            if (v.length < 3) return { label: g.label, min: 0, q1: 0, med: 0, q3: 0, max: 0, n: v.length };
            return {
                label: g.label,
                min: Math.min(...v),
                q1: this._quantile(v, 0.25),
                med: this._quantile(v, 0.5),
                q3: this._quantile(v, 0.75),
                max: Math.max(...v),
                n: v.length
            };
        });

        appState.charts[id] = new Chart(el.getContext('2d'), {
            type: 'bar',
            data: {
                labels: stats.map(s => s.label),
                datasets: [
                    {
                        label: 'Mín–Máx (amplitude)',
                        data: stats.map(s => [s.min, s.max]),
                        backgroundColor: 'rgba(148,163,184,0.25)',
                        borderColor: '#94a3b8',
                        borderWidth: 1,
                        borderSkipped: false,
                        barPercentage: 0.35
                    },
                    {
                        label: 'Q1–Q3 (IQR)',
                        data: stats.map(s => [s.q1, s.q3]),
                        backgroundColor: 'rgba(139,0,0,0.45)',
                        borderColor: '#8b0000',
                        borderWidth: 1,
                        borderSkipped: false,
                        barPercentage: 0.55
                    },
                    {
                        type: 'line',
                        label: 'Mediana',
                        data: stats.map(s => s.med),
                        borderColor: '#610000',
                        backgroundColor: '#610000',
                        pointRadius: 5,
                        pointHoverRadius: 7,
                        showLine: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } },
                    tooltip: {
                        callbacks: {
                            afterBody(items) {
                                const i = items[0].dataIndex;
                                const s = stats[i];
                                return [
                                    `n=${s.n}`,
                                    `Min ${s.min.toFixed(2)}`,
                                    `Q1 ${s.q1.toFixed(2)}`,
                                    `Med ${s.med.toFixed(2)}`,
                                    `Q3 ${s.q3.toFixed(2)}`,
                                    `Máx ${s.max.toFixed(2)}`
                                ];
                            }
                        }
                    }
                },
                scales: {
                    y: { title: { display: true, text: 'Preço (R$)' } }
                }
            }
        });
    },

    // -------------------------------------------------------------------------
    // Interações da UI
    // -------------------------------------------------------------------------

    /** Ordena tabela comparativa. */
    sortCompare(key) {
        if (this.state.sortKey === key) this.state.sortAsc = !this.state.sortAsc;
        else {
            this.state.sortKey = key;
            this.state.sortAsc = key === 'cultura';
        }
        this._renderComparisonTable();
    },

    /** Filtra tabela comparativa. */
    filterCompare(text) {
        this.state.filterText = text || '';
        this._renderComparisonTable();
    },

    /** Foca um perfil no radar de comparação. */
    focusProfile(key) {
        if (!this.state.compareKeys.includes(key)) this.state.compareKeys.push(key);
        this.state.currentKey = key;
        this._renderFingerprint();
        const p = this.state.profiles[key];
        if (p) {
            this._renderSummary(p);
            this._renderGauge(p);
            this._renderNarrative(p);
        }
    },

    /** Atualiza seleção múltipla do radar. */
    updateCompareFromSelect() {
        const sel = document.getElementById('trecCompareSelect');
        if (!sel) return;
        this.state.compareKeys = [...sel.selectedOptions].map(o => o.value).filter(k => this.state.profiles[k]);
        if (!this.state.compareKeys.length && this.state.currentKey) {
            this.state.compareKeys = [this.state.currentKey];
        }
        this._renderFingerprint();
        this._renderBiplot();
    },

    _populateCompareSelect() {
        const sel = document.getElementById('trecCompareSelect');
        if (!sel) return;
        const profiles = Object.values(this.state.profiles);
        sel.innerHTML = profiles.map(p => {
            const label = p.variedade ? `${p.produto} (${p.variedade})` : p.produto;
            const selected = this.state.compareKeys.includes(p.key) ? 'selected' : '';
            return `<option value="${p.key}" ${selected}>${label}</option>`;
        }).join('');
    },

    /** Abre modal explicativo da teoria. */
    openTheoryModal() {
        const m = document.getElementById('trecTheoryModal');
        if (m) m.classList.remove('hidden');
    },

    /** Fecha modal explicativo. */
    closeTheoryModal() {
        const m = document.getElementById('trecTheoryModal');
        if (m) m.classList.add('hidden');
    },

    /**
     * Ranking multi-cultura: analisa um conjunto de produtos da lista
     * (limitado para não sobrecarregar a API), reutilizando o clima já carregado.
     */
    async runBatchRanking(limit = 10) {
        const status = document.getElementById('status-label');
        const options = [...document.querySelectorAll('#listProd option')].map(o => o.value).filter(Boolean);
        if (!options.length) {
            alert('Lista de produtos ainda não carregada.');
            return;
        }
        if (!appState.rawClima?.length) {
            alert('Execute ao menos uma análise antes para carregar o clima de referência.');
            return;
        }

        const targets = options.slice(0, limit);
        for (let i = 0; i < targets.length; i++) {
            const prod = targets[i];
            if (status) status.innerText = `TREC: ${i + 1}/${targets.length} ${prod}`;
            try {
                const precos = await Api.fetchPrecos(prod, '');
                if (precos.length < 20) continue;
                this.analyze(precos, appState.rawClima, {
                    produto: prod,
                    variedade: '',
                    dateRef: appState.dateRef
                });
            } catch (err) {
                console.warn('TREC batch falhou para', prod, err);
            }
        }
        this._renderComparisonTable();
        this._renderRankings();
        this._renderFingerprint();
        this._renderBiplot();
        this._populateCompareSelect();
        this._renderCategorySummary();
        if (status) status.innerText = 'SISTEMA ONLINE';
    },

    /** Invalida tamanho do mapa e redesenha gráficos ao abrir a aba. */
    invalidateMap() {
        if (this.state.lastResult) {
            this._renderFingerprint();
            this._renderComponentPanels(this.state.lastResult);
            this._renderDashboardCharts(this.state.lastResult);
            this._renderBiplot();
        }
        this.invalidateMapSizeOnly();
    }
};
