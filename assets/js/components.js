
const Components = {

    atualizarSemaforo(precosFiltrados) {
        if (!precosFiltrados.length) return;

        const hoje = new Date();
        const mesAtual = hoje.getUTCMonth();

        const ultimosPrecos = precosFiltrados.slice(-30).map(p => p.val);
        const precoAtual = Utils.average(ultimosPrecos);

        const historicoMes = appState.rawPrecos.filter(p => {
            const dataP = new Date(p.data);
            return dataP.getUTCMonth() === mesAtual && dataP.getFullYear() < hoje.getFullYear();
        });

        if (historicoMes.length === 0) {
            this.renderSemaforo('neutro', 'Sem histórico suficiente', 'Ainda não temos dados de anos anteriores para comparar.');
            return;
        }

        const precoHistorico = Utils.average(historicoMes.map(p => parseFloat(p.comum)));
        const diferenca = (precoAtual - precoHistorico) / precoHistorico;

        if (diferenca > 0.10) {
            this.renderSemaforo('verde', 'Momento de Oportunidade!', `O preço atual está ${Math.round(diferenca * 100)}% ACIMA da média histórica para este mês. Bom momento para vender!`);
        } else if (diferenca < -0.10) {
            this.renderSemaforo('vermelho', 'Atenção: Preço Baixo', `O preço atual está ${Math.round(Math.abs(diferenca) * 100)}% ABAIXO do esperado para esta época.`);
        } else {
            this.renderSemaforo('amarelo', 'Mercado Estável', 'O preço está dentro da normalidade histórica para este mês.');
        }
    },

    renderSemaforo(tipo, titulo, desc) {
        const circulo = document.getElementById('semaforo-circulo');
        const icon = document.getElementById('semaforo-icon');
        const tituloEl = document.getElementById('semaforo-titulo');
        const descEl = document.getElementById('semaforo-desc');

        if (!circulo || !tituloEl) return;

        tituloEl.innerText = titulo;
        descEl.innerText = desc;

        const baseClass = "w-16 h-16 rounded-full flex items-center justify-center shadow-lg ";

        if (tipo === 'verde') {
            circulo.className = baseClass + "bg-green-500 shadow-green-200";
            icon.innerText = "trending_up";
        } else if (tipo === 'vermelho') {
            circulo.className = baseClass + "bg-red-500 shadow-red-200";
            icon.innerText = "warning";
        } else if (tipo === 'amarelo') {
            circulo.className = baseClass + "bg-amber-400 shadow-amber-200";
            icon.innerText = "remove_moderate";
        } else {
            circulo.className = "w-16 h-16 rounded-full bg-slate-300 flex items-center justify-center";
            icon.innerText = "help";
        }
    },

    gerarInsightIA(dados, pearsonTemp, pearsonChuva, ptsTemp, ptsChuva, correlacoes) {
        const insightEl = document.getElementById('ia-insight');
        if (!dados || !dados.length || !insightEl) return;

        let html = '';

        
        const recentes = dados.slice(-7);
        const anteriores = dados.slice(-14, -7);
        const mediaRecente = Utils.average(recentes.map(d => d.val));
        const mediaAnterior = anteriores.length ? Utils.average(anteriores.map(d => d.val)) : mediaRecente;
        const tendencia = mediaAnterior !== 0 ? Utils.percentualMudanca(mediaAnterior, mediaRecente) : 0;

        const prodInp = document.getElementById('prodInp').value || 'produto';

        
        html += '<div class="mb-3"><span class="font-bold text-slate-800">Tendência de Preço:</span> ';
        if (tendencia > 5) {
            html += `<span class="text-green-600">Os preços <strong>subiram ${Math.abs(tendencia).toFixed(1)}%</strong> na última semana</span>`;
        } else if (tendencia < -5) {
            html += `<span class="text-red-600">Os preços <strong>caíram ${Math.abs(tendencia).toFixed(1)}%</strong> na última semana</span>`;
        } else {
            html += `<span class="text-amber-600">Os preços têm se mantido <strong>estáveis</strong> (variação de ${Math.abs(tendencia).toFixed(1)}%)</span>`;
        }
        html += '</div>';

      
        html += '<div class="mb-3"><span class="font-bold text-slate-800">Fatores Climáticos Dominantes:</span> ';

        const corrList = Array.isArray(correlacoes) ? correlacoes : [];
        if (corrList.length === 0) {
            html += '<span class="text-slate-500">Dados insuficientes para análise climática</span>';
        } else {
            const topFactores = [...corrList].sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
            const factoresFortes = topFactores.filter(f => Math.abs(f.r) > 0.5);

            if (factoresFortes.length > 0) {
                const factor = factoresFortes[0];
                const sinal = factor.r > 0 ? 'positiva' : 'negativa';
                html += `<span class="text-blue-600">O fator <strong>${factor.nome}</strong> tem correlação ${sinal} com o preço (r=${factor.r.toFixed(2)}, ${factor.pontos} dias).</span>`;
            } else {
                html += '<span class="text-slate-500">Nenhuma correlação forte detectada (dados climáticos insuficientes ou período curto)</span>';
            }
        }
        html += '</div>';

        
        const tempStr = typeof pearsonTemp === 'number' && !isNaN(pearsonTemp)
            ? `Temperatura: r = ${pearsonTemp.toFixed(2)}` : '';
        const chuvaStr = typeof pearsonChuva === 'number' && !isNaN(pearsonChuva)
            ? `Chuva: r = ${pearsonChuva.toFixed(2)}` : '';

        if (tempStr || chuvaStr) {
            html += `<div class="mb-3"><span class="font-bold text-slate-800">Correlação Climática Rápida:</span> `;
            html += `<span class="text-slate-600">${[tempStr, chuvaStr].filter(Boolean).join(' | ')}</span></div>`;
        }

    
        html += '<div class="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">';
        html += '<span class="font-bold text-blue-900">Recomendação: </span>';

        let recomendacao;
        if (tendencia > 5) {
            recomendacao = 'Tendência de alta detectada. Considere escalonar a venda para aproveitar o momento favorável.';
        } else if (tendencia < -5) {
            recomendacao = 'Atenção às margens. Com a queda de preços, foque na redução de custos e eficiência na colheita.';
        } else {
            recomendacao = 'Mercado estável. Bom momento para planejar estratégia de médio prazo com base no histórico sazonal.';
        }
        html += `<strong>${recomendacao}</strong></div>`;

        
        html += '<div class="mt-3 text-xs text-slate-500 border-t border-slate-200 pt-2 flex flex-col gap-1">';
        const totalPontos = (ptsTemp ? ptsTemp.length : 0) + (ptsChuva ? ptsChuva.length : 0);
        const fonteClima = (window.appState && window.appState.cityClimate && window.appState.cityClimate.length > 0)
            ? `🟢 Clima das top ${window.appState.cityClimate.length} cidades produtoras (média ponderada por volume)`
            : `🟡 Base climática de reserva (CEAGESP/SP)`;
        html += `<div><strong>Fonte Climática:</strong> ${fonteClima}</div>`;
        html += `<div><strong>Amostra:</strong> ${dados.length} registros de preço | ${totalPontos} pontos climáticos cruzados</div>`;
        html += `<div class="text-[10px] text-slate-400 font-medium">Nota: As correlações climáticas refletem associações estatísticas históricas no mercado atacadista. Oferta total, sazonalidade e frete atuam simultaneamente.</div>`;
        html += '</div>';

        insightEl.innerHTML = html;
    }
};