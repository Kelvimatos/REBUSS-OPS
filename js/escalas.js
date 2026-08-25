/**
 * REBUSS OPS • Gerador de Escalas & Módulo Inteligente de Localização e Transporte
 * Identificação de Metrô, Trem, CPTM, VLT e Terminais Urbanos
 * Top 3 Estações Mais Próximas, Cálculo de Caminhada, Links Diretos e Integração Completa
 */

const EscalasModule = (() => {
  'use strict';

  const STORAGE_KEY = 'rebuss_escalas_v5';

  let selectedCity = 'São Paulo';
  let selectedUF   = 'SP';
  let selectedStationIndex = 0;
  let currentTransitResults = null; // { hasRail: boolean, stations: [...] }
  let includeStation = true;
  let searchTimer  = null;
  let activeGeocodeAbort = null;
  let geocodeCache = new Map();

  // Cores Oficiais e Metadados das Linhas por Cidade
  const LINE_DEFINITIONS = {
    // São Paulo
    '1': { label: 'Linha 1 - Azul', color: '#0066B3', textColor: '#ffffff' },
    '2': { label: 'Linha 2 - Verde', color: '#007E40', textColor: '#ffffff' },
    '3': { label: 'Linha 3 - Vermelha', color: '#EE2E24', textColor: '#ffffff' },
    '4': { label: 'Linha 4 - Amarela', color: '#FFD100', textColor: '#1e293b' },
    '5': { label: 'Linha 5 - Lilás', color: '#9B2990', textColor: '#ffffff' },
    '7': { label: 'Linha 7 - Rubi', color: '#A81B5E', textColor: '#ffffff' },
    '8': { label: 'Linha 8 - Diamante', color: '#9B1E8E', textColor: '#ffffff' },
    '9': { label: 'Linha 9 - Esmeralda', color: '#01A94D', textColor: '#ffffff' },
    '10': { label: 'Linha 10 - Turquesa', color: '#007EC1', textColor: '#ffffff' },
    '11': { label: 'Linha 11 - Coral', color: '#F04E23', textColor: '#ffffff' },
    '12': { label: 'Linha 12 - Safira', color: '#003691', textColor: '#ffffff' },
    '13': { label: 'Linha 13 - Jade', color: '#00AEEF', textColor: '#ffffff' },
    '15': { label: 'Linha 15 - Prata', color: '#64748b', textColor: '#ffffff' },
    // Rio de Janeiro
    '1-rj': { label: 'Linha 1 - Laranja', color: '#FF6600', textColor: '#ffffff' },
    '2-rj': { label: 'Linha 2 - Verde', color: '#00A859', textColor: '#ffffff' },
    '4-rj': { label: 'Linha 4 - Amarela', color: '#FFD100', textColor: '#1e293b' },
    'vlt-1': { label: 'VLT Linha 1', color: '#008080', textColor: '#ffffff' },
    'vlt-2': { label: 'VLT Linha 2', color: '#008080', textColor: '#ffffff' },
    'vlt-3': { label: 'VLT Linha 3', color: '#008080', textColor: '#ffffff' },
    'supervia': { label: 'SuperVia', color: '#005BAA', textColor: '#ffffff' },
    // Belo Horizonte
    '1-bh': { label: 'Linha 1 - Azul', color: '#005BAA', textColor: '#ffffff' },
    '2-bh': { label: 'Linha 2 - Violeta', color: '#6A0DAD', textColor: '#ffffff' },
    // Brasília
    'verde-df': { label: 'Linha Verde', color: '#007E40', textColor: '#ffffff' },
    'laranja-df': { label: 'Linha Laranja', color: '#F47920', textColor: '#ffffff' },
    // Goiânia
    'brt-go': { label: 'BRT Anhanguera', color: '#00AEEF', textColor: '#ffffff' },
    'bus': { label: 'Terminal Urbano', color: '#64748b', textColor: '#ffffff' }
  };

  // Base de Conhecimento para Identificação Precisa de Linhas
  const KNOWN_STATION_LINES = {
    // BH
    'carlos prates': '1-bh', 'calafate': '1-bh', 'gameleira': '1-bh', 'nova suíça': '1-bh', 'central': '1-bh',
    'eldorado': '1-bh', 'cidade industrial': '1-bh', 'vila oeste': '1-bh', 'lagoinha': '1-bh', 'santa tereza': '1-bh',
    'horto': '1-bh', 'santa inês': '1-bh', 'josé cândido': '1-bh', 'minas shopping': '1-bh', 'são gabriel': '1-bh',
    'primeiro de maio': '1-bh', 'waldomiro lobo': '1-bh', 'floramar': '1-bh', 'vilarinho': '1-bh',
    // DF
    'galeria': 'verde-df', '102 sul': 'verde-df', '108 sul': 'verde-df', '112 sul': 'verde-df', '114 sul': 'verde-df',
    'asa sul': 'verde-df', 'shopping': 'verde-df', 'feira': 'verde-df', 'guará': 'verde-df', 'águas claras': 'verde-df',
    'taguatinga sul': 'laranja-df', 'samambaia': 'laranja-df', 'praça do relógio': 'verde-df', 'ceilândia': 'verde-df',
    // RJ
    'carioca': '1-rj', 'cinelândia': '1-rj', 'uruguaiana': '1-rj', 'presidente vargas': '1-rj', 'central do brasil': '1-rj',
    'saens peña': '1-rj', 'são francisco xavier': '1-rj', 'afonso pena': '1-rj', 'estácio': '1-rj', 'praça onze': '1-rj',
    'catete': '1-rj', 'largo do machado': '1-rj', 'flamengo': '1-rj', 'botafogo': '1-rj', 'cardeal arcoverde': '1-rj',
    'siqueira campos': '1-rj', 'cantagalo': '1-rj', 'general osório': '1-rj', 'nossa senhora da paz': '4-rj', 'jardim de alah': '4-rj',
    'antero de quental': '4-rj', 'são conrado': '4-rj', 'jardim oceânico': '4-rj', 'maracanã': '2-rj', 'são cristóvão': '2-rj',
    'parada dos museus': 'vlt-1', 'são bento': 'vlt-1', 'candelária': 'vlt-1', 'sete de setembro': 'vlt-1', 'santos dumont': 'vlt-1',
    // SP
    'trianon': '2', 'trianon-masp': '2', 'brigadeiro': '2', 'consolação': '2', 'paulista': '4', 'faria lima': '4',
    'pinheiros': '4', 'fradique coutinho': '4', 'oscar freire': '4', 'higienópolis-mackenzie': '4', 'república': '3',
    'sé': '1', 'são bento sp': '1', 'luz': '1', 'paraiso': '1', 'ana rosa': '1', 'vila mariana': '1', 'santa cruz': '1',
    'praça da árvore': '1', 'saúde': '1', 'são judas': '1', 'conceição': '1', 'jabaquara': '1', 'barra funda': '3',
    'palmeiras-barra funda': '3', 'marechal deodoro': '3', 'santa cecília': '3', 'anhangabaú': '3', 'pedro ii': '3',
    'brás': '3', 'bresser-mooca': '3', 'belém': '3', 'tatuapé': '3', 'carrão': '3', 'penha': '3', 'vila matilde': '3',
    'guilhermina-esperança': '3', 'patriarca': '3', 'artur alvim': '3', 'corinthians-itaquera': '3', 'tamanduateí': '2',
    'sacomã': '2', 'alto do ipiranga': '2', 'santos-imigrantes': '2', 'chácara klabin': '2', 'clínicas': '2', 'santuário n. sra. de fátima-sumaré': '2',
    'vila madalena': '2', 'butantã': '4', 'são paulo-morumbi': '4', 'vila sônia': '4', 'capão redondo': '5', 'campo limpo': '5',
    'vila das belezas': '5', 'giovanni gronchi': '5', 'santo amaro': '5', 'largo treze': '5', 'adolfo pinheiro': '5',
    'alto da boa vista': '5', 'borba gato': '5', 'brooklin': '5', 'campo belo': '5', 'eucaliptos': '5', 'moema': '5', 'aacc': '5',
    'hospital são paulo': '5'
  };

  function selectCity(city, uf, buttonEl) {
    selectedCity = city;
    selectedUF   = uf;

    document.querySelectorAll('.city-tab').forEach(b => b.classList.remove('active'));
    if (buttonEl) buttonEl.classList.add('active');

    clearTransitUI();
    const addrInput = document.getElementById('escala-address');
    if (addrInput && addrInput.value.trim().length >= 4) {
      scheduleStationSearch();
    }
  }

  function scheduleStationSearch() {
    clearTimeout(searchTimer);
    const addrInput = document.getElementById('escala-address');
    if (!addrInput) return;

    const addr = addrInput.value.trim();
    if (addr.length < 4) {
      clearTransitUI();
      return;
    }
    searchTimer = setTimeout(() => searchNearbyTransit(addr), 700);
  }

  // --- Geodésica & Roteamento a Pé ---
  function calcDistM(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  // Geocodificação Robusta com Fallbacks
  async function geocodeAddress(address, city, uf) {
    const cleanAddr = address
      .replace(/\s+/g, ' ')
      .replace(/-+/g, '-')
      .replace(/,+/g, ',')
      .replace(/,\s*$/, '')
      .trim();

    const cacheKey = `${cleanAddr.toLowerCase()}|${city.toLowerCase()}|${uf.toLowerCase()}`;
    if (geocodeCache.has(cacheKey)) {
      return geocodeCache.get(cacheKey);
    }

    const queries = [
      `${cleanAddr}, ${city}, ${uf}, Brasil`,
      `${cleanAddr}, ${city}, Brasil`,
      `${cleanAddr.split(',')[0]}, ${city}, ${uf}, Brasil`
    ];

    if (activeGeocodeAbort) {
      activeGeocodeAbort.abort();
    }
    activeGeocodeAbort = new AbortController();
    const { signal } = activeGeocodeAbort;

    for (const q of queries) {
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&addressdetails=1`;
        const res = await fetch(url, {
          headers: { 'User-Agent': 'RebussOPS/3.0 (suporte@rebuss.com)', 'Accept-Language': 'pt-BR,pt;q=0.9' },
          signal
        });
        const data = await res.json();
        if (data && data.length > 0) {
          const result = {
            lat: parseFloat(data[0].lat),
            lon: parseFloat(data[0].lon),
            displayName: data[0].display_name
          };
          geocodeCache.set(cacheKey, result);
          return result;
        }
      } catch (e) {
        if (e.name === 'AbortError') throw e;
      }
    }

    // Fallback: Photon API
    try {
      const pUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(cleanAddr + ' ' + city)}&limit=1`;
      const pRes = await fetch(pUrl, { signal });
      const pData = await pRes.json();
      if (pData && pData.features && pData.features.length > 0) {
        const feat = pData.features[0];
        const result = {
          lat: feat.geometry.coordinates[1],
          lon: feat.geometry.coordinates[0],
          displayName: feat.properties.name || cleanAddr
        };
        geocodeCache.set(cacheKey, result);
        return result;
      }
    } catch (e) {
      if (e.name === 'AbortError') throw e;
    }

    throw new Error('Endereço não localizado');
  }

  // Consulta de Estações e Transporte com Overpass + Photon
  async function queryTransitAround(lat, lon, city) {
    const query = `[out:json][timeout:8];(
      node(around:10000,${lat},${lon})["railway"~"station|subway_entrance|halt|tram_stop|light_rail"];
      way(around:10000,${lat},${lon})["railway"~"station|subway_entrance|halt|tram_stop|light_rail"];
      rel(around:10000,${lat},${lon})["railway"~"station|subway_entrance|halt|tram_stop|light_rail"];
      node(around:10000,${lat},${lon})["station"~"subway|light_rail|train"];
      way(around:10000,${lat},${lon})["station"~"subway|light_rail|train"];
      node(around:6000,${lat},${lon})["amenity"="bus_station"];
      node(around:6000,${lat},${lon})["highway"="bus_station"];
      node(around:6000,${lat},${lon})["public_transport"="station"];
    );out center tags;`;

    const endpoints = [
      'https://lz4.overpass-api.de/api/interpreter',
      'https://overpass-api.de/api/interpreter'
    ];

    let rawElements = [];

    for (const ep of endpoints) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6500);
        const res = await fetch(ep, {
          method: 'POST',
          body: query,
          headers: { 'User-Agent': 'RebussOPS/3.0' },
          signal: controller.signal
        });
        clearTimeout(timer);
        const data = await res.json();
        if (data && data.elements && data.elements.length > 0) {
          rawElements = data.elements;
          break;
        }
      } catch (e) {}
    }

    // Fallback: Photon transit POIs se Overpass falhar
    if (!rawElements.length) {
      try {
        const pRes = await fetch(`https://photon.komoot.io/api/?q=estacao&lat=${lat}&lon=${lon}&limit=25`);
        const pData = await pRes.json();
        if (pData && pData.features) {
          rawElements = pData.features.map(f => ({
            lat: f.geometry.coordinates[1],
            lon: f.geometry.coordinates[0],
            tags: {
              name: f.properties.name,
              railway: f.properties.osm_value === 'station' ? 'station' : '',
              station: f.properties.osm_value === 'station' ? 'subway' : '',
              amenity: f.properties.osm_value === 'bus_station' ? 'bus_station' : ''
            }
          }));
        }
      } catch (e) {}
    }

    return rawElements;
  }

  function formatarDistancia(distanciaEmMetros) {
    if (!distanciaEmMetros || isNaN(distanciaEmMetros)) return '0 m';
    if (distanciaEmMetros < 1000) {
      return `${Math.round(distanciaEmMetros)} m`;
    }
    const km = (distanciaEmMetros / 1000).toFixed(1).replace('.', ',');
    return `${km} km`;
  }

  // Classificador e Formatador de Estação
  function processTransitElements(rawElements, storeLat, storeLon, city, uf) {
    const seen = new Set();
    const candidates = [];

    for (const el of rawElements) {
      const tags = el.tags || {};
      let name = tags.name || tags['name:pt'] || tags.alt_name || '';
      if (!name || typeof name !== 'string') continue;

      // Limpar prefixos e sufixos repetitivos
      name = name
        .replace(/^Estação\s+(de\s+Metrô\s+|Metrô\s+)?/i, '')
        .replace(/^Entrada\s+.*-\s*/i, '')
        .replace(/^Acesso\s+.*\((Estação\s+)?/i, '')
        .replace(/\)$/, '')
        .trim();

      const normalizedKey = name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (normalizedKey.length < 2 || seen.has(normalizedKey)) continue;
      seen.add(normalizedKey);

      const eLat = el.lat || (el.center && el.center.lat);
      const eLon = el.lon || (el.center && el.center.lon);
      if (!eLat || !eLon) continue;

      const straightDistM = calcDistM(storeLat, storeLon, eLat, eLon);
      const isRail = tags.railway === 'station' || tags.station === 'subway' || tags.railway === 'subway_entrance' ||
                     tags.railway === 'light_rail' || tags.station === 'light_rail' || tags.railway === 'tram_stop' ||
                     tags.station === 'train' || tags.railway === 'halt';

      const isBus = tags.amenity === 'bus_station' || tags.highway === 'bus_station' || (!isRail && tags.public_transport === 'station');

      // Classificação do Tipo e Ícone
      let typeLabel = 'Metrô';
      let icon = '🚇';
      const nameL = name.toLowerCase();

      if (tags.railway === 'light_rail' || tags.station === 'light_rail' || tags.railway === 'tram_stop' || nameL.includes('vlt')) {
        typeLabel = 'VLT';
        icon = '🚊';
      } else if (city === 'São Paulo' && (tags.operator === 'CPTM' || nameL.includes('cptm') || ['7','8','9','10','11','12','13'].includes(tags.ref))) {
        typeLabel = 'CPTM / Trem';
        icon = '🚆';
      } else if (city === 'Rio de Janeiro' && (tags.operator === 'SuperVia' || nameL.includes('supervia') || (tags.railway === 'station' && tags.station !== 'subway'))) {
        typeLabel = 'Trem (SuperVia)';
        icon = '🚆';
      } else if (isBus || nameL.includes('terminal') || nameL.includes('brt')) {
        typeLabel = city === 'Goiânia' ? 'BRT / Terminal' : 'Terminal de Ônibus';
        icon = '🚌';
      }

      // Detecção da Linha & Cor
      let lineKey = tags.ref || tags.line || tags['ref:line'] || '';
      if (!lineKey) {
        for (const [kName, kLine] of Object.entries(KNOWN_STATION_LINES)) {
          if (nameL.includes(kName)) {
            lineKey = kLine;
            break;
          }
        }
      }

      let lineInfo = LINE_DEFINITIONS[lineKey] || null;
      if (!lineInfo && typeLabel === 'VLT') lineInfo = LINE_DEFINITIONS['vlt-1'];
      if (!lineInfo && typeLabel === 'Trem (SuperVia)') lineInfo = LINE_DEFINITIONS['supervia'];
      if (!lineInfo && isBus) lineInfo = city === 'Goiânia' ? LINE_DEFINITIONS['brt-go'] : LINE_DEFINITIONS['bus'];

      // Cálculo de distância a pé e tempo estimado
      const walkFactor = 1.28; // Fator de malha viária urbana
      const walkDistKm = Number(((straightDistM * walkFactor) / 1000).toFixed(1));
      const walkMin = Math.max(1, Math.round((walkDistKm / 4.8) * 60));

      candidates.push({
        name,
        typeLabel,
        icon,
        isRail,
        isBus,
        straightDistM,
        walkDistKm,
        walkMin,
        lat: eLat,
        lon: eLon,
        lineInfo
      });
    }

    // Ordenar rigorosamente pela distância real do endereço (menor para maior)
    const railStations = candidates
      .filter(c => c.isRail && c.straightDistM <= 15000)
      .sort((a, b) => a.straightDistM - b.straightDistM);

    const busStations = candidates
      .filter(c => c.isBus && c.straightDistM <= 10000)
      .sort((a, b) => a.straightDistM - b.straightDistM);

    if (railStations.length > 0) {
      return {
        hasRail: true,
        stations: railStations.slice(0, 3),
        totalFound: railStations.length
      };
    } else {
      return {
        hasRail: false,
        stations: busStations.slice(0, 3),
        totalFound: busStations.length
      };
    }
  }

  // Fluxo Principal de Busca
  async function searchNearbyTransit(address) {
    setLoading(true);
    hideAllTransitFeedback();
    currentTransitResults = null;
    selectedStationIndex = 0;

    try {
      const geo = await geocodeAddress(address, selectedCity, selectedUF);
      const rawElements = await queryTransitAround(geo.lat, geo.lon, selectedCity);
      const result = processTransitElements(rawElements, geo.lat, geo.lon, selectedCity, selectedUF);

      currentTransitResults = result;

      if (!result.stations || result.stations.length === 0) {
        showError('Não foram localizadas estações de metrô ou transporte próximas a este endereço.');
      } else {
        renderTransitCards(result, address);
        if (!result.hasRail) {
          const noRailEl = document.getElementById('escala-transit-no-rail');
          if (noRailEl) noRailEl.classList.remove('hide');
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        showError('Não foi possível localizar o endereço para determinar as estações mais próximas. Verifique o endereço ou selecione a cidade correta.');
      }
    } finally {
      setLoading(false);
    }
  }

  // --- Renderização dos Cards ---
  function renderTransitCards(result, address) {
    const container = document.getElementById('escala-transit-cards');
    if (!container) return;

    container.innerHTML = '';
    const medals = [
      { title: '1ª mais próxima', medal: '🥇', rankClass: 'rank-1' },
      { title: '2ª mais próxima', medal: '🥈', rankClass: 'rank-2' },
      { title: '3ª mais próxima', medal: '🥉', rankClass: 'rank-3' }
    ];

    result.stations.forEach((st, idx) => {
      const rank = medals[idx] || medals[2];
      const isSelected = idx === selectedStationIndex;
      const distFormatted = formatarDistancia(st.straightDistM);

      const originAddr = `Estacao ${st.name}, ${selectedCity} - ${selectedUF}`;
      const destAddr = `${address}, ${selectedCity} - ${selectedUF}`;
      const directionsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(originAddr)}&destination=${encodeURIComponent(destAddr)}&travelmode=walking`;
      const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(st.name + ' ' + selectedCity + ' ' + selectedUF)}`;

      let lineBadgeHtml = '';
      if (st.lineInfo) {
        lineBadgeHtml = `<span class="transit-line-badge" style="background:${st.lineInfo.color}; color:${st.lineInfo.textColor || '#fff'}">${escHtml(st.lineInfo.label)}</span>`;
      }

      const card = document.createElement('div');
      card.className = `transit-station-card ${isSelected ? 'selected' : ''}`;
      card.dataset.stationIdx = idx;

      card.innerHTML = `
        <div class="transit-card-top">
          <div class="transit-rank-badge ${rank.rankClass}">
            <span class="rank-medal">${rank.medal}</span>
            <span class="rank-title">${rank.title}</span>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            <span class="transit-type-tag">${escHtml(st.typeLabel)}</span>
            ${isSelected ? '<span class="transit-selected-tag">Selecionada</span>' : ''}
          </div>
        </div>

        <div class="transit-station-main">
          <div class="transit-station-name-row">
            <span class="transit-icon">${st.icon}</span>
            <strong class="transit-station-name">${idx + 1}. Estação ${escHtml(st.name)} — ${distFormatted}</strong>
          </div>
          ${lineBadgeHtml}
        </div>

        <div class="transit-metrics-row">
          <div class="transit-metric" title="Distância calculada até o endereço">
            <span class="metric-icon">📏</span>
            <span class="metric-val">~${distFormatted}</span>
          </div>
          <div class="transit-metric" title="Tempo estimado caminhando">
            <span class="metric-icon">⏱️</span>
            <span class="metric-val">~${st.walkMin} min a pé</span>
          </div>
        </div>

        <div class="transit-card-actions">
          <a href="${directionsUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-primary btn-transit-action" title="Abrir trajeto no Google Maps" onclick="event.stopPropagation()">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="3 11 22 2 13 21 11 13 3 11"></polygon>
            </svg>
            Como chegar
          </a>
          <a href="${mapUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-secondary btn-transit-action" title="Ver no Google Maps" onclick="event.stopPropagation()">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon>
              <line x1="8" y1="2" x2="8" y2="18"></line>
              <line x1="16" y1="6" x2="16" y2="22"></line>
            </svg>
            Ver no mapa
          </a>
        </div>
      `;

      card.addEventListener('click', () => {
        selectedStationIndex = idx;
        renderTransitCards(currentTransitResults, address);
        App.playSound && App.playSound('copy');
      });

      container.appendChild(card);
    });

    if (result.stations.length < 3 && result.stations.length > 0) {
      const notice = document.createElement('div');
      notice.className = 'transit-notice-count';
      notice.style.fontSize = '0.82rem';
      notice.style.color = 'var(--text-muted)';
      notice.style.padding = '6px 10px';
      notice.style.marginTop = '4px';
      notice.style.background = 'var(--bg-card-subtle)';
      notice.style.borderRadius = 'var(--radius-sm)';
      notice.style.border = '1px dashed var(--border)';
      notice.innerHTML = `ℹ️ Foram localizadas apenas ${result.stations.length} estação(ões) próxima(s) nesta região.`;
      container.appendChild(notice);
    }

    container.classList.remove('hide');
  }

  // --- Helpers de UI ---
  function setLoading(on) {
    const el = document.getElementById('escala-transit-loading');
    if (el) el.classList.toggle('hide', !on);
  }

  function showError(msg) {
    const el = document.getElementById('escala-station-error');
    if (el) {
      el.textContent = msg;
      el.classList.remove('hide');
    }
  }

  function hideAllTransitFeedback() {
    const cards = document.getElementById('escala-transit-cards');
    const noRail = document.getElementById('escala-transit-no-rail');
    const err = document.getElementById('escala-station-error');
    if (cards) cards.classList.add('hide');
    if (noRail) noRail.classList.add('hide');
    if (err) err.classList.add('hide');
  }

  function clearTransitUI() {
    setLoading(false);
    hideAllTransitFeedback();
    currentTransitResults = null;
    selectedStationIndex = 0;
  }

  function toggleStation() {
    includeStation = !includeStation;
    const t = document.getElementById('escala-station-toggle');
    if (t) t.classList.toggle('on', includeStation);
  }

  function saudacao() {
    const h = new Date().getHours();
    return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  }

  function weekdayName(i) {
    return ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'][i];
  }

  function escHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmtDate(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}`;
  }

  function getActiveUserSignature() {
    let name = '';

    // 1. Tenta obter do AuthModule
    if (window.AuthModule && typeof window.AuthModule.getCurrentUser === 'function') {
      const authUser = window.AuthModule.getCurrentUser();
      if (authUser && authUser.nome) {
        name = authUser.nome.trim();
      }
    }

    // 2. Tenta obter do App.getCurrentUser / getActiveUser
    if (!name && window.App && typeof window.App.getCurrentUser === 'function') {
      const u = window.App.getCurrentUser();
      if (u && (u.name || u.displayName)) {
        name = (u.name || u.displayName).trim();
      }
    }

    // 3. Tenta obter do localStorage
    if (!name) {
      try {
        const localUser = JSON.parse(localStorage.getItem('rebuss_user') || 'null');
        if (localUser && (localUser.nome || localUser.name)) {
          name = (localUser.nome || localUser.name).trim();
        }
      } catch (e) {}
    }

    // Fallback se não logado ou nome genérico
    if (!name || name.toLowerCase() === 'usuário' || name.toLowerCase() === 'usuario') {
      name = 'Equipe';
    }

    // Extrai o primeiro nome para a assinatura amigável (ex: Kelvi Matos -> Kelvi)
    const firstName = name.split(/\s+/)[0];

    // Se o nome já termina ou contém 'rebuss', preserva sem duplicar
    if (/rebuss$/i.test(name) || /rebuss$/i.test(firstName)) {
      return name;
    }

    return `${firstName} Rebuss`;
  }

  // --- Geração da Mensagem Final ---
  function generate() {
    const dt = document.getElementById('escala-date').value;
    const tm = document.getElementById('escala-time').value;
    const st = document.getElementById('escala-store').value.trim();
    const ad = document.getElementById('escala-address').value.trim();
    const ar = document.getElementById('escala-arrival').value.trim();
    const ob = document.getElementById('escala-obs').value.trim();
    const signature = getActiveUserSignature();

    if (!dt || !tm || !st || !ad) {
      App.showToast('Preencha os campos de Data, Horário, Loja e Endereço.', '⚠️');
      return;
    }

    const [yyyy, mm, dd] = dt.split('-');
    const dateObj = new Date(yyyy, mm - 1, dd);
    const dateStr = `${dd}/${mm}/${yyyy}`;
    const wd = weekdayName(dateObj.getDay());

    let stationInfoText = '';
    let selectedStationData = null;

    if (includeStation && currentTransitResults && currentTransitResults.stations && currentTransitResults.stations.length > 0) {
      const activeSt = currentTransitResults.stations[selectedStationIndex] || currentTransitResults.stations[0];
      selectedStationData = activeSt;
      const lineStr = activeSt.lineInfo ? ` (${activeSt.lineInfo.label})` : '';
      const directionsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent('Estacao ' + activeSt.name + ', ' + selectedCity + ' - ' + selectedUF)}&destination=${encodeURIComponent(ad + ', ' + selectedCity + ' - ' + selectedUF)}&travelmode=walking`;

      const distStr = formatarDistancia(activeSt.straightDistM);
      stationInfoText = `\n${activeSt.icon} *Estação mais próxima:* ${activeSt.name}${lineStr} — ${distStr}\n⏱️ *Tempo estimado:* ~${activeSt.walkMin} min a pé\n🗺️ *Como chegar:* ${directionsUrl}`;
    }

    const arrivalInfoText = ar
      ? `\n🔗 *Link do Local (Maps):* ${ar}`
      : '';
    const obsInfoText = ob ? `\n📝 ${ob}` : '';

    const text =
`${saudacao()}! Segue sua escala:

📅 *${dateStr}* (${wd}) às *${tm}*
🏪 *${st}*
📍 ${ad} – ${selectedCity}/${selectedUF}${stationInfoText}${arrivalInfoText}${obsInfoText}

Confirma presença? ✅

_${signature}_`;

    document.getElementById('escala-preview').textContent = text;

    const historyEntry = {
      dt, tm, store: st, address: ad, city: selectedCity, uf: selectedUF,
      obs: ob, arrival: ar, text, station: selectedStationData ? { ...selectedStationData } : null,
      createdAt: new Date().toISOString()
    };

    saveToHistory(historyEntry);
    syncEscalaToAPI(historyEntry);

    renderHistory();
    App.showToast('Escala gerada com sucesso!', '✓');
    App.playSound('copy');
  }

  async function syncEscalaToAPI(entry) {
    if (!window.RebussAPI) return;
    try {
      // 1. Localizar ou criar Loja no banco PostgreSQL
      const lojas = await RebussAPI.lojas.list({ busca: entry.store });
      let loja = lojas.find(l => l.nome.toLowerCase() === entry.store.toLowerCase());
      if (!loja) {
        loja = await RebussAPI.lojas.create({
          nome: entry.store,
          endereco: entry.address || null,
          cidade: entry.city || null,
          estado: entry.uf || null
        });
      }
      // 2. Criar Escala no PostgreSQL
      await RebussAPI.escalas.create({
        lojaId: loja.id,
        data: entry.dt,
        horario: entry.tm,
        observacoes: entry.obs || null,
        status: 'ABERTA'
      });
      console.log('✅ Escala sincronizada no PostgreSQL');
    } catch (err) {
      console.warn('ℹ️ Escala salva localmente (banco indisponível ou offline):', err.message);
    }
  }

  async function copyText() {
    const text = document.getElementById('escala-preview').textContent.trim();
    if (!text) {
      App.showToast('Gere a mensagem primeiro.', '⚠️');
      return;
    }

    await App.copyToClipboard(text);
    App.playSound('copy');
    App.showToast('Mensagem copiada!', '📋');
  }

  // --- Histórico ---
  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; }
  }

  function saveToHistory(entry) {
    const h = loadHistory();
    const isDupe = h.some(x => x.store === entry.store && x.dt === entry.dt && x.tm === entry.tm);
    if (!isDupe) {
      h.unshift({ ...entry, id: Date.now() });
      if (h.length > 50) h.length = 50;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(h));
    }
  }

  function deleteEntry(id) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(loadHistory().filter(h => h.id !== id)));
    renderHistory();
    App.showToast('Escala removida.', '🗑');
  }

  function clearAll() {
    if (!loadHistory().length) return;
    if (confirm('Apagar todo o histórico de escalas?')) {
      localStorage.removeItem(STORAGE_KEY);
      renderHistory();
      App.showToast('Histórico limpo.', '✓');
    }
  }

  function renderHistory() {
    const history = loadHistory();
    const countEl = document.getElementById('escala-history-count');
    const container = document.getElementById('escala-history-list');

    if (countEl) countEl.textContent = history.length;
    if (!container) return;

    if (!history.length) {
      container.innerHTML = `
        <div style="text-align:center; padding: 24px 16px; color: var(--text-muted); font-size: 0.85rem;">
          Nenhuma escala no histórico.<br>Preencha os dados e gere a primeira acima.
        </div>
      `;
      return;
    }

    container.innerHTML = history.map(h => {
      const stTxt = h.station
        ? `<div style="font-size:0.78rem; color:var(--primary); font-weight:600; margin-bottom:6px;">${h.station.icon || '🚇'} ${escHtml(h.station.name)} · ~${h.station.walkDistKm || ''} km (~${h.station.walkMin || ''} min a pé)</div>`
        : '';
      const cityTag = h.city ? ` · ${h.city}` : '';

      return `
        <div class="history-item">
          <div class="history-item-top">
            <span class="history-item-store">${escHtml(h.store)}</span>
            <span class="history-item-date">${fmtDate(h.dt)} ${h.tm}</span>
          </div>
          <div style="font-size:0.78rem; color:var(--text-muted); margin-bottom:4px;">${escHtml((h.address || '').substring(0, 38))}${(h.address || '').length > 38 ? '…' : ''}${cityTag}</div>
          ${stTxt}
          <div style="display:flex; gap:6px; margin-top:8px;">
            <button class="btn btn-sm btn-primary" onclick="EscalasModule.copyHistoryItem(${h.id})">Copiar</button>
            <button class="btn btn-sm btn-secondary" onclick="EscalasModule.viewHistoryItem(${h.id})">Ver</button>
            <button class="btn btn-sm btn-danger" style="margin-left:auto;" onclick="EscalasModule.deleteEntry(${h.id})">Excluir</button>
          </div>
        </div>
      `;
    }).join('');
  }

  function copyHistoryItem(id) {
    const h = loadHistory().find(x => x.id === id);
    if (h) {
      App.copyToClipboard(h.text).then(() => {
        App.playSound('copy');
        App.showToast('Escala copiada!', '📋');
      });
    }
  }

  function viewHistoryItem(id) {
    const h = loadHistory().find(x => x.id === id);
    if (!h) return;
    document.getElementById('modal-escala-title').textContent = `${h.store} — ${fmtDate(h.dt)}`;
    document.getElementById('modal-escala-msg').textContent = h.text;
    document.getElementById('modal-escala-overlay').classList.add('open');
  }

  function render() {
    const activeInfo = document.getElementById('escala-active-user-info');
    if (activeInfo) {
      activeInfo.textContent = `Gerando escala como: ${getActiveUserSignature()}`;
    }

    const dateInput = document.getElementById('escala-date');
    if (dateInput && !dateInput.value) {
      dateInput.value = new Date().toISOString().split('T')[0];
    }

    renderHistory();
  }

  function bindEvents() {
    document.querySelectorAll('.city-tab').forEach(btn => {
      btn.addEventListener('click', function() {
        const city = this.getAttribute('data-city');
        const uf = this.getAttribute('data-uf');
        selectCity(city, uf, this);
      });
    });

    const addr = document.getElementById('escala-address');
    if (addr) addr.addEventListener('input', scheduleStationSearch);

    const toggle = document.getElementById('escala-station-toggle-row');
    if (toggle) toggle.addEventListener('click', toggleStation);

    const btnGen = document.getElementById('btn-escala-generate');
    const btnCopy = document.getElementById('btn-escala-copy');
    const btnClearAll = document.getElementById('btn-escala-clear-all');

    if (btnGen) btnGen.addEventListener('click', generate);
    if (btnCopy) btnCopy.addEventListener('click', copyText);
    if (btnClearAll) btnClearAll.addEventListener('click', clearAll);

    const btnModalCopy = document.getElementById('btn-modal-escala-copy');
    if (btnModalCopy) {
      btnModalCopy.addEventListener('click', () => {
        const msg = document.getElementById('modal-escala-msg').textContent;
        App.copyToClipboard(msg).then(() => {
          App.playSound('copy');
          App.showToast('Mensagem copiada!', '📋');
          document.getElementById('modal-escala-overlay').classList.remove('open');
        });
      });
    }
  }

  function init() {
    bindEvents();
    render();
  }

  document.addEventListener('DOMContentLoaded', init);

  return {
    init,
    render,
    generate,
    copyText,
    copyHistoryItem,
    viewHistoryItem,
    deleteEntry,
    clearAll
  };
})();

window.EscalasModule = EscalasModule;
