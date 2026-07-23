
const Api = {

    cityCache: new Map(),
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

    async geocodeCity(city, uf) {
        const key = `${city}|${uf}`;
        if (this.cityCache.has(key)) return this.cityCache.get(key);
        try {
            const saved = localStorage.getItem(`ceagesp:city:${key}`);
            if (saved) {
                const location = JSON.parse(saved);
                if (location && location.latitude) {
                    this.cityCache.set(key, location);
                    return location;
                }
            }
        } catch (_) { /* cache persistente é opcional */ }

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
            if (fallbackLoc) this.cityCache.set(key, fallbackLoc);
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

    async fetchProductionWeather(cities, startDate, endDate) {
        const located = (await Promise.all(cities.map(async city => {
            const coords = await this.geocodeCity(city.municipio, city.uf);
            return coords ? { ...city, ...coords } : null;
        }))).filter(Boolean);
        if (!located.length || startDate > endDate) return [];
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
            return locations.map((weather, index) => ({ ...located[index], weather }));
        } catch (err) {
            console.error('Erro ao buscar histórico climático por cidade:', err);
            return [];
        }
    },

    async fetchProdutos() {
        try {
            const { data, error } = await _sb.from('ceagesp').select('produto');
            if (error) throw error;
            return [...new Set(data.map(i => i.produto))].sort();
        } catch (err) {
            console.error("Erro ao buscar produtos:", err);
            return [];
        }
    },

   
    async fetchVariedades(produto) {
        try {
            const { data, error } = await _sb.from('ceagesp')
                .select('variedade')
                .eq('produto', produto);
            if (error) throw error;
            return [...new Set(data.map(i => i.variedade))].sort();
        } catch (err) {
            console.error("Erro ao buscar variedades:", err);
            return [];
        }
    },


    async fetchPrecos(produto, variedade = "") {
        let pAll = [];
        let complete = false;
        let from = 0;
        const step = 1000;

        while (!complete) {
            let query = _sb.from('ceagesp').select('*').eq('produto', produto);
            if (variedade) query = query.eq('variedade', variedade);
            
            const { data, error } = await query.range(from, from + step - 1);
            
            if (error) {
                console.error("Erro na busca de preços:", error);
                break;
            }

            if (data && data.length > 0) {
                pAll = [...pAll, ...data];
                from += step;
                if (data.length < step) complete = true;
            } else {
                complete = true;
            }
        }
        return pAll;
    },

    async fetchClima() {
        let cAll = [];
        try {
            for (let i = 0; i < 6; i++) {
                const { data, error } = await _sb.from('clima_diario')
                    .select('*')
                    .range(i * 1000, (i + 1) * 1000 - 1);
                
                if (error) throw error;
                if (data) cAll = [...cAll, ...data];
                if (data.length < 1000) break;
            }
            return cAll;
        } catch (err) {
            console.error("Erro ao buscar clima:", err);
            return [];
        }
    },

    async fetchToneladas() {
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
                    if (char === '"') {
                        inQuotes = !inQuotes;
                    } else if (char === ',' && !inQuotes) {
                        row.push(current.trim());
                        current = "";
                    } else {
                        current += char;
                    }
                }
                row.push(current.trim());
                
                if (row.length >= headers.length) {
                    const obj = {};
                    headers.forEach((header, index) => {
                        obj[header] = row[index];
                    });
                    result.push(obj);
                }
            }
            return result;
        } catch (err) {
            console.error("Erro ao buscar dados de toneladas:", err);
            return [];
        }
    }
};
