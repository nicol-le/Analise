/**
 * Inflacao — Módulo para carregar e processar dados de inflação do IBGE (Tabela 8190)
 * PMC - Variação acumulada no ano (em relação ao mesmo período do ano anterior) (%)
 * Fonte: https://raw.githubusercontent.com/nicol-le/Ceagesp/refs/heads/main/tabela8190.csv
 */

const Inflacao = (() => {
    const CSV_URL = 'https://raw.githubusercontent.com/nicol-le/Ceagesp/refs/heads/main/tabela8190.csv';

    const MONTH_MAP = {
        'janeiro': 0, 'fevereiro': 1, 'março': 2, 'marco': 2,
        'abril': 3, 'maio': 4, 'junho': 5, 'julho': 6,
        'agosto': 7, 'setembro': 8, 'outubro': 9,
        'novembro': 10, 'dezembro': 11
    };

    let _cachedData = null;

    /** Normaliza texto removendo acentos e caixa */
    function normalize(str) {
        return (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    }

    /** Converte valor brasileiro (vírgula) para float */
    function parseBR(str) {
        if (!str || str.trim() === '...' || str.trim() === '') return null;
        return parseFloat(str.replace(/\./g, '').replace(',', '.'));
    }

    /**
     * Parseia o CSV do IBGE (Tabela 8190) e extrai a série temporal de São Paulo.
     * O CSV contém múltiplas tabelas (Número-índice, Variação mensal, Variação acumulada).
     * Queremos especificamente a "Variação acumulada no ano (%)".
     * Retorna um array de objetos: { date: 'YYYY-MM', label: 'Jan 2022', value: 14.5 }
     */
    function parseCSV(rawText) {
        // Normalizar quebras de linha
        const lines = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

        // Estratégia: encontrar TODAS as linhas de cabeçalho de meses (uma por seção de tabela)
        // e para cada uma, tentar achar a linha "São Paulo" logo abaixo.
        // Preferir a seção que corresponde à "Variação acumulada no ano".
        const headerLineIdxs = [];
        for (let i = 0; i < lines.length; i++) {
            const lower = lines[i].toLowerCase();
            if (lower.includes('janeiro') && lower.includes('2022') && lower.includes('dezembro')) {
                headerLineIdxs.push(i);
            }
        }

        if (headerLineIdxs.length === 0) {
            console.error('[Inflacao] Cabeçalho de meses não encontrado no CSV.');
            return [];
        }

        // Preferir a seção de "variação acumulada" — procurar linhas acima de cada header
        // que contenham "acumulada" ou "variacao"
        let chosenHeaderIdx = headerLineIdxs[headerLineIdxs.length - 1]; // default: última
        for (const idx of headerLineIdxs) {
            // Procura nas 5 linhas anteriores
            for (let k = Math.max(0, idx - 5); k < idx; k++) {
                const l = normalize(lines[k]);
                if (l.includes('acumulada') || l.includes('acumulado')) {
                    chosenHeaderIdx = idx;
                    break;
                }
            }
        }

        // Parsear colunas de meses do header escolhido
        const headerCols = parseCSVLine(lines[chosenHeaderIdx]);
        const months = headerCols.slice(1).map(col => {
            const cleaned = col.replace(/"/g, '').trim();
            const parts = normalize(cleaned).split(/\s+/);
            if (parts.length < 2) return null;
            const monthName = parts[0];
            const year = parseInt(parts[1]);
            const monthIdx = MONTH_MAP[monthName];
            if (monthIdx === undefined || isNaN(year)) return null;
            const mm = String(monthIdx + 1).padStart(2, '0');
            // Label amigável: "Jan 2022"
            const shortName = monthName.charAt(0).toUpperCase() + monthName.slice(1, 3);
            return { date: `${year}-${mm}`, label: `${shortName} ${year}` };
        });

        // Encontrar linha de São Paulo após o header escolhido
        // SP é detectada por qualquer variação de "são paulo" ou "sao paulo"
        const SP_PATTERN = /s[aã]o\s*paulo/i;
        const saoPauloData = [];

        for (let i = chosenHeaderIdx + 1; i < Math.min(chosenHeaderIdx + 30, lines.length); i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const cols = parseCSVLine(line);
            if (!cols.length) continue;

            const rowName = normalize(cols[0]);
            // Testa "são paulo" com e sem acento
            if (SP_PATTERN.test(cols[0]) || rowName.includes('paulo')) {
                const values = cols.slice(1);
                months.forEach((m, idx) => {
                    if (!m) return;
                    const val = parseBR(values[idx]);
                    if (val !== null) {
                        saoPauloData.push({ date: m.date, label: m.label, value: val });
                    }
                });
                console.log(`[Inflacao] Encontrou SP na linha ${i}: ${saoPauloData.length} pontos válidos.`);
                break;
            }
        }

        return saoPauloData;
    }

    /** Parseia uma linha CSV com campos entre aspas separados por ; */
    function parseCSVLine(line) {
        const result = [];
        let inQuote = false;
        let current = '';
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                inQuote = !inQuote;
            } else if (ch === ';' && !inQuote) {
                result.push(current.trim());
                current = '';
            } else {
                current += ch;
            }
        }
        result.push(current.trim());
        return result;
    }

    /**
     * Carrega e parseia os dados de inflação.
     * Usa cache para evitar múltiplas requisições.
     * O CSV do IBGE é codificado em Windows-1252 (ISO-8859-1).
     * @returns {Promise<Array>} Array de { date, label, value }
     */
    async function load() {
        if (_cachedData) return _cachedData;

        try {
            const resp = await fetch(CSV_URL);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

            // Lê como ArrayBuffer para decodificar manualmente como Windows-1252/ISO-8859-1
            const buffer = await resp.arrayBuffer();
            const text = new TextDecoder('iso-8859-1').decode(buffer);

            _cachedData = parseCSV(text);
            console.log(`✅ [Inflacao] ${_cachedData.length} meses carregados para São Paulo.`);
            return _cachedData;
        } catch (err) {
            console.error('[Inflacao] Erro ao carregar CSV:', err);
            return [];
        }
    }

    /**
     * Filtra os dados de inflação para o período correspondente aos preços do produto.
     * @param {Array} inflacaoData - Array completo de inflação
     * @param {string} dateStart - 'YYYY-MM-DD'
     * @param {string} dateEnd - 'YYYY-MM-DD'
     * @returns {Array} Dados filtrados
     */
    function filterByPeriod(inflacaoData, dateStart, dateEnd) {
        if (!inflacaoData || !inflacaoData.length) return [];
        const startYM = dateStart ? dateStart.substring(0, 7) : null;
        const endYM = dateEnd ? dateEnd.substring(0, 7) : null;
        return inflacaoData.filter(d => {
            if (startYM && d.date < startYM) return false;
            if (endYM && d.date > endYM) return false;
            return true;
        });
    }

    /**
     * Renderiza o painel de inflação no dashboard.
     * Cria/atualiza o gráfico e os cards de estatísticas.
     * @param {Array} inflacaoData - Dados já filtrados por período
     */
    function renderPanel(inflacaoData) {
        const panel = document.getElementById('inflacaoPanel');
        if (!panel) return;

        if (!inflacaoData || inflacaoData.length === 0) {
            panel.innerHTML = `<p class="text-slate-400 text-sm text-center py-4">Sem dados de inflação disponíveis para o período selecionado.</p>`;
            return;
        }

        const labels = inflacaoData.map(d => d.label);
        const values = inflacaoData.map(d => d.value);

        // Estatísticas
        const latest = inflacaoData[inflacaoData.length - 1];
        const prev = inflacaoData.length > 1 ? inflacaoData[inflacaoData.length - 2] : null;
        const max = Math.max(...values);
        const min = Math.min(...values);
        const avg = values.reduce((a, b) => a + b, 0) / values.length;

        // Atualizar cards de estatísticas
        _updateCard('inflacao-latest-val', latest ? `${latest.value.toFixed(1)}%` : '—');
        _updateCard('inflacao-latest-label', latest ? latest.label : '—');
        _updateCard('inflacao-avg-val', `${avg.toFixed(1)}%`);
        _updateCard('inflacao-max-val', `${max.toFixed(1)}%`);
        _updateCard('inflacao-min-val', `${min.toFixed(1)}%`);

        // Indicador de tendência
        const trendEl = document.getElementById('inflacao-trend');
        if (trendEl && prev) {
            const diff = latest.value - prev.value;
            const arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '▶';
            const color = diff > 0 ? 'text-red-600' : diff < 0 ? 'text-green-600' : 'text-slate-500';
            trendEl.className = `text-sm font-bold ${color}`;
            trendEl.textContent = `${arrow} ${Math.abs(diff).toFixed(1)} p.p. vs mês anterior`;
        } else if (trendEl) {
            trendEl.textContent = '';
        }

        // Renderizar gráfico
        _renderChart(labels, values);

        // Insight textual
        _renderInsight(inflacaoData, avg);
    }

    function _updateCard(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    function _renderChart(labels, values) {
        if (appState.charts['chInflacao']) {
            appState.charts['chInflacao'].destroy();
        }
        const el = document.getElementById('chInflacao');
        if (!el) return;
        const ctx = el.getContext('2d');

        // Cores baseadas no valor (positivo = vermelho/inflação, negativo = verde/deflação)
        const bgColors = values.map(v => v > 0 ? 'rgba(239, 68, 68, 0.6)' : 'rgba(16, 185, 129, 0.6)');
        const borderColors = values.map(v => v > 0 ? '#ef4444' : '#10b981');

        // Linha de zero
        const zeroLine = new Array(labels.length).fill(0);

        appState.charts['chInflacao'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Variação Acumulada no Ano (%)',
                        data: values,
                        backgroundColor: bgColors,
                        borderColor: borderColors,
                        borderWidth: 1,
                        borderRadius: 3,
                        order: 2
                    },
                    {
                        label: 'Linha Zero',
                        data: zeroLine,
                        type: 'line',
                        borderColor: '#94a3b8',
                        borderWidth: 1.5,
                        borderDash: [4, 4],
                        pointRadius: 0,
                        fill: false,
                        order: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: '#64748b',
                            font: { size: 11 },
                            filter: (item) => item.text !== 'Linha Zero'
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                if (ctx.dataset.label === 'Linha Zero') return null;
                                return ` ${ctx.parsed.y.toFixed(2)}% a.a.`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        title: { display: true, text: 'Mês/Ano', color: '#64748b', font: { weight: 'bold' } },
                        ticks: { color: '#64748b', maxRotation: 45, minRotation: 45, font: { size: 10 } },
                        grid: { display: false }
                    },
                    y: {
                        title: { display: true, text: 'Variação Acum. no Ano (%)', color: '#64748b', font: { weight: 'bold' } },
                        ticks: {
                            color: '#64748b',
                            callback: v => v.toFixed(1) + '%'
                        },
                        grid: { color: '#e2e8f0' }
                    }
                }
            }
        });
    }

    function _renderInsight(data, avg) {
        const el = document.getElementById('inflacaoInsight');
        if (!el || !data.length) return;

        const latest = data[data.length - 1];
        const positives = data.filter(d => d.value > 0).length;
        const negatives = data.filter(d => d.value < 0).length;
        const maxPoint = data.reduce((a, b) => b.value > a.value ? b : a, data[0]);
        const minPoint = data.reduce((a, b) => b.value < a.value ? b : a, data[0]);
        const trend = data.length > 1
            ? (latest.value > data[data.length - 2].value ? 'acelerando' : 'desacelerando')
            : 'estável';
        const trendColor = trend === 'acelerando' ? 'text-red-600' : 'text-green-700';
        const context = latest.value > 0
            ? `o setor de atacado de alimentos em SP registra <strong>inflação de ${latest.value.toFixed(1)}%</strong> acumulada no ano`
            : `o setor de atacado de alimentos em SP registra <strong>deflação de ${Math.abs(latest.value).toFixed(1)}%</strong> acumulada no ano`;

        el.innerHTML = `
            <strong>Leitura do painel:</strong> No último dado disponível (${latest.label}), ${context} (em relação ao mesmo período do ano anterior).
            A variação média no período foi de <strong>${avg.toFixed(1)}%</strong>.
            O pico positivo ocorreu em <strong>${maxPoint.label}</strong> (+${maxPoint.value.toFixed(1)}%) e o ponto mais baixo em <strong>${minPoint.label}</strong> (${minPoint.value.toFixed(1)}%).
            <span class="${trendColor} font-semibold">A tendência recente está ${trend}.</span>
            <br><span class="text-[10px] text-slate-400 mt-1 block">Fonte: IBGE – Tabela 8190 (PMC). Base 2022=100. Variável: Variação acumulada no ano vs. mesmo período do ano anterior.</span>
        `;
    }

    return { load, filterByPeriod, renderPanel };
})();
