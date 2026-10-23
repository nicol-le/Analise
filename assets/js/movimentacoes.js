/**
 * Movimentacoes — Módulo de inteligência de mercado a partir das tabelas:
 * - ceagesp_movimentacoes (volumes reais diários por permissionário, produto, variedade e município)
 * - ceagesp_municipios (enriquecimento com UF, mesorregião, microrregião e IBGE)
 */

const Movimentacoes = (() => {

    /**
     * Processa os dados brutos e gera as estatísticas e gráficos.
     * @param {Array} movData - Registros de ceagesp_movimentacoes
     * @param {Array} historicosPreco - Array de { date: 'YYYY-MM-DD', val: float }
     * @param {Map} munMap - Map normalizado de ceagesp_municipios
     * @param {string} produto - Nome do produto atual
     */
    function render(movData, historicosPreco, munMap, produto) {
        const container = document.getElementById('panel-movimentacoes');
        if (!container) return;

        if (!movData || movData.length === 0) {
            container.classList.add('hidden');
            return;
        }

        container.classList.remove('hidden');

        // Normalização de números e datas
        const cleanRows = movData.map(r => ({
            data: r.dt_movmto,
            toneladas: parseFloat(r.vl_tonelada) || 0,
            municipio: (r.ds_municipio || '').trim(),
            estado: (r.descricao_estado || '').trim(),
            variedade: (r.ds_variedade || 'Padrão').trim(),
            permis: (r.nm_permis || 'Não informado').trim()
        })).filter(r => r.toneladas > 0 && r.data);

        if (!cleanRows.length) {
            container.classList.add('hidden');
            return;
        }

        // 1. KPIs Gerais
        const totalTon = cleanRows.reduce((acc, r) => acc + r.toneladas, 0);
        const permisSet = new Set(cleanRows.map(r => r.permis));
        const munSet = new Set(cleanRows.map(r => r.municipio));

        _setTxt('mov-total-volume', `${totalTon.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} t`);
        _setTxt('mov-total-permis', permisSet.size.toLocaleString('pt-BR'));
        _setTxt('mov-total-mun', munSet.size.toLocaleString('pt-BR'));

        // Variedade líder
        const varTotals = {};
        cleanRows.forEach(r => {
            varTotals[r.variedade] = (varTotals[r.variedade] || 0) + r.toneladas;
        });
        const sortedVars = Object.entries(varTotals).sort((a, b) => b[1] - a[1]);
        const topVarName = sortedVars[0] ? sortedVars[0][0] : '—';
        const topVarPct = sortedVars[0] && totalTon > 0 ? ((sortedVars[0][1] / totalTon) * 100).toFixed(0) : 0;
        _setTxt('mov-top-var', `${topVarName} (${topVarPct}%)`);

        // 2. Gráfico 1: Oferta × Preço (Dois Eixos - Volume Diário vs. Preço Diário)
        _renderOfertaVsPreco(cleanRows, historicosPreco);

        // 3. Gráfico 2: Top 10 Permissionários / Comercializadores
        _renderTopPermissionarios(cleanRows, totalTon);

        // 4. Gráfico 3: Mix de Variedades Comercializadas
        _renderMixVariedades(sortedVars, totalTon);

        // 5. Gráfico 4: Distribuição por Mesorregião / UF
        _renderMesorregioes(cleanRows, munMap, totalTon);

        // 6. Tabela de comercializadores
        _renderTable(cleanRows, totalTon);
    }

    function _setTxt(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    /**
     * Gráfico de dois eixos cruzando volume de entrada diário em toneladas com preço médio CEAGESP.
     */
    function _renderOfertaVsPreco(cleanRows, historicosPreco) {
        // Agrupa volume por data
        const volByDate = {};
        cleanRows.forEach(r => {
            volByDate[r.data] = (volByDate[r.data] || 0) + r.toneladas;
        });

        // Agrupa preço por data
        const precoByDate = {};
        (historicosPreco || []).forEach(p => {
            precoByDate[p.date] = p.val;
        });

        // Datas unificadas e ordenadas
        const allDates = Array.from(new Set([...Object.keys(volByDate), ...Object.keys(precoByDate)])).sort();

        // Limita a exibição se houver muitas datas para visualização limpa
        const datesToRender = allDates.filter(d => volByDate[d] !== undefined || precoByDate[d] !== undefined);

        const labels = datesToRender;
        const volumeData = datesToRender.map(d => volByDate[d] !== undefined ? parseFloat(volByDate[d].toFixed(1)) : null);
        const precoData = datesToRender.map(d => precoByDate[d] !== undefined ? parseFloat(precoByDate[d].toFixed(2)) : null);

        if (typeof Charts.updateDualAxisChart === 'function') {
            Charts.updateDualAxisChart(
                'chOfertaPreco',
                labels,
                volumeData,
                'Volume Entrado (t)',
                precoData,
                'Preço Comum (R$)',
                'Data',
                'Preço (R$)',
                'Volume (Toneladas)'
            );
        }

        const descEl = document.getElementById('statOfertaPreco');
        if (descEl) {
            descEl.textContent = `Acompanhamento sincronizado entre a entrada diária de cargas (t) e a formação do preço médio na CEAGESP no período.`;
        }
    }

    /**
     * Gráfico de barras horizontais com os Top 10 Permissionários.
     */
    function _renderTopPermissionarios(cleanRows, totalTon) {
        const byPermis = {};
        cleanRows.forEach(r => {
            byPermis[r.permis] = (byPermis[r.permis] || 0) + r.toneladas;
        });

        const sorted = Object.entries(byPermis).sort((a, b) => b[1] - a[1]).slice(0, 10);
        // Nomes formatados com abreviação amigável
        const labels = sorted.map(([name]) => {
            return name.length > 25 ? name.substring(0, 23) + '...' : name;
        });
        const data = sorted.map(([, vol]) => parseFloat(vol.toFixed(1)));

        // Concentração dos Top 5
        const top5Vol = sorted.slice(0, 5).reduce((acc, [, v]) => acc + v, 0);
        const top5Pct = totalTon > 0 ? ((top5Vol / totalTon) * 100).toFixed(1) : '0';
        _setTxt('statTopPermis', `Os 5 maiores comercializadores concentram ${top5Pct}% de todo o volume comercializado.`);

        if (typeof Charts.updateHorizontalBarChart === 'function') {
            Charts.updateHorizontalBarChart(
                'chTopPermis',
                labels,
                data,
                'Volume Comercializado (t)',
                'Comercializador / Empresa',
                '#8B0000'
            );
        }
    }

    /**
     * Gráfico de Rosca para o Mix de Variedades.
     */
    function _renderMixVariedades(sortedVars, totalTon) {
        // Pega top 6 variedades e agrupa as demais em "Outras"
        const topVars = sortedVars.slice(0, 6);
        const otherVol = sortedVars.slice(6).reduce((acc, [, v]) => acc + v, 0);

        const labels = topVars.map(([name]) => name);
        const data = topVars.map(([, v]) => parseFloat(v.toFixed(1)));

        if (otherVol > 0) {
            labels.push('Outras');
            data.push(parseFloat(otherVol.toFixed(1)));
        }

        if (typeof Charts.updateDoughnutChart === 'function') {
            Charts.updateDoughnutChart('chMixVariedades', labels, data);
        }

        const statEl = document.getElementById('statMixVariedades');
        if (statEl && sortedVars[0]) {
            statEl.textContent = `A variedade "${sortedVars[0][0]}" lidera com ${((sortedVars[0][1] / totalTon) * 100).toFixed(1)}% do volume total.`;
        }
    }

    /**
     * Gráfico de barras com distribuição de volume por Mesorregião / Estado produtor.
     */
    function _renderMesorregioes(cleanRows, munMap, totalTon) {
        const byRegion = {};
        const normalize = s => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();

        cleanRows.forEach(r => {
            const normMun = normalize(r.municipio);
            const meta = munMap ? munMap.get(normMun) : null;
            let regionKey = 'Não Regionalizado';

            if (meta && meta.mesorregiao) {
                regionKey = `${meta.mesorregiao} (${meta.uf || r.estado})`;
            } else if (r.estado) {
                regionKey = `Estado: ${r.estado}`;
            }

            byRegion[regionKey] = (byRegion[regionKey] || 0) + r.toneladas;
        });

        const sorted = Object.entries(byRegion).sort((a, b) => b[1] - a[1]).slice(0, 8);
        const labels = sorted.map(([name]) => name.length > 28 ? name.substring(0, 26) + '...' : name);
        const data = sorted.map(([, v]) => parseFloat(v.toFixed(1)));

        if (typeof Charts.updateHorizontalBarChart === 'function') {
            Charts.updateHorizontalBarChart(
                'chMesorregioes',
                labels,
                data,
                'Volume (t)',
                'Mesorregião de Origem',
                '#2563eb'
            );
        }

        const statEl = document.getElementById('statMesorregioes');
        if (statEl && sorted[0]) {
            const pct = totalTon > 0 ? ((sorted[0][1] / totalTon) * 100).toFixed(1) : '0';
            statEl.textContent = `Origem líder: ${sorted[0][0]} com ${pct}% do abastecimento.`;
        }
    }

    /**
     * Tabela detalhada de permissionários e cidades
     */
    function _renderTable(cleanRows, totalTon) {
        const tbody = document.getElementById('movTableBody');
        if (!tbody) return;

        // Agrupa por permissionário + variedade + município
        const grouped = {};
        cleanRows.forEach(r => {
            const key = `${r.permis}|${r.variedade}|${r.municipio}`;
            if (!grouped[key]) {
                grouped[key] = {
                    permis: r.permis,
                    variedade: r.variedade,
                    municipio: r.municipio,
                    estado: r.estado,
                    volume: 0
                };
            }
            grouped[key].volume += r.toneladas;
        });

        const rows = Object.values(grouped).sort((a, b) => b.volume - a.volume).slice(0, 50);

        tbody.innerHTML = rows.map(r => {
            const pct = totalTon > 0 ? ((r.volume / totalTon) * 100).toFixed(2) : '0.00';
            return `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="p-3 font-semibold text-slate-800">${r.permis}</td>
                    <td class="p-3 text-slate-600">${r.variedade}</td>
                    <td class="p-3 text-slate-600">${r.municipio} <span class="text-[10px] text-slate-400">(${r.estado})</span></td>
                    <td class="p-3 text-right font-mono font-bold text-primary">${r.volume.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} t</td>
                    <td class="p-3 text-right font-mono text-slate-600">${pct}%</td>
                </tr>
            `;
        }).join('');
    }

    return { render };
})();
