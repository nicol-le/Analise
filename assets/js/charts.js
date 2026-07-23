

const Charts = {
  
    colors: {
        primary: '#8B0000',
        primaryLight: 'rgba(139, 0, 0, 0.05)',
        grid: '#e2e8f0',
        text: '#64748b'
    },

    updateLineChart(id, labels, data, label) {
        if (appState.charts[id]) appState.charts[id].destroy();

        const ctx = document.getElementById(id).getContext('2d');
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
                    x: { grid: { display: false }, ticks: { color: this.colors.text } },
                    y: { grid: { color: this.colors.grid }, ticks: { color: this.colors.text } }
                }
            }
        });
    },


    updateBarChart(id, labels, data) {
        if (appState.charts[id]) appState.charts[id].destroy();

        const ctx = document.getElementById(id).getContext('2d');
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
                    y: { beginAtZero: false, ticks: { color: this.colors.text } },
                    x: { ticks: { color: this.colors.text } }
                }
            }
        });
    },

    updateScatter(id, pts, xLabel) {
        if (appState.charts[id]) appState.charts[id].destroy();

        const ctx = document.getElementById(id).getContext('2d');
        
        // Se não há pontos, mostrar mensagem
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
                        pointRadius: 5,
                        pointHoverRadius: 7,
                        pointBorderWidth: 1
                    },
                    {
                        type: 'line',
                        data: regLine,
                        borderColor: '#64748b',
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
                plugins: { 
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        padding: 12,
                        titleFont: { size: 13, weight: 'bold' },
                        bodyFont: { size: 12 },
                        callbacks: {
                            title: (context) => {
                                const idx = context[0].datasetIndex;
                                return idx === 0 ? `${xLabel}: ${context[0].parsed.x.toFixed(1)}` : '';
                            },
                            label: (context) => {
                                if (context.datasetIndex === 0) {
                                    return `Preço: R$ ${context.parsed.y.toFixed(2)}`;
                                }
                                return '';
                            }
                        }
                    }
                },
                scales: {
                    x: { 
                        title: { 
                            display: true, 
                            text: xLabel, 
                            color: this.colors.text,
                            font: { weight: 'bold' }
                        },
                        ticks: { color: this.colors.text },
                        grid: { color: this.colors.grid }
                    },
                    y: { 
                        ticks: { color: this.colors.text },
                        grid: { color: this.colors.grid },
                        title: {
                            display: true,
                            text: 'Preço (R$)',
                            color: this.colors.text,
                            font: { weight: 'bold' }
                        }
                    }
                }
            }
        });
    }
};