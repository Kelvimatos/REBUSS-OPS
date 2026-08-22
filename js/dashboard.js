/**
 * REBUSS OPS — Módulo de Dashboard Operacional
 * Consulta dados em tempo real no PostgreSQL e renderiza métricas, gráficos, escalas de hoje, alertas e rankings.
 */

const DashboardModule = (() => {
  'use strict';

  let currentPeriodo = 'hoje';
  let currentCidade = 'todas';
  let searchQuery = '';

  const CIDADES = [
    { id: 'todas', label: 'Todas as Praças' },
    { id: 'são paulo', label: 'São Paulo/SP' },
    { id: 'rio de janeiro', label: 'Rio de Janeiro/RJ' },
    { id: 'belo horizonte', label: 'Belo Horizonte/MG' },
    { id: 'brasília', label: 'Brasília/DF' },
    { id: 'goiânia', label: 'Goiânia/GO' },
  ];

  // ─── Renderização Principal ──────────────────────────────────────────────────
  async function render() {
    renderHeaderGreeting();
    renderFiltersUI();
    await Promise.all([
      loadIndicadores(),
      loadEscalasHoje(),
      loadAlertas(),
      loadRanking(),
      loadEquipes(),
    ]);
  }

  function renderHeaderGreeting() {
    const user = window.AuthModule ? AuthModule.getCurrentUser() : null;
    const nameEl = document.getElementById('dash-user-greeting');
    const dateEl = document.getElementById('dash-today-date');

    if (nameEl) {
      const primeiroNome = user ? user.nome.split(' ')[0] : 'Operador';
      nameEl.textContent = `Olá, ${primeiroNome} 👋`;
    }

    if (dateEl) {
      const hoje = new Date();
      const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
      dateEl.textContent = hoje.toLocaleDateString('pt-BR', options);
    }
  }

  function renderFiltersUI() {
    const cityContainer = document.getElementById('dash-city-pills');
    if (!cityContainer) return;

    cityContainer.innerHTML = CIDADES.map(c => `
      <button class="dash-filter-pill ${currentCidade === c.id ? 'active' : ''}" data-city="${c.id}">
        ${c.label}
      </button>
    `).join('');

    cityContainer.querySelectorAll('.dash-filter-pill').forEach(btn => {
      btn.addEventListener('click', function() {
        currentCidade = this.getAttribute('data-city');
        renderFiltersUI();
        render();
      });
    });
  }

  // ─── 1. Indicadores Principais & Porcentagens ─────────────────────────────────
  async function loadIndicadores() {
    const container = document.getElementById('dash-metrics-container');
    if (!container) return;

    try {
      const params = { periodo: currentPeriodo };
      if (currentCidade !== 'todas') params.cidade = currentCidade;

      const data = await RebussAPI.dashboard.getIndicadores(params);

      // 8 Cards Numéricos
      document.getElementById('m-piv-total').textContent = data.pivTotal ?? 0;
      document.getElementById('m-confirmados').textContent = data.confirmados ?? 0;
      document.getElementById('m-em-loja').textContent = data.emLoja ?? 0;
      document.getElementById('m-a-caminho').textContent = data.aCaminho ?? 0;
      document.getElementById('m-recusas').textContent = data.recusas ?? 0;
      document.getElementById('m-faltas').textContent = data.faltas ?? 0;
      document.getElementById('m-atrasos').textContent = data.atrasos ?? 0;
      document.getElementById('m-cancelamentos').textContent = data.cancelamentos ?? 0;

      // 4 Taxas Percentuais
      renderTaxaCard('t-aceitacao', data.taxaAceitacao, '%', '#3b82f6');
      renderTaxaCard('t-presenca', data.taxaPresenca, '%', '#10b981');
      renderTaxaCard('t-falta', data.taxaFalta, '%', '#ef4444');
      renderTaxaCard('t-atraso', data.taxaAtraso, '%', '#f59e0b');

      renderChart(data);
    } catch (err) {
      console.warn('Erro ao carregar indicadores:', err);
    }
  }

  function renderTaxaCard(elementId, valor, unit, color) {
    const el = document.getElementById(elementId);
    const barEl = document.getElementById(`${elementId}-bar`);
    if (el) el.textContent = `${valor}${unit}`;
    if (barEl) {
      barEl.style.width = `${Math.min(100, valor)}%`;
      barEl.style.backgroundColor = color;
    }
  }

  // ─── 2. Escalas de Hoje ──────────────────────────────────────────────────────
  async function loadEscalasHoje() {
    const container = document.getElementById('dash-escalas-list');
    const badgeCount = document.getElementById('dash-escalas-count');
    if (!container) return;

    try {
      const params = {};
      if (currentCidade !== 'todas') params.cidade = currentCidade;

      const escalas = await RebussAPI.dashboard.getEscalasHoje(params);
      if (badgeCount) badgeCount.textContent = escalas.length;

      if (!escalas || escalas.length === 0) {
        container.innerHTML = `
          <div class="dash-empty-box">
            <span>📅 Nenhuma escala programada para hoje nesta praça.</span>
          </div>
        `;
        return;
      }

      container.innerHTML = escalas.map(e => `
        <div class="dash-escala-card">
          <div class="dash-escala-header">
            <div>
              <h4 class="dash-escala-loja">${escapeHtml(e.loja)}</h4>
              <span class="dash-escala-loc">📍 ${escapeHtml(e.cidade)}/${escapeHtml(e.estado)} · ⏰ ${e.horario}</span>
            </div>
            <span class="dash-status-pill status-${e.status.toLowerCase()}">${e.status}</span>
          </div>

          <div class="dash-escala-metrics">
            <div class="escala-metric-item">
              <span class="lbl">PIV Meta</span>
              <span class="val">${e.pivNecessario}</span>
            </div>
            <div class="escala-metric-item">
              <span class="lbl">Confirmados</span>
              <span class="val text-success">${e.confirmados}</span>
            </div>
            <div class="escala-metric-item">
              <span class="lbl">A Caminho</span>
              <span class="val text-info">${e.aCaminho}</span>
            </div>
            <div class="escala-metric-item">
              <span class="lbl">Em Loja</span>
              <span class="val text-primary font-bold">${e.emLoja}</span>
            </div>
          </div>

          <div class="dash-escala-actions">
            <button class="btn btn-sm btn-outline-primary" onclick="DashboardModule.abrirModalEscala('${e.id}')">
              Ver Escala Completa
            </button>
          </div>
        </div>
      `).join('');
    } catch (err) {
      console.warn('Erro ao carregar escalas de hoje:', err);
    }
  }

  // ─── 3. Alertas Operacionais ─────────────────────────────────────────────────
  async function loadAlertas() {
    const container = document.getElementById('dash-alertas-list');
    const badgeCount = document.getElementById('dash-alertas-count');
    if (!container) return;

    try {
      const params = {};
      if (currentCidade !== 'todas') params.cidade = currentCidade;

      const alertas = await RebussAPI.dashboard.getAlertas(params);
      if (badgeCount) badgeCount.textContent = alertas.length;

      if (!alertas || alertas.length === 0) {
        container.innerHTML = `
          <div class="dash-empty-box text-success">
            <span>✅ Tudo sob controle! Nenhum alerta crítico reportado no momento.</span>
          </div>
        `;
        return;
      }

      container.innerHTML = alertas.map(a => `
        <div class="dash-alerta-item nivel-${a.nivel}">
          <span class="alerta-icon">${a.icone}</span>
          <div class="alerta-body">
            <strong>${escapeHtml(a.titulo)}</strong>
            <p>${escapeHtml(a.mensagem)}</p>
          </div>
        </div>
      `).join('');
    } catch (err) {
      console.warn('Erro ao carregar alertas:', err);
    }
  }

  // ─── 4. Ranking de Melhores Colaboradores ────────────────────────────────────
  async function loadRanking() {
    const container = document.getElementById('dash-ranking-list');
    if (!container) return;

    try {
      const ranking = await RebussAPI.dashboard.getRanking();

      if (!ranking || ranking.length === 0) {
        container.innerHTML = `
          <div class="dash-empty-box">
            <span>Nenhum histórico de pontualidade registrado ainda.</span>
          </div>
        `;
        return;
      }

      const medals = ['🥇', '🥈', '🥉'];

      container.innerHTML = ranking.slice(0, 6).map((colab, idx) => {
        const medalha = medals[idx] || `<span class="rank-num">#${idx + 1}</span>`;
        return `
          <div class="dash-ranking-item">
            <div class="rank-pos">${medalha}</div>
            <div class="rank-info">
              <strong class="rank-name">${escapeHtml(colab.nome)}</strong>
              <span class="rank-meta">Matrícula: ${escapeHtml(colab.matricula)} · ${escapeHtml(colab.cidade)}</span>
            </div>
            <div class="rank-score">
              <span class="score-badge">${colab.score}%</span>
              <span class="score-lbl">Pontualidade</span>
            </div>
          </div>
        `;
      }).join('');
    } catch (err) {
      console.warn('Erro ao carregar ranking:', err);
    }
  }

  // ─── 5. Resumo das Equipes ───────────────────────────────────────────────────
  async function loadEquipes() {
    const container = document.getElementById('dash-equipes-grid');
    if (!container) return;

    try {
      const equipes = await RebussAPI.dashboard.getEquipes();

      if (!equipes || equipes.length === 0) {
        container.innerHTML = `
          <div class="dash-empty-box">
            <span>Nenhuma equipe cadastrada no banco.</span>
          </div>
        `;
        return;
      }

      container.innerHTML = equipes.slice(0, 6).map(eq => `
        <div class="dash-equipe-mini-card">
          <div class="eq-mini-head">
            <strong>${escapeHtml(eq.nome)}</strong>
            <span class="badge-tag">${escapeHtml(eq.estado || 'SP')}</span>
          </div>
          <div class="eq-mini-body">
            <span>👥 ${eq.totalMembros} integrantes</span>
            <span class="text-success font-bold">✓ ${eq.taxaPresenca}% presença</span>
          </div>
          <a href="#/equipes" class="btn btn-xs btn-outline-secondary mt-2" data-nav="equipes">
            Ver Equipe
          </a>
        </div>
      `).join('');
    } catch (err) {
      console.warn('Erro ao carregar equipes:', err);
    }
  }

  // ─── 6. Gráfico Operacional em Canvas HTML5 ──────────────────────────────────
  function renderChart(data) {
    const canvas = document.getElementById('dash-operation-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width = canvas.parentElement.clientWidth || 400;
    const height = canvas.height = 200;

    ctx.clearRect(0, 0, width, height);

    const labels = ['Confirmados', 'Em Loja', 'A Caminho', 'Faltas', 'Atrasos', 'Recusas'];
    const values = [
      data.confirmados || 0,
      data.emLoja || 0,
      data.aCaminho || 0,
      data.faltas || 0,
      data.atrasos || 0,
      data.recusas || 0,
    ];
    const colors = ['#3b82f6', '#10b981', '#06b6d4', '#ef4444', '#f59e0b', '#8b5cf6'];

    const maxVal = Math.max(...values, 5);
    const barWidth = Math.min(45, (width - 60) / labels.length - 12);
    const startX = 35;
    const chartHeight = height - 50;

    // Linhas guias horizontais
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = 20 + (chartHeight / 4) * i;
      ctx.beginPath();
      ctx.moveTo(startX, y);
      ctx.lineTo(width - 20, y);
      ctx.stroke();
    }

    // Barras
    values.forEach((val, i) => {
      const x = startX + i * (barWidth + 16) + 8;
      const barH = (val / maxVal) * chartHeight;
      const y = height - 30 - barH;

      // Barra
      ctx.fillStyle = colors[i];
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barH, [4, 4, 0, 0]);
      ctx.fill();

      // Valor no topo
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(val.toString(), x + barWidth / 2, y - 5);

      // Label embaixo
      ctx.fillStyle = '#64748b';
      ctx.font = '10px sans-serif';
      ctx.fillText(labels[i].substring(0, 6), x + barWidth / 2, height - 12);
    });
  }

  // ─── Modal de Escala Detalhada ───────────────────────────────────────────────
  async function abrirModalEscala(escalaId) {
    try {
      const escala = await RebussAPI.escalas.get(escalaId);
      const modal = document.getElementById('modal-dash-escala-detalhe');
      const title = document.getElementById('modal-dash-escala-title');
      const body = document.getElementById('modal-dash-escala-body');

      if (!modal || !escala) return;

      if (title) title.textContent = `${escala.loja?.nome || 'Escala'} — ${escala.horario}`;
      if (body) {
        body.innerHTML = `
          <div style="margin-bottom:12px; font-size:0.88rem; color:var(--text-muted);">
            📍 ${escapeHtml(escala.loja?.endereco || '')} · ${escapeHtml(escala.loja?.cidade || '')}/${escapeHtml(escala.loja?.estado || '')}
          </div>
          <div style="margin-bottom:16px;">
            <strong>Membros Escalados (${escala.membros.length}):</strong>
          </div>
          <div class="table-responsive">
            <table class="table-dash-membros">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Matrícula</th>
                  <th>Status</th>
                  <th>Confirmação</th>
                  <th>Chegada</th>
                </tr>
              </thead>
              <tbody>
                ${escala.membros.map(m => `
                  <tr>
                    <td><strong>${escapeHtml(m.usuario.nome)}</strong></td>
                    <td>${escapeHtml(m.usuario.matricula || '—')}</td>
                    <td><span class="dash-status-pill status-${m.status.toLowerCase()}">${m.status}</span></td>
                    <td>${m.confirmou ? '✅ Confirmado' : '⏳ Pendente'}</td>
                    <td>${m.chegou ? '🟢 Em Loja' : '—'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      }

      modal.classList.add('open');
    } catch (err) {
      alert('Erro ao carregar detalhes da escala: ' + err.message);
    }
  }

  // ─── Busca Global ────────────────────────────────────────────────────────────
  function handleGlobalSearch(query) {
    searchQuery = query.toLowerCase().trim();
    if (!searchQuery) {
      document.getElementById('dash-search-results')?.classList.add('hide');
      return;
    }
    // Filtrar dados em tela
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function bindEvents() {
    // Filtros de Período
    document.querySelectorAll('.dash-periodo-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.dash-periodo-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        currentPeriodo = this.getAttribute('data-periodo');
        render();
      });
    });

    // Busca Global
    const searchInput = document.getElementById('dash-global-search');
    if (searchInput) {
      let timer = null;
      searchInput.addEventListener('input', (e) => {
        clearTimeout(timer);
        timer = setTimeout(() => handleGlobalSearch(e.target.value), 300);
      });
    }

    // Modal Close
    document.getElementById('modal-dash-escala-close')?.addEventListener('click', () => {
      document.getElementById('modal-dash-escala-detalhe')?.classList.remove('open');
    });
  }

  function init() {
    bindEvents();
  }

  document.addEventListener('DOMContentLoaded', init);

  return {
    init,
    render,
    abrirModalEscala,
  };
})();

window.DashboardModule = DashboardModule;
