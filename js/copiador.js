/**
 * REBUSS OPS • Copiador de Nomes Inteligente
 * Lógica Completa e Preservada: Filtros, Limpeza, Busca, Ordenação, Atalhos e Exportação
 */

const CopiadorModule = (() => {
  'use strict';

  const STORAGE_KEY = 'rebuss_copiador_v2';

  const state = {
    items: [],
    undoStack: [],
    activeFilter: 'all',  // 'all' | 'pending' | 'copied'
    sortBy: 'original',   // 'original' | 'az' | 'za' | 'pending-first' | 'copied-first'
    searchQuery: '',
    confettiTriggered: false
  };

  // --- Elementos do DOM ---
  let el = {};

  function initDOM() {
    el = {
      input: document.getElementById('copiador-input'),
      dropZone: document.getElementById('copiador-drop-zone'),
      fileInput: document.getElementById('copiador-file-input'),
      btnLoad: document.getElementById('btn-copiador-load'),
      btnReset: document.getElementById('btn-copiador-reset'),
      btnClear: document.getElementById('btn-copiador-clear'),
      btnToggleOptions: document.getElementById('btn-toggle-options'),
      formattingPanel: document.getElementById('formatting-options-panel'),

      optCleanNumbers: document.getElementById('opt-clean-numbers'),
      optRemoveCodes: document.getElementById('opt-remove-codes'),
      optDeduplicate: document.getElementById('opt-deduplicate'),
      optTrimSpaces: document.getElementById('opt-trim-spaces'),
      optCaseTransform: document.getElementById('opt-case-transform'),

      total: document.getElementById('copiador-total'),
      copied: document.getElementById('copiador-copied'),
      remaining: document.getElementById('copiador-remaining'),
      progressBarFill: document.getElementById('copiador-progress-fill'),
      progressPct: document.getElementById('copiador-progress-pct'),

      filterTabs: document.querySelectorAll('.copiador-filter-tab'),
      countAll: document.getElementById('count-all'),
      countPending: document.getElementById('count-pending'),
      countCopied: document.getElementById('count-copied'),

      search: document.getElementById('copiador-search'),
      btnClearSearch: document.getElementById('btn-clear-search'),
      sortSelect: document.getElementById('copiador-sort-select'),
      btnCopyAllPending: document.getElementById('btn-copy-all-pending'),

      list: document.getElementById('copiador-list'),

      exportTxt: document.getElementById('export-txt'),
      exportCsv: document.getElementById('export-csv'),
      exportPendingTxt: document.getElementById('export-pending-txt')
    };
  }

  // --- Normalização & Limpeza ---
  function capitalizeWords(str) {
    return (str || '').toLowerCase().replace(/(?:^|\s|\/|-)\S/g, char => char.toUpperCase());
  }

  function cleanLine(rawLine) {
    let line = rawLine;

    if (el.optTrimSpaces && el.optTrimSpaces.checked) {
      line = line.trim();
    }

    if (!line) return '';

    // Limpar numerações e marcadores
    if (el.optCleanNumbers && el.optCleanNumbers.checked) {
      line = line
        .replace(/^[\s\(\[]*\d+[\s\.\)\:\-\]\/]+\s*/i, '')
        .replace(/^[\s*•\-\–\—\>]\s*/, '')
        .trim();
    }

    // Remover parênteses/códigos (ex: "Caíque (103881)" -> "Caíque")
    if (el.optRemoveCodes && el.optRemoveCodes.checked) {
      line = line
        .replace(/\s*[\(\[][^\)\]]+[\)\]]/g, '')
        .replace(/\s*-\s*\d+$/g, '')
        .trim();
    }

    // Transformação de Caixa
    if (el.optCaseTransform) {
      const caseOpt = el.optCaseTransform.value;
      if (caseOpt === 'upper') line = line.toUpperCase();
      else if (caseOpt === 'lower') line = line.toLowerCase();
      else if (caseOpt === 'capitalize') line = capitalizeWords(line);
    }

    return line;
  }

  function normalizeSearch(text) {
    return (text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  // --- Carregamento de Nomes ---
  function loadNames() {
    if (!el.input) return;
    const rawText = el.input.value;
    if (!rawText.trim()) {
      App.showToast('Cole ao menos um nome para carregar.', '⚠️');
      return;
    }

    const lines = rawText.split(/\r?\n/);
    const processed = [];
    const seen = new Set();
    let duplicatesCount = 0;

    lines.forEach((line, index) => {
      const cleaned = cleanLine(line);
      if (!cleaned) return;

      const normKey = cleaned.toLowerCase();
      if (el.optDeduplicate && el.optDeduplicate.checked && seen.has(normKey)) {
        duplicatesCount++;
        return;
      }
      seen.add(normKey);

      processed.push({
        id: 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        name: cleaned,
        originalName: line.trim(),
        copied: false,
        order: index
      });
    });

    if (processed.length === 0) {
      App.showToast('Nenhum nome válido encontrado.', '⚠️');
      return;
    }

    state.items = processed;
    state.undoStack = [];
    state.confettiTriggered = false;

    saveToStorage();
    render();

    let msg = `${processed.length} nome(s) carregado(s)!`;
    if (duplicatesCount > 0) msg += ` (${duplicatesCount} duplicados removidos)`;
    App.showToast(msg, '✓');
    App.playSound('copy');
  }

  // --- Manipulação de Itens ---
  async function copyItem(id) {
    const item = state.items.find(i => i.id === id);
    if (!item) return;

    await App.copyToClipboard(item.name);
    App.playSound('copy');

    state.undoStack.push({ id: item.id, wasCopied: item.copied });
    item.copied = true;

    saveToStorage();
    render();

    App.showToast(`Copiado: "${item.name}"`, '📋');
    checkCompletion();
  }

  function toggleItemStatus(id, event) {
    if (event) event.stopPropagation();
    const item = state.items.find(i => i.id === id);
    if (!item) return;

    state.undoStack.push({ id: item.id, wasCopied: item.copied });
    item.copied = !item.copied;
    App.playSound(item.copied ? 'copy' : 'undo');

    saveToStorage();
    render();
    checkCompletion();
  }

  function deleteItem(id, event) {
    if (event) event.stopPropagation();
    const index = state.items.findIndex(i => i.id === id);
    if (index === -1) return;

    const [removed] = state.items.splice(index, 1);
    saveToStorage();
    render();
    App.showToast(`"${removed.name}" removido.`, '🗑');
  }

  function editItem(id, event) {
    if (event) event.stopPropagation();
    const item = state.items.find(i => i.id === id);
    if (!item) return;

    const newName = prompt('Editar nome:', item.name);
    if (newName !== null && newName.trim() !== '') {
      item.name = newName.trim();
      saveToStorage();
      render();
      App.showToast('Nome atualizado.', '✓');
    }
  }

  function copyNextPending() {
    const visiblePending = getFilteredAndSortedItems().filter(i => !i.copied);
    const targetItem = visiblePending.length > 0 ? visiblePending[0] : state.items.find(i => !i.copied);

    if (!targetItem) {
      App.showToast('Todos os nomes já foram copiados!', '🎉');
      return;
    }

    copyItem(targetItem.id);

    // Scroll suave para o card
    setTimeout(() => {
      const cardEl = document.querySelector(`[data-id="${targetItem.id}"]`);
      if (cardEl) {
        cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 40);
  }

  async function copyAllPending() {
    const pendingItems = state.items.filter(i => !i.copied);
    if (pendingItems.length === 0) {
      App.showToast('Nenhum nome pendente para copiar.', 'ℹ');
      return;
    }

    const textToCopy = pendingItems.map(i => i.name).join('\n');
    await App.copyToClipboard(textToCopy);
    App.playSound('copy');
    App.showToast(`${pendingItems.length} nome(s) copiado(s)!`, '📋');
  }

  function undo() {
    if (state.undoStack.length === 0) {
      App.showToast('Nada a desfazer.', 'ℹ');
      return;
    }

    const last = state.undoStack.pop();
    const item = state.items.find(i => i.id === last.id);
    if (item) {
      item.copied = last.wasCopied;
      App.playSound('undo');
      saveToStorage();
      render();
      App.showToast(`Desfeito: "${item.name}"`, '↩');
    }
  }

  function resetAll() {
    if (state.items.length === 0) return;
    if (confirm('Deseja desmarcar todas as cópias feitas?')) {
      state.items.forEach(i => i.copied = false);
      state.undoStack = [];
      state.confettiTriggered = false;
      saveToStorage();
      render();
      App.playSound('undo');
      App.showToast('Marcações limpas.', '✓');
    }
  }

  function clearAll() {
    if (state.items.length === 0 && (!el.input || !el.input.value)) return;
    if (confirm('Tem certeza de que deseja apagar a lista inteira?')) {
      state.items = [];
      state.undoStack = [];
      if (el.input) el.input.value = '';
      state.confettiTriggered = false;
      saveToStorage();
      render();
      App.showToast('Lista apagada com sucesso.', '✓');
    }
  }

  // --- Filtros & Ordenação ---
  function getFilteredAndSortedItems() {
    let result = [...state.items];

    if (state.activeFilter === 'pending') {
      result = result.filter(i => !i.copied);
    } else if (state.activeFilter === 'copied') {
      result = result.filter(i => i.copied);
    }

    if (state.searchQuery) {
      const q = normalizeSearch(state.searchQuery);
      result = result.filter(i => normalizeSearch(i.name).includes(q));
    }

    if (state.sortBy === 'az') {
      result.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
    } else if (state.sortBy === 'za') {
      result.sort((a, b) => b.name.localeCompare(a.name, 'pt-BR', { sensitivity: 'base' }));
    } else if (state.sortBy === 'pending-first') {
      result.sort((a, b) => (a.copied === b.copied ? a.order - b.order : a.copied ? 1 : -1));
    } else if (state.sortBy === 'copied-first') {
      result.sort((a, b) => (a.copied === b.copied ? a.order - b.order : a.copied ? -1 : 1));
    } else {
      result.sort((a, b) => a.order - b.order);
    }

    return result;
  }

  function render() {
    if (!el.total) initDOM();

    const totalCount = state.items.length;
    const copiedCount = state.items.filter(i => i.copied).length;
    const remainingCount = Math.max(totalCount - copiedCount, 0);
    const percent = totalCount > 0 ? Math.round((copiedCount / totalCount) * 100) : 0;

    if (el.total) el.total.textContent = totalCount;
    if (el.copied) el.copied.textContent = copiedCount;
    if (el.remaining) el.remaining.textContent = remainingCount;
    if (el.progressBarFill) el.progressBarFill.style.width = `${percent}%`;
    if (el.progressPct) el.progressPct.textContent = `${percent}%`;

    if (el.countAll) el.countAll.textContent = totalCount;
    if (el.countPending) el.countPending.textContent = remainingCount;
    if (el.countCopied) el.countCopied.textContent = copiedCount;

    if (el.btnClearSearch && el.search) {
      el.btnClearSearch.classList.toggle('hide', el.search.value.trim().length === 0);
    }

    if (!el.list) return;
    el.list.innerHTML = '';

    if (totalCount === 0) {
      el.list.innerHTML = `
        <div style="grid-column: 1 / -1; text-align:center; padding: 32px 16px; color: var(--text-muted); background: var(--bg-card-subtle); border-radius: var(--radius-sm); border: 1px dashed var(--border);">
          Cole sua lista de nomes acima e clique em "Carregar Nomes".
        </div>
      `;
      return;
    }

    const filtered = getFilteredAndSortedItems();

    if (filtered.length === 0) {
      el.list.innerHTML = `
        <div style="grid-column: 1 / -1; text-align:center; padding: 32px 16px; color: var(--text-muted); background: var(--bg-card-subtle); border-radius: var(--radius-sm);">
          Nenhum nome encontrado para esta busca ou filtro.
        </div>
      `;
      return;
    }

    const fragment = document.createDocumentFragment();

    filtered.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = `name-card ${item.copied ? 'done' : ''}`;
      card.setAttribute('data-id', item.id);

      const left = document.createElement('div');
      left.className = 'name-card-left';

      const idxBadge = document.createElement('span');
      idxBadge.className = 'item-index';
      idxBadge.textContent = String(index + 1).padStart(2, '0');

      const nameSpan = document.createElement('span');
      nameSpan.className = 'name-title';
      nameSpan.textContent = item.name;

      left.append(idxBadge, nameSpan);

      const right = document.createElement('div');
      right.style.display = 'flex';
      right.style.alignItems = 'center';
      right.style.gap = '6px';

      const hoverActions = document.createElement('div');
      hoverActions.className = 'card-actions-hover';

      const btnToggle = document.createElement('button');
      btnToggle.className = 'btn-card-mini';
      btnToggle.title = item.copied ? 'Marcar pendente' : 'Marcar copiado';
      btnToggle.innerHTML = item.copied ? '↩' : '✓';
      btnToggle.onclick = (e) => toggleItemStatus(item.id, e);

      const btnEdit = document.createElement('button');
      btnEdit.className = 'btn-card-mini';
      btnEdit.title = 'Editar';
      btnEdit.innerHTML = '✎';
      btnEdit.onclick = (e) => editItem(item.id, e);

      const btnDel = document.createElement('button');
      btnDel.className = 'btn-card-mini btn-del';
      btnDel.title = 'Excluir';
      btnDel.innerHTML = '✕';
      btnDel.onclick = (e) => deleteItem(item.id, e);

      hoverActions.append(btnToggle, btnEdit, btnDel);

      const statusBadge = document.createElement('span');
      statusBadge.className = 'status-badge';
      statusBadge.textContent = item.copied ? 'COPIADO' : 'COPIAR';

      right.append(hoverActions, statusBadge);
      card.append(left, right);

      card.onclick = () => copyItem(item.id);

      fragment.appendChild(card);
    });

    el.list.appendChild(fragment);
  }

  function checkCompletion() {
    const total = state.items.length;
    const copied = state.items.filter(i => i.copied).length;

    if (total > 0 && copied === total && !state.confettiTriggered) {
      state.confettiTriggered = true;
      App.playSound('fanfare');
      App.launchConfetti();
      App.showToast('100% da lista concluída!', '🎉');
    }
  }

  // --- Exportação ---
  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportTxt(onlyPending = false) {
    let list = state.items;
    if (onlyPending) list = list.filter(i => !i.copied);
    if (list.length === 0) {
      App.showToast('Nenhum item para exportar.', 'ℹ');
      return;
    }
    const content = list.map(i => i.name).join('\r\n');
    const filename = onlyPending ? 'rebuss_pendentes.txt' : 'rebuss_nomes.txt';
    downloadFile(content, filename, 'text/plain;charset=utf-8');
    App.showToast(`Exportado: ${filename}`, '✓');
  }

  function exportCsv() {
    if (state.items.length === 0) {
      App.showToast('Nenhum item para exportar.', 'ℹ');
      return;
    }
    const rows = [['ID', 'Nome', 'Status', 'Ordem']];
    state.items.forEach((item, i) => {
      rows.push([i + 1, `"${item.name.replace(/"/g, '""')}"`, item.copied ? 'Copiado' : 'Pendente', item.order + 1]);
    });
    const content = '\uFEFF' + rows.map(r => r.join(',')).join('\r\n');
    downloadFile(content, 'rebuss_relatorio.csv', 'text/csv;charset=utf-8');
    App.showToast('Relatório CSV exportado!', '✓');
  }

  function handleFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      if (el.input) {
        el.input.value = e.target.result;
        loadNames();
      }
    };
    reader.readAsText(file);
  }

  // --- LocalStorage ---
  function saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ items: state.items, version: 2 }));
    } catch (e) {}
  }

  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.items)) state.items = parsed.items;
      } else {
        const legacy = localStorage.getItem('rebussCopiador');
        if (legacy) {
          const parsed = JSON.parse(legacy);
          if (parsed && Array.isArray(parsed.names)) {
            const copiedSet = new Set(parsed.copied || []);
            state.items = parsed.names.map((name, i) => ({
              id: 'migrated_' + i,
              name,
              originalName: name,
              copied: copiedSet.has(name),
              order: i
            }));
          }
        }
      }
    } catch (e) {}
  }

  function bindEvents() {
    initDOM();

    if (el.btnLoad) el.btnLoad.addEventListener('click', loadNames);
    if (el.btnReset) el.btnReset.addEventListener('click', resetAll);
    if (el.btnClear) el.btnClear.addEventListener('click', clearAll);

    if (el.btnToggleOptions && el.formattingPanel) {
      el.btnToggleOptions.addEventListener('click', () => {
        el.formattingPanel.classList.toggle('hide');
      });
    }

    if (el.filterTabs) {
      el.filterTabs.forEach(tab => {
        tab.addEventListener('click', function() {
          el.filterTabs.forEach(t => t.classList.remove('active'));
          this.classList.add('active');
          state.activeFilter = this.getAttribute('data-filter');
          render();
        });
      });
    }

    if (el.search) {
      el.search.addEventListener('input', (e) => {
        state.searchQuery = e.target.value.trim();
        render();
      });
    }
    if (el.btnClearSearch && el.search) {
      el.btnClearSearch.addEventListener('click', () => {
        el.search.value = '';
        state.searchQuery = '';
        render();
        el.search.focus();
      });
    }

    if (el.sortSelect) {
      el.sortSelect.addEventListener('change', (e) => {
        state.sortBy = e.target.value;
        render();
      });
    }

    if (el.btnCopyAllPending) el.btnCopyAllPending.addEventListener('click', copyAllPending);

    if (el.exportTxt) el.exportTxt.addEventListener('click', () => exportTxt(false));
    if (el.exportCsv) el.exportCsv.addEventListener('click', () => exportCsv());
    if (el.exportPendingTxt) el.exportPendingTxt.addEventListener('click', () => exportTxt(true));

    if (el.fileInput) {
      el.fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
      });
    }

    if (el.dropZone) {
      ['dragenter', 'dragover'].forEach(ev => {
        el.dropZone.addEventListener(ev, (e) => {
          e.preventDefault();
          el.dropZone.classList.add('dragover');
        });
      });
      ['dragleave', 'drop'].forEach(ev => {
        el.dropZone.addEventListener(ev, (e) => {
          e.preventDefault();
          el.dropZone.classList.remove('dragover');
        });
      });
      el.dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        if (dt.files && dt.files.length > 0) handleFile(dt.files[0]);
      });
    }
  }

  function init() {
    loadFromStorage();
    bindEvents();
    render();
  }

  document.addEventListener('DOMContentLoaded', init);

  return {
    init,
    render,
    loadNames,
    copyNextPending,
    copyAllPending,
    undo
  };
})();

window.CopiadorModule = CopiadorModule;
