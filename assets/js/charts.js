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
    updateBarChart(id, labels, data, xLabel, yLabel) {
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
                        ticks: { color: this.colors.text }
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
    }
};