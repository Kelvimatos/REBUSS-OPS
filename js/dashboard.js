/**
 * REBUSS OPS — Módulo de Dashboard Operacional Executivo
 * Painel de alta densidade: Indicadores compactos, taxas operacionais, alertas prioritários, desempenho e Top 3.
 */

const DashboardModule = (() => {
  'use strict';

  let currentPeriodo = 'hoje';
  let currentCidade = 'todas';
  let todosAlertas = [];
  let alertasExpandidos = false;

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
      loadAlertas(),
      loadRanking(),
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

  // ─── 1. Indicadores Principais & Taxas Operacionais ──────────────────────────
  async function loadIndicadores() {
    try {
      const params = { periodo: currentPeriodo };
      if (currentCidade !== 'todas') params.cidade = currentCidade;

      const data = await RebussAPI.dashboard.getIndicadores(params);

      // 8 Cards Numéricos Compactos
      const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val ?? 0;
      };

      setVal('m-convites', data.convitesTotais ?? (data.confirmados + (data.recusas || 0) + (data.cancelamentos || 0)));
      setVal('m-confirmados', data.confirmados ?? 0);
      setVal('m-presentes', data.emLoja ?? 0);
      setVal('m-a-caminho', data.aCaminho ?? 0);
      setVal('m-em-loja', data.emLoja ?? 0);
      setVal('m-faltas', data.faltas ?? 0);
      setVal('m-atrasos', data.atrasos ?? 0);
      setVal('m-cancelamentos', data.cancelamentos ?? 0);

      // 4 Taxas Percentuais
      renderTaxaCard('t-aceitacao', data.taxaAceitacao, '%', '#3b82f6');
      renderTaxaCard('t-presenca', data.taxaPresenca, '%', '#10b981');
      renderTaxaCard('t-falta', data.taxaFalta, '%', '#ef4444');
      renderTaxaCard('t-atraso', data.taxaAtraso, '%', '#f59e0b');

      // Resumo de Desempenho Operacional Compacto
      renderDesempenhoCompacto(data);
    } catch (err) {
      console.warn('Erro ao carregar indicadores do dashboard:', err);
    }
  }

  function renderTaxaCard(elementId, valor, unit, color) {
    const el = document.getElementById(elementId);
    const barEl = document.getElementById(`${elementId}-bar`);
    const valNum = isNaN(Number(valor)) ? 0 : Number(valor);
    if (el) el.textContent = `${valNum}${unit}`;
    if (barEl) {
      barEl.style.width = `${Math.min(100, Math.max(0, valNum))}%`;
      barEl.style.backgroundColor = color;
    }
  }

  // ─── 2. Desempenho Operacional Compacto (Resumo Visual) ──────────────────────
  function renderDesempenhoCompacto(data) {
    const container = document.getElementById('dash-desempenho-compact');
    if (!container) return;

    const confirmados = data.confirmados || 0;
    const emLoja = data.emLoja || 0;
    const faltas = data.faltas || 0;
    const atrasos = data.atrasos || 0;
    const recusas = data.recusas || 0;

    const pPresenca = confirmados > 0 ? Math.round((emLoja / confirmados) * 100) : 0;
    const pFaltas = confirmados > 0 ? Math.round((faltas / confirmados) * 100) : 0;
    const pAtrasos = emLoja > 0 ? Math.round((atrasos / emLoja) * 100) : 0;
    const pRecusas = data.convitesTotais > 0 ? Math.round((recusas / data.convitesTotais) * 100) : 0;

    container.innerHTML = `
      <div class="desempenho-row">
        <div class="desempenho-meta">
          <span>✓ Presença em Loja</span>
          <strong class="text-emerald">${emLoja} (${pPresenca}%)</strong>
        </div>
        <div class="desempenho-bar-track">
          <div class="desempenho-bar-fill" style="width: ${pPresenca}%; background: #10b981;"></div>
        </div>
      </div>

      <div class="desempenho-row">
        <div class="desempenho-meta">
          <span>🚫 Faltas Registradas</span>
          <strong class="text-danger">${faltas} (${pFaltas}%)</strong>
        </div>
        <div class="desempenho-bar-track">
          <div class="desempenho-bar-fill" style="width: ${pFaltas}%; background: #ef4444;"></div>
        </div>
      </div>

      <div class="desempenho-row">
        <div class="desempenho-meta">
          <span>⏰ Atrasos Identificados</span>
          <strong class="text-warning">${atrasos} (${pAtrasos}%)</strong>
        </div>
        <div class="desempenho-bar-track">
          <div class="desempenho-bar-fill" style="width: ${pAtrasos}%; background: #f59e0b;"></div>
        </div>
      </div>

      <div class="desempenho-row">
        <div class="desempenho-meta">
          <span>❌ Recusas de Convite</span>
          <strong style="color:#8b5cf6;">${recusas} (${pRecusas}%)</strong>
        </div>
        <div class="desempenho-bar-track">
          <div class="desempenho-bar-fill" style="width: ${pRecusas}%; background: #8b5cf6;"></div>
        </div>
      </div>
    `;
  }

  // ─── 3. Alertas Operacionais (Máximo 5 com Toggle) ───────────────────────────
  async function loadAlertas() {
    const container = document.getElementById('dash-alertas-list');
    const badgeCount = document.getElementById('dash-alertas-count');
    const btnToggle = document.getElementById('btn-toggle-alertas');
    if (!container) return;

    try {
      const params = {};
      if (currentCidade !== 'todas') params.cidade = currentCidade;

      const alertas = await RebussAPI.dashboard.getAlertas(params);
      todosAlertas = Array.isArray(alertas) ? alertas : [];

      if (badgeCount) badgeCount.textContent = todosAlertas.length;

      if (todosAlertas.length === 0) {
        if (btnToggle) btnToggle.style.display = 'none';
        container.innerHTML = `
          <div class="dash-empty-compact text-emerald">
            ✓ Tudo sob controle. Nenhum alerta operacional pendente.
          </div>
        `;
        return;
      }

      if (btnToggle) {
        if (todosAlertas.length > 5) {
          btnToggle.style.display = 'inline-block';
          btnToggle.textContent = alertasExpandidos ? 'Ver menos' : `Ver todos (${todosAlertas.length})`;
        } else {
          btnToggle.style.display = 'none';
        }
      }

      renderListaAlertas();
    } catch (err) {
      console.warn('Erro ao carregar alertas do dashboard:', err);
      if (container) {
        container.innerHTML = '<div class="dash-empty-compact">Falha ao carregar alertas operacionais.</div>';
      }
    }
  }

  function renderListaAlertas() {
    const container = document.getElementById('dash-alertas-list');
    if (!container) return;

    const listaExibida = alertasExpandidos ? todosAlertas : todosAlertas.slice(0, 5);

    container.innerHTML = listaExibida.map(a => {
      const icone = a.icone || (a.nivel === 'critico' ? '🔴' : a.nivel === 'alerta' ? '🟠' : '🟡');
      const clickAction = a.escalaId ? `onclick="DashboardModule.abrirOperacao('${a.escalaId}')" style="cursor:pointer;" title="Clique para abrir a operação"` : '';
      return `
        <div class="dash-alerta-compact-item nivel-${a.nivel || 'aviso'}" ${clickAction}>
          <span class="alerta-compact-icon">${icone}</span>
          <div class="alerta-compact-content">
            <strong>${escapeHtml(a.titulo)}</strong>
            <span>${escapeHtml(a.mensagem)}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  function toggleAlertas() {
    alertasExpandidos = !alertasExpandidos;
    const btnToggle = document.getElementById('btn-toggle-alertas');
    if (btnToggle) {
      btnToggle.textContent = alertasExpandidos ? 'Ver menos' : `Ver todos (${todosAlertas.length})`;
    }
    renderListaAlertas();
  }

  // ─── 4. Ranking Top 3 Melhores Colaboradores ─────────────────────────────────
  async function loadRanking() {
    const container = document.getElementById('dash-ranking-list');
    if (!container) return;

    try {
      const ranking = await RebussAPI.dashboard.getRanking();
      const lista = Array.isArray(ranking) ? ranking.slice(0, 3) : [];

      if (lista.length === 0) {
        container.innerHTML = `
          <div class="dash-empty-compact" style="grid-column: 1 / -1;">
            Nenhum histórico de pontualidade registrado no momento.
          </div>
        `;
        return;
      }

      const medals = ['🥇', '🥈', '🥉'];

      container.innerHTML = lista.map((colab, idx) => `
        <div class="dash-top3-card rank-${idx + 1}">
          <div class="top3-medal">${medals[idx] || '🏆'}</div>
          <div class="top3-info">
            <strong class="top3-name">${escapeHtml(colab.nome)}</strong>
            <span class="top3-meta">Matrícula ${escapeHtml(colab.matricula || '—')} · ${escapeHtml(colab.cidade || 'SP')}</span>
          </div>
          <div class="top3-score-wrap">
            <strong class="top3-score">${colab.score ?? colab.taxaPresenca ?? 100}%</strong>
            <span class="top3-score-lbl">Presença</span>
          </div>
        </div>
      `).join('');
    } catch (err) {
      console.warn('Erro ao carregar ranking do dashboard:', err);
    }
  }

  // ─── Navegação Direta para a Operação ─────────────────────────────────────────
  async function abrirOperacao(escalaId) {
    if (window.App && typeof App.navigateTo === 'function') {
      App.navigateTo('operacoes');
    }
    if (window.OperacoesModule && typeof OperacoesModule.abrirOperacao === 'function') {
      await OperacoesModule.abrirOperacao(escalaId);
    }
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
  }

  function init() {
    bindEvents();
  }

  document.addEventListener('DOMContentLoaded', init);

  return {
    init,
    render,
    recarregar: render,
    abrirOperacao,
    abrirModalEscala: abrirOperacao,
    toggleAlertas,
  };
})();

window.DashboardModule = DashboardModule;
