const OrigemMap = {
    map: null,
    markersGroup: null,
    heatLayer: null,

    init() {
        if (this.map) return;
        this.map = L.map('map-container').setView([-14.235, -51.9253], 4);
        window.appMap = this.map;
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
            subdomains: 'abcd', maxZoom: 20
        }).addTo(this.map);
        this.markersGroup = L.layerGroup().addTo(this.map);
        this.addLegend();
    },

    addLegend() {
        const legendDiv = document.createElement('div');
        legendDiv.innerHTML = '<div style="background: white; padding: 6px; font-size: 12px; width: 180px; border-radius: 6px; box-shadow: 0 2px 6px rgba(0,0,0,0.2);">' +
            '<span style="font-weight:bold; margin-right: 4px;">Legenda de Tiers</span>' +
            '<i style="background:#8b0000;color:#fff;padding:2px 4px;margin:2px 0;border-radius:3px;">Ruim</i> Preços baixos, mercado fraco<br>' +
            '<i style="background:#ff7800;padding:2px 4px;margin:2px 0;border-radius:3px;">Fraco</i> Oferta reduzida<br>' +
            '<i style="background:#ffbf00;padding:2px 4px;margin:2px 0;border-radius:3px;">Ok (medio)</i> Preço médio, volatilidade normal<br>' +
            '<i style="background:#a7ff00;padding:2px 4px;margin:2px 0;border-radius:3px;">Bom</i> Boa época para vender<br>' +
            '<i style="background:#00a859;padding:2px 4px;margin:2px 0;border-radius:3px;">Ótimo</i> Excelente momento, alta demanda<br>' +
            '<i style="background:#ccc;padding:2px 4px;margin:2px 0;border-radius:3px;">Off</i> Dia sem comercialização na CEAGESP' +
        '</div>';
        legendDiv.style.cssText = 'background: white; padding: 6px; font-size: 12px; width: 180px; border-radius: 6px; box-shadow: 0 2px 6px rgba(0,0,0,0.2); position: absolute; top: 10px; right: 10px;';
        legendDiv.title = 'Legenda de tiers de preço';
        this.map.getContainer().appendChild(legendDiv);
    },

    update(cities) {
        this.init();
        this.markersGroup.clearLayers();
        if (this.heatLayer) {
            this.map.removeLayer(this.heatLayer);
            this.heatLayer = null;
        }

        const points = (cities || []).filter(city => Number.isFinite(city.latitude) && Number.isFinite(city.longitude));
        if (!points.length) {
            this.map.setView([-14.235, -51.9253], 4);
            return;
        }

        const total = points.reduce((sum, city) => sum + city.volume, 0);
        const maxVolume = Math.max(...points.map(city => city.volume), 1);
        if (L.heatLayer) {
            this.heatLayer = L.heatLayer(points.map(city => [city.latitude, city.longitude, city.volume / maxVolume]), {
                radius: 36, blur: 26, maxZoom: 8, minOpacity: 0.3,
                gradient: { 0.2: '#fbbf24', 0.55: '#f97316', 1: '#8b0000' }
            }).addTo(this.map);
        }

        points.forEach(city => {
            const share = total ? ((city.volume / total) * 100).toFixed(1) : '0.0';
            const circle = L.circleMarker([city.latitude, city.longitude], {
                radius: 8 + 26 * Math.sqrt(city.volume / maxVolume),
                fillColor: '#8b0000', color: '#610000', weight: 1.5, opacity: 0.85, fillOpacity: 0.62
            });
            circle.bindPopup(`
                <div class="p-2 font-[Inter] text-slate-800" style="min-width: 210px;">
                    <h4 class="font-bold text-sm text-primary mb-1 border-b border-slate-100 pb-1">${city.municipio} - ${city.uf}</h4>
                    <p class="text-xs"><strong>Volume:</strong> ${city.volume.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} t (${share}%)</p>
                    <p class="text-[10px] text-slate-500 mt-1">Intensidade proporcional ao volume registrado.</p>
                </div>`, { closeButton: false });
            circle.on('mouseover', function () { this.setStyle({ fillOpacity: 0.9, weight: 2.5 }); });
            circle.on('mouseout', function () { this.setStyle({ fillOpacity: 0.62, weight: 1.5 }); });
            this.markersGroup.addLayer(circle);
        });
        this.map.fitBounds(L.latLngBounds(points.map(city => [city.latitude, city.longitude])), { padding: [50, 50] });
    }
};
