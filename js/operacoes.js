/**
 * REBUSS OPS — Módulo de Controle Operacional Diário (Versão SaaS Profissional)
 * Fluxo: Listagem de Operações -> Nova Operação -> Painel Operacional -> Importar Equipe -> Ações Rápidas de Status -> Controle de PIV -> Observações -> Finalizar
 */

const OperacoesModule = (() => {
  'use strict';

  // Estado global do módulo
  const state = {
    periodo: 'hoje',
    data: new Date().toISOString().split('T')[0],
    loja: '',
    cidade: '',
    estado: 'todos',
    status: 'todos',
    operacoesList: [],
    operacaoAtiva: null,
    analiseEquipe: null,
    teamStatusFilter: 'TODOS',
    teamSearchQuery: '',
  };

  function init() {
    bindEvents();
  }

  function bindEvents() {
    // 1. Abas de Período (Hoje, Amanhã, Próximas, Finalizadas, Todas)
    document.querySelectorAll('.ops-tab-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.ops-tab-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        state.periodo = this.getAttribute('data-periodo');
        state.data = '';
        const dateInput = document.getElementById('ops-date-picker');
        if (dateInput) dateInput.value = '';
        carregarListaOperacoes();
      });
    });

    // 2. Filtro de Data Específica
    const dateInput = document.getElementById('ops-date-picker');
    if (dateInput) {
      dateInput.addEventListener('change', (e) => {
        state.data = e.target.value;
        if (state.data) {
          document.querySelectorAll('.ops-tab-btn').forEach(b => b.classList.remove('active'));
          state.periodo = 'custom';
        }
        carregarListaOperacoes();
      });
    }

    // 3. Filtros de Texto / Selects
    const inputLoja = document.getElementById('ops-filter-loja');
    if (inputLoja) {
      let debounceTimer = null;
      inputLoja.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          state.loja = e.target.value.trim();
          carregarListaOperacoes();
        }, 250);
      });
    }

    const selectCidade = document.getElementById('ops-filter-cidade');
    if (selectCidade) {
      selectCidade.addEventListener('change', (e) => {
        state.cidade = e.target.value;
        carregarListaOperacoes();
      });
    }

    const selectEstado = document.getElementById('ops-filter-estado');
    if (selectEstado) {
      selectEstado.addEventListener('change', (e) => {
        state.estado = e.target.value;
        carregarListaOperacoes();
      });
    }

    const selectStatus = document.getElementById('ops-filter-status');
    if (selectStatus) {
      selectStatus.addEventListener('change', (e) => {
        state.status = e.target.value;
        carregarListaOperacoes();
      });
    }

    // Sincronização automática entre Cidade e Estado nos modais
    document.getElementById('novo-op-cidade')?.addEventListener('change', (e) => {
      const estadoInput = document.getElementById('novo-op-estado');
      if (estadoInput) estadoInput.value = e.target.value;
    });
    document.getElementById('novo-op-estado')?.addEventListener('change', (e) => {
      const cidadeInput = document.getElementById('novo-op-cidade');
      if (cidadeInput) cidadeInput.value = e.target.value;
    });
    document.getElementById('edit-op-cidade')?.addEventListener('change', (e) => {
      const estadoInput = document.getElementById('edit-op-estado');
      if (estadoInput) estadoInput.value = e.target.value;
    });
    document.getElementById('edit-op-estado')?.addEventListener('change', (e) => {
      const cidadeInput = document.getElementById('edit-op-cidade');
      if (cidadeInput) cidadeInput.value = e.target.value;
    });

    // Botão Limpar Filtros
    document.getElementById('btn-ops-limpar-filtros')?.addEventListener('click', () => {
      state.periodo = 'hoje';
      state.data = new Date().toISOString().split('T')[0];
      state.loja = '';
      state.cidade = '';
      state.estado = 'todos';
      state.status = 'todos';

      if (inputLoja) inputLoja.value = '';
      if (inputCidade) inputCidade.value = '';
      if (selectEstado) selectEstado.value = 'todos';
      if (selectStatus) selectStatus.value = 'todos';
      if (dateInput) dateInput.value = '';

      document.querySelectorAll('.ops-tab-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-periodo') === 'hoje');
      });

      carregarListaOperacoes();
    });

    // 4. Nova Operação
    document.getElementById('btn-abrir-nova-operacao')?.addEventListener('click', () => {
      abrirModalNovaOperacao();
    });

    document.getElementById('form-nova-operacao')?.addEventListener('submit', handleCriarOperacao);

    // 4.1. Edição de Operação
    document.getElementById('btn-editar-dados-op')?.addEventListener('click', () => {
      abrirModalEditarOperacao();
    });
    document.getElementById('painel-op-sub')?.addEventListener('click', () => {
      abrirModalEditarOperacao();
    });
    document.getElementById('form-editar-operacao')?.addEventListener('submit', handleEditarOperacao);

    // 4.2. Edição de Colaborador
    document.getElementById('form-editar-membro-op')?.addEventListener('submit', handleEditarMembro);

    // 5. Botões do Painel da Operação
    document.getElementById('btn-voltar-operacoes-dia')?.addEventListener('click', () => {
      fecharPainelOperacao();
    });

    document.getElementById('btn-painel-importar-equipe')?.addEventListener('click', () => {
      abrirModalImportarEquipe();
    });

    document.getElementById('btn-painel-add-colaborador')?.addEventListener('click', () => {
      abrirModalAdicionarColaborador();
    });

    document.getElementById('btn-painel-finalizar-op')?.addEventListener('click', () => {
      abrirModalFinalizarOperacao();
    });

    document.getElementById('btn-salvar-observacoes-op')?.addEventListener('click', handleSalvarObservacoes);

    // 6. Filtros e Busca de Equipe dentro da Operação
    document.querySelectorAll('.ops-team-pill').forEach(btn => {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.ops-team-pill').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        state.teamStatusFilter = this.getAttribute('data-status') || 'TODOS';
        filtrarERenderizarTabelaEquipe();
      });
    });

    const inputTeamSearch = document.getElementById('ops-team-search-input');
    if (inputTeamSearch) {
      inputTeamSearch.addEventListener('input', (e) => {
        state.teamSearchQuery = e.target.value.toLowerCase().trim();
        filtrarERenderizarTabelaEquipe();
      });
    }

    // 6.1. Copiar todos os telefones ao clicar no cabeçalho TELEFONE
    document.getElementById('th-ops-copiar-telefones')?.addEventListener('click', copiarTodosTelefonesOperacao);

    // 7. Modal de Importação de Equipe
    document.getElementById('btn-analisar-equipe-op')?.addEventListener('click', handleAnalisarEquipe);
    document.getElementById('btn-confirmar-importar-equipe-op')?.addEventListener('click', handleConfirmarImportarEquipe);
    document.getElementById('btn-limpar-texto-equipe-op')?.addEventListener('click', () => {
      const ta = document.getElementById('textarea-equipe-op');
      if (ta) ta.value = '';
      resetPreviewEquipe();
    });

    // 8. Modal de Finalizar Operação
    document.getElementById('btn-confirmar-finalizacao-op')?.addEventListener('click', handleConfirmarFinalizacao);

    // 9. Fechamento de Modais
    document.querySelectorAll('.modal-ops-close').forEach(btn => {
      btn.addEventListener('click', fecharTodosModaisOps);
    });

    const modalIds = [
      'modal-nova-operacao',
      'modal-editar-operacao',
      'modal-editar-membro-op',
      'modal-importar-equipe-op',
      'modal-finalizar-operacao',
      'modal-colaborador-dossie'
    ];

    modalIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('click', (e) => {
          if (e.target === el) fecharTodosModaisOps();
        });
      }
    });
  }

  function fecharTodosModaisOps() {
    const modalIds = [
      'modal-nova-operacao',
      'modal-editar-operacao',
      'modal-editar-membro-op',
      'modal-importar-equipe-op',
      'modal-finalizar-operacao',
      'modal-colaborador-dossie'
    ];
    modalIds.forEach(id => {
      document.getElementById(id)?.classList.remove('open', 'active');
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER PRINCIPAL DA ABA OPERAÇÕES
  // ─────────────────────────────────────────────────────────────────────────────
  async function render() {
    if (state.operacaoAtiva) {
      await carregarDetalhesOperacao(state.operacaoAtiva.id);
    } else {
      await carregarListaOperacoes();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. CARREGAR LISTA DE OPERAÇÕES & CENTRAL DE PENDÊNCIAS
  // ─────────────────────────────────────────────────────────────────────────────
  async function carregarListaOperacoes() {
    const listContainer = document.getElementById('ops-dia-list');
    const pendenciasWrapper = document.getElementById('ops-pendencias-wrapper');
    const pendenciasContainer = document.getElementById('ops-pendencias-container');
    const contagemLabel = document.getElementById('ops-lista-contagem');
    const tituloLista = document.getElementById('ops-lista-titulo');

    if (listContainer) {
      listContainer.innerHTML = '<div class="ops-empty-state"><div class="ops-empty-spinner"></div>Carregando operações...</div>';
    }

    try {
      const params = {};
      if (state.periodo && state.periodo !== 'custom') params.periodo = state.periodo;
      if (state.data) params.data = state.data;
      if (state.loja) params.loja = state.loja;
      if (state.cidade) params.cidade = state.cidade;
      if (state.estado !== 'todos') params.estado = state.estado;
      if (state.status !== 'todos') params.status = state.status;

      const operacoes = await RebussAPI.operacoes.list(params);
      state.operacoesList = Array.isArray(operacoes) ? operacoes : [];

      atualizarMetricasGlobais(state.operacoesList);
      renderizarPendencias(state.operacoesList, pendenciasContainer, pendenciasWrapper);
      renderizarCardsOperacoes(state.operacoesList, listContainer, contagemLabel, tituloLista);
    } catch (err) {
      console.error('Erro ao carregar operações:', err);
      if (listContainer) {
        listContainer.innerHTML = `
          <div class="ops-empty-state ops-state-error">
            <p>Erro ao carregar operações do banco PostgreSQL.</p>
            <button type="button" class="btn btn-secondary btn-sm" onclick="OperacoesModule.carregarListaOperacoes()">Tentar novamente</button>
          </div>
        `;
      }
    }
  }

  function atualizarMetricasGlobais(operacoes) {
    let pivTotal = 0;
    let confirmados = 0;
    let emLoja = 0;
    let aCaminho = 0;
    let faltas = 0;
    let atrasados = 0;
    let incompletas = 0;

    operacoes.forEach(op => {
      pivTotal += op.pivNecessario || 0;
      confirmados += op.confirmados || 0;
      emLoja += op.emLoja || 0;
      aCaminho += op.aCaminho || 0;
      faltas += op.faltas || 0;
      atrasados += op.atrasados || 0;
      if (op.pivIncompleto) incompletas++;
    });

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setVal('ops-m-piv-total', pivTotal);
    setVal('ops-m-confirmados', confirmados);
    setVal('ops-m-em-loja', emLoja);
    setVal('ops-m-a-caminho', aCaminho);
    setVal('ops-m-faltas', faltas);
    setVal('ops-m-atrasos', atrasados);
    setVal('ops-m-incompletas', incompletas);
  }

  function renderizarPendencias(operacoes, container, wrapper) {
    if (!container) return;

    const pendencias = [];

    operacoes.forEach(op => {
      if (op.status === 'FINALIZADA') return;

      if (op.pivIncompleto && op.deficit > 0) {
        pendencias.push({
          tipo: 'critico',
          opId: op.id,
          loja: op.loja,
          titulo: `${op.loja} — PIV ${op.emLoja}/${op.pivNecessario}`,
          desc: `Déficit de ${op.deficit} pessoa(s) em loja.`,
        });
      }

      if (op.faltas > 0) {
        pendencias.push({
          tipo: 'critico',
          opId: op.id,
          loja: op.loja,
          titulo: `${op.loja} — ${op.faltas} falta(s) registrada(s)`,
          desc: `Colaborador(es) marcaram falta.`,
        });
      }

      if (op.atrasados > 0) {
        pendencias.push({
          tipo: 'aviso',
          opId: op.id,
          loja: op.loja,
          titulo: `${op.loja} — ${op.atrasados} atraso(s)`,
          desc: `Colaborador(es) em atraso para o início da operação.`,
        });
      }

      if (op.pendentes > 0) {
        pendencias.push({
          tipo: 'alerta',
          opId: op.id,
          loja: op.loja,
          titulo: `${op.loja} — ${op.pendentes} confirmação(ões) pendente(s)`,
          desc: `Aguardando confirmação de presença da equipe.`,
        });
      }
    });

    if (pendencias.length === 0) {
      if (wrapper) wrapper.style.display = 'none';
      container.innerHTML = '';
      return;
    }

    if (wrapper) wrapper.style.display = 'block';

    container.innerHTML = pendencias.slice(0, 6).map(p => `
      <div class="ops-pendencia-item ${p.tipo}" onclick="OperacoesModule.abrirOperacao('${p.opId}')" title="Clique para abrir ${p.loja}">
        <div class="ops-pendencia-text">
          <strong>${p.titulo}</strong>
          <span>${p.desc}</span>
        </div>
        <button type="button" class="btn-outline-ops">Abrir</button>
      </div>
    `).join('');
  }

  function renderizarCardsOperacoes(operacoes, container, contagemEl, tituloEl) {
    if (!container) return;

    const count = operacoes.length;
    if (contagemEl) {
      contagemEl.textContent = `${count} ${count === 1 ? 'operação encontrada' : 'operações encontradas'}`;
    }

    if (tituloEl) {
      const titulosMap = {
        hoje: 'Operações de Hoje',
        amanha: 'Operações de Amanhã',
        proximas: 'Próximas Operações',
        finalizadas: 'Operações Finalizadas',
        todas: 'Todas as Operações',
      };
      tituloEl.textContent = titulosMap[state.periodo] || 'Operações';
    }

    if (count === 0) {
      container.innerHTML = `
        <div class="ops-empty-state" style="grid-column: 1 / -1;">
          <p>Nenhuma operação encontrada para os filtros selecionados.</p>
          <button type="button" class="btn btn-primary btn-sm" onclick="OperacoesModule.abrirModalNovaOperacao()">
            + Criar Nova Operação
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = operacoes.map(op => {
      const dataFmt = formatarDataBR(op.data);
      const isFinalizada = op.status === 'FINALIZADA';
      const isPivIncompleto = op.pivIncompleto;
      const deficit = op.deficit || 0;

      let statusBadgeClass = 'badge-completo';
      let statusBadgeText = 'Em andamento';

      if (isFinalizada) {
        statusBadgeClass = 'badge-finalizada';
        statusBadgeText = 'Finalizada';
      } else if (isPivIncompleto) {
        statusBadgeClass = 'badge-incompleto';
        statusBadgeText = 'PIV Incompleto';
      } else if (op.pendentes > 0) {
        statusBadgeClass = 'badge-pendente';
        statusBadgeText = 'Pendente';
      }

      const pivPercent = op.pivNecessario > 0 ? Math.min(100, Math.round((op.emLoja / op.pivNecessario) * 100)) : 0;

      return `
        <div class="ops-card-item ${isFinalizada ? 'finalizada' : ''}">
          <div class="ops-card-header">
            <div>
              <h3 class="ops-card-title">${op.loja}</h3>
              <div class="ops-card-loc">${dataFmt} • ${op.horario} • ${op.cidade}/${op.estado}</div>
            </div>
            <span class="ops-badge-status ${statusBadgeClass}">${statusBadgeText}</span>
          </div>

          <div class="ops-card-piv-summary">
            <div class="ops-card-piv-row">
              <span class="ops-card-piv-tag">PIV <strong>${op.emLoja} / ${op.pivNecessario}</strong></span>
              <span class="ops-card-sub-info">${op.emLoja} em loja · ${op.confirmados} confirmados</span>
            </div>
            <div class="piv-progress-track">
              <div class="piv-progress-fill ${isPivIncompleto ? 'fill-warning' : 'fill-success'}" style="width: ${pivPercent}%;"></div>
            </div>
          </div>

          <div class="ops-card-footer">
            <div class="ops-card-stats-mini">
              <span>A caminho: <strong>${op.aCaminho}</strong></span>
              ${op.faltas > 0 ? `<span class="text-danger">Faltas: <strong>${op.faltas}</strong></span>` : ''}
              ${deficit > 0 && !isFinalizada ? `<span class="ops-card-deficit-tag">Déficit: ${deficit}</span>` : ''}
            </div>
            <button type="button" class="btn btn-secondary btn-sm" onclick="OperacoesModule.abrirOperacao('${op.id}')">
              Abrir operação
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. PAINEL DA OPERAÇÃO (WORKSPACE OPERACIONAL)
  // ─────────────────────────────────────────────────────────────────────────────
  async function abrirOperacao(opId) {
    const diaContainer = document.getElementById('ops-view-dia-container');
    const painelContainer = document.getElementById('ops-view-painel-container');

    if (diaContainer) diaContainer.style.display = 'none';
    if (painelContainer) painelContainer.style.display = 'block';

    window.scrollTo({ top: 0, behavior: 'instant' });
    await carregarDetalhesOperacao(opId);
  }

  function fecharPainelOperacao() {
    state.operacaoAtiva = null;
    const diaContainer = document.getElementById('ops-view-dia-container');
    const painelContainer = document.getElementById('ops-view-painel-container');

    if (painelContainer) painelContainer.style.display = 'none';
    if (diaContainer) diaContainer.style.display = 'block';

    carregarListaOperacoes();
  }

  async function carregarDetalhesOperacao(opId) {
    const tbody = document.getElementById('painel-equipe-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4">Carregando dados da operação...</td></tr>';

    try {
      const op = await RebussAPI.operacoes.get(opId);
      state.operacaoAtiva = op;

      renderizarCabecalhoPainel(op);
      renderizarBlocoPIV(op);
      renderizarTimeline(op.statusLogs || []);
      filtrarERenderizarTabelaEquipe();

      const obsTextarea = document.getElementById('painel-op-observacoes');
      if (obsTextarea) obsTextarea.value = op.observacoes || '';
    } catch (err) {
      console.error('Erro ao carregar detalhes da operação:', err);
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-danger py-4">Erro ao carregar detalhes da operação.</td></tr>';
      }
    }
  }

  function renderizarCabecalhoPainel(op) {
    const titleEl = document.getElementById('painel-op-title');
    const subEl = document.getElementById('painel-op-sub');
    const badgeEl = document.getElementById('painel-op-status-badge');
    const btnFinalizar = document.getElementById('btn-painel-finalizar-op');

    if (titleEl) titleEl.textContent = op.loja;

    if (subEl) {
      const dataFmt = formatarDataBR(op.data);
      const endFmt = op.endereco ? ` • ${op.endereco}` : '';
      subEl.textContent = `${dataFmt} • ${op.horario} • ${op.cidade}/${op.estado}${endFmt}`;
    }

    if (badgeEl) {
      const isFin = op.status === 'FINALIZADA';
      badgeEl.className = `ops-status-badge ${isFin ? 'finalizada' : 'aberta'}`;
      badgeEl.textContent = isFin ? 'Finalizada' : 'Em andamento';
    }

    if (btnFinalizar) {
      btnFinalizar.style.display = op.status === 'FINALIZADA' ? 'none' : 'inline-flex';
    }
  }

  function renderizarBlocoPIV(op) {
    const metricas = op.metricas || {};
    const pivNec = metricas.pivNecessario || op.pivNecessario || 0;
    const emLoja = metricas.emLoja || 0;
    const confirmados = metricas.confirmados || 0;
    const aCaminho = metricas.aCaminho || 0;
    const faltas = metricas.faltas || 0;
    const atrasados = metricas.atrasados || 0;
    const deficit = metricas.deficit || 0;
    const isPivIncompleto = metricas.pivIncompleto;
    const isFinalizada = op.status === 'FINALIZADA';

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setVal('painel-piv-necessario', pivNec);
    setVal('painel-confirmados', confirmados);
    setVal('painel-a-caminho', aCaminho);
    setVal('painel-em-loja', emLoja);
    setVal('painel-atrasos', atrasados);
    setVal('painel-faltas', faltas);
    setVal('painel-piv-big-counter', `${emLoja} / ${pivNec}`);

    // Barra de Progresso
    const progressFill = document.getElementById('painel-piv-progress-fill');
    const statusPill = document.getElementById('painel-piv-status-pill');
    const percent = pivNec > 0 ? Math.min(100, Math.round((emLoja / pivNec) * 100)) : 0;

    if (progressFill) {
      progressFill.style.width = `${percent}%`;
      progressFill.className = `piv-progress-fill ${isPivIncompleto ? 'fill-warning' : 'fill-success'}`;
    }

    if (statusPill) {
      if (isFinalizada) {
        statusPill.className = 'piv-status-pill pill-neutral';
        statusPill.textContent = 'Operação Encerrada';
      } else if (isPivIncompleto) {
        statusPill.className = 'piv-status-pill pill-warning';
        statusPill.textContent = `PIV Incompleto · Déficit: ${deficit}`;
      } else {
        statusPill.className = 'piv-status-pill pill-success';
        statusPill.textContent = 'PIV Completo';
      }
    }

    // Banner Dinâmico Discreto de PIV Incompleto
    const bannerEl = document.getElementById('painel-piv-incompleto-banner');
    if (bannerEl) {
      if (isPivIncompleto && !isFinalizada && deficit > 0) {
        bannerEl.style.display = 'block';
        bannerEl.innerHTML = `
          <div class="ops-piv-alert-discrete">
            <div class="ops-piv-alert-dot"></div>
            <div class="ops-piv-alert-text">
              <strong>PIV INCOMPLETO</strong> — PIV Necessário: ${pivNec} · Presentes em loja: ${emLoja} · <strong>Déficit de ${deficit} pessoa(s).</strong>
            </div>
          </div>
        `;
      } else {
        bannerEl.style.display = 'none';
        bannerEl.innerHTML = '';
      }
    }

    // Atualizar Contadores das Pílulas de Filtro da Equipe
    atualizarContadoresPillsEquipe(op.membros || []);
  }

  function atualizarContadoresPillsEquipe(membros) {
    const counts = {
      TODOS: membros.length,
      PENDENTE: 0,
      CONFIRMADO: 0,
      A_CAMINHO: 0,
      EM_LOJA: 0,
      ATRASADO: 0,
      FALTOU: 0,
    };

    membros.forEach(m => {
      const st = m.status || 'PENDENTE';
      if (counts[st] !== undefined) counts[st]++;
    });

    const setCnt = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setCnt('cnt-team-todos', counts.TODOS);
    setCnt('cnt-team-pendentes', counts.PENDENTE);
    setCnt('cnt-team-confirmados', counts.CONFIRMADO);
    setCnt('cnt-team-caminho', counts.A_CAMINHO);
    setCnt('cnt-team-loja', counts.EM_LOJA);
    setCnt('cnt-team-atrasados', counts.ATRASADO);
    setCnt('cnt-team-faltas', counts.FALTOU);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. TABELA DE EQUIPE & AÇÕES RÁPIDAS
  // ─────────────────────────────────────────────────────────────────────────────
  function filtrarERenderizarTabelaEquipe() {
    const tbody = document.getElementById('painel-equipe-tbody');
    if (!tbody || !state.operacaoAtiva) return;

    let membros = state.operacaoAtiva.membros || [];

    // 1. Filtro por status
    if (state.teamStatusFilter !== 'TODOS') {
      membros = membros.filter(m => (m.status || 'PENDENTE') === state.teamStatusFilter);
    }

    // 2. Filtro por busca textual (Nome, Código, Matrícula, Telefone)
    if (state.teamSearchQuery) {
      const q = state.teamSearchQuery;
      membros = membros.filter(m => {
        const nome = (m.nome || '').toLowerCase();
        const codigo = (m.codigo || '').toLowerCase();
        const mat = (m.matricula || '').toLowerCase();
        const tel = (m.telefone || '').replace(/\D/g, '');
        return nome.includes(q) || codigo.includes(q) || mat.includes(q) || tel.includes(q);
      });
    }

    if (membros.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center py-4 text-muted">
            Nenhum colaborador encontrado com os filtros aplicados.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = membros.map((m, idx) => {
      const telClean = (m.telefone || '').replace(/\D/g, '');
      const zapLink = telClean ? `https://wa.me/55${telClean}` : null;
      const status = m.status || 'PENDENTE';
      const statusClass = `status-${status.toLowerCase()}`;
      const statusLabel = formatarStatusLabel(status);

      return `
        <tr data-membro-id="${m.id}" data-usuario-id="${m.usuarioId}">
          <td class="text-muted" style="font-size:0.78rem;">${idx + 1}</td>
          <td><span class="ops-role-pill">${m.cargo || 'Operador'}</span></td>
          <td>
            <code class="ops-code-tag" onclick="OperacoesModule.abrirModalEditarMembro('${m.usuarioId}')" style="cursor:pointer;" title="Clique para editar matrícula/dados">
              ${m.matricula || m.codigo || '—'}
            </code>
          </td>
          <td>
            <button type="button" class="ops-colab-link" onclick="OperacoesModule.abrirModalEditarMembro('${m.usuarioId}')" title="Clique para editar integrante">
              <strong>${m.nome}</strong>
            </button>
          </td>
          <td>
            <span class="text-muted" onclick="OperacoesModule.abrirModalEditarMembro('${m.usuarioId}')" style="cursor:pointer; font-size:0.82rem;" title="Clique para editar cidade">
              ${m.cidade || '—'}
            </span>
          </td>
          <td>
            <div style="display:inline-flex; align-items:center; gap:6px;">
              <span class="ops-editable-tel" onclick="OperacoesModule.editarTelefoneInline('${m.usuarioId}', '${m.telefone || ''}')" title="Clique para editar o telefone">
                ${m.telefone || '<span class="text-muted" style="font-size:0.8rem;">(sem telefone)</span>'}
              </span>
              ${zapLink ? `
                <a href="${zapLink}" target="_blank" rel="noopener noreferrer" class="ops-zap-btn" title="Conversar no WhatsApp">
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                    <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.312.045-.63.078-1.802-.408-1.498-.62-2.438-2.146-2.51-2.244-.07-.099-.606-.807-.606-1.54 0-.733.383-1.094.52-1.242.136-.148.298-.185.398-.185.099 0 .198.001.284.005.091.004.213-.034.333.255.124.298.423 1.034.46 1.109.037.075.062.162.012.261-.049.099-.074.161-.148.247-.074.086-.156.193-.223.259-.074.074-.151.155-.065.303.086.148.384.633.824 1.025.567.505 1.045.662 1.194.736.148.074.235.062.322-.037.086-.099.37-.432.469-.58.099-.148.198-.124.334-.074.136.049.865.408 1.014.482.148.074.247.111.284.173.037.062.037.359-.107.764z"/>
                  </svg>
                </a>
              ` : ''}
            </div>
          </td>
          <td>
            <span class="ops-status-tag ${statusClass}">${statusLabel}</span>
          </td>
          <td>
            <div class="ops-quick-action-row">
              <button type="button" class="btn-ops-act btn-act-conf ${status === 'CONFIRMADO' ? 'active' : ''}" onclick="OperacoesModule.alterarStatusMembro('${m.usuarioId}', 'CONFIRMADO')" title="Confirmar presença">
                Confirmar
              </button>
              <button type="button" class="btn-ops-act btn-act-cam ${status === 'A_CAMINHO' ? 'active' : ''}" onclick="OperacoesModule.alterarStatusMembro('${m.usuarioId}', 'A_CAMINHO')" title="A caminho da loja">
                A caminho
              </button>
              <button type="button" class="btn-ops-act btn-act-loja ${status === 'EM_LOJA' ? 'active' : ''}" onclick="OperacoesModule.alterarStatusMembro('${m.usuarioId}', 'EM_LOJA')" title="Em loja / Presente">
                Em loja
              </button>

              <select class="ops-select-status-more" onchange="OperacoesModule.alterarStatusMembro('${m.usuarioId}', this.value)" title="Outras opções de status">
                <option value="" disabled selected>Mais...</option>
                <option value="PENDENTE">Pendente</option>
                <option value="ATRASADO">Atrasado</option>
                <option value="FALTOU">Faltou</option>
                <option value="RECUSOU">Recusou</option>
                <option value="CANCELADO">Cancelado</option>
              </select>
            </div>
          </td>
          <td class="text-right">
            <div style="display:inline-flex; align-items:center; gap:4px;">
              <button type="button" class="btn-card-mini" onclick="OperacoesModule.abrirModalEditarMembro('${m.usuarioId}')" title="Editar dados do integrante" style="padding:2px 5px; font-size:0.75rem;">
                ✏️
              </button>
              <button type="button" class="btn-icon-del-colab" onclick="OperacoesModule.removerColaboradorOperacao('${m.id}', '${m.nome}')" title="Remover da operação">
                ✕
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  function formatarStatusLabel(st) {
    const map = {
      PENDENTE: 'Pendente',
      CONFIRMADO: 'Confirmado',
      A_CAMINHO: 'A caminho',
      EM_LOJA: 'Em loja',
      ATRASADO: 'Atrasado',
      FALTOU: 'Faltou',
      RECUSOU: 'Recusou',
      CANCELADO: 'Cancelado',
    };
    return map[st] || st;
  }

  async function alterarStatusMembro(usuarioId, novoStatus) {
    if (!state.operacaoAtiva || !novoStatus) return;

    try {
      const opId = state.operacaoAtiva.id;
      await RebussAPI.operacoes.updateStatus(opId, usuarioId, novoStatus);

      // Atualizar no estado local
      const membro = state.operacaoAtiva.membros.find(m => m.usuarioId === usuarioId);
      if (membro) {
        membro.status = novoStatus;
        if (novoStatus === 'CONFIRMADO') membro.confirmou = true;
        if (novoStatus === 'EM_LOJA') {
          membro.confirmou = true;
          membro.chegou = true;
        }
      }

      // Recalcular métricas
      recalcularMetricasLocais();
      renderizarBlocoPIV(state.operacaoAtiva);
      filtrarERenderizarTabelaEquipe();

      // Recarregar histórico/timeline em segundo plano
      const opAtualizada = await RebussAPI.operacoes.get(opId);
      if (opAtualizada && opAtualizada.statusLogs) {
        renderizarTimeline(opAtualizada.statusLogs);
      }

      showToast(`Status atualizado para ${formatarStatusLabel(novoStatus)}`);
    } catch (err) {
      console.error('Erro ao atualizar status do colaborador:', err);
      showToast('Erro ao atualizar status no banco PostgreSQL', 'error');
    }
  }

  function recalcularMetricasLocais() {
    if (!state.operacaoAtiva) return;

    const membros = state.operacaoAtiva.membros || [];
    const pivNec = state.operacaoAtiva.pivNecessario || membros.length || 0;

    let confirmados = 0;
    let aCaminho = 0;
    let emLoja = 0;
    let faltas = 0;
    let atrasados = 0;
    let pendentes = 0;

    membros.forEach(m => {
      const s = m.status || 'PENDENTE';
      if (s === 'CONFIRMADO' || m.confirmou) confirmados++;
      if (s === 'A_CAMINHO') aCaminho++;
      if (s === 'EM_LOJA' || m.chegou) emLoja++;
      if (s === 'FALTOU') faltas++;
      if (s === 'ATRASADO') atrasados++;
      if (s === 'PENDENTE') pendentes++;
    });

    const deficit = Math.max(0, pivNec - emLoja);
    const pivIncompleto = emLoja < pivNec && state.operacaoAtiva.status !== 'FINALIZADA';

    state.operacaoAtiva.metricas = {
      pivNecessario: pivNec,
      confirmados,
      aCaminho,
      emLoja,
      faltas,
      atrasados,
      pendentes,
      deficit,
      pivIncompleto,
    };
  }

  async function removerColaboradorOperacao(membroId, nome) {
    if (!state.operacaoAtiva) return;
    if (!confirm(`Deseja remover ${nome} desta operação?`)) return;

    try {
      await RebussAPI.operacoes.removeMembro(state.operacaoAtiva.id, membroId);
      state.operacaoAtiva.membros = state.operacaoAtiva.membros.filter(m => m.id !== membroId);

      recalcularMetricasLocais();
      renderizarBlocoPIV(state.operacaoAtiva);
      filtrarERenderizarTabelaEquipe();
      showToast('Colaborador removido da operação');
    } catch (err) {
      console.error('Erro ao remover colaborador:', err);
      showToast('Erro ao remover colaborador', 'error');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. OBSERVAÇÕES & HISTÓRICO DA OPERAÇÃO
  // ─────────────────────────────────────────────────────────────────────────────
  async function handleSalvarObservacoes() {
    if (!state.operacaoAtiva) return;

    const textarea = document.getElementById('painel-op-observacoes');
    const observacoes = textarea ? textarea.value.trim() : '';

    try {
      await RebussAPI.operacoes.updateObservacoes(state.operacaoAtiva.id, observacoes);
      state.operacaoAtiva.observacoes = observacoes;
      showToast('Observações salvas com sucesso!');
    } catch (err) {
      console.error('Erro ao salvar observações:', err);
      showToast('Erro ao salvar observações', 'error');
    }
  }

  function renderizarTimeline(logs) {
    const container = document.getElementById('painel-op-timeline');
    if (!container) return;

    if (!logs || logs.length === 0) {
      container.innerHTML = '<div class="text-muted" style="font-size:0.82rem; padding:8px 0;">Nenhuma alteração registrada até o momento.</div>';
      return;
    }

    container.innerHTML = logs.map(l => {
      const timeFmt = formatarHora(l.criadoEm);
      return `
        <div class="ops-timeline-item">
          <span class="ops-timeline-time">${timeFmt}</span>
          <span class="ops-timeline-dot"></span>
          <span class="ops-timeline-desc">${l.acao}</span>
        </div>
      `;
    }).join('');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. MODAL: NOVA OPERAÇÃO
  // ─────────────────────────────────────────────────────────────────────────────
  function abrirModalNovaOperacao() {
    const modal = document.getElementById('modal-nova-operacao');
    const inputData = document.getElementById('novo-op-data');
    if (inputData && !inputData.value) {
      inputData.value = new Date().toISOString().split('T')[0];
    }
    if (modal) modal.classList.add('open');
  }

  async function handleCriarOperacao(e) {
    e.preventDefault();

    const btnSubmit = document.getElementById('btn-submit-nova-op');
    const lojaInput = document.getElementById('novo-op-loja');
    const dataInput = document.getElementById('novo-op-data');
    const horarioInput = document.getElementById('novo-op-horario');
    const pivInput = document.getElementById('novo-op-piv');
    const cidadeInput = document.getElementById('novo-op-cidade');
    const estadoInput = document.getElementById('novo-op-estado');

    const loja = lojaInput?.value.trim();
    const data = dataInput?.value;
    const horario = horarioInput?.value;
    const piv = parseInt(pivInput?.value, 10) || 5;
    const cidade = cidadeInput?.value || 'SP';
    const estado = estadoInput?.value || cidade;

    if (!loja || !data || !horario) {
      showToast('Preencha os campos obrigatórios da operação (Loja, Data e Horário)', 'error');
      return;
    }

    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.innerHTML = '<span class="btn-spinner"></span> Criando operação...';
    }

    try {
      const res = await RebussAPI.operacoes.create({
        lojaNome: loja,
        data,
        horario,
        pivNecessario: piv,
        cidade,
        estado,
      });

      // Limpar formulário
      if (lojaInput) lojaInput.value = '';

      fecharTodosModaisOps();
      showToast(`Operação ${loja} criada com sucesso! Cole a equipe para continuar.`);

      // Redireciona diretamente para o painel da operação criada e abre modal de importar equipe
      if (res && res.operacao && res.operacao.id) {
        await abrirOperacao(res.operacao.id);
        abrirModalImportarEquipe();
      } else {
        await carregarListaOperacoes();
      }
    } catch (err) {
      console.error('Erro ao criar operação:', err);
      showToast(err.message || 'Erro ao criar operação', 'error');
    } finally {
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = 'Criar Operação';
      }
    }
  }

  function normalizarSiglaPraca(val) {
    if (!val) return 'SP';
    const s = String(val).trim().toUpperCase();
    if (['SP', 'DF', 'MG', 'GO', 'RJ'].includes(s)) return s;
    if (s.includes('SÃO PAULO') || s.includes('SAO PAULO')) return 'SP';
    if (s.includes('DISTRITO') || s.includes('BRASÍLIA') || s.includes('BRASILIA')) return 'DF';
    if (s.includes('MINAS') || s.includes('BELO HORIZONTE')) return 'MG';
    if (s.includes('GOIÁS') || s.includes('GOIAS') || s.includes('GOIÂNIA') || s.includes('GOIANIA')) return 'GO';
    if (s.includes('RIO DE JANEIRO')) return 'RJ';
    return 'SP';
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5.1. MODAL: EDITAR OPERAÇÃO
  // ─────────────────────────────────────────────────────────────────────────────
  async function abrirModalEditarOperacao(targetOpId) {
    let op = null;

    if (typeof targetOpId === 'string' && targetOpId.trim()) {
      try {
        op = await RebussAPI.operacoes.get(targetOpId.trim());
        state.operacaoAtiva = op;
      } catch (err) {
        console.error('[Operações] Erro ao carregar operação por ID:', err);
      }
    }

    if (!op) {
      op = state.operacaoAtiva;
    }

    // Se state.operacaoAtiva não estiver no estado, tenta recuperar pelo container
    if (!op || !op.id) {
      const painel = document.getElementById('ops-view-painel-container');
      const opId = painel?.dataset?.opId;
      if (opId) {
        try {
          op = await RebussAPI.operacoes.get(opId);
          state.operacaoAtiva = op;
        } catch (err) {
          console.error('[Operações] Erro ao carregar dados da operação para edição:', err);
        }
      }
    }

    if (!op || !op.id) {
      showToast('Nenhuma operação ativa selecionada para editar', 'error');
      return;
    }

    const modal = document.getElementById('modal-editar-operacao');
    const lojaInput = document.getElementById('edit-op-loja');
    const dataInput = document.getElementById('edit-op-data');
    const horarioInput = document.getElementById('edit-op-horario');
    const pivInput = document.getElementById('edit-op-piv');
    const cidadeInput = document.getElementById('edit-op-cidade');
    const estadoInput = document.getElementById('edit-op-estado');
    const btnSubmit = document.getElementById('btn-submit-editar-op');

    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = 'Salvar Alterações';
    }

    const nomeLoja = typeof op.loja === 'string' ? op.loja : (op.loja?.nome || op.lojaNome || '');
    const rawCidade = op.cidade || (op.loja && typeof op.loja === 'object' ? op.loja.cidade : '') || 'SP';
    const rawEstado = op.estado || (op.loja && typeof op.loja === 'object' ? op.loja.estado : '') || 'SP';
    const sigla = normalizarSiglaPraca(rawCidade || rawEstado);
    const piv = op.pivNecessario || op.piv || (op.metricas ? op.metricas.pivNecessario : 5) || 5;
    const horario = op.horario || '18:30';

    let dt = '';
    if (op.data) {
      try {
        if (typeof op.data === 'string' && op.data.includes('T')) {
          dt = op.data.split('T')[0];
        } else if (typeof op.data === 'string' && op.data.match(/^\d{4}-\d{2}-\d{2}$/)) {
          dt = op.data;
        } else {
          const d = new Date(op.data);
          const y = d.getUTCFullYear();
          const m = String(d.getUTCMonth() + 1).padStart(2, '0');
          const day = String(d.getUTCDate()).padStart(2, '0');
          dt = `${y}-${m}-${day}`;
        }
      } catch {
        dt = '';
      }
    }

    if (lojaInput) lojaInput.value = nomeLoja;
    if (dataInput) dataInput.value = dt;
    if (horarioInput) horarioInput.value = horario;
    if (pivInput) pivInput.value = piv;
    if (cidadeInput) cidadeInput.value = sigla;
    if (estadoInput) estadoInput.value = sigla;

    if (modal) {
      modal.classList.add('open', 'active');
    }
  }

  async function handleEditarOperacao(e) {
    if (e) {
      e.preventDefault();
      if (e.stopPropagation) e.stopPropagation();
    }

    const op = state.operacaoAtiva;
    const opId = op?.id || document.getElementById('ops-view-painel-container')?.dataset?.opId;

    if (!opId) {
      showToast('ID da operação não encontrado para atualizar', 'error');
      return;
    }

    const btnSubmit = document.getElementById('btn-submit-editar-op');
    const lojaInput = document.getElementById('edit-op-loja');
    const dataInput = document.getElementById('edit-op-data');
    const horarioInput = document.getElementById('edit-op-horario');
    const pivInput = document.getElementById('edit-op-piv');
    const cidadeInput = document.getElementById('edit-op-cidade');
    const estadoInput = document.getElementById('edit-op-estado');

    const loja = lojaInput?.value.trim();
    const data = dataInput?.value;
    const horario = horarioInput?.value;
    const piv = parseInt(pivInput?.value, 10) || 5;
    const cidade = cidadeInput?.value || 'SP';
    const estado = estadoInput?.value || cidade;

    if (!loja || !data || !horario) {
      showToast('Preencha os campos obrigatórios (Nome da Loja, Data e Horário)', 'error');
      return;
    }

    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.innerHTML = '<span class="btn-spinner"></span> Salvando alterações...';
    }

    try {
      const payload = {
        lojaNome: loja,
        data,
        horario,
        pivNecessario: piv,
        cidade,
        estado,
      };

      const res = await RebussAPI.operacoes.update(opId, payload);

      fecharTodosModaisOps();
      showToast('✓ Operação atualizada com sucesso!');
      await carregarDetalhesOperacao(opId);
    } catch (err) {
      console.error(`[Operações] PUT /api/operacoes/${opId} falhou:`, err);
      showToast(err.message || 'Não foi possível atualizar a operação. Tente novamente.', 'error');
    } finally {
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = 'Salvar Alterações';
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5.2. EDIÇÃO DE COLABORADORES
  // ─────────────────────────────────────────────────────────────────────────────
  function abrirModalEditarMembro(usuarioId) {
    if (!state.operacaoAtiva || !usuarioId) return;

    const membro = (state.operacaoAtiva.membros || []).find(m => m.usuarioId === usuarioId);
    if (!membro) return;

    const modal = document.getElementById('modal-editar-membro-op');
    const idInput = document.getElementById('edit-membro-usuario-id');
    const nomeInput = document.getElementById('edit-membro-nome');
    const matInput = document.getElementById('edit-membro-matricula');
    const cidInput = document.getElementById('edit-membro-cidade');
    const telInput = document.getElementById('edit-membro-telefone');

    if (idInput) idInput.value = usuarioId;
    if (nomeInput) nomeInput.value = membro.nome || '';
    if (matInput) matInput.value = membro.matricula || membro.codigo || '';
    if (cidInput) cidInput.value = membro.cidade || '';
    if (telInput) telInput.value = membro.telefone || '';

    if (modal) modal.classList.add('open');
  }

  async function handleEditarMembro(e) {
    e.preventDefault();
    if (!state.operacaoAtiva) return;

    const idInput = document.getElementById('edit-membro-usuario-id');
    const nomeInput = document.getElementById('edit-membro-nome');
    const matInput = document.getElementById('edit-membro-matricula');
    const cidInput = document.getElementById('edit-membro-cidade');
    const telInput = document.getElementById('edit-membro-telefone');
    const btnSubmit = document.getElementById('btn-submit-editar-membro-op');

    const usuarioId = idInput?.value;
    const nome = nomeInput?.value.trim();
    const matricula = matInput?.value.trim();
    const cidade = cidInput?.value.trim();
    const telefone = telInput?.value.trim();

    if (!usuarioId || !nome) {
      showToast('O nome do colaborador é obrigatório', 'error');
      return;
    }

    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.innerHTML = '<span class="btn-spinner"></span> Salvando...';
    }

    try {
      const opId = state.operacaoAtiva.id;
      await RebussAPI.operacoes.updateMembro(opId, usuarioId, {
        nome,
        matricula,
        cidade,
        telefone,
      });

      // Atualiza no estado local
      const membro = (state.operacaoAtiva.membros || []).find(m => m.usuarioId === usuarioId);
      if (membro) {
        membro.nome = nome;
        membro.matricula = matricula;
        membro.codigo = matricula;
        membro.cidade = cidade;
        membro.telefone = telefone;
      }

      fecharTodosModaisOps();
      filtrarERenderizarTabelaEquipe();
      showToast('Dados do colaborador atualizados com sucesso!');
    } catch (err) {
      console.error('Erro ao atualizar colaborador:', err);
      showToast(err.message || 'Erro ao atualizar dados', 'error');
    } finally {
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = 'Salvar Alterações';
      }
    }
  }

  async function editarTelefoneInline(usuarioId, telAtual) {
    if (!state.operacaoAtiva || !usuarioId) return;

    const membro = (state.operacaoAtiva.membros || []).find(m => m.usuarioId === usuarioId);
    const nome = membro ? membro.nome : 'colaborador';

    const novoTel = prompt(`Editar telefone de ${nome}:`, telAtual || '');
    if (novoTel === null) return; // cancelado pelo usuário

    try {
      const opId = state.operacaoAtiva.id;
      await RebussAPI.operacoes.updateMembro(opId, usuarioId, {
        telefone: novoTel.trim(),
      });

      if (membro) {
        membro.telefone = novoTel.trim();
      }

      filtrarERenderizarTabelaEquipe();
      showToast('Telefone atualizado com sucesso!');
    } catch (err) {
      console.error('Erro ao editar telefone:', err);
      showToast('Erro ao salvar telefone', 'error');
    }
  }

  async function copiarTodosTelefonesOperacao() {
    const th = document.getElementById('th-ops-copiar-telefones');
    if (th) {
      th.style.pointerEvents = 'none';
      th.innerHTML = '<span style="display:inline-flex; align-items:center; gap:5px;">⏳ Carregando...</span>';
    }

    try {
      let op = state.operacaoAtiva;

      // Se a operação ou membros ainda não estiverem carregados, buscar da API
      if (!op || !op.membros || op.membros.length === 0) {
        const painel = document.getElementById('ops-view-painel-container');
        const opId = painel?.dataset?.opId;
        if (opId) {
          try {
            op = await RebussAPI.operacoes.get(opId);
            state.operacaoAtiva = op;
          } catch (fetchErr) {
            console.error('[Operações] Erro ao carregar membros da operação:', fetchErr);
          }
        }
      }

      const membros = (op && op.membros) ? op.membros : [];
      const telefones = [];
      const seen = new Set();

      for (const m of membros) {
        const tel = (m.telefone || m.usuario?.telefone || '').trim();
        if (tel && tel !== '-' && tel !== '—' && !seen.has(tel)) {
          seen.add(tel);
          telefones.push(tel);
        }
      }

      if (telefones.length === 0) {
        showToast('Nenhum telefone cadastrado nesta operação', 'error');
        if (th) {
          th.style.pointerEvents = '';
          th.innerHTML = '<span style="display:inline-flex; align-items:center; gap:5px;">TELEFONE 📋</span>';
        }
        return;
      }

      const texto = telefones.join('\n');

      let copied = false;
      if (navigator.clipboard && window.isSecureContext) {
        try {
          await navigator.clipboard.writeText(texto);
          copied = true;
        } catch (clipErr) {
          console.warn('[Operações] Falha no navigator.clipboard, tentando fallback:', clipErr);
        }
      }

      if (!copied) {
        copied = fallbackCopyText(texto);
      }

      if (copied) {
        showToast('✓ Telefones copiados!');
        if (th) {
          th.innerHTML = '<span style="display:inline-flex; align-items:center; gap:5px; color: var(--success, #10b981);">✓ Copiado!</span>';
          setTimeout(() => {
            if (th) {
              th.style.pointerEvents = '';
              th.innerHTML = '<span style="display:inline-flex; align-items:center; gap:5px;">TELEFONE 📋</span>';
            }
          }, 2000);
        }
      } else {
        throw new Error('Não foi possível acessar a área de transferência');
      }
    } catch (err) {
      console.error('[Operações] Erro ao copiar telefones:', err);
      showToast('Não foi possível copiar os telefones. Tente novamente.', 'error');
      if (th) {
        th.style.pointerEvents = '';
        th.innerHTML = '<span style="display:inline-flex; align-items:center; gap:5px;">TELEFONE 📋</span>';
      }
    }
  }

  function fallbackCopyText(texto) {
    const ta = document.createElement('textarea');
    ta.value = texto;
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.left = '-9999px';
    ta.style.opacity = '0';
    ta.setAttribute('readonly', '');
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    let success = false;
    try {
      success = document.execCommand('copy');
    } catch (e) {
      console.error('[Operações] Fallback execCommand copy error:', e);
      success = false;
    }
    document.body.removeChild(ta);
    return success;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. MODAL: IMPORTAR EQUIPE
  // ─────────────────────────────────────────────────────────────────────────────
  function abrirModalImportarEquipe() {
    if (!state.operacaoAtiva) return;

    const modal = document.getElementById('modal-importar-equipe-op');
    const sub = document.getElementById('modal-importar-equipe-loja-sub');
    const ta = document.getElementById('textarea-equipe-op');

    if (sub) sub.textContent = `Operação: ${state.operacaoAtiva.loja}`;
    if (ta) ta.value = '';
    resetPreviewEquipe();

    if (modal) modal.classList.add('open');
  }

  async function handleAnalisarEquipe() {
    const ta = document.getElementById('textarea-equipe-op');
    const texto = ta ? ta.value.trim() : '';

    if (!texto) {
      showToast('Cole o texto da equipe antes de analisar', 'error');
      return;
    }

    const btnAnalisar = document.getElementById('btn-analisar-equipe-op');
    const originalText = btnAnalisar ? btnAnalisar.textContent : 'Analisar Equipe';
    if (btnAnalisar) {
      btnAnalisar.disabled = true;
      btnAnalisar.textContent = 'Analisando...';
    }

    try {
      const res = await RebussAPI.operacoes.analisar(texto);
      state.analiseEquipe = res.colaboradores || [];

      const previewWrap = document.getElementById('import-equipe-preview-wrap');
      const previewTbody = document.getElementById('table-preview-equipe-tbody');
      const previewCount = document.getElementById('preview-equipe-count');
      const btnConfirmar = document.getElementById('btn-confirmar-importar-equipe-op');

      if (previewCount) {
        previewCount.textContent = `${state.analiseEquipe.length} colaboradores identificados`;
      }

      if (previewTbody) {
        previewTbody.innerHTML = state.analiseEquipe.map((c, i) => `
          <tr>
            <td>${i + 1}</td>
            <td><span class="ops-role-pill">${c.cargo || 'Operador'}</span></td>
            <td><strong>${c.nome}</strong></td>
            <td><code style="font-weight:700; color:var(--primary);">${c.matricula || '—'}</code></td>
            <td>${c.cidade || '—'}</td>
            <td>${c.telefone || '—'}</td>
          </tr>
        `).join('');
      }

      if (previewWrap) previewWrap.style.display = 'block';
      if (btnConfirmar) btnConfirmar.disabled = state.analiseEquipe.length === 0;

      if (state.analiseEquipe.length > 0) {
        showToast(`${state.analiseEquipe.length} colaboradores identificados!`);
      } else {
        showToast('Nenhum colaborador identificado no texto fornecido', 'warning');
      }
    } catch (err) {
      console.error('Erro ao analisar equipe:', err);
      showToast(err.message || 'Erro ao interpretar texto da equipe', 'error');
    } finally {
      if (btnAnalisar) {
        btnAnalisar.disabled = false;
        btnAnalisar.textContent = originalText;
      }
    }
  }

  function resetPreviewEquipe() {
    state.analiseEquipe = null;
    const previewWrap = document.getElementById('import-equipe-preview-wrap');
    const previewTbody = document.getElementById('table-preview-equipe-tbody');
    const btnConfirmar = document.getElementById('btn-confirmar-importar-equipe-op');

    if (previewWrap) previewWrap.style.display = 'none';
    if (previewTbody) previewTbody.innerHTML = '';
    if (btnConfirmar) btnConfirmar.disabled = true;
  }

  async function handleConfirmarImportarEquipe() {
    if (!state.operacaoAtiva) return;

    const ta = document.getElementById('textarea-equipe-op');
    const texto = ta ? ta.value.trim() : '';

    if (!texto && (!state.analiseEquipe || state.analiseEquipe.length === 0)) {
      showToast('Texto de equipe vazio', 'error');
      return;
    }

    const btnConfirmar = document.getElementById('btn-confirmar-importar-equipe-op');
    const originalText = btnConfirmar ? btnConfirmar.textContent : 'Importar para a Operação';
    if (btnConfirmar) {
      btnConfirmar.disabled = true;
      btnConfirmar.textContent = 'Importando...';
    }

    try {
      const opId = state.operacaoAtiva.id;
      const res = await RebussAPI.operacoes.importarEquipe(opId, {
        texto,
        colaboradores: state.analiseEquipe || []
      });

      fecharTodosModaisOps();
      showToast(res.mensagem || 'Equipe importada com sucesso!');

      await carregarDetalhesOperacao(opId);
    } catch (err) {
      console.error('Erro ao importar equipe:', err);
      showToast(err.message || 'Erro ao importar equipe para o banco', 'error');
    } finally {
      if (btnConfirmar) {
        btnConfirmar.disabled = false;
        btnConfirmar.textContent = originalText;
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. MODAL: ADICIONAR COLABORADOR INDIVIDUAL
  // ─────────────────────────────────────────────────────────────────────────────
  async function abrirModalAdicionarColaborador() {
    if (!state.operacaoAtiva) return;

    const nome = prompt('Nome do colaborador:');
    if (!nome || !nome.trim()) return;

    const cargo = prompt('Cargo (Supervisor / Operador):', 'Operador') || 'Operador';
    const codigo = prompt('Código / Matrícula (opcional):', '') || '';
    const telefone = prompt('Telefone / WhatsApp (opcional):', '') || '';

    try {
      await RebussAPI.operacoes.addMembro(state.operacaoAtiva.id, {
        nome: nome.trim(),
        cargo: cargo.trim(),
        codigo: codigo.trim(),
        telefone: telefone.trim(),
      });

      showToast(`${nome} adicionado à operação!`);
      await carregarDetalhesOperacao(state.operacaoAtiva.id);
    } catch (err) {
      console.error('Erro ao adicionar colaborador:', err);
      showToast('Erro ao adicionar colaborador', 'error');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. MODAL: FINALIZAR OPERAÇÃO
  // ─────────────────────────────────────────────────────────────────────────────
  function abrirModalFinalizarOperacao() {
    if (!state.operacaoAtiva) return;

    const op = state.operacaoAtiva;
    const modal = document.getElementById('modal-finalizar-operacao');
    const nomeEl = document.getElementById('fin-loja-nome');
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    if (nomeEl) nomeEl.textContent = op.loja;

    const m = op.metricas || {};
    setVal('fin-piv-nec', m.pivNecessario || op.pivNecessario || 0);
    setVal('fin-confirmados', m.confirmados || 0);
    setVal('fin-em-loja', m.emLoja || 0);
    setVal('fin-a-caminho', m.aCaminho || 0);
    setVal('fin-atrasados', m.atrasados || 0);
    setVal('fin-faltas', m.faltas || 0);

    const warnEl = document.getElementById('fin-incompleto-warning');
    if (warnEl) {
      if (m.pivIncompleto && m.deficit > 0) {
        warnEl.innerHTML = `
          <div class="ops-piv-alert-discrete" style="margin-top:10px;">
            <div class="ops-piv-alert-dot"></div>
            <div class="ops-piv-alert-text">
              <strong>Atenção:</strong> PIV incompleto com déficit de ${m.deficit} colaborador(es).
            </div>
          </div>
        `;
      } else {
        warnEl.innerHTML = '';
      }
    }

    if (modal) modal.classList.add('open');
  }

  async function handleConfirmarFinalizacao() {
    if (!state.operacaoAtiva) return;

    try {
      const opId = state.operacaoAtiva.id;
      await RebussAPI.operacoes.finalizar(opId);

      fecharTodosModaisOps();
      showToast(`Operação ${state.operacaoAtiva.loja} finalizada e salva no histórico!`);

      await carregarDetalhesOperacao(opId);
    } catch (err) {
      console.error('Erro ao finalizar operação:', err);
      showToast('Erro ao finalizar operação', 'error');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 9. MODAL: DOSSIÊ DO COLABORADOR
  // ─────────────────────────────────────────────────────────────────────────────
  async function abrirDossieColaborador(idOrCodigo) {
    const modal = document.getElementById('modal-colaborador-dossie');
    const body = document.getElementById('modal-dossie-body');

    if (!modal || !body) return;
    body.innerHTML = '<div class="text-center py-4 text-muted">Carregando histórico do colaborador...</div>';
    modal.classList.add('open');

    try {
      const data = await RebussAPI.historico.getColaborador(idOrCodigo);
      const c = data.colaborador || {};
      const ind = data.indicadores || {};
      const timeline = data.timeline || [];

      body.innerHTML = `
        <div class="dossie-header-card">
          <div class="dossie-avatar">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
          </div>
          <div class="dossie-info">
            <h2>${c.nome || 'Colaborador'}</h2>
            <div class="dossie-tags">
              <span>Código: <strong>${c.codigo || '—'}</strong></span>
              <span>Matrícula: <strong>${c.matricula || '—'}</strong></span>
              <span>Telefone: <strong>${c.telefone || '—'}</strong></span>
              <span>Cidade: <strong>${c.cidade || '—'}</strong></span>
            </div>
          </div>
        </div>

        <div class="dossie-stats-grid">
          <div class="dossie-stat-card">
            <span class="dossie-stat-label">OPERAÇÕES</span>
            <strong class="dossie-stat-val">${ind.totalEscalas || 0}</strong>
          </div>
          <div class="dossie-stat-card">
            <span class="dossie-stat-label">PRESENÇAS</span>
            <strong class="dossie-stat-val em-loja">${ind.presencas || 0}</strong>
          </div>
          <div class="dossie-stat-card">
            <span class="dossie-stat-label">FALTAS</span>
            <strong class="dossie-stat-val faltas">${ind.faltas || 0}</strong>
          </div>
          <div class="dossie-stat-card">
            <span class="dossie-stat-label">ATRASOS</span>
            <strong class="dossie-stat-val atrasos">${ind.atrasos || 0}</strong>
          </div>
          <div class="dossie-stat-card">
            <span class="dossie-stat-label">% PRESENÇA</span>
            <strong class="dossie-stat-val ${ind.taxaPresenca >= 90 ? 'em-loja' : 'faltas'}">${ind.taxaPresenca || 0}%</strong>
          </div>
        </div>

        <h4 style="margin:16px 0 8px; font-size:0.92rem;">Histórico de Operações</h4>
        <div class="table-responsive" style="max-height:240px; overflow-y:auto;">
          <table class="ops-excel-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Loja</th>
                <th>Horário</th>
                <th>Cargo</th>
                <th>Status Presença</th>
              </tr>
            </thead>
            <tbody>
              ${timeline.length > 0 ? timeline.map(t => `
                <tr>
                  <td>${formatarDataBR(t.data)}</td>
                  <td><strong>${t.lojaNome}</strong></td>
                  <td>${t.horario || '—'}</td>
                  <td><span class="ops-role-pill">${t.cargo || 'Operador'}</span></td>
                  <td><span class="ops-status-tag status-${(t.statusPresenca || 'PENDENTE').toLowerCase()}">${formatarStatusLabel(t.statusPresenca)}</span></td>
                </tr>
              `).join('') : '<tr><td colspan="5" class="text-center py-3 text-muted">Nenhuma operação no histórico.</td></tr>'}
            </tbody>
          </table>
        </div>
      `;
    } catch (err) {
      console.error('Erro ao abrir dossiê:', err);
      body.innerHTML = '<div class="text-center py-4 text-danger">Erro ao carregar histórico do colaborador.</div>';
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // UTILITÁRIOS
  // ─────────────────────────────────────────────────────────────────────────────
  function formatarDataBR(dataIso) {
    if (!dataIso) return '—';
    try {
      const parts = dataIso.split('T')[0].split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return dataIso;
    } catch {
      return dataIso;
    }
  }

  function formatarHora(dataHoraIso) {
    if (!dataHoraIso) return '--:--';
    try {
      const d = new Date(dataHoraIso);
      return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '--:--';
    }
  }

  function showToast(msg, type = 'success') {
    const toast = document.getElementById('global-toast');
    const toastMsg = document.getElementById('toast-msg');
    const toastIcon = document.getElementById('toast-icon');

    if (toast && toastMsg) {
      toastMsg.textContent = msg;
      if (toastIcon) {
        toastIcon.textContent = type === 'error' ? '✕' : '✓';
      }
      toast.className = `toast show ${type}`;
      setTimeout(() => {
        toast.className = 'toast';
      }, 3000);
    }
  }

  // Inicialização automática ao carregar DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return {
    render,
    carregarListaOperacoes,
    abrirOperacao,
    fecharPainelOperacao,
    abrirModalNovaOperacao,
    abrirModalEditarOperacao,
    editarOperacao: abrirModalEditarOperacao,
    abrirEditarOperacao: abrirModalEditarOperacao,
    openEditModal: abrirModalEditarOperacao,
    abrirModalOperacao: abrirModalEditarOperacao,
    handleEditarOperacao,
    abrirModalEditarMembro,
    editarTelefoneInline,
    copiarTodosTelefonesOperacao,
    copiarTodosTelefones: copiarTodosTelefonesOperacao,
    copiarTelefones: copiarTodosTelefonesOperacao,
    abrirDossieColaborador,
    alterarStatusMembro,
    removerColaboradorOperacao,
  };
})();

window.OperacoesModule = OperacoesModule;
window.abrirModalEditarOperacao = OperacoesModule.abrirModalEditarOperacao;
window.handleEditarOperacao = OperacoesModule.handleEditarOperacao;
window.copiarTodosTelefonesOperacao = OperacoesModule.copiarTodosTelefonesOperacao;
window.copiarTelefones = OperacoesModule.copiarTodosTelefonesOperacao;
