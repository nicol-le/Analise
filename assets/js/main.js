window.appState = window.appState || {
    rawPrecos: [],
    rawClima: [],
    rawToneladas: [],
    charts: {},
    currentGranularity: 'diario',
    dateRef: null,
    currentProduto: null,
    originTableData: [],
    originSortKey: 'VL_TONELADA',
    originSortAsc: false
};


function addDays(dateStr, days) {
    const date = new Date(dateStr);
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
}

function generateForecast(historicos, dateRef) {
    if (historicos.length < 3) return [];

    const horizonte = Utils.getDaysToFeb2026(dateRef);
    const forecasts = [];
    

    const sazonalidade = {};
    appState.rawPrecos.forEach(p => {
        const mes = new Date(p.data).getUTCMonth();
        if (!sazonalidade[mes]) sazonalidade[mes] = [];
        sazonalidade[mes].push(parseFloat(p.comum));
    });
    const mediasSazonais = Object.keys(sazonalidade).reduce((acc, mes) => {
        acc[mes] = Utils.average(sazonalidade[mes]);
        return acc;
    }, {});

    
    const recentes = historicos.slice(-30);
    const dadosTendencia = recentes.map((d, i) => ({ x: i, y: d.val }));
    const n = dadosTendencia.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    dadosTendencia.forEach(p => {
        sumX += p.x; sumY += p.y; sumXY += p.x * p.y; sumX2 += p.x * p.x;
    });
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX) || 0;

    const ultimoPreco = historicos[historicos.length - 1].val;
    
    for (let i = 1; i <= horizonte; i++) {
        const data = addDays(dateRef, i);
        const dateObj = new Date(data + 'T00:00:00');
        const mes = dateObj.getUTCMonth();

        const fatorTendencia = ultimoPreco + (slope * i * 0.5);
        const baseSazonal = mediasSazonais[mes] || ultimoPreco;
        let precoBase = (fatorTendencia * 0.4) + (baseSazonal * 0.6);

        const ruido = 1 + (Math.random() * 0.02 - 0.01); 
        forecasts.push({ date: data, valor: Math.max(0, precoBase * ruido), tipo: 'previsto' });
    }
    
    return forecasts;
}

function fitPolynomial(dados, grau) {
    const n = dados.length;
    if (grau === 2) {
        let sumX = 0, sumX2 = 0, sumX3 = 0, sumX4 = 0;
        let sumY = 0, sumXY = 0, sumX2Y = 0;
        dados.forEach(d => {
            sumX += d.x; sumX2 += d.x * d.x; sumX3 += d.x * d.x * d.x; sumX4 += d.x * d.x * d.x * d.x;
            sumY += d.y; sumXY += d.x * d.y; sumX2Y += d.x * d.x * d.y;
        });
        const A = [[n, sumX, sumX2], [sumX, sumX2, sumX3], [sumX2, sumX3, sumX4]];
        const b = [sumY, sumXY, sumX2Y];
        return solveLinearSystem(A, b);
    }
    return [0, 0, 0];
}

function solveLinearSystem(A, b) {
    const n = A.length;
    const M = A.map((row, i) => [...row, b[i]]);
    for (let i = 0; i < n; i++) {
        let maxRow = i;
        for (let k = i + 1; k < n; k++) {
            if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) maxRow = k;
        }
        [M[i], M[maxRow]] = [M[maxRow], M[i]];
        for (let k = i + 1; k < n; k++) {
            const factor = M[k][i] / M[i][i];
            for (let j = i; j <= n; j++) M[k][j] -= factor * M[i][j];
        }
    }
    const x = new Array(n);
    for (let i = n - 1; i >= 0; i--) {
        x[i] = M[i][n];
        for (let j = i + 1; j < n; j++) x[i] -= M[i][j] * x[j];
        x[i] /= M[i][i];
    }
    return x;
}

function calculateConfidence(historicos, volatility, numPoints, accuracyError) {
    let score = 50;
    if (numPoints > 60) score += 20;
    else if (numPoints > 30) score += 15;
    else if (numPoints > 15) score += 10;
    if (volatility < 10) score += 20;
    else if (volatility < 20) score += 10;
    else score -= 10;
    if (accuracyError < 2) score += 15;
    else if (accuracyError < 5) score += 10;
    else if (accuracyError > 15) score -= 20;
    return Math.max(0, Math.min(100, score));
}

function getConfidenceLevel(score) {
    if (score >= 70) return { color: '#10b981', label: '🟢 Alta Confiabilidade', icon: 'check_circle' };
    if (score >= 50) return { color: '#f59e0b', label: '🟡 Média Confiabilidade', icon: 'pending' };
    return { color: '#ef4444', label: '🔴 Baixa Confiabilidade', icon: 'error' };
}


window.onload = async () => {
    document.getElementById('status-label').innerText = "CARREGANDO...";
    
    const [produtos, toneladas] = await Promise.all([
        Api.fetchProdutos(),
        Api.fetchToneladas()
    ]);

    appState.rawToneladas = toneladas;
    
    const list = document.getElementById('listProd');
    produtos.forEach(p => {
        let o = document.createElement('option');
        o.value = p;
        list.appendChild(o);
    });

    document.getElementById('status-label').innerText = "SISTEMA ONLINE";
};

async function loadVariedades() {
    const prod = document.getElementById('prodInp').value;
    const variedades = await Api.fetchVariedades(prod);
    const list = document.getElementById('listVar');
    list.innerHTML = "";
    variedades.forEach(v => {
        let o = document.createElement('option');
        o.value = v;
        list.appendChild(o);
    });
}

function changeGranularity(g, btn) {
    appState.currentGranularity = g;
    document.querySelectorAll('#timeControls button').forEach(b => b.classList.remove('active-time'));
    btn.classList.add('active-time');
    if (appState.rawPrecos.length > 0) renderDashboard();
}

async function processar() {
    const prod = document.getElementById('prodInp').value;
    const varInp = document.getElementById('varInp').value;
    const dateRef = document.getElementById('dateRef').value; // pode ser vazio

    if (!prod) return alert("Por favor, selecione um produto.");

    document.getElementById('status-label').innerText = "BUSCANDO DADOS...";

    const [precos, clima] = await Promise.all([
        Api.fetchPrecos(prod, varInp),
        Api.fetchClima()
    ]);

    appState.rawPrecos = precos;
    appState.rawClima = clima;
    appState.currentProduto = prod;

    
    if (dateRef) {
        appState.dateRef = dateRef;
    } else {
        const datas = precos.map(p => Utils.toYMD(p.data)).filter(Boolean).sort();
        appState.dateRef = datas.length ? datas[datas.length - 1] : new Date().toISOString().split('T')[0];
        // Preenche o campo de data na interface com o valor usado
        document.getElementById('dateRef').value = appState.dateRef;
    }

    const allCities = getProducerCities(prod);
    const topCities = allCities.slice(0, 10);
    appState.allProducerCities = allCities;
    appState.topProducerCities = topCities;
    appState.cityClimate = [];
    appState.cityCoordinates = {};

    const priceDates = precos.map(p => Utils.toYMD(p.data)).filter(Boolean).sort();
    if (topCities.length && priceDates.length) {
        const availableUntil = new Date();
        availableUntil.setDate(availableUntil.getDate() - 5);
        const endDate = [priceDates[priceDates.length - 1], availableUntil.toISOString().slice(0, 10)].sort()[0];
        const cityClimate = await Api.fetchProductionWeather(topCities, priceDates[0], endDate);
        if (cityClimate.length) {
            appState.cityClimate = cityClimate;
            appState.cityCoordinates = Object.fromEntries(cityClimate.map(city => [`${city.municipio}|${city.uf}`, city]));
            appState.rawClima = buildWeightedClimate(cityClimate);
        }
    }

    console.group("📊 DEBUG: Análise");
    console.log("Total registros preços:", precos.length);
    console.log("Cidades com clima ponderado:", appState.cityClimate.length);
    console.log("Data de Referência usada:", appState.dateRef);
    console.groupEnd();

    renderOriginData(appState.currentProduto);

    renderDashboard();
    document.getElementById('status-label').innerText = "SISTEMA ONLINE";

    // O mapa contém todas as cidades. Coordenadas ficam no cache do navegador
    // para as próximas análises, enquanto o clima usa somente as 10 principais.
    Api.resolveCityCoordinates(allCities, (done, total) => {
        document.getElementById('status-label').innerText = `MAPA: ${done}/${total} CIDADES`;
    }).then(located => {
        appState.cityCoordinates = Object.fromEntries(located.map(city => [`${city.municipio}|${city.uf}`, city]));
        renderOriginData(appState.currentProduto);
        document.getElementById('status-label').innerText = "SISTEMA ONLINE";
    });
}

function getProducerCities(produto) {
    const normalize = value => (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
    const targetNorm = normalize(produto);
    if (!targetNorm) return [];

    let rows = appState.rawToneladas.filter(row => normalize(row.PRODUTO) === targetNorm);

    // Fallback 1: Busca por inclusão de substring se não houver match exato
    if (!rows.length) {
        rows = appState.rawToneladas.filter(row => {
            const pNorm = normalize(row.PRODUTO);
            return pNorm.includes(targetNorm) || targetNorm.includes(pNorm);
        });
    }

    // Fallback 2: Primeiro termo relevante (ex: "TOMATE", "ABACATE", "BATATA")
    if (!rows.length) {
        const firstWord = targetNorm.split(' ')[0];
        if (firstWord.length >= 3) {
            rows = appState.rawToneladas.filter(row => normalize(row.PRODUTO).startsWith(firstWord));
        }
    }

    const totals = new Map();
    rows.forEach(row => {
        const canonical = normalize(row.MUNICIPIO).replace(/[^A-Z0-9]/g, '');
        const key = `${canonical}|${row.UF}`;
        const current = totals.get(key) || { municipio: (row.MUNICIPIO || '').trim(), uf: row.UF, volume: 0 };
        current.volume += Utils.parseBrazilFloat(row.VL_TONELADA);
        totals.set(key, current);
    });
    return [...totals.values()].sort((a, b) => b.volume - a.volume);
}

function buildWeightedClimate(cities) {
    const days = new Map();
    const totalVolume = cities.reduce((sum, city) => sum + city.volume, 0) || 1;
    cities.forEach(city => {
        const daily = city.weather?.daily;
        if (!daily?.time) return;
        daily.time.forEach((date, index) => {
            const item = days.get(date) || { data: date, temperatura: 0, chuva: 0, umidade: 0, evapotranspiracao: 0, velocidadedevento: 0, temperaturasolo: 0 };
            const weight = city.volume / totalVolume;
            item.temperatura += (daily.temperature_2m_mean?.[index] || 0) * weight;
            item.chuva += (daily.precipitation_sum?.[index] || 0) * weight;
            item.umidade += (daily.relative_humidity_2m_mean?.[index] || 0) * weight;
            item.evapotranspiracao += (daily.et0_fao_evapotranspiration?.[index] || 0) * weight;
            item.velocidadedevento += (daily.wind_speed_10m_max?.[index] || 0) * weight;
            item.temperaturasolo += (daily.soil_temperature_0_to_7cm_mean?.[index] || 0) * weight;
            days.set(date, item);
        });
    });
    return [...days.values()];
}



function renderDashboard() {
    const dateRef = appState.dateRef;
    
    // Monta TODOS os registros válidos primeiro
    let todosHistoricos = appState.rawPrecos.map(p => ({ 
        date: Utils.toYMD(p.data), 
        val: parseFloat(p.comum),
        unidade: p.unidade || 'KG'
    }))
    .filter(p => p.date && !isNaN(p.val))
    .sort((a, b) => a.date.localeCompare(b.date));

    if (!todosHistoricos.length) {
        document.getElementById('status-label').innerText = "SISTEMA ONLINE";
        alert("Nenhum dado de preço encontrado para este produto.");
        return;
    }


    let historicos = todosHistoricos.filter(p => p.date <= dateRef);

    
    if (!historicos.length) {
        console.warn("Nenhum dado antes da data de referência. Usando todos os dados disponíveis.");
        historicos = todosHistoricos;
        appState.dateRef = todosHistoricos[todosHistoricos.length - 1].date;
        document.getElementById('dateRef').value = appState.dateRef;
    }

    let reaisPosteriores = appState.rawPrecos.map(p => ({ 
        date: Utils.toYMD(p.data), 
        val: parseFloat(p.comum)
    }))
    .filter(p => p.date && !isNaN(p.val) && p.date > dateRef && p.date <= addDays(dateRef, 60))
    .sort((a, b) => a.date.localeCompare(b.date));

    const vals = historicos.map(f => f.val);
    const minData = Utils.findMin(historicos);
    const maxData = Utils.findMax(historicos);
    const stdDev = Utils.stdDev(vals);
    const cv = Utils.coefficientOfVariation(vals);
    const unidade = historicos.length > 0 ? historicos[0].unidade : 'KG';

    document.getElementById('st-media').innerText = Utils.formatCurrency(Utils.average(vals));
    document.getElementById('st-media-date').innerText = `${historicos.length} dias`;
    document.getElementById('st-unidade').innerText = `por ${unidade}`;
    document.getElementById('st-min').innerText = Utils.formatCurrency(minData.val);
    document.getElementById('st-min-date').innerText = Utils.formatDate(minData.date);
    document.getElementById('st-max').innerText = Utils.formatCurrency(maxData.val);
    document.getElementById('st-max-date').innerText = Utils.formatDate(maxData.date);
    document.getElementById('st-stddev').innerText = Utils.formatCurrency(stdDev);
    document.getElementById('st-cv').innerText = `CV: ${cv.toFixed(1)}%`;

    
    const previsoes = generateForecast(historicos, dateRef);
    
    let dadosEvolucao = [...historicos];
    if (appState.currentGranularity !== 'diario') {
        let grupos = {};
        historicos.forEach(f => {
            let chave = (appState.currentGranularity === 'mensal') 
                ? f.date.substring(0, 7) 
                : `${new Date(f.date).getFullYear()}-W${Math.ceil(new Date(f.date).getDate()/7)}`;
            if (!grupos[chave]) grupos[chave] = [];
            grupos[chave].push(f.val);
        });
        dadosEvolucao = Object.keys(grupos).map(k => ({ date: k, val: Utils.average(grupos[k]) }));
    }

    Charts.updateLineChart('chEvolucao', dadosEvolucao.map(d => d.date), dadosEvolucao.map(d => d.val), 'Preço R$');

    const mesesLabels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    const sazonalData = mesesLabels.map((_, i) => {
        let m = historicos.filter(p => new Date(p.date).getUTCMonth() === i);
        return m.length ? Utils.average(m.map(p => p.val)) : 0;
    });
    Charts.updateBarChart('chSazonal', mesesLabels, sazonalData);

    renderForecastChart(historicos, previsoes, reaisPosteriores);
    renderForecastAccuracy(previsoes, reaisPosteriores, historicos);

    const volatility = cv;
    const accuracyError = calculateForecastError(previsoes, reaisPosteriores);
    const confidenceScore = calculateConfidence(historicos, volatility, historicos.length, accuracyError);
    const confidenceInfo = getConfidenceLevel(confidenceScore);
    
    document.getElementById('confidence-circle').style.backgroundColor = confidenceInfo.color;
    document.getElementById('confidence-icon').innerText = confidenceInfo.icon;
    document.getElementById('confidence-level').innerText = confidenceScore.toFixed(0);
    document.getElementById('confidence-desc').innerText = confidenceInfo.label;
    document.getElementById('data-points').innerText = historicos.length;
    document.getElementById('mean-error').innerText = accuracyError.toFixed(2) + '%';

   
    const mapaClima = {};
    appState.rawClima.forEach(c => {
        try {
            let d = Utils.toYMD(c.data);
            if (!d) return;
            const temp = parseFloat(c.temperatura) || parseFloat(c.temperatura_media) || 0;
            const chuva = parseFloat(c.chuva) || parseFloat(c.chuva_mm) || 0;
            const umidade = parseFloat(c.humidade) || parseFloat(c.umidade_relativa) || 0;
            const evapotransp = parseFloat(c.evapotranspiracao) || 0;
            const vento = parseFloat(c.velocidadedevento) || 0;
            const tempSolo = parseFloat(c.temperaturasolo) || 0;
            if (!mapaClima[d]) {
                mapaClima[d] = { temp, chuva, umidade, evapotransp, vento, tempSolo };
            }
        } catch (e) {}
    });

    let correlacoes = [];
    
    let ptsTemp = [];
    historicos.forEach(p => {
        if (mapaClima[p.date] && mapaClima[p.date].temp !== 0)
            ptsTemp.push({ x: mapaClima[p.date].temp, y: p.val });
    });
    const pearsonTemp = Utils.getPearson(ptsTemp);
    if (ptsTemp.length > 1) correlacoes.push({ nome: 'Temperatura', r: pearsonTemp, pontos: ptsTemp.length });

    let ptsChuva = [];
    historicos.forEach(p => {
        if (mapaClima[p.date] && mapaClima[p.date].chuva !== 0)
            ptsChuva.push({ x: mapaClima[p.date].chuva, y: p.val });
    });
    const pearsonChuva = Utils.getPearson(ptsChuva);
    if (ptsChuva.length > 1) correlacoes.push({ nome: 'Precipitação', r: pearsonChuva, pontos: ptsChuva.length });

    let ptsUmidade = [];
    historicos.forEach(p => {
        if (mapaClima[p.date] && mapaClima[p.date].umidade !== 0)
            ptsUmidade.push({ x: mapaClima[p.date].umidade, y: p.val });
    });
    const pearsonUmidade = Utils.getPearson(ptsUmidade);
    if (ptsUmidade.length > 1) correlacoes.push({ nome: 'Umidade', r: pearsonUmidade, pontos: ptsUmidade.length });

    let ptsEvapotransp = [];
    historicos.forEach(p => {
        if (mapaClima[p.date] && mapaClima[p.date].evapotransp !== 0)
            ptsEvapotransp.push({ x: mapaClima[p.date].evapotransp, y: p.val });
    });
    const pearsonEvapotransp = Utils.getPearson(ptsEvapotransp);
    if (ptsEvapotransp.length > 1) correlacoes.push({ nome: 'Evapotranspiração', r: pearsonEvapotransp, pontos: ptsEvapotransp.length });

    let ptsVento = [];
    historicos.forEach(p => {
        if (mapaClima[p.date] && mapaClima[p.date].vento !== 0)
            ptsVento.push({ x: mapaClima[p.date].vento, y: p.val });
    });
    const pearsonVento = Utils.getPearson(ptsVento);
    if (ptsVento.length > 1) correlacoes.push({ nome: 'Velocidade do Vento', r: pearsonVento, pontos: ptsVento.length });

    let ptsTempSolo = [];
    historicos.forEach(p => {
        if (mapaClima[p.date] && mapaClima[p.date].tempSolo !== 0)
            ptsTempSolo.push({ x: mapaClima[p.date].tempSolo, y: p.val });
    });
    const pearsonTempSolo = Utils.getPearson(ptsTempSolo);
    if (ptsTempSolo.length > 1) correlacoes.push({ nome: 'Temperatura do Solo', r: pearsonTempSolo, pontos: ptsTempSolo.length });

    Charts.updateScatter('chTemp', ptsTemp, 'Temp ºC');
    Charts.updateScatter('chChuva', ptsChuva, 'Chuva mm');
    
    document.getElementById('statTemp').innerText = `${ptsTemp.length} dias com dados • Correlação: ${pearsonTemp.toFixed(2)}`;
    document.getElementById('statChuva').innerText = `${ptsChuva.length} dias com dados • Correlação: ${pearsonChuva.toFixed(2)}`;

    renderCorrelationTable(correlacoes);
    renderClimateEvidence(historicos, mapaClima, ptsTemp, ptsChuva);

    Components.atualizarSemaforo(historicos);
    if (document.getElementById('ia-insight')) {
        Components.gerarInsightIA(historicos, pearsonTemp, pearsonChuva, ptsTemp, ptsChuva, correlacoes);
    }

    renderExtremeEvents(historicos, mapaClima);
    populateHistoryTable();
}


function renderOriginData(produto) {
    if (!produto) return;

    
    if (!appState.rawToneladas.length) {
        console.warn("rawToneladas vazio — tentando recarregar CSV...");
        Api.fetchToneladas().then(data => {
            appState.rawToneladas = data;
            if (data.length > 0) renderOriginData(produto);
        });
        return;
    }

    const normalize = s => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
    const prodNorm = normalize(produto);
    
    const toneladasFiltradas = appState.rawToneladas.filter(row => 
        normalize(row.PRODUTO) === prodNorm
    );

    console.log(`[Mapa] Produto: "${produto}" → ${toneladasFiltradas.length} registros no CSV`);
    if (toneladasFiltradas.length === 0) {
  
        const produtos = [...new Set(appState.rawToneladas.map(r => r.PRODUTO))];
        const similares = produtos.filter(p => normalize(p).includes(prodNorm.substring(0, 4)));
        console.log(`[Mapa] Produtos similares no CSV:`, similares.slice(0, 10));
    }

    const totalVolume = toneladasFiltradas.reduce((sum, row) => sum + Utils.parseBrazilFloat(row.VL_TONELADA), 0);
    const uniqueStates = new Set(toneladasFiltradas.map(r => r.UF)).size;
    const uniqueCities = new Set(toneladasFiltradas.map(r => r.MUNICIPIO)).size;

    const volEl = document.getElementById('log-total-volume');
    const stEl = document.getElementById('log-total-states');
    const ctEl = document.getElementById('log-total-cities');

    if (toneladasFiltradas.length === 0) {
        if (volEl) volEl.innerText = 'Sem dados (2022)';
        if (stEl) stEl.innerText = '0';
        if (ctEl) ctEl.innerText = '0';
     
        const tbody = document.getElementById('originTableBody');
        if (tbody) tbody.innerHTML = `<tr><td class="p-6 text-slate-400 italic text-center" colspan="4">
            Nenhum dado de volume encontrado para <strong>${produto}</strong> em 2022.<br>
            <span class="text-xs">O nome do produto pode diferir entre as bases de dados.</span>
        </td></tr>`;
        
        if (typeof OrigemMap !== 'undefined') OrigemMap.update([], produto);
        return;
    }

    if (volEl) volEl.innerText = `${totalVolume.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} t`;
    if (stEl) stEl.innerText = uniqueStates;
    if (ctEl) ctEl.innerText = uniqueCities;


    if (typeof OrigemMap !== 'undefined') {
        updateOriginMap();
    }

    const tableData = appState.allProducerCities.map(city => ({
        MUNICIPIO: city.municipio || '-',
        UF: city.uf || '-',
        VL_TONELADA: city.volume,
        PERCENT: totalVolume > 0 ? (city.volume / totalVolume) * 100 : 0
    }));

    appState.originTableData = tableData;
    appState.originSortKey = 'VL_TONELADA';
    appState.originSortAsc = false;

    renderOriginTable();
}

function updateOriginMap() {
    const query = (document.getElementById('originMapFilter')?.value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
    const cities = appState.allProducerCities.filter(city => {
        const label = `${city.municipio} ${city.uf}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
        return !query || label.includes(query);
    }).map(city => {
        const resolved = appState.cityCoordinates[`${city.municipio}|${city.uf}`];
        return { ...city, latitude: resolved?.latitude, longitude: resolved?.longitude };
    });
    OrigemMap.update(cities);
}

function filterOriginMap() {
    if (typeof OrigemMap !== 'undefined') updateOriginMap();
}

function renderOriginTable() {
    const tbody = document.getElementById('originTableBody');
    if (!tbody) return;

    const search = (document.getElementById('originSearch')?.value || '').toLowerCase();
    const key = appState.originSortKey;
    const asc = appState.originSortAsc;

    let data = appState.originTableData;

   
    if (search) {
        data = data.filter(row =>
            row.MUNICIPIO.toLowerCase().includes(search) || row.UF.toLowerCase().includes(search)
        );
    }

    data = [...data].sort((a, b) => {
        let va = a[key], vb = b[key];
        if (typeof va === 'string') {
            return asc ? va.localeCompare(vb) : vb.localeCompare(va);
        }
        return asc ? va - vb : vb - va;
    });

    tbody.innerHTML = '';
    if (!data.length) {
        tbody.innerHTML = '<tr><td class="p-4 text-slate-500" colspan="4">Nenhum resultado encontrado.</td></tr>';
        return;
    }

    data.forEach(row => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition-colors';
        
        const percBar = `<div class="w-full bg-slate-100 rounded-full h-1 mt-1">
            <div class="bg-primary-container h-1 rounded-full" style="width: ${Math.min(100, row.PERCENT).toFixed(1)}%"></div>
        </div>`;

        tr.innerHTML = `
            <td class="p-4 font-semibold text-slate-800">${row.MUNICIPIO}</td>
            <td class="p-4">
                <span class="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-red-50 text-primary border border-red-100">${row.UF}</span>
            </td>
            <td class="p-4 text-right font-mono text-slate-700">
                ${row.VL_TONELADA.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} t
            </td>
            <td class="p-4 text-right">
                <span class="font-mono text-slate-600">${row.PERCENT.toFixed(2)}%</span>
                ${percBar}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function filterOriginTable() {
    renderOriginTable();
}

function sortOriginTable(key) {
    if (appState.originSortKey === key) {
        appState.originSortAsc = !appState.originSortAsc;
    } else {
        appState.originSortKey = key;
        appState.originSortAsc = key !== 'VL_TONELADA'; // Volume: desc by default
    }

    const icons = ['MUNICIPIO', 'UF', 'VL_TONELADA', 'PERCENT'];
    icons.forEach(k => {
        const el = document.getElementById(`sort-icon-${k}`);
        if (el) {
            el.innerText = (appState.originSortKey === k) ? (appState.originSortAsc ? '▲' : '▼') : '';
        }
    });

    renderOriginTable();
}


function renderClimateEvidence(historicos, mapaClima, ptsTemp, ptsChuva) {
    const coverage = document.getElementById('climateEvidenceCoverage');
    const anomaly = document.getElementById('climateEvidenceAnomaly');
    const anomalyDesc = document.getElementById('climateEvidenceAnomalyDesc');
    const effect = document.getElementById('climateEvidenceEffect');
    const effectDesc = document.getElementById('climateEvidenceEffectDesc');
    const conclusion = document.getElementById('climateEvidenceConclusion');
    const method = document.getElementById('climateEvidenceMethod');
    const climateSourceBadge = document.getElementById('climateSourceBadge');
    if (!coverage) return;

    const pairs = historicos
        .filter(item => mapaClima[item.date] && Number.isFinite(mapaClima[item.date].temp))
        .map(item => ({ price: item.val, temp: mapaClima[item.date].temp, rain: mapaClima[item.date].chuva || 0, date: item.date }));
    coverage.textContent = `${pairs.length} dias`;

    if (appState.cityClimate && appState.cityClimate.length > 0) {
        if (method) method.textContent = `Média ponderada · top ${appState.cityClimate.length} cidades`;
        if (climateSourceBadge) {
            climateSourceBadge.className = "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800 border border-green-200";
            climateSourceBadge.innerHTML = `<span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> Média Ponderada (${appState.cityClimate.length} Cidades Produtoras)`;
        }
    } else {
        if (method) method.textContent = 'Base climática de reserva (CEAGESP/SP)';
        if (climateSourceBadge) {
            climateSourceBadge.className = "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200";
            climateSourceBadge.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-500"></span> Base Climática de Reserva (CEAGESP)`;
        }
    }

    if (pairs.length < 12) {
        anomaly.textContent = 'amostra curta';
        anomalyDesc.textContent = 'são necessários pelo menos 12 cruzamentos';
        effect.textContent = '—';
        conclusion.textContent = 'Ainda não há observações suficientes para uma leitura estatística robusta. O painel preserva as correlações, mas evita inferir efeito com amostra curta.';
        return;
    }

    const temps = pairs.map(item => item.temp);
    const baseline = Utils.average(temps);
    const deviation = Utils.stdDev(temps);
    const recent = pairs.slice(-Math.min(7, pairs.length));
    const recentTemp = Utils.average(recent.map(item => item.temp));
    const z = deviation ? (recentTemp - baseline) / deviation : 0;
    anomaly.textContent = `${z >= 0 ? '+' : ''}${z.toFixed(2)} DP`;
    anomalyDesc.textContent = `${recentTemp.toFixed(1)} °C recente vs média de ${baseline.toFixed(1)} °C (Z-Score em relação ao período)`;

    const sorted = [...pairs].sort((a, b) => a.temp - b.temp);
    const groupSize = Math.max(3, Math.floor(sorted.length * 0.25));
    const coldPrice = Utils.average(sorted.slice(0, groupSize).map(item => item.price));
    const hotPrice = Utils.average(sorted.slice(-groupSize).map(item => item.price));
    const difference = Utils.percentualMudanca(coldPrice, hotPrice);
    effect.textContent = `${difference >= 0 ? '+' : ''}${difference.toFixed(1)}%`;
    effectDesc.textContent = `${groupSize} dias mais quentes vs. ${groupSize} mais frios (quantis 25%)`;

    const rTemp = Utils.getPearson(ptsTemp);
    const rRain = Utils.getPearson(ptsChuva);
    const direction = difference > 0 ? 'maior' : difference < 0 ? 'menor' : 'sem diferença';
    conclusion.textContent = `Leitura estatística: nos 25% dos dias mais quentes, o preço médio foi ${Math.abs(difference).toFixed(1)}% ${direction} que nos 25% mais frios. Correlação de Pearson: temperatura r=${rTemp.toFixed(2)} e chuva r=${rRain.toFixed(2)}. Nota agrícola: Esta observação descritiva reflete associação empírica e NÃO comprova causalidade direta, pois sazonalidade de safra, logística e choque de oferta/demanda atuam simultaneamente.`;
}

function renderCorrelationTable(correlacoes) {
    const tbody = document.getElementById('climateCorrelationTable');
    tbody.innerHTML = "";

    if (!correlacoes.length) {
        tbody.innerHTML = '<tr class="hover:bg-slate-50"><td class="p-4 text-slate-500" colspan="5">Dados insuficientes para análise</td></tr>';
        return;
    }

    correlacoes.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));

    correlacoes.forEach(corr => {
        const absR = Math.abs(corr.r);
        let força = 'Nenhuma';
        let corClass = 'text-slate-500';
        if (absR > 0.7) { força = 'Forte'; corClass = corr.r > 0 ? 'text-green-600' : 'text-red-600'; }
        else if (absR > 0.5) { força = 'Moderada'; corClass = corr.r > 0 ? 'text-green-500' : 'text-red-500'; }
        else if (absR > 0.3) { força = 'Fraca'; corClass = corr.r > 0 ? 'text-blue-500' : 'text-orange-500'; }
        const direcao = corr.r > 0 ? 'Positiva' : corr.r < 0 ? 'Negativa' : 'Neutra';

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition-colors';
        tr.innerHTML = `
            <td class="p-4 font-bold text-slate-700">${corr.nome}</td>
            <td class="p-4 text-right ${corClass}"><strong>${corr.r.toFixed(3)}</strong></td>
            <td class="p-4 text-right">${força}</td>
            <td class="p-4 text-right text-slate-600">${direcao}</td>
            <td class="p-4 text-right text-slate-500">${corr.pontos}</td>
        `;
        tbody.appendChild(tr);
    });
}

function populateHistoryTable() {
    const tbody = document.getElementById('historyTableBody');
    tbody.innerHTML = "";
    let anos = {};

    appState.rawPrecos.forEach(p => {
        let a = new Date(p.data).getFullYear();
        if (!anos[a]) anos[a] = Array(12).fill(0).map(() => []);
        anos[a][new Date(p.data).getUTCMonth()].push(parseFloat(p.comum));
    });

    Object.keys(anos).sort().reverse().forEach(ano => {
        let tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 transition-colors";
        let html = `<td class="p-4 font-bold text-primary">${ano}</td>`;
        anos[ano].forEach(mesArray => {
            let media = mesArray.length ? Utils.formatCurrency(Utils.average(mesArray)) : "-";
            html += `<td class="py-4 text-slate-600">${media}</td>`;
        });
        tr.innerHTML = html;
        tbody.appendChild(tr);
    });
}

function renderExtremeEvents(historicos, mapaClima) {
    if (!historicos.length) return;

    const limites = {
        temperatura: { threshold: 2 }, chuva: { threshold: 1.5 },
        umidade: { threshold: 1.5 }, evapotransp: { threshold: 1.5 },
        vento: { threshold: 2 }, tempSolo: { threshold: 2 }
    };

    const stats = {};
    ['temperatura', 'chuva', 'umidade', 'evapotransp', 'vento', 'tempSolo'].forEach(var_clima => {
        const chaveClima = var_clima === 'temperatura' ? 'temp' : var_clima;
        const valores = historicos.map(p => mapaClima[p.date]?.[chaveClima]).filter(v => v && v > 0);
        if (valores.length > 2) {
            stats[var_clima] = { avg: Utils.average(valores), std: Utils.stdDev(valores) };
        }
    });

    const extremeEvents = [];
    const nomesVariaveis = {
        temperatura: 'Temperatura Extrema', chuva: 'Chuva Intensa',
        umidade: 'Umidade Extrema', evapotransp: 'Evapotranspiração Extrema',
        vento: 'Vento Forte', tempSolo: 'Temp. Solo Extrema'
    };

    historicos.forEach((p, idx) => {
        const clima = mapaClima[p.date];
        if (!clima) return;

        const valores_clima = {
            temperatura: clima.temp, chuva: clima.chuva, umidade: clima.umidade,
            evapotransp: clima.evapotransp, vento: clima.vento, tempSolo: clima.tempSolo
        };

        Object.entries(valores_clima).forEach(([var_nome, valor]) => {
            if (!valor || valor === 0 || !stats[var_nome]) return;
            const s = stats[var_nome];
            const threshold = limites[var_nome]?.threshold || 1.5;
            let isExtremo = valor > s.avg + threshold * s.std || (valor < s.avg - threshold * s.std && valor > 0);
            if (isExtremo) {
                
                const preStart = Math.max(0, idx - 14);
                const preSlice = historicos.slice(preStart, idx).map(item => item.val);
                const precoBase = preSlice.length ? Utils.average(preSlice) : p.val;

                
                const post7Slice = historicos.slice(idx + 1, Math.min(historicos.length, idx + 8)).map(item => item.val);
                const var7d = post7Slice.length ? Utils.percentualMudanca(precoBase, Utils.average(post7Slice)) : null;

                const post14Slice = historicos.slice(idx + 8, Math.min(historicos.length, idx + 15)).map(item => item.val);
                const var14d = post14Slice.length ? Utils.percentualMudanca(precoBase, Utils.average(post14Slice)) : null;

                const post30Slice = historicos.slice(idx + 15, Math.min(historicos.length, idx + 31)).map(item => item.val);
                const var30d = post30Slice.length ? Utils.percentualMudanca(precoBase, Utils.average(post30Slice)) : null;

                extremeEvents.push({
                    data: Utils.formatDate(p.date),
                    tipo: nomesVariaveis[var_nome],
                    valor: valor.toFixed(2),
                    precoBase: Utils.formatCurrency(precoBase),
                    var7d, var14d, var30d,
                    unidade: var_nome === 'temperatura' || var_nome === 'tempSolo' ? '°C' :
                             var_nome === 'chuva' ? 'mm' : var_nome === 'vento' ? 'km/h' : '%'
                });
            }
        });
    });

    extremeEvents.sort((a, b) => Math.abs(b.var14d ?? b.var7d ?? 0) - Math.abs(a.var14d ?? a.var7d ?? 0));

    const tbody = document.getElementById('extremeEventsTable');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (extremeEvents.length === 0) {
        tbody.innerHTML = '<tr><td class="p-4 text-slate-500 text-center" colspan="7">Nenhuma condição extrema detectada neste período</td></tr>';
        return;
    }

    const formatVar = (val) => {
        if (val === null || val === undefined) return '<span class="text-slate-400">-</span>';
        const color = val > 0 ? 'text-red-600' : val < 0 ? 'text-green-600' : 'text-slate-600';
        const sign = val > 0 ? '+' : '';
        return `<span class="font-mono font-semibold ${color}">${sign}${val.toFixed(1)}%</span>`;
    };

    extremeEvents.slice(0, 15).forEach(evt => {
        let tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition-colors border-b border-slate-100';
        tr.innerHTML = `
            <td class="p-4 font-semibold text-slate-800">${evt.data}</td>
            <td class="p-4 text-slate-700 font-medium">${evt.tipo}</td>
            <td class="p-4 text-right text-slate-600 font-mono">${evt.valor} ${evt.unidade}</td>
            <td class="p-4 text-right font-mono text-slate-500">${evt.precoBase}</td>
            <td class="p-4 text-right">${formatVar(evt.var7d)}</td>
            <td class="p-4 text-right">${formatVar(evt.var14d)}</td>
            <td class="p-4 text-right">${formatVar(evt.var30d)}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderForecastChart(historicos, previsoes, reaisPosteriores) {
    if (!document.getElementById('chForecast')) return;
    
    const labels = [];
    const historicosData = [];
    const previscoesData = [];
    const reaisData = [];
    
    historicos.forEach(h => {
        labels.push(h.date);
        historicosData.push(h.val);
        previscoesData.push(null);
        reaisData.push(null);
    });
    
    previsoes.forEach((p, i) => {
        if (i % 5 === 0) {
            labels.push(p.date);
            historicosData.push(null);
            previscoesData.push(p.valor);
            reaisData.push(null);
        }
    });
    
    reaisPosteriores.forEach(r => {
        if (!labels.includes(r.date)) {
            labels.push(r.date);
            historicosData.push(null);
            previscoesData.push(null);
            reaisData.push(r.val);
        } else {
            reaisData[labels.indexOf(r.date)] = r.val;
        }
    });
    
    if (appState.charts['chForecast']) appState.charts['chForecast'].destroy();
    
    const ctx = document.getElementById('chForecast').getContext('2d');
    appState.charts['chForecast'] = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Histórico',
                    data: historicosData,
                    borderColor: '#8B0000',
                    backgroundColor: 'rgba(139, 0, 0, 0.05)',
                    fill: true, tension: 0.3, pointRadius: 2
                },
                {
                    label: 'Previsão',
                    data: previscoesData,
                    borderColor: '#3B82F6',
                    borderDash: [5, 5],
                    backgroundColor: 'rgba(59, 130, 246, 0.05)',
                    fill: false, tension: 0.3, pointRadius: 3
                },
                {
                    label: 'Real Futuro',
                    data: reaisData,
                    borderColor: '#10B981',
                    backgroundColor: 'rgba(16, 185, 129, 0.05)',
                    fill: false, tension: 0.3, pointRadius: 3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true, position: 'top' },
                tooltip: { enabled: true, intersect: false, mode: 'index' }
            },
            scales: {
                x: { grid: { display: false } },
                y: { grid: { color: '#e2e8f0' } }
            }
        }
    });
    
    document.getElementById('forecastInfo').innerText = `Previsão até ${addDays(appState.dateRef, 60)} baseada em ${historicos.length} dias de histórico`;
}

function renderForecastAccuracy(previsoes, reaisPosteriores) {
    const tbody = document.getElementById('forecastAccuracyTable');
    tbody.innerHTML = '';
    
    if (reaisPosteriores.length === 0) {
        tbody.innerHTML = '<tr><td class="p-4 text-slate-500 text-center" colspan="5">Nenhum dado real posterior para comparação</td></tr>';
        return;
    }
    
    const comparacoes = [];
    reaisPosteriores.forEach(real => {
        const previsao = previsoes.find(p => p.date === real.date);
        if (previsao) {
            const erroAbs = Math.abs(previsao.valor - real.val);
            const erroPerc = (erroAbs / real.val) * 100;
            comparacoes.push({
                data: Utils.formatDate(real.date),
                previsto: previsao.valor,
                real: real.val,
                erroAbs, erroPerc
            });
        }
    });
    
    if (!comparacoes.length) {
        tbody.innerHTML = '<tr><td class="p-4 text-slate-500 text-center" colspan="5">Sem dados para comparação</td></tr>';
        return;
    }
    
    comparacoes.slice(0, 20).forEach(comp => {
        let tr = document.createElement('tr');
        let erroColor = comp.erroPerc < 3 ? 'text-green-600' : comp.erroPerc < 8 ? 'text-yellow-600' : 'text-red-600';
        tr.className = 'hover:bg-slate-50 transition-colors';
        tr.innerHTML = `
            <td class="p-4 font-semibold text-slate-800">${comp.data}</td>
            <td class="p-4 text-right font-mono text-slate-700">${Utils.formatCurrency(comp.previsto)}</td>
            <td class="p-4 text-right font-mono text-slate-700">${Utils.formatCurrency(comp.real)}</td>
            <td class="p-4 text-right font-mono text-slate-700">${Utils.formatCurrency(comp.erroAbs)}</td>
            <td class="p-4 text-right font-mono font-bold ${erroColor}">${comp.erroPerc.toFixed(2)}%</td>
        `;
        tbody.appendChild(tr);
    });
}

function calculateForecastError(previsoes, reaisPosteriores) {
    if (!reaisPosteriores.length) return 0;
    let totalErro = 0, count = 0;
    reaisPosteriores.forEach(real => {
        const previsao = previsoes.find(p => p.date === real.date);
        if (previsao) {
            totalErro += (Math.abs(previsao.valor - real.val) / real.val) * 100;
            count++;
        }
    });
    return count > 0 ? totalErro / count : 0;
}
