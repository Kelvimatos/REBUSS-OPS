/**
 * REBUSS OPS — Módulo de Histórico Operacional Permanente
 * Gerencia a visualização em árvore (Ano ➔ Mês ➔ Dia), linha do tempo,
 * busca global por colaborador/loja e dossiê histórico individual.
 */

const HistoricoModule = (() => {
  'use strict';

  let currentPeriodo = '30dias';
  let currentCidade = 'todas';
  let currentBusca = '';
  let arvoreDados = null;
  let operacoesLista = [];

  async function init() {
    bindEvents();
  }

  function bindEvents() {
    // Filtros de Período
    document.querySelectorAll('.hist-periodo-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.hist-periodo-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        currentPeriodo = this.getAttribute('data-periodo');

        // Se for personalizado, exibe os inputs de data
        const customWrap = document.getElementById('hist-custom-date-wrap');
        if (customWrap) {
          customWrap.style.display = currentPeriodo === 'personalizado' ? 'flex' : 'none';
        }

        if (currentPeriodo !== 'personalizado') {
          carregarHistorico();
        }
      });
    });

    // Filtros de Praça/Cidade
    document.querySelectorAll('.hist-city-pill').forEach(pill => {
      pill.addEventListener('click', function() {
        document.querySelectorAll('.hist-city-pill').forEach(p => p.classList.remove('active'));
        this.classList.add('active');
        currentCidade = this.getAttribute('data-city');
        carregarHistorico();
      });
    });

    // Busca rápida
    const searchInput = document.getElementById('hist-search-input');
    if (searchInput) {
      let debounceTimeout = null;
      searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(() => {
          currentBusca = e.target.value.trim();
          carregarHistorico();
        }, 300);
      });
    }

    // Botão aplicar datas personalizadas
    document.getElementById('btn-hist-apply-custom')?.addEventListener('click', () => {
      carregarHistorico();
    });

    // Alternar modo de visualização (Árvore vs Lista)
    document.getElementById('btn-toggle-hist-view')?.addEventListener('click', function() {
      const isTree = this.getAttribute('data-mode') === 'tree';
      const treeView = document.getElementById('hist-tree-view');
      const listView = document.getElementById('hist-list-view');

      if (isTree) {
        this.setAttribute('data-mode', 'list');
        this.innerHTML = '📋 Visualização em Lista';
        if (treeView) treeView.style.display = 'none';
        if (listView) listView.style.display = 'block';
      } else {
        this.setAttribute('data-mode', 'tree');
        this.innerHTML = '🌳 Visualização em Árvore';
        if (treeView) treeView.style.display = 'block';
        if (listView) listView.style.display = 'none';
      }
    });

    // Fechar modais
    document.querySelectorAll('.modal-historico-close').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('modal-historico-detalhe')?.classList.remove('open', 'active');
        document.getElementById('modal-historico-colaborador')?.classList.remove('open', 'active');
      });
    });

    // Fechar ao clicar no overlay
    ['modal-historico-detalhe', 'modal-historico-colaborador'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('click', (e) => {
          if (e.target === el) {
            el.classList.remove('open', 'active');
          }
        });
      }
    });
  }

  async function render() {
    await carregarHistorico();
  }

  async function carregarHistorico() {
    const containerTree = document.getElementById('hist-tree-container');
    const containerList = document.getElementById('hist-list-container');
    const statsContainer = document.getElementById('hist-stats-summary');

    if (containerTree) containerTree.innerHTML = '<div class="dash-empty-box">Carregando histórico permanente...</div>';
    if (containerList) containerList.innerHTML = '<div class="dash-empty-box">Carregando histórico permanente...</div>';

    try {
      const params = {
        periodo: currentPeriodo,
        cidade: currentCidade,
        busca: currentBusca,
      };

      if (currentPeriodo === 'personalizado') {
        params.dataInicio = document.getElementById('hist-custom-start')?.value;
        params.dataFim = document.getElementById('hist-custom-end')?.value;
      }

      const [arvore, operacoes, indicadores] = await Promise.all([
        RebussAPI.historico.getArvore({ ano: 2026 }),
        RebussAPI.historico.getOperacoes(params),
        RebussAPI.historico.getIndicadores(params),
      ]);

      arvoreDados = arvore;
      operacoesLista = operacoes;

      renderResumoEstatisticas(indicadores, statsContainer);
      renderArvoreHistorica(arvore, containerTree);
      renderListaOperacoes(operacoes, containerList);
    } catch (err) {
      console.error('Erro ao carregar histórico:', err);
      if (containerTree) containerTree.innerHTML = `<div class="dash-empty-box text-danger">Erro ao carregar histórico: ${err.message}</div>`;
    }
  }

  function renderResumoEstatisticas(ind, container) {
    if (!container || !ind) return;

    container.innerHTML = `
      <div class="hist-stats-grid">
        <div class="hist-stat-card">
          <span class="stat-lbl">Operações no Período</span>
          <span class="stat-val">${ind.totalEscalas || 0}</span>
          <span class="stat-sub">Registros permanentes</span>
        </div>
        <div class="hist-stat-card">
          <span class="stat-lbl">PIV Total Realizado</span>
          <span class="stat-val text-primary">${ind.pivTotal || 0}</span>
          <span class="stat-sub">${ind.presencas || 0} presenças registradas</span>
        </div>
        <div class="hist-stat-card">
          <span class="stat-lbl">Taxa Geral de Presença</span>
          <span class="stat-val text-success">${ind.taxaPresenca || 0}%</span>
          <span class="stat-sub">${ind.faltas || 0} faltas acumuladas</span>
        </div>
        <div class="hist-stat-card">
          <span class="stat-lbl">Taxa de Aceitação</span>
          <span class="stat-val text-info">${ind.taxaAceitacao || 0}%</span>
          <span class="stat-sub">${ind.recusas || 0} recusas no período</span>
        </div>
      </div>
    `;
  }

  function renderArvoreHistorica(arvore, container) {
    if (!container) return;

    if (!arvore || !arvore.meses || Object.keys(arvore.meses).length === 0) {
      container.innerHTML = `
        <div class="dash-empty-box">
          <span style="font-size:2rem; display:block; margin-bottom:8px;">📅</span>
          Nenhuma operação registrada no histórico de 2026.
        </div>
      `;
      return;
    }

    let html = `<div class="hist-tree-root">
      <div class="tree-header-year">
        <h3>🏛️ Ano de ${arvore.ano}</h3>
        <span class="badge-total-op">${arvore.totalOperacoesAno} operações salvas</span>
      </div>
      <div class="tree-branches">
    `;

    const mesesChaves = Object.keys(arvore.meses);

    for (const mesNome of mesesChaves) {
      const mesData = arvore.meses[mesNome];
      const diasChaves = Object.keys(mesData.dias);

      html += `
        <div class="tree-month-block">
          <details open class="tree-details-month">
            <summary class="tree-month-summary">
              <span class="month-title">📁 ${mesNome}</span>
              <span class="badge-month-op">${mesData.totalOperacoesMes} operações</span>
            </summary>

            <div class="tree-days-list">
      `;

      for (const diaKey of diasChaves) {
        const diaData = mesData.dias[diaKey];
        html += `
          <div class="tree-day-block">
            <div class="tree-day-header">
              <span class="day-badge">📅 ${diaKey}</span>
              <span class="day-ops-count">${diaData.totalOperacoesDia} ${diaData.totalOperacoesDia === 1 ? 'loja' : 'lojas'}</span>
            </div>

            <div class="tree-ops-cards-grid">
        `;

        for (const op of diaData.operacoes) {
          const statusClass = op.status === 'FINALIZADA' ? 'status-finalizada' : (op.status === 'EM_ANDAMENTO' ? 'status-em_andamento' : 'status-aberta');
          const statusIcon = op.status === 'FINALIZADA' ? '🔒' : (op.status === 'EM_ANDAMENTO' ? '🟢' : '⏳');

          html += `
            <div class="hist-op-card" onclick="HistoricoModule.abrirDetalhesOperacao('${op.id}')">
              <div class="op-card-top">
                <strong class="op-loja-name">${op.loja}</strong>
                <span class="hist-status-badge ${statusClass}">${statusIcon} ${op.status}</span>
              </div>
              <div class="op-card-meta">
                <span>⏰ ${op.horario}</span>
                <span>📍 ${op.cidade}/${op.estado}</span>
              </div>
              <div class="op-card-stats-mini">
                <span title="PIV">🎯 PIV: <strong>${op.pivNecessario}</strong></span>
                <span title="Presentes" class="text-success">✅ ${op.presentes}</span>
                <span title="Faltas" class="${op.faltas > 0 ? 'text-danger' : ''}">❌ ${op.faltas}</span>
                <span title="Atrasos" class="${op.atrasos > 0 ? 'text-warning' : ''}">🟡 ${op.atrasos}</span>
              </div>
            </div>
          `;
        }

        html += `
            </div>
          </div>
        `;
      }

      html += `
            </div>
          </details>
        </div>
      `;
    }

    html += `</div></div>`;
    container.innerHTML = html;
  }

  function renderListaOperacoes(operacoes, container) {
    if (!container) return;

    if (!operacoes || operacoes.length === 0) {
      container.innerHTML = `
        <div class="dash-empty-box">
          <span style="font-size:2rem; display:block; margin-bottom:8px;">🔍</span>
          Nenhuma operação encontrada para os filtros selecionados.
        </div>
      `;
      return;
    }

    let html = `<div class="hist-table-wrap"><table class="table-admin-users">
      <thead>
        <tr>
          <th>Data / Hora</th>
          <th>Loja</th>
          <th>Praça</th>
          <th>PIV</th>
          <th>Presentes</th>
          <th>Faltas</th>
          <th>Status</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody>
    `;

    for (const op of operacoes) {
      const dt = new Date(op.data);
      const dataFmt = `${dt.getUTCDate().toString().padStart(2, '0')}/${(dt.getUTCMonth() + 1).toString().padStart(2, '0')}/${dt.getUTCFullYear()}`;
      const statusClass = op.status === 'FINALIZADA' ? 'status-concluida' : (op.status === 'EM_ANDAMENTO' ? 'status-em_andamento' : 'status-aberta');

      html += `
        <tr>
          <td><strong>${dataFmt}</strong> às ${op.horario}</td>
          <td><strong style="color:var(--primary);">${op.loja}</strong></td>
          <td>📍 ${op.cidade}/${op.estado}</td>
          <td><strong>${op.pivNecessario}</strong></td>
          <td><span class="text-success" style="font-weight:700;">${op.presentes}</span> / ${op.totalMembros}</td>
          <td><span class="${op.faltas > 0 ? 'text-danger font-weight-bold' : 'text-muted'}">${op.faltas}</span></td>
          <td><span class="dash-status-pill ${statusClass}">${op.status}</span></td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick="HistoricoModule.abrirDetalhesOperacao('${op.id}')">
              Ver Detalhes
            </button>
          </td>
        </tr>
      `;
    }

    html += `</tbody></table></div>`;
    container.innerHTML = html;
  }

  // Abre o Modal com Detalhes da Operação
  async function abrirDetalhesOperacao(escalaId) {
    try {
      const escala = await RebussAPI.escalas.get(escalaId);
      if (!escala) return;

      const modal = document.getElementById('modal-historico-detalhe');
      const titleEl = document.getElementById('modal-hist-op-title');
      const bodyEl = document.getElementById('modal-hist-op-body');
      const btnFinalizar = document.getElementById('btn-hist-finalizar-op');

      if (!modal || !bodyEl) return;

      const dt = new Date(escala.data);
      const dataFmt = `${dt.getUTCDate().toString().padStart(2, '0')}/${(dt.getUTCMonth() + 1).toString().padStart(2, '0')}/${dt.getUTCFullYear()}`;

      if (titleEl) {
        titleEl.innerHTML = `🏪 ${escala.loja.nome} <span style="font-size:0.85rem; color:var(--text-muted); font-weight:normal;">(${dataFmt} às ${escala.horario})</span>`;
      }

      const confirmados = escala.membros.filter(m => m.confirmou).length;
      const presentes = escala.membros.filter(m => m.status === 'EM_LOJA' || m.chegou).length;
      const faltas = escala.membros.filter(m => m.status === 'FALTOU').length;
      const atrasos = escala.membros.filter(m => m.status === 'ATRASADO').length;

      let tabelaMembros = `
        <table class="table-admin-users" style="margin-top:16px;">
          <thead>
            <tr>
              <th>Cód.</th>
              <th>Colaborador</th>
              <th>Cargo</th>
              <th>Confirmação</th>
              <th>Presença / Status</th>
            </tr>
          </thead>
          <tbody>
      `;

      for (const m of escala.membros) {
        const mat = m.usuario.matricula || '—';
        const statusBadge = m.status === 'EM_LOJA' || m.chegou
          ? '<span class="dash-status-pill status-concluida">✅ Presente</span>'
          : (m.status === 'FALTOU'
            ? '<span class="dash-status-pill status-cancelada">❌ Falta</span>'
            : (m.status === 'ATRASADO'
              ? '<span class="dash-status-pill status-em_andamento">🟡 Atrasado</span>'
              : '<span class="dash-status-pill status-aberta">⏳ Pendente</span>'));

        tabelaMembros += `
          <tr>
            <td><code style="font-weight:700; color:var(--primary);">${mat}</code></td>
            <td>
              <a href="javascript:void(0)" onclick="HistoricoModule.abrirDossieColaborador('${m.usuarioId}')" style="font-weight:600; color:var(--text-main); text-decoration:underline;">
                ${m.usuario.nome}
              </a>
            </td>
            <td><span class="role-badge role-operador">${m.cargo || 'Operador'}</span></td>
            <td>${m.confirmou ? '🟢 Confirmado' : '⚪ Não confirmado'}</td>
            <td>${statusBadge}</td>
          </tr>
        `;
      }

      tabelaMembros += `</tbody></table>`;

      bodyEl.innerHTML = `
        <div class="dash-escala-metrics" style="margin-bottom:16px;">
          <div class="escala-metric-item">
            <span class="lbl">PIV NECESSÁRIO</span>
            <span class="val">${escala.pivNecessario || escala.membros.length}</span>
          </div>
          <div class="escala-metric-item">
            <span class="lbl">CONFIRMADOS</span>
            <span class="val text-primary">${confirmados}</span>
          </div>
          <div class="escala-metric-item">
            <span class="lbl">PRESENTES</span>
            <span class="val text-success">${presentes}</span>
          </div>
          <div class="escala-metric-item">
            <span class="lbl">FALTAS</span>
            <span class="val ${faltas > 0 ? 'text-danger' : ''}">${faltas}</span>
          </div>
        </div>

        <div style="font-size:0.85rem; color:var(--text-muted); display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px;">
          <span>📍 Local: <strong>${escala.loja.endereco || escala.loja.cidade || '—'}</strong></span>
          <span>👤 Importado por: <strong>${escala.importadoPor || 'Admin Rebuss'}</strong></span>
          <span>Status: <strong>${escala.status}</strong></span>
        </div>

        ${tabelaMembros}
      `;

      if (btnFinalizar) {
        if (escala.status === 'FINALIZADA') {
          btnFinalizar.style.display = 'none';
        } else {
          btnFinalizar.style.display = '';
          btnFinalizar.onclick = async () => {
            if (confirm(`Deseja finalizar e arquivar a operação de ${escala.loja.nome}?`)) {
              await RebussAPI.operacoes.finalizar(escala.id);
              if (window.App) App.showToast('Operação finalizada e gravada no histórico permanente!', '🔒');
              modal.classList.remove('open', 'active');
              carregarHistorico();
            }
          };
        }
      }

      modal.classList.add('open', 'active');
    } catch (err) {
      console.error('Erro ao abrir detalhes da operação:', err);
      alert('Erro ao carregar detalhes: ' + err.message);
    }
  }

  // Abre o Dossiê Histórico Individual do Colaborador
  async function abrirDossieColaborador(idOrMatricula) {
    try {
      const data = await RebussAPI.historico.getColaborador(idOrMatricula);
      if (!data) return;

      const modal = document.getElementById('modal-historico-colaborador');
      const titleEl = document.getElementById('modal-hist-colab-title');
      const bodyEl = document.getElementById('modal-hist-colab-body');

      if (!modal || !bodyEl) return;

      const colab = data.colaborador;
      const ind = data.indicadores;

      if (titleEl) {
        titleEl.innerHTML = `👤 Dossiê do Colaborador: <strong>${colab.nome}</strong>`;
      }

      let timelineHtml = `
        <div class="colab-timeline-wrap" style="margin-top:18px;">
          <h4 style="margin-bottom:10px;">📅 Histórico de Escalas em 2026 (${ind.totalEscalas} operações)</h4>
      `;

      if (data.timeline && data.timeline.length > 0) {
        timelineHtml += `<div class="timeline-items-list">`;
        for (const item of data.timeline) {
          const dt = new Date(item.data);
          const dataFmt = `${dt.getUTCDate().toString().padStart(2, '0')}/${(dt.getUTCMonth() + 1).toString().padStart(2, '0')}/${dt.getUTCFullYear()}`;
          const statusIcon = item.statusPresenca === 'EM_LOJA' || item.chegou ? '✅ Presente' : (item.statusPresenca === 'FALTOU' ? '❌ Falta' : '⏳ Pendente');
          const statusClass = item.statusPresenca === 'EM_LOJA' || item.chegou ? 'text-success' : (item.statusPresenca === 'FALTOU' ? 'text-danger' : 'text-muted');

          timelineHtml += `
            <div class="colab-timeline-card">
              <div class="tl-head">
                <strong>${item.lojaNome}</strong>
                <span class="${statusClass}" style="font-weight:700;">${statusIcon}</span>
              </div>
              <div class="tl-meta">
                <span>📅 ${dataFmt} às ${item.horario}</span>
                <span>📍 ${item.cidade}/${item.estado}</span>
                <span>Cargo: <em>${item.cargo}</em></span>
              </div>
            </div>
          `;
        }
        timelineHtml += `</div>`;
      } else {
        timelineHtml += `<div class="dash-empty-box">Nenhuma escala registrada para este colaborador.</div>`;
      }

      timelineHtml += `</div>`;

      bodyEl.innerHTML = `
        <div class="colab-dossie-header">
          <div class="colab-info-box">
            <p><strong>Matrícula/Código:</strong> <code style="color:var(--primary); font-size:1.1rem;">${colab.matricula}</code></p>
            <p><strong>Cidade/Estado:</strong> ${colab.cidade || '—'} / ${colab.estado || '—'}</p>
            <p><strong>Telefone:</strong> ${colab.telefone || '—'}</p>
          </div>
        </div>

        <div class="dash-metrics-grid" style="grid-template-columns: repeat(4, 1fr); margin-top:14px; gap:10px;">
          <div class="metric-card" style="padding:12px;">
            <div class="metric-content">
              <span class="metric-title">TOTAL ESCALAS</span>
              <span class="metric-value">${ind.totalEscalas}</span>
            </div>
          </div>
          <div class="metric-card" style="padding:12px;">
            <div class="metric-content">
              <span class="metric-title">PRESENÇAS</span>
              <span class="metric-value text-success">${ind.presencas}</span>
            </div>
          </div>
          <div class="metric-card" style="padding:12px;">
            <div class="metric-content">
              <span class="metric-title">FALTAS</span>
              <span class="metric-value ${ind.faltas > 0 ? 'text-danger' : ''}">${ind.faltas}</span>
            </div>
          </div>
          <div class="metric-card" style="padding:12px;">
            <div class="metric-content">
              <span class="metric-title">TAXA PRESENÇA</span>
              <span class="metric-value text-primary">${ind.taxaPresenca}%</span>
            </div>
          </div>
        </div>

        ${timelineHtml}
      `;

      modal.classList.add('open', 'active');
    } catch (err) {
      console.error('Erro ao abrir dossiê do colaborador:', err);
      alert('Erro ao carregar histórico: ' + err.message);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return {
    init,
    render,
    carregarHistorico,
    abrirDetalhesOperacao,
    abrirDossieColaborador,
  };
})();

window.HistoricoModule = HistoricoModule;
