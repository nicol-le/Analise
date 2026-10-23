/**
 * Inflacao — Módulo para carregar e processar dados de inflação do IBGE (Tabela 8190)
 * PMC - Variação acumulada no ano (em relação ao mesmo período do ano anterior) (%)
 * Fonte: https://raw.githubusercontent.com/nicol-le/Ceagesp/refs/heads/main/tabela8190.csv
 *
 * v2 — Adiciona comparativo anual preço × inflação e getLastAnalysis() para uso no bot.
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
    let _lastAnalysis = null; // Armazena última análise para uso externo (bot)

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
     */
    function parseCSV(rawText) {
        const lines = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

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

        let chosenHeaderIdx = headerLineIdxs[headerLineIdxs.length - 1];
        for (const idx of headerLineIdxs) {
            for (let k = Math.max(0, idx - 5); k < idx; k++) {
                const l = normalize(lines[k]);
                if (l.includes('acumulada') || l.includes('acumulado')) {
                    chosenHeaderIdx = idx;
                    break;
                }
            }
        }

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
            const shortName = monthName.charAt(0).toUpperCase() + monthName.slice(1, 3);
            return { date: `${year}-${mm}`, label: `${shortName} ${year}`, year, month: monthIdx };
        });

        const SP_PATTERN = /s[aã]o\s*paulo/i;
        const saoPauloData = [];

        for (let i = chosenHeaderIdx + 1; i < Math.min(chosenHeaderIdx + 30, lines.length); i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const cols = parseCSVLine(line);
            if (!cols.length) continue;

            const rowName = normalize(cols[0]);
            if (SP_PATTERN.test(cols[0]) || rowName.includes('paulo')) {
                const values = cols.slice(1);
                months.forEach((m, idx) => {
                    if (!m) return;
                    const val = parseBR(values[idx]);
                    if (val !== null) {
                        saoPauloData.push({ date: m.date, label: m.label, value: val, year: m.year, month: m.month });
                    }
                });
                console.log(`[Inflacao] Encontrou SP na linha ${i}: ${saoPauloData.length} pontos válidos.`);
                break;
            }
        }

        return saoPauloData;
    }

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
     * Carrega e parseia os dados de inflação com cache.
     * @returns {Promise<Array>} Array de { date, label, value, year, month }
     */
    async function load() {
        if (_cachedData) return _cachedData;
        try {
            const resp = await fetch(CSV_URL);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
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
     * Filtra os dados de inflação para um período.
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
     * Calcula comparativo anual: variação de preço do produto vs inflação IBGE.
     * @param {Array} inflacaoData - Série completa de inflação SP
     * @param {Array} historicosPreco - Array de {date:'YYYY-MM-DD', val:float}
     * @param {string} produto - Nome do produto
     * @returns {Array} [{ano, precoMedio, variacaoPreco, inflacaoAcum, spreadReal, ganho}]
     */
    function computeYearlyComparison(inflacaoData, historicosPreco, produto) {
        if (!historicosPreco || historicosPreco.length === 0) return [];

        // Agrupa preços por ano
        const precosPorAno = {};
        historicosPreco.forEach(p => {
            const year = p.date ? p.date.substring(0, 4) : null;
            if (!year) return;
            if (!precosPorAno[year]) precosPorAno[year] = [];
            precosPorAno[year].push(p.val);
        });

        // Para cada ano, pega a inflação acumulada do último mês disponível (dez ou último mês)
        const inflacaoPorAno = {};
        if (inflacaoData && inflacaoData.length) {
            // Para cada ano, encontra o ponto de fechamento (dez ou último disponível)
            const anos = [...new Set(inflacaoData.map(d => d.year))];
            anos.forEach(ano => {
                const pontosDoAno = inflacaoData.filter(d => d.year === ano);
                if (!pontosDoAno.length) return;
                // Preferir dezembro (mês 11); se não tiver, pegar o último disponível
                const dez = pontosDoAno.find(d => d.month === 11);
                const ponto = dez || pontosDoAno[pontosDoAno.length - 1];
                inflacaoPorAno[ano] = { value: ponto.value, label: ponto.label };
            });
        }

        const anosComDados = Object.keys(precosPorAno).sort();
        if (anosComDados.length < 2) return [];

        const result = [];
        // Calcula média de preços por ano
        const mediasPorAno = {};
        anosComDados.forEach(ano => {
            const vals = precosPorAno[ano];
            mediasPorAno[ano] = vals.reduce((a, b) => a + b, 0) / vals.length;
        });

        // Calcula variações em relação ao ano anterior
        for (let i = 1; i < anosComDados.length; i++) {
            const anoAtual = anosComDados[i];
            const anoAnterior = anosComDados[i - 1];
            const precoAtual = mediasPorAno[anoAtual];
            const precoAnterior = mediasPorAno[anoAnterior];
            if (!precoAnterior || precoAnterior === 0) continue;

            const variacaoPreco = ((precoAtual - precoAnterior) / precoAnterior) * 100;
            const inflacaoAcum = inflacaoPorAno[anoAtual] ? inflacaoPorAno[anoAtual].value : null;
            const spreadReal = inflacaoAcum !== null ? variacaoPreco - inflacaoAcum : null;
            const ganho = spreadReal !== null ? (spreadReal > 0 ? 'ganho' : spreadReal < 0 ? 'perda' : 'neutro') : 'sem dados';

            result.push({
                ano: anoAtual,
                anoAnterior,
                precoMedio: precoAtual,
                precoMedioAnterior: precoAnterior,
                variacaoPreco: parseFloat(variacaoPreco.toFixed(2)),
                inflacaoAcum: inflacaoAcum !== null ? parseFloat(inflacaoAcum.toFixed(2)) : null,
                spreadReal: spreadReal !== null ? parseFloat(spreadReal.toFixed(2)) : null,
                ganho
            });
        }

        return result;
    }

    /**
     * Retorna a última análise calculada para uso externo (bot, aba produtor, etc.)
     */
    function getLastAnalysis() {
        return _lastAnalysis;
    }

    /**
     * Renderiza o painel completo de inflação com comparativo anual.
     * @param {Array} inflacaoData - Dados de inflação SP (série completa)
     * @param {Array} historicosPreco - Histórico de preços {date, val}
     * @param {string} produto - Nome do produto
     */
    function renderPanel(inflacaoData, historicosPreco, produto) {
        // --- Painel de inflação clássico (gráfico de barras mensal) ---
        const panel = document.getElementById('inflacaoPanel');
        if (panel) {
            if (!inflacaoData || inflacaoData.length === 0) {
                panel.innerHTML = `<p class="text-slate-400 text-sm text-center py-4">Sem dados de inflação disponíveis para o período selecionado.</p>`;
            } else {
                const labels = inflacaoData.map(d => d.label);
                const values = inflacaoData.map(d => d.value);
                const latest = inflacaoData[inflacaoData.length - 1];
                const prev = inflacaoData.length > 1 ? inflacaoData[inflacaoData.length - 2] : null;
                const max = Math.max(...values);
                const min = Math.min(...values);
                const avg = values.reduce((a, b) => a + b, 0) / values.length;

                _updateCard('inflacao-latest-val', latest ? `${latest.value.toFixed(1)}%` : '—');
                _updateCard('inflacao-latest-label', latest ? latest.label : '—');
                _updateCard('inflacao-avg-val', `${avg.toFixed(1)}%`);
                _updateCard('inflacao-max-val', `${max.toFixed(1)}%`);
                _updateCard('inflacao-min-val', `${min.toFixed(1)}%`);

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

                _renderChartMensal(labels, values);
                _renderInsight(inflacaoData, avg);
            }
        }

        // --- Comparativo Anual: Preço × Inflação ---
        const comparativo = computeYearlyComparison(inflacaoData, historicosPreco, produto);

        // Salva análise para uso externo
        if (comparativo && comparativo.length > 0) {
            const ult = comparativo[comparativo.length - 1];
            _lastAnalysis = {
                produto: produto || '—',
                anoAtual: ult.ano,
                anoAnterior: ult.anoAnterior,
                variacaoPreco: ult.variacaoPreco,
                inflacaoAcum: ult.inflacaoAcum,
                spreadReal: ult.spreadReal,
                ganho: ult.ganho,
                precoMedio: ult.precoMedio,
                todos: comparativo
            };
        } else {
            _lastAnalysis = null;
        }

        // Atualiza card na aba Produtor (se existir)
        _renderProducerInflacaoCard(_lastAnalysis);

        // Tabela comparativa
        const tbody = document.getElementById('inflacaoTableBody');
        if (tbody) {
            if (!comparativo || comparativo.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-slate-400 italic text-xs">Dados insuficientes para comparativo anual (necessário ao menos 2 anos com preços).</td></tr>`;
            } else {
                tbody.innerHTML = comparativo.map(row => {
                    const spreadClass = row.spreadReal === null ? 'text-slate-400' :
                        row.spreadReal > 0 ? 'text-green-700 font-bold' : 'text-red-600 font-bold';
                    const ganhoIcon = row.ganho === 'ganho' ? '📈 Ganho real' :
                        row.ganho === 'perda' ? '📉 Perda real' : '➡️ Neutro';
                    const ganhoClass = row.ganho === 'ganho' ? 'text-green-700' :
                        row.ganho === 'perda' ? 'text-red-600' : 'text-slate-500';
                    return `
                        <tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                            <td class="px-3 py-2 font-bold text-slate-700">${row.anoAnterior} → ${row.ano}</td>
                            <td class="px-3 py-2 font-mono text-slate-700">R$ ${row.precoMedioAnterior.toFixed(2)}</td>
                            <td class="px-3 py-2 font-mono text-slate-700">R$ ${row.precoMedio.toFixed(2)}</td>
                            <td class="px-3 py-2 font-mono ${row.variacaoPreco >= 0 ? 'text-red-600' : 'text-green-700'}">${row.variacaoPreco >= 0 ? '+' : ''}${row.variacaoPreco.toFixed(1)}%</td>
                            <td class="px-3 py-2 font-mono text-blue-700">${row.inflacaoAcum !== null ? (row.inflacaoAcum >= 0 ? '+' : '') + row.inflacaoAcum.toFixed(1) + '%' : '—'}</td>
                            <td class="px-3 py-2">
                                ${row.spreadReal !== null ? `<span class="${spreadClass}">${row.spreadReal >= 0 ? '+' : ''}${row.spreadReal.toFixed(1)} p.p.</span>` : '—'}
                                <span class="${ganhoClass} text-xs ml-1">${ganhoIcon}</span>
                            </td>
                        </tr>
                    `;
                }).join('');
            }
        }

        // Gráfico comparativo anual (barras + linha)
        _renderChartYearly(comparativo, produto);

        // Gráfico de curvas por ano
        _renderChartCurvas(inflacaoData, historicosPreco, produto);

        // Título dinâmico
        const titleEl = document.getElementById('inflacao-prod-title');
        if (titleEl && produto) {
            titleEl.textContent = `${produto} — Preço vs Inflação IBGE/SP`;
        }
    }

    /** Atualiza o card de inflação na aba "Para o Produtor" */
    function _renderProducerInflacaoCard(analysis) {
        const card = document.getElementById('prod-inflacao-card');
        if (!card) return;

        if (!analysis) {
            card.innerHTML = `<p class="text-slate-400 text-xs italic">Execute uma análise para ver o comparativo de inflação.</p>`;
            return;
        }

        const spreadColor = analysis.spreadReal > 0 ? 'text-green-700' : analysis.spreadReal < 0 ? 'text-red-600' : 'text-slate-500';
        const spreadIcon = analysis.ganho === 'ganho' ? '📈' : analysis.ganho === 'perda' ? '📉' : '➡️';
        const spreadMsg = analysis.ganho === 'ganho'
            ? `O preço de <strong>${analysis.produto}</strong> subiu <strong>${analysis.variacaoPreco >= 0 ? '+' : ''}${analysis.variacaoPreco?.toFixed(1)}%</strong> de ${analysis.anoAnterior} para ${analysis.anoAtual}, enquanto a inflação do setor foi de <strong>${analysis.inflacaoAcum !== null ? (analysis.inflacaoAcum >= 0 ? '+' : '') + analysis.inflacaoAcum?.toFixed(1) + '%' : '—'}</strong>. Isso representa um <span class="text-green-700 font-bold">ganho real de ${analysis.spreadReal?.toFixed(1)} pontos percentuais</span> — o produto valorizou acima da inflação. 💪`
            : analysis.ganho === 'perda'
            ? `O preço de <strong>${analysis.produto}</strong> subiu <strong>${analysis.variacaoPreco >= 0 ? '+' : ''}${analysis.variacaoPreco?.toFixed(1)}%</strong> de ${analysis.anoAnterior} para ${analysis.anoAtual}, mas a inflação do setor foi de <strong>${analysis.inflacaoAcum !== null ? (analysis.inflacaoAcum >= 0 ? '+' : '') + analysis.inflacaoAcum?.toFixed(1) + '%' : '—'}</strong>. Isso representa uma <span class="text-red-600 font-bold">perda real de ${Math.abs(analysis.spreadReal)?.toFixed(1)} pontos percentuais</span> — o produto perdeu valor acima da inflação.`
            : `O preço de <strong>${analysis.produto}</strong> variou em linha com a inflação entre ${analysis.anoAnterior} e ${analysis.anoAtual}.`;

        card.innerHTML = `
            <div class="flex items-start gap-3">
                <span class="text-2xl mt-0.5">${spreadIcon}</span>
                <div class="flex-1">
                    <p class="text-sm text-slate-700 leading-relaxed">${spreadMsg}</p>
                    <div class="flex flex-wrap gap-3 mt-3">
                        <div class="bg-white border border-slate-200 rounded-lg px-3 py-2 text-center">
                            <p class="text-[9px] font-bold text-slate-400 uppercase">Variação Preço</p>
                            <p class="text-base font-mono font-bold ${analysis.variacaoPreco >= 0 ? 'text-red-600' : 'text-green-700'}">${analysis.variacaoPreco >= 0 ? '+' : ''}${analysis.variacaoPreco?.toFixed(1)}%</p>
                        </div>
                        <div class="bg-white border border-slate-200 rounded-lg px-3 py-2 text-center">
                            <p class="text-[9px] font-bold text-slate-400 uppercase">Inflação IBGE</p>
                            <p class="text-base font-mono font-bold text-blue-700">${analysis.inflacaoAcum !== null ? (analysis.inflacaoAcum >= 0 ? '+' : '') + analysis.inflacaoAcum?.toFixed(1) + '%' : '—'}</p>
                        </div>
                        <div class="bg-white border border-slate-200 rounded-lg px-3 py-2 text-center">
                            <p class="text-[9px] font-bold text-slate-400 uppercase">Spread Real</p>
                            <p class="text-base font-mono font-bold ${spreadColor}">${analysis.spreadReal !== null ? (analysis.spreadReal >= 0 ? '+' : '') + analysis.spreadReal?.toFixed(1) + ' p.p.' : '—'}</p>
                        </div>
                        <div class="bg-white border border-slate-200 rounded-lg px-3 py-2 text-center">
                            <p class="text-[9px] font-bold text-slate-400 uppercase">Preço Médio ${analysis.anoAtual}</p>
                            <p class="text-base font-mono font-bold text-slate-700">R$ ${analysis.precoMedio?.toFixed(2)}</p>
                        </div>
                    </div>
                    <p class="text-[10px] text-slate-400 mt-2">Fonte: IBGE – PMC Tabela 8190. Comparativo ${analysis.anoAnterior} → ${analysis.anoAtual}.</p>
                </div>
            </div>
        `;
    }

    function _updateCard(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    function _renderChartMensal(labels, values) {
        if (appState.charts['chInflacao']) {
            appState.charts['chInflacao'].destroy();
            delete appState.charts['chInflacao'];
        }
        const el = document.getElementById('chInflacao');
        if (!el) return;
        const ctx = el.getContext('2d');

        const bgColors = values.map(v => v > 0 ? 'rgba(239, 68, 68, 0.6)' : 'rgba(16, 185, 129, 0.6)');
        const borderColors = values.map(v => v > 0 ? '#ef4444' : '#10b981');
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
                        ticks: { color: '#64748b', callback: v => v.toFixed(1) + '%' },
                        grid: { color: '#e2e8f0' }
                    }
                }
            }
        });
    }

    /** Gráfico de barras agrupadas + linha de spread real (comparativo anual) */
    function _renderChartYearly(comparativo, produto) {
        if (appState.charts['chInflacaoYearly']) {
            appState.charts['chInflacaoYearly'].destroy();
            delete appState.charts['chInflacaoYearly'];
        }
        const el = document.getElementById('chInflacaoYearly');
        if (!el || !comparativo || !comparativo.length) return;
        const ctx = el.getContext('2d');

        const labels = comparativo.map(r => `${r.anoAnterior}→${r.ano}`);
        const varPreco = comparativo.map(r => r.variacaoPreco);
        const inflacoes = comparativo.map(r => r.inflacaoAcum);
        const spreads = comparativo.map(r => r.spreadReal);

        appState.charts['chInflacaoYearly'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: `Variação Preço (${produto || 'produto'})`,
                        data: varPreco,
                        backgroundColor: varPreco.map(v => v >= 0 ? 'rgba(239,68,68,0.65)' : 'rgba(16,185,129,0.65)'),
                        borderColor: varPreco.map(v => v >= 0 ? '#ef4444' : '#10b981'),
                        borderWidth: 1.5,
                        borderRadius: 4,
                        order: 2
                    },
                    {
                        label: 'Inflação IBGE/SP (%)',
                        data: inflacoes,
                        backgroundColor: 'rgba(59,130,246,0.45)',
                        borderColor: '#3b82f6',
                        borderWidth: 1.5,
                        borderRadius: 4,
                        order: 3
                    },
                    {
                        label: 'Spread Real (p.p.)',
                        data: spreads,
                        type: 'line',
                        borderColor: '#8b0000',
                        backgroundColor: 'rgba(139,0,0,0.1)',
                        borderWidth: 2.5,
                        pointBackgroundColor: spreads.map(s => s > 0 ? '#10b981' : '#ef4444'),
                        pointRadius: 6,
                        pointHoverRadius: 8,
                        fill: false,
                        tension: 0.3,
                        order: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: { color: '#334155', font: { size: 11 }, boxWidth: 14, padding: 14 }
                    },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const v = ctx.parsed.y;
                                if (ctx.dataset.label.startsWith('Spread')) {
                                    return ` Spread Real: ${v >= 0 ? '+' : ''}${v?.toFixed(1)} p.p. ${v > 0 ? '(Ganho)' : '(Perda)'}`;
                                }
                                return ` ${ctx.dataset.label}: ${v >= 0 ? '+' : ''}${v?.toFixed(1)}%`;
                            }
                        }
                    },
                    annotation: {}
                },
                scales: {
                    x: {
                        title: { display: true, text: 'Período', color: '#64748b', font: { weight: 'bold' } },
                        ticks: { color: '#64748b', font: { size: 11 } },
                        grid: { display: false }
                    },
                    y: {
                        title: { display: true, text: '% / p.p.', color: '#64748b', font: { weight: 'bold' } },
                        ticks: {
                            color: '#64748b',
                            callback: v => v.toFixed(1) + (v === 0 ? '' : '')
                        },
                        grid: { color: '#e2e8f0' }
                    }
                }
            }
        });
    }

    /** Gráfico de curvas: preço médio mensal por ano (sobrepostos) */
    function _renderChartCurvas(inflacaoData, historicosPreco, produto) {
        if (appState.charts['chInflacaoCurvas']) {
            appState.charts['chInflacaoCurvas'].destroy();
            delete appState.charts['chInflacaoCurvas'];
        }
        const el = document.getElementById('chInflacaoCurvas');
        if (!el || !historicosPreco || !historicosPreco.length) return;
        const ctx = el.getContext('2d');

        // Agrupa preços por ano e mês
        const precosMesAno = {};
        historicosPreco.forEach(p => {
            if (!p.date) return;
            const year = p.date.substring(0, 4);
            const month = parseInt(p.date.substring(5, 7)) - 1; // 0-indexed
            if (!precosMesAno[year]) precosMesAno[year] = {};
            if (!precosMesAno[year][month]) precosMesAno[year][month] = [];
            precosMesAno[year][month].push(p.val);
        });

        const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const COLORS = ['#8b0000', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

        const anos = Object.keys(precosMesAno).sort();
        const datasets = anos.map((ano, i) => {
            const data = MESES.map((_, m) => {
                const vals = precosMesAno[ano][m];
                if (!vals || !vals.length) return null;
                return parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2));
            });
            return {
                label: ano,
                data,
                borderColor: COLORS[i % COLORS.length],
                backgroundColor: COLORS[i % COLORS.length] + '22',
                borderWidth: 2,
                pointRadius: 3,
                pointHoverRadius: 5,
                tension: 0.35,
                fill: false,
                spanGaps: true
            };
        });

        appState.charts['chInflacaoCurvas'] = new Chart(ctx, {
            type: 'line',
            data: { labels: MESES, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: { color: '#334155', font: { size: 11 }, boxWidth: 14, padding: 10 }
                    },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                if (ctx.parsed.y === null) return null;
                                return ` ${ctx.dataset.label}: R$ ${ctx.parsed.y.toFixed(2)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        title: { display: true, text: 'Mês', color: '#64748b' },
                        ticks: { color: '#64748b', font: { size: 11 } },
                        grid: { display: false }
                    },
                    y: {
                        title: { display: true, text: `Preço Médio (R$)`, color: '#64748b' },
                        ticks: {
                            color: '#64748b',
                            callback: v => 'R$ ' + v.toFixed(2)
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

    return { load, filterByPeriod, renderPanel, computeYearlyComparison, getLastAnalysis };
})();
