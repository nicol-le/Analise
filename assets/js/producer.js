/**
 * Visão do Produtor — calendário de melhor período de venda
 * e recomendações em linguagem simples (sem alterar as análises técnicas).
 */
const Producer = {
    /** Nomes dos meses em português. */
    monthNames: [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ],
    weekDays: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],

    /**
     * Calcula, para o mês do último preço, a atratividade de venda por dia
     * com base na sazonalidade histórica (mesmo mês em anos anteriores)
     * e no padrão por dia da semana.
     */
    buildSellCalendar(historicos) {
        if (!historicos || historicos.length < 5) return null;

        const last = historicos[historicos.length - 1];
        const lastDate = new Date(last.date + 'T00:00:00');
        const year = lastDate.getFullYear();
        const month = lastDate.getMonth(); // 0–11

        // Preços históricos do mesmo mês (todos os anos) e por dia da semana
        const sameMonth = historicos.filter(h => new Date(h.date + 'T00:00:00').getMonth() === month);
        const byDow = Array.from({ length: 7 }, () => []);
        const byDom = Array.from({ length: 32 }, () => []);
        sameMonth.forEach(h => {
            const d = new Date(h.date + 'T00:00:00');
            byDow[d.getDay()].push(h.val);
            byDom[d.getDate()].push(h.val);
        });

        const overallMean = Utils.average(sameMonth.map(h => h.val)) || Utils.average(historicos.map(h => h.val));
        const overallStd = Utils.stdDev(sameMonth.map(h => h.val)) || Utils.stdDev(historicos.map(h => h.val)) || 1;

        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const days = [];
        for (let day = 1; day <= daysInMonth; day++) {
            const dateObj = new Date(year, month, day);
            const dow = dateObj.getDay();
            const dowMean = byDow[dow].length ? Utils.average(byDow[dow]) : overallMean;
            const domMean = byDom[day].length ? Utils.average(byDom[day]) : overallMean;
            // Score: média ponderada dia-do-mês + dia-da-semana vs média do mês
            const expected = 0.55 * domMean + 0.45 * dowMean;
            const z = (expected - overallMean) / overallStd;
            let tier = 'medio';
            if (z >= 0.45) tier = 'otimo';
            else if (z >= 0.1) tier = 'bom';
            else if (z <= -0.45) tier = 'ruim';
            else if (z <= -0.1) tier = 'fraco';

            days.push({
                day,
                dow,
                dateStr: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
                expected,
                z,
                tier,
                isPast: dateObj < new Date(last.date + 'T00:00:00'),
                isToday: dateObj.toDateString() === lastDate.toDateString()
            });
        }

        // Semanas do mês (agrupadas)
        const weeks = [];
        let current = null;
        days.forEach(d => {
            const weekNum = Math.ceil(d.day / 7);
            if (!current || current.weekNum !== weekNum) {
                current = { weekNum, days: [], score: 0 };
                weeks.push(current);
            }
            current.days.push(d);
        });
        weeks.forEach(w => {
            w.score = Utils.average(w.days.map(d => d.z));
            w.tier = w.score >= 0.35 ? 'otimo' : w.score >= 0.05 ? 'bom' : w.score <= -0.35 ? 'ruim' : 'medio';
            w.label = `${w.days[0].day}–${w.days[w.days.length - 1].day}`;
        });

        const bestDays = [...days].filter(d => d.tier === 'otimo' || d.tier === 'bom')
            .sort((a, b) => b.z - a.z)
            .slice(0, 7);
        const bestWeek = [...weeks].sort((a, b) => b.score - a.score)[0];

        return {
            year,
            month,
            monthLabel: `${this.monthNames[month]} / ${year}`,
            lastPrice: last.val,
            lastDate: last.date,
            overallMean,
            days,
            weeks,
            bestDays,
            bestWeek,
            tip: this._buildTip(bestWeek, bestDays, overallMean, last.val)
        };
    },

    /** Texto simples para o produtor. */
    _buildTip(bestWeek, bestDays, mean, lastPrice) {
        const vsMean = ((lastPrice - mean) / (mean || 1)) * 100;
        const weekTxt = bestWeek
            ? `A melhor janela tende a ser entre os dias ${bestWeek.label} (semana ${bestWeek.weekNum}).`
            : '';
        const dayTxt = bestDays.length
            ? ` Destaque para os dias ${bestDays.slice(0, 3).map(d => d.day).join(', ')}.`
            : '';
        const priceTxt = vsMean >= 5
            ? ` O preço atual está cerca de ${vsMean.toFixed(0)}% acima da média histórica deste mês — momento favorável para comercializar.`
            : vsMean <= -5
                ? ` O preço atual está cerca de ${Math.abs(vsMean).toFixed(0)}% abaixo da média deste mês — se puder, aguarde uma janela mais firme.`
                : ` O preço atual está próximo da média histórica deste mês.`;
        return weekTxt + dayTxt + priceTxt;
    },

    /** Renderiza o calendário e o resumo na aba do produtor. */
    render(historicos, mapaClima, produto) {
        const cal = this.buildSellCalendar(historicos);
        const grid = document.getElementById('prodCalendarGrid');
        const title = document.getElementById('prodCalendarTitle');
        const tip = document.getElementById('prodCalendarTip');
        const weeksEl = document.getElementById('prodWeekSummary');
        const bestEl = document.getElementById('prodBestPeriod');

        if (!cal) {
            if (title) title.textContent = 'Calendário de venda';
            if (tip) tip.textContent = 'Execute uma análise para ver o melhor período de comercialização.';
            if (grid) grid.innerHTML = '';
            return;
        }

        if (title) title.textContent = `Calendário de venda — ${cal.monthLabel}`;
        if (tip) tip.textContent = cal.tip;
        if (bestEl) {
            bestEl.innerHTML = cal.bestWeek
                ? `<strong>Melhor período:</strong> dias ${cal.bestWeek.label} de ${this.monthNames[cal.month]}`
                : '—';
        }

        if (weeksEl) {
            weeksEl.innerHTML = cal.weeks.map(w => `
                <div class="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                    <span class="text-xs text-slate-700">Semana ${w.weekNum} <span class="text-slate-400">(dias ${w.label})</span></span>
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${this._tierClass(w.tier)}">${this._tierLabel(w.tier)}</span>
                </div>
            `).join('');
        }

        if (grid) {
            const firstDow = new Date(cal.year, cal.month, 1).getDay();
            let html = this.weekDays.map(d => `<div class="text-center text-[10px] font-bold text-slate-400 py-1">${d}</div>`).join('');
            for (let i = 0; i < firstDow; i++) html += '<div></div>';
            cal.days.forEach(d => {
                const ring = d.isToday ? 'ring-2 ring-primary' : '';
                html += `
                    <div class="aspect-square rounded-lg flex flex-col items-center justify-center text-xs ${this._dayBg(d.tier)} ${ring}" title="Score ${d.z.toFixed(2)}">
                        <span class="font-bold">${d.day}</span>
                        <span class="text-[8px] opacity-80">${this._tierShort(d.tier)}</span>
                    </div>`;
            });
            grid.innerHTML = html;
        }

        // Cards simples
        const mediaEl = document.getElementById('prod-media');
        const statusEl = document.getElementById('prod-status');
        const statusDesc = document.getElementById('prod-status-desc');
        if (mediaEl) mediaEl.textContent = Utils.formatCurrency(cal.lastPrice);
        const vs = ((cal.lastPrice - cal.overallMean) / (cal.overallMean || 1)) * 100;
        if (statusEl && statusDesc) {
            if (vs >= 5) {
                statusEl.textContent = 'Bom momento';
                statusEl.className = 'text-lg font-bold text-green-700';
                statusDesc.textContent = 'Preço acima da média do mês — favorece a venda.';
            } else if (vs <= -5) {
                statusEl.textContent = 'Momento fraco';
                statusEl.className = 'text-lg font-bold text-amber-700';
                statusDesc.textContent = 'Preço abaixo da média — prefira as janelas verdes do calendário.';
            } else {
                statusEl.textContent = 'Momento estável';
                statusEl.className = 'text-lg font-bold text-slate-700';
                statusDesc.textContent = 'Preço próximo da média histórica deste mês.';
            }
        }

        // Consultor Virtual e Curiosidades
        this._updateBotAndCuriosities(historicos, mapaClima, produto);
    },

    _updateBotAndCuriosities(historicos, mapaClima, produto) {
        const botEl = document.getElementById('bot-explicacao');
        const curiositiesEl = document.getElementById('producer-curiosities');

        const prodUpper = (produto || '').toUpperCase();
        let group = 'geral';
        if (['TOMATE', 'BATATA', 'CENOURA', 'CEBOLA', 'ALHO'].some(p => prodUpper.includes(p))) group = 'hortalicas';
        if (['MAMAO', 'MELANCIA', 'UVA', 'ABACAXI', 'LIMAO', 'LARANJA', 'MACA', 'BANANA'].some(p => prodUpper.includes(p))) group = 'frutas';
        if (['ALFACE', 'REPOLHO', 'COUVE', 'RUCULA'].some(p => prodUpper.includes(p))) group = 'folhosas';
        if (['FEIJAO', 'SOJA', 'MILHO'].some(p => prodUpper.includes(p))) group = 'graos';

        if (botEl && mapaClima && historicos.length > 10) {
            const recentDates = historicos.slice(-5).map(h => h.date);
            const olderDates = historicos.slice(-10, -5).map(h => h.date);
            
            let recentTemp = 0, oldTemp = 0, rc = 0, oc = 0;
            recentDates.forEach(d => { if(mapaClima[d]) { recentTemp += mapaClima[d].temp; rc++; } });
            olderDates.forEach(d => { if(mapaClima[d]) { oldTemp += mapaClima[d].temp; oc++; } });
            
            if (rc > 0 && oc > 0) {
                recentTemp /= rc;
                oldTemp /= oc;
                const diff = recentTemp - oldTemp;
                const trend = diff > 0.5 ? 'aumentou' : (diff < -0.5 ? 'caiu' : 'se manteve estável');
                
                let groupImpact = '';
                if (group === 'hortalicas') groupImpact = 'Para raízes e hortaliças, variações bruscas podem afetar o calibre e a qualidade comercial, alterando a oferta na CEAGESP e impactando os preços de 1 a 2 semanas depois.';
                else if (group === 'frutas') groupImpact = 'Nas frutas, o calor acelera a maturação. Isso pode gerar um pico de oferta inicial (pressionando os preços para baixo), seguido de escassez caso as perdas sejam altas.';
                else if (group === 'folhosas') groupImpact = 'Folhosas são extremamente sensíveis ao calor e chuva forte. Temperaturas elevadas podem queimar as folhas, reduzindo a oferta e causando picos rápidos de preço em poucos dias.';
                else groupImpact = 'Mudanças de temperatura afetam o ciclo da planta e a logística até o terminal, gerando oscilações de preço.';

                botEl.innerHTML = `
                    <p>Olá! Analisei os dados climáticos das principais regiões produtoras de <strong>${produto}</strong>.</p>
                    <p class="mt-2">Notei que a temperatura média nos últimos dias foi de <strong>${recentTemp.toFixed(1)}ºC</strong>, o que significa que <strong>${trend}</strong> em relação à semana anterior.</p>
                    <p class="mt-2">${groupImpact}</p>
                    <p class="mt-2 text-primary font-bold">Fique de olho: acompanhe o calendário de vendas acima para escolher o melhor dia da semana para descarregar!</p>
                `;
            } else {
                botEl.innerHTML = '<p>Não há dados climáticos suficientes para esta análise no período selecionado.</p>';
            }
        }

        if (curiositiesEl) {
            const curiosidadesMap = {
                'hortalicas': [
                    'Muitas hortaliças de fruto, como o tomate, são extremamente sensíveis à amplitude térmica. Noites frias e dias quentes favorecem o rachamento dos frutos.',
                    'A batata é plantada em diferentes safras no Brasil (das águas, da seca e de inverno), o que garante oferta o ano todo na CEAGESP.'
                ],
                'frutas': [
                    'Frutas climatéricas (como banana, mamão e tomate) continuam amadurecendo após a colheita, o que exige logística rápida nos períodos de muito calor.',
                    'O Brasil é um dos três maiores produtores de frutas do mundo, e a CEAGESP movimenta uma parte gigantesca dessa riqueza.'
                ],
                'folhosas': [
                    'As folhosas têm um ciclo muito curto (em média 30 a 45 dias). Um evento climático extremo, como geada, pode zerar a oferta no mercado de um dia para o outro.',
                    'A umidade alta somada ao calor aumenta drasticamente a incidência de fungos nas folhas.'
                ],
                'geral': [
                    'A CEAGESP é o maior entreposto de alimentos da América Latina.',
                    'Acompanhar a previsão do tempo na origem é a melhor forma de prever se o mercado vai estar "firme" ou "fraco" na semana seguinte.'
                ]
            };
            const cur = curiosidadesMap[group] || curiosidadesMap['geral'];
            curiositiesEl.innerHTML = `<ul class="list-disc pl-5 space-y-2 text-sm text-slate-600">
                ${cur.map(c => `<li>${c}</li>`).join('')}
            </ul>`;
        }
    },

    _tierLabel(t) {
        return { otimo: 'Ótimo p/ vender', bom: 'Bom', medio: 'Neutro', fraco: 'Fraco', ruim: 'Evitar' }[t] || t;
    },
    _tierShort(t) {
        return { otimo: 'Ótimo', bom: 'Bom', medio: 'Ok', fraco: 'Fraco', ruim: 'Ruim' }[t] || '';
    },
    _tierClass(t) {
        return {
            otimo: 'bg-green-100 text-green-800',
            bom: 'bg-emerald-50 text-emerald-700',
            medio: 'bg-slate-100 text-slate-600',
            fraco: 'bg-amber-50 text-amber-700',
            ruim: 'bg-red-50 text-red-700'
        }[t] || 'bg-slate-100 text-slate-600';
    },
    _dayBg(t) {
        return {
            otimo: 'bg-green-500 text-white',
            bom: 'bg-green-100 text-green-900',
            medio: 'bg-slate-50 text-slate-700',
            fraco: 'bg-amber-50 text-amber-900',
            ruim: 'bg-red-50 text-red-800'
        }[t] || 'bg-slate-50';
    }
};
