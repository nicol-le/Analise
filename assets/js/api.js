
const Api = {

    cityCache: new Map(),
    /** Cache em memória para acelerar reanálises */
    _climaCache: null,
    _climaCacheAt: 0,
    _precosCache: new Map(),
    _produtosCache: null,
    _toneladasCache: null,
    /** Limite de meses de clima Open-Meteo (acelera muito a análise) */
    WEATHER_MAX_MONTHS: 18,
    /** Quantidade de cidades usadas no clima ponderado */
    WEATHER_TOP_CITIES: 5,
    /** Máximo de cidades geocodificadas no mapa por análise */
    MAP_GEOCODE_LIMIT: 35,

    stateNames: { AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins' },

    stateCapitals: {
        SP: { latitude: -23.5505, longitude: -46.6333 }, MG: { latitude: -19.9208, longitude: -43.9378 },
        PR: { latitude: -25.4284, longitude: -49.2733 }, RS: { latitude: -30.0346, longitude: -51.2177 },
        SC: { latitude: -27.5954, longitude: -48.5480 }, BA: { latitude: -12.9777, longitude: -38.5016 },
        GO: { latitude: -16.6869, longitude: -49.2648 }, PE: { latitude: -8.0476, longitude: -34.8770 },
        CE: { latitude: -3.7319, longitude: -38.5267 }, RJ: { latitude: -22.9068, longitude: -43.1729 },
        ES: { latitude: -20.3155, longitude: -40.3128 }, MT: { latitude: -15.6010, longitude: -56.0979 },
        MS: { latitude: -20.4486, longitude: -54.6295 }, PA: { latitude: -1.4558, longitude: -48.4902 },
        MA: { latitude: -2.5307, longitude: -44.3068 }, PB: { latitude: -7.1195, longitude: -34.8450 },
        RN: { latitude: -5.7945, longitude: -35.2110 }, AL: { latitude: -9.6658, longitude: -35.7353 },
        SE: { latitude: -10.9472, longitude: -37.0731 }, PI: { latitude: -5.0920, longitude: -42.8038 },
        TO: { latitude: -10.2491, longitude: -48.3243 }, AM: { latitude: -3.1190, longitude: -60.0217 },
        RO: { latitude: -8.7619, longitude: -63.9039 }, AC: { latitude: -9.9754, longitude: -67.8249 },
        AP: { latitude: 0.0355, longitude: -51.0705 }, RR: { latitude: 2.8235, longitude: -60.6758 },
        DF: { latitude: -15.7942, longitude: -47.8822 }
    },

    municipiosCache: null,

    async loadMunicipios() {
        if (this.municipiosCache) return this.municipiosCache;
        try {
            const response = await fetch('https://raw.githubusercontent.com/kelvins/municipios-brasileiros/main/json/municipios.json');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            const cache = new Map();
            const normalize = s => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
            
            data.forEach(m => {
                if (m && m.nome) {
                    const normName = normalize(m.nome);
                    const key = `${normName}|${m.uf}`;
                    cache.set(key, { latitude: m.latitude, longitude: m.longitude });
                }
            });
            this.municipiosCache = cache;
            console.log(`[Api] Loaded ${cache.size} Brazilian municipalities for local geocoding.`);
            return cache;
        } catch (err) {
            console.warn("Could not load kelvins municipios.json, falling back to online search:", err);
            this.municipiosCache = new Map();
            return this.municipiosCache;
        }
    },

    async geocodeCity(city, uf) {
        const normalize = s => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
        const key = `${normalize(city)}|${uf}`;
        
        // 1. Check in memory cityCache first
        if (this.cityCache.has(key)) return this.cityCache.get(key);
        
        // 2. Check in localStorage
        try {
            const saved = localStorage.getItem(`ceagesp:city:${key}`);
            if (saved) {
                const location = JSON.parse(saved);
                if (location && location.latitude) {
                    this.cityCache.set(key, location);
                    return location;
                }
            }
        } catch (_) {}

        // 3. Check in local Kelvins index
        const kCache = await this.loadMunicipios();
        if (kCache && kCache.has(key)) {
            const location = kCache.get(key);
            this.cityCache.set(key, location);
            try { localStorage.setItem(`ceagesp:city:${key}`, JSON.stringify(location)); } catch (_) {}
            return location;
        }

        // 4. Fallback to Open-Meteo online search
        try {
            const query = encodeURIComponent(city);
            const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${query}&count=10&countryCode=BR&language=pt&format=json`);
            if (!response.ok) throw new Error(`Geocoding HTTP ${response.status}`);
            const results = (await response.json()).results || [];
            const stateName = this.stateNames[uf];
            const result = results.find(item => item.country_code === 'BR' && item.admin1 === stateName) || results.find(item => item.country_code === 'BR');
            let location = result ? { latitude: result.latitude, longitude: result.longitude } : null;

            if (!location && this.stateCapitals[uf]) {
                console.warn(`Geocoding indisponível para ${city}/${uf}, usando fallback por estado.`);
                location = { ...this.stateCapitals[uf], isFallback: true };
            }

            if (location) {
                this.cityCache.set(key, location);
                try { localStorage.setItem(`ceagesp:city:${key}`, JSON.stringify(location)); } catch (_) {}
            }
            return location;
        } catch (err) {
            console.warn(`Erro no geocoding de ${city}/${uf}, usando coordenadas estaduais de reserva:`, err);
            const fallbackLoc = this.stateCapitals[uf] ? { ...this.stateCapitals[uf], isFallback: true } : null;
            if (fallbackLoc) {
                this.cityCache.set(key, fallbackLoc);
                try { localStorage.setItem(`ceagesp:city:${key}`, JSON.stringify(fallbackLoc)); } catch (_) {}
            }
            return fallbackLoc;
        }
    },

    async resolveCityCoordinates(cities, onProgress) {
        const resolved = [];
        let next = 0;
        const worker = async () => {
            while (next < cities.length) {
                const index = next++;
                const city = cities[index];
                const coords = await this.geocodeCity(city.municipio, city.uf);
                if (coords) resolved.push({ ...city, ...coords });
                onProgress?.(index + 1, cities.length);
            }
        };
        await Promise.all(Array.from({ length: Math.min(4, cities.length) }, worker));
        return resolved;
    },

    /**
     * Recorta o intervalo de clima para no máximo WEATHER_MAX_MONTHS
     * a partir da data final (acelera Open-Meteo drasticamente).
     */
    clampWeatherRange(startDate, endDate) {
        if (!startDate || !endDate) return { startDate, endDate };
        const end = new Date(endDate + 'T00:00:00');
        const minStart = new Date(end);
        minStart.setMonth(minStart.getMonth() - this.WEATHER_MAX_MONTHS);
        const minStr = minStart.toISOString().slice(0, 10);
        return { startDate: startDate > minStr ? startDate : minStr, endDate };
    },

    async fetchProductionWeather(cities, startDate, endDate) {
        const range = this.clampWeatherRange(startDate, endDate);
        startDate = range.startDate;
        endDate = range.endDate;

        const limited = (cities || []).slice(0, this.WEATHER_TOP_CITIES);
        const located = (await Promise.all(limited.map(async city => {
            const coords = await this.geocodeCity(city.municipio, city.uf);
            return coords ? { ...city, ...coords } : null;
        }))).filter(Boolean);
        if (!located.length || startDate > endDate) return [];

        const cacheKey = `wx:${located.map(c => c.municipio + c.uf).join(',')}:${startDate}:${endDate}`;
        try {
            const hit = sessionStorage.getItem(cacheKey);
            if (hit) return JSON.parse(hit);
        } catch (_) {}

        const params = new URLSearchParams({
            latitude: located.map(c => c.latitude).join(','), longitude: located.map(c => c.longitude).join(','),
            start_date: startDate, end_date: endDate,
            daily: 'weather_code,temperature_2m_mean,precipitation_sum,relative_humidity_2m_mean,wind_speed_10m_max,et0_fao_evapotranspiration,soil_temperature_0_to_7cm_mean',
            timezone: 'America/Sao_Paulo', wind_speed_unit: 'kmh'
        });
        try {
            const response = await fetch(`https://archive-api.open-meteo.com/v1/archive?${params}`);
            if (!response.ok) throw new Error(`Histórico climático HTTP ${response.status}`);
            const payload = await response.json();
            const locations = Array.isArray(payload) ? payload : [payload];
            const result = locations.map((weather, index) => ({ ...located[index], weather }));
            try { sessionStorage.setItem(cacheKey, JSON.stringify(result)); } catch (_) {}
            return result;
        } catch (err) {
            console.error('Erro ao buscar histórico climático por cidade:', err);
            return [];
        }
    },

    async fetchProdutos() {
        if (this._produtosCache) return this._produtosCache;
        try {
            const cached = localStorage.getItem('ceagesp:produtos');
            if (cached) {
                const parsed = JSON.parse(cached);
                if (Array.isArray(parsed) && parsed.length > 20) {
                    this._produtosCache = parsed;
                    console.log(`📦 ${parsed.length} produtos carregados do cache`);
                    // Atualiza em background
                    this._refreshProdutosBackground();
                    return parsed;
                }
            }
        } catch (_) {}

        try {
            console.log('🔍 Buscando produtos do Supabase...');
            // 4 páginas em paralelo cobrem bem a variedade de produtos (amostra ampla)
            const ranges = await Promise.all([
                _sb.from('ceagesp').select('produto').range(0, 999),
                _sb.from('ceagesp').select('produto').range(5000, 5999),
                _sb.from('ceagesp').select('produto').range(15000, 15999),
                _sb.from('ceagesp').select('produto').range(30000, 30999)
            ]);
            const set = new Set();
            for (const r of ranges) {
                if (r.error) throw r.error;
                (r.data || []).forEach(i => { if (i.produto) set.add(i.produto); });
            }
            this._produtosCache = [...set].sort();
            console.log(`✅ ${this._produtosCache.length} produtos carregados do Supabase`);
            try { localStorage.setItem('ceagesp:produtos', JSON.stringify(this._produtosCache)); } catch (_) {}
            this._refreshProdutosBackground();
            return this._produtosCache;
        } catch (err) {
            console.error("Erro ao buscar produtos:", err);
            return [];
        }
    },

    /** Expande a lista de produtos em segundo plano sem travar a UI. */
    async _refreshProdutosBackground() {
        if (this._produtosRefreshing) return;
        this._produtosRefreshing = true;
        try {
            const set = new Set(this._produtosCache || []);
            let from = 0;
            for (let batch = 0; batch < 8; batch++) {
                const { data, error } = await _sb.from('ceagesp').select('produto').range(from, from + 1999);
                if (error || !data?.length) break;
                data.forEach(i => { if (i.produto) set.add(i.produto); });
                from += 2000;
                if (data.length < 2000) break;
            }
            this._produtosCache = [...set].sort();
            try { localStorage.setItem('ceagesp:produtos', JSON.stringify(this._produtosCache)); } catch (_) {}
            const list = document.getElementById('listProd');
            if (list && this._produtosCache.length > list.children.length) {
                list.innerHTML = '';
                this._produtosCache.forEach(p => {
                    const o = document.createElement('option');
                    o.value = p;
                    list.appendChild(o);
                });
            }
        } catch (_) {}
        this._produtosRefreshing = false;
    },

    async fetchVariedades(produto) {
        try {
            const { data, error } = await _sb.from('ceagesp')
                .select('variedade')
                .eq('produto', produto)
                .limit(500);
            if (error) throw error;
            return [...new Set(data.map(i => i.variedade))].sort();
        } catch (err) {
            console.error("Erro ao buscar variedades:", err);
            return [];
        }
    },

    async fetchPrecos(produto, variedade = "", onProgress) {
        const cacheKey = `${produto}||${variedade || ''}`;
        if (this._precosCache.has(cacheKey)) {
            const cached = this._precosCache.get(cacheKey);
            if (onProgress) onProgress(cached.length, cached.length);
            return cached;
        }

        const cols = 'produto,variedade,data,comum,unidade';
        const pageSize = 1000;
        const maxParallel = 8; // Aumentado de 5 para 8
        let pAll = [];
        let from = 0;
        let done = false;
        let estimatedTotal = 0;

        while (!done) {
            const reqs = [];
            for (let i = 0; i < maxParallel; i++) {
                const start = from + i * pageSize;
                let query = _sb.from('ceagesp').select(cols).eq('produto', produto);
                if (variedade) query = query.eq('variedade', variedade);
                reqs.push(query.range(start, start + pageSize - 1));
            }
            const results = await Promise.all(reqs);
            let gotFull = false;
            let batchCount = 0;
            for (const r of results) {
                if (r.error) {
                    console.error("Erro na busca de preços:", r.error);
                    done = true;
                    break;
                }
                const data = r.data || [];
                if (data.length) {
                    pAll = pAll.concat(data);
                    batchCount += data.length;
                }
                if (data.length === pageSize) gotFull = true;
                if (data.length < pageSize) done = true;
            }
            if (!gotFull) done = true;
            from += maxParallel * pageSize;
            if (pAll.length > 25000) done = true;
            
            // Estimativa de progresso
            if (onProgress) {
                estimatedTotal = gotFull ? from + maxParallel * pageSize : pAll.length;
                onProgress(pAll.length, estimatedTotal);
            }
        }

        if (onProgress) onProgress(pAll.length, pAll.length);
        this._precosCache.set(cacheKey, pAll);
        return pAll;
    },

    async fetchClima() {
        if (this._climaCache && (Date.now() - this._climaCacheAt) < 30 * 60 * 1000) {
            return this._climaCache;
        }
        try {
            const ranges = [
                _sb.from('clima_diario').select('*').range(0, 999),
                _sb.from('clima_diario').select('*').range(1000, 1999),
                _sb.from('clima_diario').select('*').range(2000, 2999)
            ];
            const results = await Promise.all(ranges);
            let cAll = [];
            for (const r of results) {
                if (r.error) throw r.error;
                if (r.data) cAll = [...cAll, ...r.data];
            }
            this._climaCache = cAll;
            this._climaCacheAt = Date.now();
            return cAll;
        } catch (err) {
            console.error("Erro ao buscar clima:", err);
            return this._climaCache || [];
        }
    },

    async fetchToneladas() {
        if (this._toneladasCache) return this._toneladasCache;
        try {
            const response = await fetch('assets/data/dadostoneladaano.csv');
            const text = await response.text();
            const lines = text.split('\n');
            if (lines.length === 0) return [];
            const headers = lines[0].split(',').map(h => h.trim().toUpperCase());
            const result = [];
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i];
                if (!line.trim()) continue;
                const row = [];
                let inQuotes = false;
                let current = "";
                for (let j = 0; j < line.length; j++) {
                    const char = line[j];
                    if (char === '"') inQuotes = !inQuotes;
                    else if (char === ',' && !inQuotes) { row.push(current.trim()); current = ""; }
                    else current += char;
                }
                row.push(current.trim());
                if (row.length >= headers.length) {
                    const obj = {};
                    headers.forEach((header, index) => { obj[header] = row[index]; });
                    result.push(obj);
                }
            }
            this._toneladasCache = result;
            return result;
        } catch (err) {
            console.error("Erro ao buscar dados de toneladas:", err);
            return [];
        }
    },

    _movimentacoesCache: new Map(),
    _ceagespMunicipiosCache: null,

    /**
     * Busca dados enriquecidos da tabela ceagesp_movimentacoes no Supabase.
     * Retorna array de { dt_movmto, vl_tonelada, ds_municipio, nm_permis, ds_variedade, descricao_estado }
     */
    async fetchMovimentacoes(produto, variedade = "", dateStart = "", dateEnd = "", onProgress) {
        if (!produto) return [];
        const prodUpper = (produto || '').trim().toUpperCase();
        const cacheKey = `${prodUpper}||${variedade || ''}||${dateStart || ''}||${dateEnd || ''}`;
        if (this._movimentacoesCache.has(cacheKey)) {
            return this._movimentacoesCache.get(cacheKey);
        }

        const cols = 'dt_movmto,vl_tonelada,ds_municipio,nm_permis,ds_variedade,descricao_estado';
        const pageSize = 1000;
        const maxRecords = 15000; // Amostra de alta representatividade para velocidade
        let results = [];
        let from = 0;
        let done = false;

        try {
            while (!done && results.length < maxRecords) {
                let query = _sb.from('ceagesp_movimentacoes')
                    .select(cols)
                    .ilike('ds_produto', prodUpper);

                if (variedade) {
                    query = query.ilike('ds_variedade', `%${variedade}%`);
                }
                if (dateStart) {
                    query = query.gte('dt_movmto', dateStart);
                }
                if (dateEnd) {
                    query = query.lte('dt_movmto', dateEnd);
                }

                query = query.order('dt_movmto', { ascending: true })
                    .range(from, from + pageSize - 1);

                const { data, error } = await query;
                if (error) {
                    console.warn('[Api] Aviso ao buscar movimentacoes:', error.message);
                    break;
                }

                if (data && data.length > 0) {
                    results = results.concat(data);
                    from += pageSize;
                    onProgress?.(results.length, maxRecords);
                    if (data.length < pageSize) done = true;
                } else {
                    done = true;
                }
            }

            console.log(`📦 [Api] ${results.length} movimentações carregadas para ${prodUpper}`);
            this._movimentacoesCache.set(cacheKey, results);
            return results;
        } catch (err) {
            console.error('[Api] Erro ao carregar movimentacoes:', err);
            return [];
        }
    },

    /**
     * Carrega metadados de municípios da tabela ceagesp_municipios
     * Retorna Map chaveado por 'MUNICIPIO' normalizado -> { uf, mesorregiao, microrregiao, ibge }
     */
    async fetchCeagespMunicipios() {
        if (this._ceagespMunicipiosCache) return this._ceagespMunicipiosCache;

        try {
            // Busca os primeiros 5000 registros mais relevantes
            const { data, error } = await _sb.from('ceagesp_municipios')
                .select('municipio,uf,mesorregiao,microrregiao,ibge')
                .limit(5000);

            if (error) throw error;

            const map = new Map();
            (data || []).forEach(row => {
                if (row.municipio) {
                    const norm = (row.municipio || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
                    map.set(norm, row);
                }
            });

            this._ceagespMunicipiosCache = map;
            console.log(`🗺️ [Api] ${map.size} municípios mapeados de ceagesp_municipios`);
            return map;
        } catch (err) {
            console.warn('[Api] Não foi possível carregar ceagesp_municipios:', err);
            return new Map();
        }
    }
};

