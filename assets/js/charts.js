

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
    },

    updateLagChart(historicos, mapaClima, produto) {
        if (!appState.charts) appState.charts = {};
        if (appState.charts['chLag']) appState.charts['chLag'].destroy();
        
        const prodUpper = (produto || '').toUpperCase();
        let lagDays = 10;
        let groupName = "Geral";
        
        if (['TOMATE', 'BATATA', 'CENOURA', 'CEBOLA', 'ALHO'].some(p => prodUpper.includes(p))) { lagDays = 14; groupName = "Raízes/Hortaliças"; }
        if (['MAMAO', 'MELANCIA', 'UVA', 'ABACAXI', 'LIMAO', 'LARANJA', 'MACA', 'BANANA'].some(p => prodUpper.includes(p))) { lagDays = 14; groupName = "Frutas"; }
        if (['ALFACE', 'REPOLHO', 'COUVE', 'RUCULA'].some(p => prodUpper.includes(p))) { lagDays = 5; groupName = "Folhosas"; }

        const temps = Object.values(mapaClima).map(m => m.temp).filter(t => t > 0);
        if (temps.length < 10) {
            this._drawEmptyLag("Poucos dados climáticos.");
            return;
        }

        const meanT = Utils.average(temps);
        const stdT = Utils.stdDev(temps) || 1;
        const threshold = meanT + (stdT * 0.8); 

        const events = [];
        const histMap = {};
        historicos.forEach(h => histMap[h.date] = h.val);

        const dates = Object.keys(mapaClima).sort();
        for (let i = 0; i < dates.length; i++) {
            const date = dates[i];
            const m = mapaClima[date];
            if (m.temp > threshold) {
                let priceBefore = histMap[date];
                if (!priceBefore) {
                    for(let j=1; j<=3; j++) {
                        let dObj = new Date(date + 'T00:00:00');
                        dObj.setDate(dObj.getDate() - j);
                        let dStr = dObj.toISOString().split('T')[0];
                        if (histMap[dStr]) { priceBefore = histMap[dStr]; break; }
                    }
                }
                
                let priceAfter = null;
                for(let j=0; j<=3; j++) {
                    let dObj = new Date(date + 'T00:00:00');
                    dObj.setDate(dObj.getDate() + lagDays + j);
                    let dStr = dObj.toISOString().split('T')[0];
                    if (histMap[dStr]) { priceAfter = histMap[dStr]; break; }
                }

                if (priceBefore && priceAfter) {
                    const varPct = ((priceAfter - priceBefore) / priceBefore) * 100;
                    events.push(varPct);
                }
            }
        }

        const eEl = document.getElementById('statLag');
        if (events.length === 0) {
            this._drawEmptyLag("Sem eventos extremos suficientes.");
            if (eEl) eEl.innerText = `Impacto não detectado para ${groupName} (Lag: ${lagDays}d)`;
            return;
        }

        let altas = 0, baixas = 0, neutras = 0;
        events.forEach(v => {
            if (v > 3) altas++;
            else if (v < -3) baixas++;
            else neutras++;
        });
        
        if (eEl) eEl.innerText = `Grupo: ${groupName} • Lag: ${lagDays} dias após pico de calor (${events.length} análises).`;

        const ctx = document.getElementById('chLag').getContext('2d');
        appState.charts['chLag'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Subiu (>3%)', 'Estável', 'Caiu (<-3%)'],
                datasets: [{
                    data: [altas, neutras, baixas],
                    backgroundColor: ['#ef4444', '#94a3b8', '#3b82f6'],
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, ticks: { stepSize: 1, color: this.colors.text } },
                    x: { ticks: { color: this.colors.text } }
                }
            }
        });
    },
    
    _drawEmptyLag(msg) {
        const ctx = document.getElementById('chLag').getContext('2d');
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '14px Inter';
        ctx.textAlign = 'center';
        ctx.fillText(msg, ctx.canvas.width / 2, ctx.canvas.height / 2);
    }
};