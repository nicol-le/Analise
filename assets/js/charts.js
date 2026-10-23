/**
 * Charts — Funções de renderização de gráficos com eixos nomeados.
 */
const Charts = {

    colors: {
        primary: '#8B0000',
        primaryLight: 'rgba(139, 0, 0, 0.05)',
        blue: '#3b82f6',
        green: '#10b981',
        amber: '#f59e0b',
        slate: '#64748b',
        grid: '#e2e8f0',
        text: '#64748b'
    },

    /** Gráfico de linha simples com eixos nomeados. */
    updateLineChart(id, labels, data, label, xLabel, yLabel) {
        if (appState.charts[id]) appState.charts[id].destroy();
        const el = document.getElementById(id);
        if (!el) return;
        const ctx = el.getContext('2d');
        appState.charts[id] = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label,
                    data,
                    borderColor: this.colors.primary,
                    backgroundColor: this.colors.primaryLight,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: {
                        title: { display: !!xLabel, text: xLabel, color: this.colors.text, font: { weight: 'bold' } },
                        grid: { display: false },
                        ticks: { color: this.colors.text, maxTicksLimit: 12 }
                    },
                    y: {
                        title: { display: !!yLabel, text: yLabel, color: this.colors.text, font: { weight: 'bold' } },
                        grid: { color: this.colors.grid },
                        ticks: { color: this.colors.text }
                    }
                }
            }
        });
    },

    /** Gráfico de barras simples com eixos nomeados. */
    updateBarChart(id, labels, data, xLabel, yLabel, xTickRotation = 0) {
        if (appState.charts[id]) appState.charts[id].destroy();
        const el = document.getElementById(id);
        if (!el) return;
        const ctx = el.getContext('2d');
        appState.charts[id] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    data,
                    backgroundColor: this.colors.primary,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: {
                        title: { display: !!xLabel, text: xLabel, color: this.colors.text, font: { weight: 'bold' } },
                        ticks: { color: this.colors.text, maxRotation: xTickRotation, minRotation: xTickRotation }
                    },
                    y: {
                        title: { display: !!yLabel, text: yLabel, color: this.colors.text, font: { weight: 'bold' } },
                        beginAtZero: false,
                        ticks: { color: this.colors.text }
                    }
                }
            }
        });
    },

    /** Gráfico de múltiplas linhas (ex: preço + médias móveis). */
    updateMultiLineChart(id, labels, datasets, xLabel, yLabel) {
        if (appState.charts[id]) appState.charts[id].destroy();
        const el = document.getElementById(id);
        if (!el) return;
        const ctx = el.getContext('2d');
        appState.charts[id] = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, position: 'top', labels: { color: this.colors.text, font: { size: 11 } } },
                    tooltip: { mode: 'index', intersect: false }
                },
                scales: {
                    x: {
                        title: { display: !!xLabel, text: xLabel, color: this.colors.text, font: { weight: 'bold' } },
                        grid: { display: false },
                        ticks: { color: this.colors.text, maxTicksLimit: 12 }
                    },
                    y: {
                        title: { display: !!yLabel, text: yLabel, color: this.colors.text, font: { weight: 'bold' } },
                        grid: { color: this.colors.grid },
                        ticks: { color: this.colors.text }
                    }
                }
            }
        });
    },

    /** Gráfico de barras com cores variáveis (ex: variação diária %). */
    updatePriceChangeChart(id, labels, data, xLabel, yLabel) {
        if (appState.charts[id]) appState.charts[id].destroy();
        const el = document.getElementById(id);
        if (!el) return;
        const ctx = el.getContext('2d');
        const colors = data.map(v => v >= 0 ? '#ef4444' : '#10b981');
        appState.charts[id] = new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets: [{ data, backgroundColor: colors, borderRadius: 2 }] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: {
                        title: { display: !!xLabel, text: xLabel, color: this.colors.text, font: { weight: 'bold' } },
                        grid: { display: false },
                        ticks: { color: this.colors.text, maxTicksLimit: 12 }
                    },
                    y: {
                        title: { display: !!yLabel, text: yLabel, color: this.colors.text, font: { weight: 'bold' } },
                        grid: { color: this.colors.grid },
                        ticks: { color: this.colors.text, callback: v => v.toFixed(1) + '%' }
                    }
                }
            }
        });
    },

    /** Índice cumulativo (base 100) com linha de referência. */
    updateCumulativeChart(id, labels, data, xLabel, yLabel) {
        if (appState.charts[id]) appState.charts[id].destroy();
        const el = document.getElementById(id);
        if (!el) return;
        const ctx = el.getContext('2d');
        const refLine = new Array(labels.length).fill(100);
        appState.charts[id] = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Índice de Preço',
                        data,
                        borderColor: this.colors.primary,
                        backgroundColor: this.colors.primaryLight,
                        fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2
                    },
                    {
                        label: 'Referência (100)',
                        data: refLine,
                        borderColor: this.colors.slate,
                        borderDash: [5, 5], fill: false, pointRadius: 0, borderWidth: 1.5
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, position: 'top', labels: { color: this.colors.text, font: { size: 11 } } }
                },
                scales: {
                    x: {
                        title: { display: !!xLabel, text: xLabel, color: this.colors.text, font: { weight: 'bold' } },
                        grid: { display: false },
                        ticks: { color: this.colors.text, maxTicksLimit: 12 }
                    },
                    y: {
                        title: { display: !!yLabel, text: yLabel, color: this.colors.text, font: { weight: 'bold' } },
                        grid: { color: this.colors.grid },
                        ticks: { color: this.colors.text }
                    }
                }
            }
        });
    },

    /** Estatísticas mensais: mínimo, mediana e máximo lado a lado. */
    updateMonthlyStatsChart(id, labels, minData, medData, maxData, xLabel, yLabel) {
        if (appState.charts[id]) appState.charts[id].destroy();
        const el = document.getElementById(id);
        if (!el) return;
        const ctx = el.getContext('2d');
        appState.charts[id] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: 'Mínimo', data: minData, backgroundColor: '#10b981', borderRadius: 3 },
                    { label: 'Mediana', data: medData, backgroundColor: '#94a3b8', borderRadius: 3 },
                    { label: 'Máximo', data: maxData, backgroundColor: '#ef4444', borderRadius: 3 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, position: 'top', labels: { color: this.colors.text, font: { size: 11 } } }
                },
                scales: {
                    x: {
                        title: { display: !!xLabel, text: xLabel, color: this.colors.text, font: { weight: 'bold' } },
                        grid: { display: false },
                        ticks: { color: this.colors.text }
                    },
                    y: {
                        title: { display: !!yLabel, text: yLabel, color: this.colors.text, font: { weight: 'bold' } },
                        grid: { color: this.colors.grid },
                        ticks: { color: this.colors.text }
                    }
                }
            }
        });
    },

    /** Scatter plot com linha de regressão. */
    updateScatter(id, pts, xLabel) {
        if (appState.charts[id]) appState.charts[id].destroy();
        const el = document.getElementById(id);
        if (!el) return;
        const ctx = el.getContext('2d');

        if (!pts || pts.length < 2) {
            ctx.fillStyle = '#94a3b8';
            ctx.font = '14px Inter';
            ctx.textAlign = 'center';
            ctx.fillText('Dados insuficientes para correlação', ctx.canvas.width / 2, ctx.canvas.height / 2);
            return;
        }

        const regLine = Utils.getRegLine(pts);
        appState.charts[id] = new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [
                    {
                        type: 'scatter',
                        data: pts,
                        backgroundColor: this.colors.primary,
                        borderColor: this.colors.primary,
                        pointRadius: 4,
                        pointHoverRadius: 6
                    },
                    {
                        type: 'line',
                        data: regLine,
                        borderColor: this.colors.slate,
                        borderDash: [5, 5],
                        borderWidth: 2,
                        fill: false,
                        pointRadius: 0,
                        tension: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: {
                        title: { display: true, text: xLabel, color: this.colors.text, font: { weight: 'bold' } },
                        ticks: { color: this.colors.text },
                        grid: { color: this.colors.grid }
                    },
                    y: {
                        title: { display: true, text: 'Preço (R$)', color: this.colors.text, font: { weight: 'bold' } },
                        ticks: { color: this.colors.text },
                        grid: { color: this.colors.grid }
                    }
                }
            }
        });
    },

    /** Gráfico de dois eixos: Volume (barras) vs Preço (linha). */
    updateDualAxisChart(id, labels, barData, barLabel, lineData, lineLabel, xLabel, yPrecoLabel, yVolumeLabel) {
        if (appState.charts[id]) appState.charts[id].destroy();
        const el = document.getElementById(id);
        if (!el) return;
        const ctx = el.getContext('2d');
        appState.charts[id] = new Chart(ctx, {
            data: {
                labels,
                datasets: [
                    {
                        type: 'bar',
                        label: barLabel,
                        data: barData,
                        backgroundColor: 'rgba(59, 130, 246, 0.45)',
                        borderColor: '#3b82f6',
                        borderWidth: 1,
                        borderRadius: 3,
                        yAxisID: 'yVolume',
                        order: 2
                    },
                    {
                        type: 'line',
                        label: lineLabel,
                        data: lineData,
                        borderColor: this.colors.primary,
                        backgroundColor: this.colors.primaryLight,
                        borderWidth: 2.5,
                        fill: false,
                        tension: 0.3,
                        pointRadius: 2,
                        pointHoverRadius: 4,
                        yAxisID: 'yPreco',
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
                        labels: { color: this.colors.text, font: { size: 11 } }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: (c) => {
                                if (c.dataset.yAxisID === 'yVolume') {
                                    return ` ${c.dataset.label}: ${c.parsed.y.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} t`;
                                }
                                return ` ${c.dataset.label}: R$ ${c.parsed.y.toFixed(2)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        title: { display: !!xLabel, text: xLabel, color: this.colors.text, font: { weight: 'bold' } },
                        grid: { display: false },
                        ticks: { color: this.colors.text, maxTicksLimit: 14 }
                    },
                    yPreco: {
                        type: 'linear',
                        position: 'left',
                        title: { display: true, text: yPrecoLabel || 'Preço (R$)', color: this.colors.primary, font: { weight: 'bold' } },
                        ticks: { color: this.colors.primary, callback: v => 'R$ ' + v.toFixed(2) },
                        grid: { color: this.colors.grid }
                    },
                    yVolume: {
                        type: 'linear',
                        position: 'right',
                        title: { display: true, text: yVolumeLabel || 'Volume (t)', color: '#2563eb', font: { weight: 'bold' } },
                        ticks: { color: '#2563eb', callback: v => v.toLocaleString('pt-BR') + ' t' },
                        grid: { display: false }
                    }
                }
            }
        });
    },

    /** Gráfico de barras horizontais (ex: Top Permissionários). */
    updateHorizontalBarChart(id, labels, data, xLabel, yLabel, barColor) {
        if (appState.charts[id]) appState.charts[id].destroy();
        const el = document.getElementById(id);
        if (!el) return;
        const ctx = el.getContext('2d');
        appState.charts[id] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    data,
                    backgroundColor: barColor || this.colors.primary,
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: c => ` Volume: ${c.parsed.x.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} t`
                        }
                    }
                },
                scales: {
                    x: {
                        title: { display: !!xLabel, text: xLabel, color: this.colors.text, font: { weight: 'bold' } },
                        ticks: { color: this.colors.text, callback: v => v.toLocaleString('pt-BR') + ' t' },
                        grid: { color: this.colors.grid }
                    },
                    y: {
                        title: { display: !!yLabel, text: yLabel, color: this.colors.text, font: { weight: 'bold' } },
                        ticks: { color: this.colors.text, font: { size: 10 } },
                        grid: { display: false }
                    }
                }
            }
        });
    },

    /** Gráfico de rosca / donut (ex: Mix de Variedades). */
    updateDoughnutChart(id, labels, data, customColors) {
        if (appState.charts[id]) appState.charts[id].destroy();
        const el = document.getElementById(id);
        if (!el) return;
        const ctx = el.getContext('2d');
        const defaultPalette = ['#8B0000', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#64748b'];
        const colors = customColors || defaultPalette.slice(0, labels.length);
        const total = data.reduce((a, b) => a + b, 0) || 1;

        appState.charts[id] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data,
                    backgroundColor: colors,
                    borderColor: '#ffffff',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '62%',
                plugins: {
                    legend: {
                        display: true,
                        position: 'right',
                        labels: {
                            color: this.colors.text,
                            font: { size: 11 },
                            generateLabels: (chart) => {
                                const orig = Chart.overrides.doughnut.plugins.legend.labels.generateLabels(chart);
                                return orig.map((item, idx) => {
                                    const val = data[idx] || 0;
                                    const pct = ((val / total) * 100).toFixed(1);
                                    item.text = `${labels[idx]} (${pct}%)`;
                                    return item;
                                });
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: c => {
                                const val = c.parsed;
                                const pct = ((val / total) * 100).toFixed(1);
                                return ` ${val.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} t (${pct}%)`;
                            }
                        }
                    }
                }
            }
        });
    }
,

    /**
     * Gráfico Comparativo Anual: Variação de Preço da Cultura vs Inflação Oficial IBGE (%)
     */
    updateYearlyComparisonChart(id, years, priceVarData, inflacaoData, spreadData, productName) {
        if (appState.charts[id]) appState.charts[id].destroy();
        const el = document.getElementById(id);
        if (!el) return;
        const ctx = el.getContext('2d');

        appState.charts[id] = new Chart(ctx, {
            data: {
                labels: years,
                datasets: [
                    {
                        type: 'bar',
                        label: `Variação Preço: ${productName || 'Produto'} (%)`,
                        data: priceVarData,
                        backgroundColor: 'rgba(139, 0, 0, 0.75)',
                        borderColor: '#8B0000',
                        borderWidth: 1.5,
                        borderRadius: 4,
                        order: 2
                    },
                    {
                        type: 'bar',
                        label: 'Inflação Atacado Alimentar SP (IBGE %)',
                        data: inflacaoData,
                        backgroundColor: 'rgba(59, 130, 246, 0.65)',
                        borderColor: '#2563eb',
                        borderWidth: 1.5,
                        borderRadius: 4,
                        order: 3
                    },
                    {
                        type: 'line',
                        label: 'Ganho/Perda Real (Spread p.p.)',
                        data: spreadData,
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        borderWidth: 2.5,
                        fill: false,
                        tension: 0.3,
                        pointRadius: 4,
                        pointHoverRadius: 6,
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
                        labels: { color: this.colors.text, font: { size: 11 } }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: c => ` ${c.dataset.label}: ${c.parsed.y >= 0 ? '+' : ''}${c.parsed.y.toFixed(1)}%`
                        }
                    }
                },
                scales: {
                    x: {
                        title: { display: true, text: 'Ano de Comparação', color: this.colors.text, font: { weight: 'bold' } },
                        grid: { display: false },
                        ticks: { color: this.colors.text }
                    },
                    y: {
                        title: { display: true, text: 'Variação / Inflação (%)', color: this.colors.text, font: { weight: 'bold' } },
                        ticks: {
                            color: this.colors.text,
                            callback: v => `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`
                        },
                        grid: { color: this.colors.grid }
                    }
                }
            }
        });
    },

    /**
     * Gráfico de Linhas Sobrepostas dos Anos (Jan a Dez)
     * Permite comparar a curva de preços mês a mês entre diferentes safras/anos.
     */
    updateMultiYearLineChart(id, monthsLabels, yearlyDatasets, yLabel) {
        if (appState.charts[id]) appState.charts[id].destroy();
        const el = document.getElementById(id);
        if (!el) return;
        const ctx = el.getContext('2d');

        appState.charts[id] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: monthsLabels,
                datasets: yearlyDatasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: { color: this.colors.text, font: { size: 11 } }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: c => {
                                if (c.parsed.y == null || isNaN(c.parsed.y)) return null;
                                return ` ${c.dataset.label}: R$ ${c.parsed.y.toFixed(2)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        title: { display: true, text: 'Mês', color: this.colors.text, font: { weight: 'bold' } },
                        grid: { display: false },
                        ticks: { color: this.colors.text }
                    },
                    y: {
                        title: { display: true, text: yLabel || 'Preço Médio (R$)', color: this.colors.text, font: { weight: 'bold' } },
                        ticks: {
                            color: this.colors.text,
                            callback: v => 'R$ ' + v.toFixed(2)
                        },
                        grid: { color: this.colors.grid }
                    }
                }
            }
        });
    }

};
