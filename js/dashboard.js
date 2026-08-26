/**
 * REBUSS OPS — Módulo de Dashboard Operacional Executivo
 * Painel de alta densidade: Indicadores compactos, taxas operacionais, resumo de operações em andamento, desempenho e Top 3.
 */

const DashboardModule = (() => {
  'use strict';

  let currentPeriodo = 'hoje';
  let currentCidade = 'todas';

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
      loadOperacoesEmAndamento(),
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

  // ─── 3. Normalização, Agrupamento e Consolidação por Loja Única ──────────────
  function getStoreKey(op) {
    if (op.lojaId) {
      return `loja_id_${String(op.lojaId).trim()}`;
    }
    const rawNome = (op.loja || op.lojaNome || op.nome || '').trim();
    const cleanedNome = rawNome
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/^(dsp|dp|loja|unidade|cd|local|inventario em)\s*[-–—:]*\s*/i, '')
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const cidade = (op.cidade || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '').trim();
    const estado = (op.estado || '').toLowerCase().trim();

    return `loja_name_${cleanedNome}_${cidade}_${estado}`;
  }

  function consolidarLojas(rawOps) {
    const storesMap = new Map();

    (Array.isArray(rawOps) ? rawOps : []).forEach(op => {
      if (!op) return;
      const storeKey = getStoreKey(op);
      if (!storeKey) return;

      if (!storesMap.has(storeKey)) {
        storesMap.set(storeKey, {
          storeKey,
          lojaId: op.lojaId || op.id,
          lojaNome: (op.loja || op.lojaNome || 'Loja').trim(),
          cidade: (op.cidade || 'São Paulo').trim(),
          estado: (op.estado || 'SP').trim().toUpperCase(),
          registros: [],
        });
      }

      storesMap.get(storeKey).registros.push(op);
    });

    const lojasConsolidadas = [];

    for (const [, store] of storesMap) {
      const { registros } = store;
      if (!registros || registros.length === 0) continue;

      // 1. Acumular PIV e métricas de todos os registros da mesma loja
      let pivMeta = 0;
      let emLoja = 0;
      let faltas = 0;
      let atrasados = 0;
      let pendentes = 0;

      // Ordenar registros por severidade de problema para escolher o ID e horário principal de foco
      const sortedRegistros = [...registros].sort((a, b) => {
        const aDef = Math.max(0, (Number(a.pivNecessario) || 0) - (Number(a.emLoja) || 0));
        const bDef = Math.max(0, (Number(b.pivNecessario) || 0) - (Number(b.emLoja) || 0));
        const aCrit = (aDef > 0 || (Number(a.faltas) || 0) > 0) ? 2 : ((Number(a.pendentes) || 0) > 0 || (Number(a.atrasados) || 0) > 0) ? 1 : 0;
        const bCrit = (bDef > 0 || (Number(b.faltas) || 0) > 0) ? 2 : ((Number(b.pendentes) || 0) > 0 || (Number(b.atrasados) || 0) > 0) ? 1 : 0;
        return bCrit - aCrit;
      });

      const operacaoPrincipalId = sortedRegistros[0].id;
      const horarioPrincipal = sortedRegistros[0].horario || '18:30';
      const todosFinalizados = registros.every(r => r.status === 'FINALIZADA');

      for (const reg of registros) {
        const rMeta = Number(reg.pivNecessario) || (reg.membros ? reg.membros.length : 0);
        const rEmLoja = Number(reg.emLoja) || 0;
        const rFaltas = Number(reg.faltas) || 0;
        const rAtrasados = Number(reg.atrasados) || 0;
        const rPendentes = Number(reg.pendentes) || 0;

        pivMeta += rMeta;
        emLoja += rEmLoja;
        faltas += rFaltas;
        atrasados += rAtrasados;
        pendentes += rPendentes;
      }

      const pivFaltante = Math.max(0, pivMeta - emLoja);

      // 2. Determinar status consolidado da loja (Prioridade: Crítico > Falta > Atraso > Pendente > Normal)
      let statusClass = 'status-normal';
      let statusBadge = '<span class="dash-op-status-badge badge-normal">🟢 Normal</span>';
      let prioridadeScore = 0; // 0: Normal, 1: Atenção, 2: Crítico

      if (todosFinalizados) {
        statusClass = 'status-normal';
        statusBadge = '<span class="dash-op-status-badge badge-normal">🟢 Finalizada</span>';
        prioridadeScore = -1;
      } else if (pivFaltante > 0 || faltas > 0) {
        statusClass = 'status-critico';
        statusBadge = '<span class="dash-op-status-badge badge-critico">🔴 Crítico</span>';
        prioridadeScore = 2;
      } else if (pendentes > 0 || atrasados > 0) {
        statusClass = 'status-atencao';
        statusBadge = '<span class="dash-op-status-badge badge-atencao">🟡 Atenção</span>';
        prioridadeScore = 1;
      }

      // 3. Construir pílulas de status consolidadas
      const pills = [];

      // 1. PIV (Regra estrita: PIV faltante = PIV Meta - PIV Atual)
      if (pivFaltante > 0) {
        pills.push(`<span class="dash-op-pill pill-piv-critico">🔴 PIV ${emLoja}/${pivMeta} — faltam ${pivFaltante}</span>`);
      } else if (pivMeta > 0) {
        pills.push(`<span class="dash-op-pill pill-piv-ok">🟢 PIV ${pivMeta}/${pivMeta} — completo</span>`);
      }

      // 2. Faltas
      if (faltas > 0) {
        pills.push(`<span class="dash-op-pill pill-falta">🚫 ${faltas} ${faltas === 1 ? 'falta' : 'faltas'}</span>`);
      }

      // 3. Atrasos
      if (atrasados > 0) {
        pills.push(`<span class="dash-op-pill pill-atraso">🟠 ${atrasados} ${atrasados === 1 ? 'atraso' : 'atrasos'}</span>`);
      }

      // 4. Confirmações pendentes (SEPARADO DO PIV FALTANTE!)
      if (pendentes > 0) {
        pills.push(`<span class="dash-op-pill pill-pendente">🔵 ${pendentes} ${pendentes === 1 ? 'confirmação pendente' : 'confirmações pendentes'}</span>`);
      }

      // 5. Sem problemas
      if (pivFaltante === 0 && faltas === 0 && atrasados === 0 && pendentes === 0 && !todosFinalizados) {
        pills.push(`<span class="dash-op-pill pill-normal">🟢 Operação normal</span>`);
      }

      lojasConsolidadas.push({
        lojaId: store.lojaId,
        operacaoId: operacaoPrincipalId,
        lojaNome: store.lojaNome,
        cidade: store.cidade,
        estado: store.estado,
        horario: horarioPrincipal,
        pivMeta,
        emLoja,
        pivFaltante,
        faltas,
        atrasados,
        pendentes,
        statusClass,
        statusBadge,
        pills,
        prioridadeScore,
      });
    }

    // 4. Ordenar lojas consolidadas: mais críticas primeiro, depois por horário
    lojasConsolidadas.sort((a, b) => {
      if (b.prioridadeScore !== a.prioridadeScore) {
        return b.prioridadeScore - a.prioridadeScore;
      }
      return (a.horario || '').localeCompare(b.horario || '');
    });

    return lojasConsolidadas;
  }

  async function loadOperacoesEmAndamento() {
    const container = document.getElementById('dash-operacoes-list');
    const badgeCount = document.getElementById('dash-ops-count');
    if (!container) return;

    try {
      const params = { periodo: currentPeriodo };
      if (currentCidade !== 'todas') params.cidade = currentCidade;

      const rawOps = await RebussAPI.operacoes.list(params);

      // ETAPA OBRIGATÓRIA: DEDUPLICAÇÃO E CONSOLIDAÇÃO POR LOJA ÚNICA (ANTES DO MAP)
      const lojasConsolidadas = consolidarLojas(rawOps);

      if (badgeCount) {
        badgeCount.textContent = lojasConsolidadas.length;
      }

      if (lojasConsolidadas.length === 0) {
        container.innerHTML = `
          <div class="dash-empty-compact text-emerald">
            ✓ Nenhuma operação programada ou em andamento no momento.
          </div>
        `;
        return;
      }

      // Limitar a exibição às 5 principais lojas em acompanhamento
      const top5Lojas = lojasConsolidadas.slice(0, 5);

      container.innerHTML = top5Lojas.map(loja => {
        const horarioFmt = (loja.horario || '18:30').trim();
        const ufFmt = (loja.estado || 'SP').trim().toUpperCase();

        return `
          <div class="dash-op-summary-card ${loja.statusClass}" onclick="DashboardModule.abrirOperacao('${loja.operacaoId}')" title="Clique para abrir ${escapeHtml(loja.lojaNome)}">
            <div class="dash-op-card-head">
              <div class="dash-op-name-loc">
                <strong class="dash-op-name">${escapeHtml(loja.lojaNome)}</strong>
                <span class="dash-op-loc">${horarioFmt} • ${ufFmt}</span>
              </div>
              ${loja.statusBadge}
            </div>
            <div class="dash-op-pills-row">
              ${loja.pills.join('')}
            </div>
          </div>
        `;
      }).join('');
    } catch (err) {
      console.warn('Erro ao carregar operações em andamento do dashboard:', err);
      if (container) {
        container.innerHTML = '<div class="dash-empty-compact">Falha ao carregar operações em andamento.</div>';
      }
    }
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
  };
})();

window.DashboardModule = DashboardModule;
