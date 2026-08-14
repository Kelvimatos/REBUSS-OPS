/**
 * REBUSS OPS • Gerador de Escalas
 * Integração com Usuário Ativo (Sem digitação manual de nome), Nominatim, Overpass API e Histórico
 */

const EscalasModule = (() => {
  'use strict';

  const STORAGE_KEY = 'rebuss_escalas_v4';

  let selectedCity = 'São Paulo';
  let selectedUF   = 'SP';
  let stationData  = null;
  let includeStation = true;
  let searchTimer  = null;

  const RADIUS_M = 30000;

  const LINE_COLORS = {
    // SP Metrô
    '1': '#0066B3', '2': '#007E40', '3': '#EE2E24',
    '4': '#FFDD00', '5': '#9B2990', '15': '#F37021',
    // SP CPTM
    '7': '#F47920', '8': '#9B1E8E', '9': '#01A94D',
    '10': '#007EC1', '11': '#F04E23', '12': '#003691', '13': '#00AEEF',
    // RJ Metrô
    '1-rj': '#E8A000', '2-rj': '#E8003D', '3-rj': '#7B2D8B',
    // BH CBTU/Metrô
    '1-bh': '#005BAA',
    // Brasília Metrô
    'laranja': '#F47920', 'verde': '#007E40',
    // Goiânia BRT/Rede
    'brt': '#00AEEF'
  };

  function lineColor(ref, city) {
    if (!ref) return '#38bdf8';
    const key = ref + (city === 'Rio de Janeiro' ? '-rj' : city === 'Belo Horizonte' ? '-bh' : '');
    return LINE_COLORS[key] || LINE_COLORS[ref] || '#38bdf8';
  }

  function selectCity(city, uf, buttonEl) {
    selectedCity = city;
    selectedUF   = uf;

    document.querySelectorAll('.city-tab').forEach(b => b.classList.remove('active'));
    if (buttonEl) buttonEl.classList.add('active');

    clearStationUI();
    stationData = null;

    const addrInput = document.getElementById('escala-address');
    if (addrInput && addrInput.value.trim().length >= 6) {
      scheduleStationSearch();
    }
  }

  function scheduleStationSearch() {
    clearTimeout(searchTimer);
    const addrInput = document.getElementById('escala-address');
    if (!addrInput) return;

    const addr = addrInput.value.trim();
    if (addr.length < 6) {
      clearStationUI();
      return;
    }
    searchTimer = setTimeout(() => findNearestStation(addr), 900);
  }

  async function findNearestStation(address) {
    setSpinner(true);
    clearStationUI(true);
    stationData = null;

    const cleanAddr = address
      .replace(/\s+/g, ' ')
      .replace(/-+/g, '-')
      .replace(/,+/g, ',')
      .replace(/,\s*$/, '')
      .trim();

    try {
      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cleanAddr + ', ' + selectedCity + ', ' + selectedUF + ', Brasil')}&format=json&limit=1`,
        { headers: { 'Accept-Language': 'pt-BR', 'User-Agent': 'RebussOps/2.0' } }
      );
      const geoData = await geoRes.json();
      if (!geoData.length) throw new Error('not_found');

      const { lat, lon } = geoData[0];

      const query = `
[out:json][timeout:25];
(
  nwr(around:${RADIUS_M}, ${lat}, ${lon})["railway"~"station|halt"];
  nwr(around:${RADIUS_M}, ${lat}, ${lon})["station"="subway"];
  nwr(around:${RADIUS_M}, ${lat}, ${lon})["highway"="bus_station"];
  nwr(around:${RADIUS_M}, ${lat}, ${lon})["amenity"="bus_station"];
  nwr(around:${RADIUS_M}, ${lat}, ${lon})["public_transport"~"station|stop_area"];
);
out center;`;

      const ovRes = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: query
      });
      const ovData = await ovRes.json();
      if (!ovData.elements || !ovData.elements.length) throw new Error('not_found');

      const R = 6371000;
      function distM(a, b, c, d) {
        const dLat = (c - a) * Math.PI / 180;
        const dLon = (d - b) * Math.PI / 180;
        const x = Math.sin(dLat / 2) ** 2 + Math.cos(a * Math.PI / 180) * Math.cos(c * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(x));
      }

      const elements = ovData.elements
        .filter(el => el.tags && el.tags.name)
        .map(el => {
          const eLat = el.lat || (el.center && el.center.lat);
          const eLon = el.lon || (el.center && el.center.lon);
          return {
            ...el,
            distM: distM(parseFloat(lat), parseFloat(lon), eLat, eLon),
            isRail: el.tags.railway === 'station' || el.tags.station === 'subway' || el.tags.railway === 'halt'
          };
        })
        .sort((a, b) => {
          if (a.isRail !== b.isRail) return a.isRail ? -1 : 1;
          return a.distM - b.distM;
        });

      if (!elements.length) throw new Error('not_found');

      const best = elements[0];
      const tags = best.tags;
      const name = tags.name || tags['name:pt'] || 'Estação';
      const lineRef = tags.ref || tags.line || tags['ref:line'] || tags['route_ref'] || '';
      const isBus = !best.isRail;
      const distKm = (best.distM / 1000).toFixed(1);
      const color = isBus ? '#38bdf8' : lineColor(lineRef, selectedCity);
      const typeLabel = isBus ? 'Terminal' : 'Estação';
      const typeEmoji = isBus ? '🚌' : '🚇';

      stationData = { name, typeLabel, typeEmoji, lineRef, color, distKm, isBus };

      const nameEl = document.getElementById('escala-station-name');
      const distEl = document.getElementById('escala-station-dist');
      const dotEl = document.getElementById('escala-line-dot');
      const chipEl = document.getElementById('escala-station-chip');

      if (nameEl) nameEl.textContent = `${typeEmoji} ${name}${lineRef ? ` · L${lineRef}` : ''}`;
      if (distEl) distEl.textContent = `~${distKm} km`;
      if (dotEl) dotEl.style.background = color;
      if (chipEl) chipEl.classList.remove('hidden');

    } catch (e) {
      const errEl = document.getElementById('escala-station-error');
      if (errEl) errEl.classList.add('show');
    } finally {
      setSpinner(false);
    }
  }

  function setSpinner(on) {
    const s = document.getElementById('escala-station-spinner');
    if (s) s.classList.toggle('active', on);
  }

  function clearStationUI(keepSpinner = false) {
    if (!keepSpinner) setSpinner(false);
    const chip = document.getElementById('escala-station-chip');
    const err = document.getElementById('escala-station-error');
    if (chip) chip.classList.add('hidden');
    if (err) err.classList.remove('show');
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

  // --- Obter Nome do Usuário Ativo para Assinatura ---
  function getActiveUserSignature() {
    const activeUser = App.getCurrentUser();
    if (!activeUser) return 'Equipe – Rebuss';
    return `${activeUser.name} – Rebuss`;
  }

  // --- Geração da Mensagem ---
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
    if (includeStation && stationData) {
      const lineRefText = stationData.lineRef ? ` (L${stationData.lineRef})` : '';
      stationInfoText = `\n${stationData.typeEmoji} *${stationData.typeLabel} mais próximo${stationData.isBus ? '' : 'a'}:* ${stationData.name}${lineRefText} (~${stationData.distKm} km)`;
    }

    const arrivalInfoText = ar
      ? `\n🚶 *Como chegar:*\n1️⃣ Clique no link abaixo:\n🔗 ${ar}\n2️⃣ Quando abrir o Maps, clique em *Rotas*.\n3️⃣ O aplicativo vai mostrar o caminho para você chegar ao local.`
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

    saveToHistory({
      dt, tm, store: st, address: ad, city: selectedCity, uf: selectedUF,
      obs: ob, arrival: ar, text, station: stationData ? { ...stationData } : null,
      createdAt: new Date().toISOString()
    });

    renderHistory();
    App.showToast('Escala gerada com sucesso!', '✓');
    App.playSound('copy');
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
        ? `<div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:6px;">${h.station.typeEmoji} ${escHtml(h.station.name)}${h.station.lineRef ? ` · L${h.station.lineRef}` : ''} · ~${h.station.distKm} km</div>`
        : '';
      const cityTag = h.city ? ` · ${h.city}` : '';

      return `
        <div class="history-item">
          <div class="history-item-top">
            <span class="history-item-store">${escHtml(h.store)}</span>
            <span class="history-item-date">${fmtDate(h.dt)} ${h.tm}</span>
          </div>
          <div style="font-size:0.78rem; color:var(--text-muted); margin-bottom:4px;">${escHtml((h.address || '').substring(0, 36))}${(h.address || '').length > 36 ? '…' : ''}${cityTag}</div>
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
    // Atualizar banner informativo do responsável
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
