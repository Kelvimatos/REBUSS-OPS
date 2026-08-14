/**
 * REBUSS OPS • Equipes Fixas
 * Gerenciamento local de equipes fixas por região (SP, SJC, RJ)
 * Tudo via localStorage — sem backend, sem banco de dados.
 */

const EquipesModule = (() => {
  'use strict';

  const STORAGE_KEY = 'rebuss_equipes_v1';

  const EQUIPES_DEFAULT = {
    sp: { id: 'sp', label: 'São Paulo — SP', equipes: [] },
    sjc: { id: 'sjc', label: 'São José dos Campos — SJC', equipes: [] },
    rj: {
      id: 'rj',
      label: 'Rio de Janeiro — RJ',
      equipes: [
        {
          id: 'rj-wallace',
          nome: 'EQUIPE FIXA RJ — WALLACE',
          membros: [
            { nome: 'Wallace Da Silva De Oliveira', funcao: 'Supervisor', matricula: '' },
            { nome: 'Larissa Carvalho', funcao: 'Operador', matricula: '' },
            { nome: 'Angélica Palácio', funcao: 'Operador', matricula: '' },
            { nome: 'Ana Maria Enedina', funcao: 'Operador', matricula: '' },
            { nome: 'Michel Gomes', funcao: 'Operador', matricula: '' },
            { nome: 'Maria Dias', funcao: 'Operador', matricula: '' },
            { nome: 'Aline Pedro', funcao: 'Operador', matricula: '' },
            { nome: 'William Gama', funcao: 'Operador', matricula: '' },
            { nome: 'Amanda da Silva de Lima (MARÇIA LIRA)', funcao: 'Operador', matricula: '' },
            { nome: 'Vinicios Souza dos Santos', funcao: 'Operador', matricula: '' },
            { nome: 'Daniela dos Santos Leite', funcao: 'Operador', matricula: '' },
            { nome: 'Sara de Souza Araújo', funcao: 'Operador', matricula: '' }
          ]
        },
        {
          id: 'rj-natalia',
          nome: 'EQUIPE FIXA RJ — NATALIA',
          membros: [
            { nome: 'Natalia Duarte Da Silva Lopes', funcao: 'Supervisor', matricula: '' },
            { nome: 'Celso Oliveira Da Silva Junior', funcao: 'Operador', matricula: '' },
            { nome: 'Lucas Da Silva Freire', funcao: 'Operador', matricula: '' },
            { nome: 'Carla Assis Da Costa Assis', funcao: 'Operador', matricula: '' },
            { nome: 'Andrea de Souza Paes', funcao: 'Operador', matricula: '' },
            { nome: 'Marlon Augusto da Silva', funcao: 'Operador', matricula: '' },
            { nome: 'Beatriz Machado', funcao: 'Operador', matricula: '' },
            { nome: 'Luana Borges', funcao: 'Operador', matricula: '' },
            { nome: 'Geysiane Rocha de Oliveira', funcao: 'Operador', matricula: '' },
            { nome: 'Marcela Oliveira Marques Correia', funcao: 'Operador', matricula: '' },
            { nome: 'Lucianne de Fatima Fernandes Almendra', funcao: 'Operador', matricula: '' },
            { nome: 'Anderson De Araújo Miguel', funcao: 'Operador', matricula: '' }
          ]
        },
        {
          id: 'rj-crislaine',
          nome: 'EQUIPE FIXA RJ — CRISLAINE',
          membros: [
            { nome: 'Crislaine Ferreira Guimaraes', funcao: 'Supervisor', matricula: '' },
            { nome: 'Cleidilaine Ferreira Guimaraes', funcao: 'Operador', matricula: '' },
            { nome: 'Paula Denise', funcao: 'Operador', matricula: '' },
            { nome: 'Ricardo Joao Verissimo', funcao: 'Operador', matricula: '' },
            { nome: 'Maria Claudia Augusto', funcao: 'Operador', matricula: '' },
            { nome: 'Joao Victor Augusto', funcao: 'Operador', matricula: '' },
            { nome: 'Nathaly Marques', funcao: 'Operador', matricula: '' },
            { nome: 'Kevin Mozarth De Almeida', funcao: 'Operador', matricula: '' },
            { nome: 'Solange Da Cruz', funcao: 'Operador', matricula: '' }
          ]
        },
        {
          id: 'rj-brunosantana',
          nome: 'EQUIPE FIXA RJ — BRUNO SANTANA',
          membros: [
            { nome: 'Bruno Santana', funcao: 'Supervisor', matricula: '' },
            { nome: 'ROGÉRIO DE ARAUJO SILVA', funcao: 'Operador', matricula: '' },
            { nome: 'DAVI ARNALDO DE SOUZA', funcao: 'Operador', matricula: '' },
            { nome: 'Samuel Romero Lopes', funcao: 'Operador', matricula: '' },
            { nome: 'Janderson Barbosa Monteiro', funcao: 'Operador', matricula: '' },
            { nome: 'THAMIREZ SANTOS SANTANA', funcao: 'Operador', matricula: '' },
            { nome: 'Camila de Oliveira Silva', funcao: 'Operador', matricula: '' },
            { nome: 'Amanda de Moraes Corrêa', funcao: 'Operador', matricula: '' },
            { nome: 'Lucimar Marques Serafina', funcao: 'Operador', matricula: '' },
            { nome: 'Eliane Angelica dos Santos de Lima', funcao: 'Operador', matricula: '' },
            { nome: 'Rayna Romero Nunes de Azevedo', funcao: 'Operador', matricula: '' },
            { nome: 'Jonathan Pereira Mello', funcao: 'Operador', matricula: '' }
          ]
        }
      ]
    }
  };

  const FUNCOES = ['Supervisor','Chefe de Grupo','Operador de Sistema','Operador de PC','Operador','Contador','Auxiliar'];

  let state = {
    regiaoAtiva: 'rj',
    dados: null,
    searchQuery: '',
    editCtx: null,
    addCtx: null,
    deleteCtx: null,
    restoreCtx: null,
    copyCtx: null
  };

  // --- Persistência ---
  function mergeDefaults(dados) {
    const merged = JSON.parse(JSON.stringify(dados || {}));
    Object.keys(EQUIPES_DEFAULT).forEach(regiaoKey => {
      const defRegiao = EQUIPES_DEFAULT[regiaoKey];
      if (!merged[regiaoKey]) {
        merged[regiaoKey] = JSON.parse(JSON.stringify(defRegiao));
        return;
      }
      merged[regiaoKey].label = defRegiao.label;
      defRegiao.equipes.forEach(defEq => {
        if (!merged[regiaoKey].equipes.some(e => e.id === defEq.id)) {
          merged[regiaoKey].equipes.push(JSON.parse(JSON.stringify(defEq)));
        }
      });
    });
    return merged;
  }

  function loadDados() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return mergeDefaults(JSON.parse(raw));
    } catch(e) {}
    return JSON.parse(JSON.stringify(EQUIPES_DEFAULT));
  }

  function saveDados() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.dados)); } catch(e) {}
  }

  function getEquipeById(equipeId) {
    for (const regiao of Object.values(state.dados)) {
      const eq = regiao.equipes.find(e => e.id === equipeId);
      if (eq) return eq;
    }
    return null;
  }

  function getEquipeDefaultById(equipeId) {
    for (const regiao of Object.values(EQUIPES_DEFAULT)) {
      const eq = regiao.equipes.find(e => e.id === equipeId);
      if (eq) return eq;
    }
    return null;
  }

  // --- Copy & Toast ---
  function copyText(text, label) {
    if (!text || text === '—') return;
    const clean = String(text).trim();
    const doToast = () => showToastLocal(label + ' copiado!');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(clean).then(doToast).catch(() => {
        fallbackCopy(clean); doToast();
      });
    } else { fallbackCopy(clean); doToast(); }
    if (window.App && App.playSound) App.playSound('copy');
  }

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy');
    document.body.removeChild(ta);
  }

  function showToastLocal(msg) {
    if (window.App && App.showToast) { App.showToast(msg, '✓'); return; }
    let t = document.getElementById('equipes-toast-fallback');
    if (!t) {
      t = document.createElement('div');
      t.id = 'equipes-toast-fallback';
      t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(10px);background:var(--text-main);color:var(--bg-card);padding:8px 18px;border-radius:6px;font-size:.85rem;font-weight:600;opacity:0;transition:all .2s ease;z-index:9999;pointer-events:none;';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1'; t.style.transform = 'translateX(-50%) translateY(0)';
    clearTimeout(t._t);
    t._t = setTimeout(() => { t.style.opacity='0'; t.style.transform='translateX(-50%) translateY(10px)'; }, 2000);
  }

  // --- Search ---
  function matchSearch(membro, q) {
    if (!q) return true;
    const ql = q.toLowerCase();
    return membro.nome.toLowerCase().includes(ql) ||
           membro.funcao.toLowerCase().includes(ql) ||
           (membro.matricula && membro.matricula.toLowerCase().includes(ql));
  }

  // --- Render ---
  function render() { renderTabs(); renderEquipes(); }

  function renderTabs() {
    const el = document.getElementById('equipes-tabs');
    if (!el) return;
    el.innerHTML = '';
    Object.values(state.dados).forEach(regiao => {
      const btn = document.createElement('button');
      btn.className = 'equipes-tab' + (regiao.id === state.regiaoAtiva ? ' active' : '');
      btn.textContent = regiao.label;
      btn.dataset.regiao = regiao.id;
      btn.addEventListener('click', () => {
        state.regiaoAtiva = regiao.id;
        state.searchQuery = '';
        const s = document.getElementById('equipes-search');
        if (s) s.value = '';
        render();
      });
      el.appendChild(btn);
    });
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function slugFuncao(f) { return f.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z-]/g,''); }

  function renderEquipes() {
    const container = document.getElementById('equipes-container');
    if (!container) return;
    const regiao = state.dados[state.regiaoAtiva];
    if (!regiao) return;
    const query = state.searchQuery.toLowerCase();
    container.innerHTML = '';

    if (regiao.equipes.length === 0) {
      container.innerHTML = `<div class="equipes-empty">
        <div class="equipes-empty-icon">👥</div>
        <p>Nenhuma equipe cadastrada nesta região.</p>
        <button class="btn btn-primary btn-sm" id="btn-nova-equipe-empty">+ Adicionar Equipe</button>
      </div>`;
      const b = document.getElementById('btn-nova-equipe-empty');
      if (b) b.addEventListener('click', () => addEquipe(regiao.id));
    } else {
      regiao.equipes.forEach(equipe => {
        const membrosVisiveis = equipe.membros.filter(m => matchSearch(m, query));
        const nomeMatch = !query || equipe.nome.toLowerCase().includes(query);
        if (query && membrosVisiveis.length === 0 && !nomeMatch) return;

        const supervisor = equipe.membros.find(m => m.funcao === 'Supervisor');
        const card = document.createElement('div');
        card.className = 'equipe-card';
        card.dataset.equipeId = equipe.id;

        card.innerHTML = `
          <div class="equipe-card-header">
            <div class="equipe-card-header-left">
              <div class="equipe-nome-wrapper">
                <span class="equipe-nome">${escHtml(equipe.nome)}</span>
                <button class="btn-equipe-icon btn-edit-nome" title="Editar nome da equipe" data-equipe-id="${equipe.id}">
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                  </svg>
                </button>
              </div>
              ${supervisor ? `<span class="equipe-supervisor">Supervisor: ${escHtml(supervisor.nome)}</span>` : ''}
            </div>
            <div class="equipe-card-header-right">
              <button class="btn btn-ghost btn-sm btn-copy-equipe" data-equipe-id="${equipe.id}">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                Copiar
              </button>
              <button class="btn btn-ghost btn-sm btn-restore-equipe" data-equipe-id="${equipe.id}">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="1 4 1 10 7 10"></polyline>
                  <path d="M3.51 15a9 9 0 1 0 .49-3.2"></path>
                </svg>
                Restaurar
              </button>
            </div>
          </div>
          <div class="equipe-table-wrapper">
            <table class="equipe-table">
              <thead><tr>
                <th class="col-funcao">Função</th>
                <th class="col-nome">Nome</th>
                <th class="col-matricula">Mat.</th>
                <th class="col-acoes"></th>
              </tr></thead>
              <tbody id="tbody-${equipe.id}"></tbody>
            </table>
          </div>
          <div class="equipe-mobile-list" id="mobile-${equipe.id}"></div>
          <div class="equipe-card-footer">
            <button class="btn btn-ghost btn-sm btn-add-membro" data-equipe-id="${equipe.id}">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Adicionar integrante
            </button>
            <span class="equipe-count">${equipe.membros.length} integrante${equipe.membros.length !== 1 ? 's' : ''}</span>
          </div>
        `;

        container.appendChild(card);

        // Preencher tbody e cards mobile
        const tbody = document.getElementById('tbody-' + equipe.id);
        const mobileList = document.getElementById('mobile-' + equipe.id);
        const lista = query ? membrosVisiveis : equipe.membros;

        if (tbody) {
          lista.forEach(membro => {
            const realIdx = equipe.membros.indexOf(membro);
            const mat = membro.matricula && membro.matricula.trim() ? membro.matricula.trim() : '—';
            const matCopy = mat !== '—';
            const tr = document.createElement('tr');
            tr.className = 'membro-row';
            tr.innerHTML = `
              <td class="col-funcao"><span class="funcao-badge funcao-${slugFuncao(membro.funcao)}">${escHtml(membro.funcao)}</span></td>
              <td class="col-nome"><span class="cell-clickable" title="Clique para copiar nome" data-copy="${escHtml(membro.nome)}" data-label="Nome">${escHtml(membro.nome)}</span></td>
              <td class="col-matricula"><span class="${matCopy ? 'cell-clickable' : 'cell-empty'}" ${matCopy ? `title="Clique para copiar matrícula" data-copy="${escHtml(mat)}" data-label="Matrícula"` : ''}>${escHtml(mat)}</span></td>
              <td class="col-acoes">
                <div class="membro-actions">
                  <button class="btn-membro-icon btn-edit-membro" title="Editar" data-equipe-id="${equipe.id}" data-idx="${realIdx}">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                  </button>
                  <button class="btn-membro-icon btn-delete-membro" title="Excluir" data-equipe-id="${equipe.id}" data-idx="${realIdx}">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>
                  </button>
                </div>
              </td>`;
            tbody.appendChild(tr);
          });

          if (lista.length === 0 && query) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td colspan="4" class="equipe-no-results">Nenhum resultado para "<strong>${escHtml(query)}</strong>"</td>`;
            tbody.appendChild(tr);
          }
        }

        if (mobileList) {
          mobileList.innerHTML = '';
          lista.forEach(membro => {
            const realIdx = equipe.membros.indexOf(membro);
            const mat = membro.matricula && membro.matricula.trim() ? membro.matricula.trim() : '';
            const card = document.createElement('div');
            card.className = 'membro-mobile-card';
            card.innerHTML = `
              <div class="membro-mobile-header">
                <span class="membro-mobile-icon">👤</span>
                <div class="membro-mobile-info">
                  <div class="membro-mobile-nome">${escHtml(membro.nome)}</div>
                  <div class="membro-mobile-meta">
                    <span class="funcao-badge funcao-${slugFuncao(membro.funcao)}">${escHtml(membro.funcao)}</span>
                    ${mat ? `<span>Mat: ${escHtml(mat)}</span>` : ''}
                  </div>
                </div>
              </div>
              <div class="membro-mobile-actions">
                <button class="btn btn-secondary btn-sm btn-copy-nome-mobile" data-copy="${escHtml(membro.nome)}" type="button">Copiar nome</button>
                ${mat ? `<button class="btn btn-secondary btn-sm btn-copy-mat-mobile" data-copy="${escHtml(mat)}" type="button">Copiar mat.</button>` : ''}
                <button class="btn btn-ghost btn-sm btn-edit-membro" data-equipe-id="${equipe.id}" data-idx="${realIdx}" type="button">Editar</button>
                <button class="btn btn-ghost btn-sm btn-delete-membro" data-equipe-id="${equipe.id}" data-idx="${realIdx}" type="button">Excluir</button>
              </div>`;
            mobileList.appendChild(card);
          });

          if (lista.length === 0 && query) {
            mobileList.innerHTML = `<div class="equipe-no-results">Nenhum resultado para "<strong>${escHtml(query)}</strong>"</div>`;
          }
        }

        bindCardEvents(card, equipe);
      });

      const btnNovaEquipe = document.createElement('button');
      btnNovaEquipe.className = 'btn btn-ghost btn-sm equipes-add-equipe-btn';
      btnNovaEquipe.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> Nova equipe nesta região`;
      btnNovaEquipe.addEventListener('click', () => addEquipe(state.regiaoAtiva));
      container.appendChild(btnNovaEquipe);
    }
  }

  function bindCardEvents(card, equipe) {
    card.querySelectorAll('.cell-clickable[data-copy]').forEach(el => {
      el.addEventListener('click', () => copyText(el.dataset.copy, el.dataset.label));
    });
    card.querySelectorAll('.btn-copy-nome-mobile[data-copy]').forEach(el => {
      el.addEventListener('click', () => copyText(el.dataset.copy, 'Nome'));
    });
    card.querySelectorAll('.btn-copy-mat-mobile[data-copy]').forEach(el => {
      el.addEventListener('click', () => copyText(el.dataset.copy, 'Matrícula'));
    });
    const bEN = card.querySelector('.btn-edit-nome');
    if (bEN) bEN.addEventListener('click', () => openEditNome(equipe.id));
    const bCopy = card.querySelector('.btn-copy-equipe');
    if (bCopy) bCopy.addEventListener('click', () => openCopyModal(equipe.id));
    const bRestore = card.querySelector('.btn-restore-equipe');
    if (bRestore) bRestore.addEventListener('click', () => openRestoreModal(equipe.id));
    const bAdd = card.querySelector('.btn-add-membro');
    if (bAdd) bAdd.addEventListener('click', () => openAddModal(equipe.id));
    card.querySelectorAll('.btn-edit-membro').forEach(b => b.addEventListener('click', () => openEditModal(b.dataset.equipeId, parseInt(b.dataset.idx))));
    card.querySelectorAll('.btn-delete-membro').forEach(b => b.addEventListener('click', () => openDeleteModal(b.dataset.equipeId, parseInt(b.dataset.idx))));
  }

  // --- Nova equipe ---
  function addEquipe(regiaoId) {
    const nome = prompt('Nome da nova equipe (ex: EQUIPE FIXA SP — JOAO):');
    if (!nome || !nome.trim()) return;
    const id = regiaoId + '-' + Date.now();
    state.dados[regiaoId].equipes.push({ id, nome: nome.trim(), membros: [] });
    saveDados(); render();
  }

  // --- Editar nome equipe ---
  function openEditNome(equipeId) {
    const equipe = getEquipeById(equipeId);
    if (!equipe) return;
    const modal = document.getElementById('modal-equipe-editnome');
    if (!modal) return;
    modal.querySelector('#editnome-input').value = equipe.nome;
    modal.dataset.equipeId = equipeId;
    modal.classList.add('open');
    modal.querySelector('#editnome-input').focus();
  }

  function saveEditNome() {
    const modal = document.getElementById('modal-equipe-editnome');
    if (!modal) return;
    const novoNome = modal.querySelector('#editnome-input').value.trim();
    if (!novoNome) return;
    const equipe = getEquipeById(modal.dataset.equipeId);
    if (equipe) { equipe.nome = novoNome; saveDados(); closeModal('modal-equipe-editnome'); render(); showToastLocal('Nome atualizado!'); }
  }

  // --- Editar membro ---
  function openEditModal(equipeId, idx) {
    const equipe = getEquipeById(equipeId);
    if (!equipe || !equipe.membros[idx]) return;
    const m = equipe.membros[idx];
    const modal = document.getElementById('modal-equipe-editar');
    if (!modal) return;
    modal.querySelector('#edit-membro-nome').value = m.nome;
    modal.querySelector('#edit-membro-matricula').value = m.matricula || '';
    populateFuncaoSelect('#edit-membro-funcao', m.funcao);
    state.editCtx = { equipeId, membroIdx: idx };
    modal.classList.add('open');
    modal.querySelector('#edit-membro-nome').focus();
  }

  function saveEditMembro() {
    if (!state.editCtx) return;
    const { equipeId, membroIdx } = state.editCtx;
    const equipe = getEquipeById(equipeId);
    if (!equipe) return;
    const nome = document.getElementById('edit-membro-nome').value.trim();
    if (!nome) { showToastLocal('O nome é obrigatório.'); return; }
    equipe.membros[membroIdx] = {
      nome,
      funcao: document.getElementById('edit-membro-funcao').value,
      matricula: document.getElementById('edit-membro-matricula').value.trim()
    };
    saveDados(); closeModal('modal-equipe-editar'); state.editCtx = null; render(); showToastLocal('Integrante atualizado!');
  }

  // --- Adicionar membro ---
  function openAddModal(equipeId) {
    const modal = document.getElementById('modal-equipe-adicionar');
    if (!modal) return;
    modal.querySelector('#add-membro-nome').value = '';
    modal.querySelector('#add-membro-matricula').value = '';
    populateFuncaoSelect('#add-membro-funcao', 'Operador');
    state.addCtx = { equipeId };
    modal.classList.add('open');
    modal.querySelector('#add-membro-nome').focus();
  }

  function saveAddMembro() {
    if (!state.addCtx) return;
    const equipe = getEquipeById(state.addCtx.equipeId);
    if (!equipe) return;
    const nome = document.getElementById('add-membro-nome').value.trim();
    if (!nome) { showToastLocal('O nome é obrigatório.'); return; }
    equipe.membros.push({
      nome,
      funcao: document.getElementById('add-membro-funcao').value,
      matricula: document.getElementById('add-membro-matricula').value.trim()
    });
    saveDados(); closeModal('modal-equipe-adicionar'); state.addCtx = null; render(); showToastLocal('Integrante adicionado!');
  }

  // --- Deletar membro ---
  function openDeleteModal(equipeId, idx) {
    const equipe = getEquipeById(equipeId);
    if (!equipe || !equipe.membros[idx]) return;
    const modal = document.getElementById('modal-equipe-confirmar');
    if (!modal) return;
    modal.querySelector('#confirmar-msg').textContent = 'Tem certeza que deseja remover este integrante?';
    state.deleteCtx = { equipeId, membroIdx: idx };
    modal.classList.add('open');
  }

  function confirmDelete() {
    if (!state.deleteCtx) return;
    const { equipeId, membroIdx } = state.deleteCtx;
    const equipe = getEquipeById(equipeId);
    if (equipe) { equipe.membros.splice(membroIdx, 1); saveDados(); render(); showToastLocal('Integrante removido.'); }
    closeModal('modal-equipe-confirmar'); state.deleteCtx = null;
  }

  // --- Restaurar equipe ---
  function openRestoreModal(equipeId) {
    const equipe = getEquipeById(equipeId);
    if (!equipe) return;
    const modal = document.getElementById('modal-equipe-restaurar');
    if (!modal) return;
    const defaultEquipe = getEquipeDefaultById(equipeId);
    if (!defaultEquipe) {
      showToastLocal('Não há dados originais para esta equipe.'); return;
    }
    modal.querySelector('#restaurar-msg').textContent = 'Tem certeza que deseja restaurar esta equipe para os dados originais?';
    state.restoreCtx = { equipeId };
    modal.classList.add('open');
  }

  function confirmRestore() {
    if (!state.restoreCtx) return;
    const { equipeId } = state.restoreCtx;
    const def = getEquipeDefaultById(equipeId);
    if (def) {
      for (const regiao of Object.values(state.dados)) {
        const idx = regiao.equipes.findIndex(e => e.id === equipeId);
        if (idx !== -1) { regiao.equipes[idx] = JSON.parse(JSON.stringify(def)); break; }
      }
      saveDados(); render(); showToastLocal('Equipe restaurada!');
    }
    closeModal('modal-equipe-restaurar'); state.restoreCtx = null;
  }

  // --- Copiar equipe ---
  function openCopyModal(equipeId) {
    const equipe = getEquipeById(equipeId);
    if (!equipe) return;
    const modal = document.getElementById('modal-equipe-copiar');
    if (!modal) return;
    modal.querySelector('#copiar-equipe-nome').textContent = equipe.nome;
    state.copyCtx = { equipeId };
    modal.classList.add('open');
  }

  function executeCopy(modo) {
    if (!state.copyCtx) return;
    const equipe = getEquipeById(state.copyCtx.equipeId);
    if (!equipe) return;
    let texto;
    if (modo === 'nomes') {
      texto = equipe.membros.map(m => m.nome).join('\n');
    } else {
      texto = equipe.membros.map(m => {
        const mat = m.matricula && m.matricula.trim() ? m.matricula.trim() : '';
        return mat ? m.nome + ' (' + mat + ')' : m.nome;
      }).join('\n');
    }
    copyText(texto, 'Lista da equipe');
    closeModal('modal-equipe-copiar'); state.copyCtx = null;
  }

  // --- Helpers ---
  function populateFuncaoSelect(sel, selected) {
    const el = document.querySelector(sel);
    if (!el) return;
    el.innerHTML = FUNCOES.map(f => `<option value="${f}"${f === selected ? ' selected' : ''}>${f}</option>`).join('');
  }

  function closeModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.remove('open');
  }

  // --- Init ---
  function initDOM() {
    state.dados = loadDados();
    saveDados();
    render();

    const searchEl = document.getElementById('equipes-search');
    const btnClear = document.getElementById('equipes-search-clear');

    function updateSearchClear() {
      if (btnClear) btnClear.classList.toggle('hide', !state.searchQuery);
    }

    if (searchEl) {
      searchEl.addEventListener('input', e => {
        state.searchQuery = e.target.value;
        updateSearchClear();
        renderEquipes();
      });
    }
    if (btnClear) {
      btnClear.addEventListener('click', () => {
        state.searchQuery = '';
        if (searchEl) searchEl.value = '';
        updateSearchClear();
        renderEquipes();
      });
    }

    bindModal('modal-equipe-editnome', 'btn-save-editnome', () => saveEditNome());
    document.getElementById('modal-equipe-editnome')?.querySelector('#editnome-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') saveEditNome(); });
    bindModal('modal-equipe-editar', 'btn-save-editar', () => saveEditMembro());
    bindModal('modal-equipe-adicionar', 'btn-save-adicionar', () => saveAddMembro());
    document.getElementById('btn-confirmar-delete')?.addEventListener('click', confirmDelete);
    document.getElementById('btn-confirmar-restore')?.addEventListener('click', confirmRestore);
    document.getElementById('btn-copiar-nomes')?.addEventListener('click', () => executeCopy('nomes'));
    document.getElementById('btn-copiar-nomes-mat')?.addEventListener('click', () => executeCopy('nomes-mat'));

    // Fechar modais
    document.querySelectorAll('.modal-equipes-overlay').forEach(overlay => {
      overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('open'); });
      overlay.querySelector('.modal-equipes-close')?.addEventListener('click', () => overlay.classList.remove('open'));
      overlay.querySelectorAll('.btn-modal-equipes-cancel').forEach(b => b.addEventListener('click', () => overlay.classList.remove('open')));
    });
  }

  function bindModal(id, saveBtnId, saveFn) {
    const modal = document.getElementById(id);
    if (!modal) return;
    const saveBtn = saveBtnId ? document.getElementById(saveBtnId) : modal.querySelector('[id^="btn-save-"]');
    if (saveBtn && saveFn) saveBtn.addEventListener('click', saveFn);
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('view-equipes')) initDOM();
  });

  return { render, initDOM };
})();
