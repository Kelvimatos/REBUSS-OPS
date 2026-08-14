/**
 * REBUSS OPS • Calendário de Plantões 12x36
 * Lógica Contínua de Escala 12x36, Grupos Operacionais e Resumo em Tempo Real
 */

const CalendarioModule = (() => {
  'use strict';

  // --- Definição dos Grupos de Plantão ---
  const GROUPS = {
    1: {
      id: 1,
      name: 'Grupo 1',
      members: [
        { id: 'kelvi', name: 'Kelvi' },
        { id: 'matheus', name: 'Matheus' },
        { id: 'bruno', name: 'Bruno' }
      ]
    },
    2: {
      id: 2,
      name: 'Grupo 2',
      members: [
        { id: 'francisco', name: 'Francisco' },
        { id: 'arthur', name: 'Arthur' },
        { id: 'alexandre', name: 'Alexandre' }
      ]
    }
  };

  // Ponto de Partida da Escala: 02/08/2026 (Grupo 1 Trabalha)
  const BASE_DATE_UTC = Date.UTC(2026, 7, 2); // Agosto é mês 7 (0-indexado)

  // Estado Atual do Calendário
  const state = {
    currentYear: 2026,
    currentMonth: 7, // Agosto (0 = Jan, 7 = Ago, 11 = Dez)
    filterUserId: 'active' // 'active' | 'all' | 'kelvi' | 'francisco' | 'bruno' | 'matheus' | 'arthur' | 'alexandre'
  };

  const MONTH_NAMES = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const WEEKDAY_NAMES = [
    'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
    'Quinta-feira', 'Sexta-feira', 'Sábado'
  ];

  // ==========================================================================
  // 1. CÁLCULO CONTÍNUO DA ESCALA 12x36
  // ==========================================================================
  function getDutyGroup(year, month, day) {
    const targetUtc = Date.UTC(year, month, day);
    const diffTime = targetUtc - BASE_DATE_UTC;
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    const isGroup1 = ((diffDays % 2) + 2) % 2 === 0;
    return isGroup1 ? 1 : 2;
  }

  function isUserInGroup(userId, groupId) {
    const group = GROUPS[groupId];
    return group.members.some(m => m.id === userId);
  }

  function isUserWorkingOnDate(userId, year, month, day) {
    const groupId = getDutyGroup(year, month, day);
    return isUserInGroup(userId, groupId);
  }

  function getEffectiveFilterUser() {
    if (state.filterUserId === 'all') return null;
    if (state.filterUserId === 'active') {
      const activeUser = App.getCurrentUser();
      return activeUser ? activeUser.id : 'kelvi';
    }
    return state.filterUserId;
  }

  // ==========================================================================
  // 2. NAVEGAÇÃO ENTRE MESES
  // ==========================================================================
  function prevMonth() {
    state.currentMonth--;
    if (state.currentMonth < 0) {
      state.currentMonth = 11;
      state.currentYear--;
    }
    render();
  }

  function nextMonth() {
    state.currentMonth++;
    if (state.currentMonth > 11) {
      state.currentMonth = 0;
      state.currentYear++;
    }
    render();
  }

  function goToToday() {
    state.currentYear = 2026;
    state.currentMonth = 7; // Agosto de 2026 como base padrão
    render();
  }

  // ==========================================================================
  // 3. RENDERIZAÇÃO DO CALENDÁRIO
  // ==========================================================================
  function render() {
    const monthTitleEl = document.getElementById('cal-month-title');
    const filterSelectEl = document.getElementById('cal-user-filter');

    if (monthTitleEl) {
      monthTitleEl.textContent = `${MONTH_NAMES[state.currentMonth]} ${state.currentYear}`;
    }

    if (filterSelectEl) {
      filterSelectEl.value = state.filterUserId;
    }

    const effectiveUserId = getEffectiveFilterUser();
    renderSummary(effectiveUserId);
    renderGrid(effectiveUserId);
  }

  function renderSummary(userId) {
    const userSummaryName = document.getElementById('cal-summary-user-name');
    const userWorkDays = document.getElementById('cal-summary-work-days');
    const userOffDays = document.getElementById('cal-summary-off-days');
    const userNextDuty = document.getElementById('cal-summary-next-duty');
    const userNextOff = document.getElementById('cal-summary-next-off');

    const activeUser = App.getCurrentUser();
    const effectiveName = userId
      ? (userId === 'kelvi' ? 'Kelvi' : userId.charAt(0).toUpperCase() + userId.slice(1))
      : 'Todos os Grupos';

    if (userSummaryName) userSummaryName.textContent = effectiveName;

    // Calcular dias no mês atual
    const daysInMonth = new Date(state.currentYear, state.currentMonth + 1, 0).getDate();
    let workCount = 0;
    let offCount = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      if (userId) {
        if (isUserWorkingOnDate(userId, state.currentYear, state.currentMonth, d)) {
          workCount++;
        } else {
          offCount++;
        }
      } else {
        workCount = daysInMonth;
        offCount = 0;
      }
    }

    if (userWorkDays) userWorkDays.textContent = userId ? workCount : `${daysInMonth} dias`;
    if (userOffDays) userOffDays.textContent = userId ? offCount : '—';

    // Próximo plantão e folga a partir de hoje / data base
    if (userId) {
      const today = new Date();
      // Usar a data atual do sistema ou 02/08/2026 se estiver em 2026
      let checkDate = new Date(state.currentYear, state.currentMonth, 1);
      if (today.getFullYear() === state.currentYear && today.getMonth() === state.currentMonth) {
        checkDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      }

      let nextDutyStr = '—';
      let nextOffStr = '—';

      for (let offset = 0; offset < 40; offset++) {
        const testDate = new Date(checkDate.getFullYear(), checkDate.getMonth(), checkDate.getDate() + offset);
        const isWorking = isUserWorkingOnDate(userId, testDate.getFullYear(), testDate.getMonth(), testDate.getDate());
        const dStr = `${String(testDate.getDate()).padStart(2, '0')}/${String(testDate.getMonth() + 1).padStart(2, '0')}/${testDate.getFullYear()}`;

        if (isWorking && nextDutyStr === '—') {
          nextDutyStr = dStr;
        }
        if (!isWorking && nextOffStr === '—') {
          nextOffStr = dStr;
        }
        if (nextDutyStr !== '—' && nextOffStr !== '—') break;
      }

      if (userNextDuty) userNextDuty.textContent = nextDutyStr;
      if (userNextOff) userNextOff.textContent = nextOffStr;
    } else {
      if (userNextDuty) userNextDuty.textContent = 'Plantão diário';
      if (userNextOff) userNextOff.textContent = 'Alternado';
    }
  }

  function renderGrid(userId) {
    const gridContainer = document.getElementById('cal-days-grid');
    if (!gridContainer) return;

    gridContainer.innerHTML = '';

    const firstDayIndex = new Date(state.currentYear, state.currentMonth, 1).getDay();
    const daysInMonth = new Date(state.currentYear, state.currentMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(state.currentYear, state.currentMonth, 0).getDate();

    const fragment = document.createDocumentFragment();

    // Dias do Mês Anterior (Preenchimento)
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const prevDay = daysInPrevMonth - i;
      const prevMonthIdx = state.currentMonth - 1;
      const prevYear = prevMonthIdx < 0 ? state.currentYear - 1 : state.currentYear;
      const realMonth = (prevMonthIdx + 12) % 12;

      const cell = createDayCell(prevYear, realMonth, prevDay, true, userId);
      fragment.appendChild(cell);
    }

    // Dias do Mês Atual
    for (let day = 1; day <= daysInMonth; day++) {
      const cell = createDayCell(state.currentYear, state.currentMonth, day, false, userId);
      fragment.appendChild(cell);
    }

    // Dias do Próximo Mês (Preenchimento para completar grade de 35 ou 42 células)
    const totalCells = firstDayIndex + daysInMonth;
    const nextDaysNeeded = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let nextDay = 1; nextDay <= nextDaysNeeded; nextDay++) {
      const nextMonthIdx = state.currentMonth + 1;
      const nextYear = nextMonthIdx > 11 ? state.currentYear + 1 : state.currentYear;
      const realMonth = nextMonthIdx % 12;

      const cell = createDayCell(nextYear, realMonth, nextDay, true, userId);
      fragment.appendChild(cell);
    }

    gridContainer.appendChild(fragment);
  }

  function createDayCell(year, month, day, isOtherMonth, userId) {
    const cell = document.createElement('div');
    cell.className = `cal-day-cell ${isOtherMonth ? 'other-month' : ''}`;

    const groupId = getDutyGroup(year, month, day);
    const group = GROUPS[groupId];
    const isWorking = userId ? isUserInGroup(userId, groupId) : null;

    if (!isOtherMonth) {
      if (userId) {
        cell.classList.add(isWorking ? 'day-duty' : 'day-off');
      } else {
        cell.classList.add(groupId === 1 ? 'day-g1' : 'day-g2');
      }
    }

    // Topo do Dia (Número + Badge)
    const dayTop = document.createElement('div');
    dayTop.className = 'cal-day-top';

    const dayNumber = document.createElement('span');
    dayNumber.className = 'cal-day-number';
    dayNumber.textContent = day;

    dayTop.appendChild(dayNumber);

    // Tag / Status
    const badge = document.createElement('span');
    badge.className = 'cal-day-tag';

    if (userId) {
      badge.textContent = isWorking ? 'TRABALHO' : 'FOLGA';
      badge.classList.add(isWorking ? 'tag-duty' : 'tag-off');
    } else {
      badge.textContent = `GRUPO ${groupId}`;
      badge.classList.add(groupId === 1 ? 'tag-g1' : 'tag-g2');
    }

    dayTop.appendChild(badge);
    cell.appendChild(dayTop);

    // Membros do Grupo (Texto Sóbrio)
    const membersList = document.createElement('div');
    membersList.className = 'cal-members-preview';
    membersList.textContent = group.members.map(m => m.name).join(', ');
    cell.appendChild(membersList);

    // Clique no Dia para Ver Detalhes
    cell.addEventListener('click', () => {
      openDayModal(year, month, day, groupId, userId);
    });

    return cell;
  }

  // ==========================================================================
  // 4. MODAL DE DETALHES DO DIA
  // ==========================================================================
  function openDayModal(year, month, day, groupId, currentFilterUserId) {
    const modal = document.getElementById('modal-cal-day');
    const titleEl = document.getElementById('modal-cal-day-title');
    const workingMembersEl = document.getElementById('modal-cal-working-members');
    const offMembersEl = document.getElementById('modal-cal-off-members');
    const userStatusAlertEl = document.getElementById('modal-cal-user-status');

    if (!modal) return;

    const dateObj = new Date(year, month, day);
    const weekday = WEEKDAY_NAMES[dateObj.getDay()];
    const dateStr = `${String(day).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}/${year}`;

    if (titleEl) titleEl.textContent = `${weekday}, ${dateStr}`;

    const workingGroup = GROUPS[groupId];
    const offGroupId = groupId === 1 ? 2 : 1;
    const offGroup = GROUPS[offGroupId];

    if (workingMembersEl) {
      workingMembersEl.innerHTML = workingGroup.members
        .map(m => `<span class="badge-cal-member badge-duty">🟦 ${m.name}</span>`)
        .join(' ');
    }

    if (offMembersEl) {
      offMembersEl.innerHTML = offGroup.members
        .map(m => `<span class="badge-cal-member badge-off">⬜ ${m.name}</span>`)
        .join(' ');
    }

    if (userStatusAlertEl) {
      const activeUser = App.getCurrentUser();
      const targetUserId = currentFilterUserId || (activeUser ? activeUser.id : 'kelvi');
      const isWorking = isUserInGroup(targetUserId, groupId);
      const userName = targetUserId === 'kelvi' ? 'Kelvi' : targetUserId.charAt(0).toUpperCase() + targetUserId.slice(1);

      userStatusAlertEl.className = `cal-status-banner ${isWorking ? 'status-duty' : 'status-off'}`;
      userStatusAlertEl.innerHTML = isWorking
        ? `<strong>${userName}:</strong> Dia de <strong>PLANTÃO (TRABALHO)</strong>`
        : `<strong>${userName}:</strong> Dia de <strong>FOLGA</strong>`;
    }

    modal.classList.add('open');
  }

  // ==========================================================================
  // 5. EVENTOS E INICIALIZAÇÃO
  // ==========================================================================
  function bindEvents() {
    const btnPrev = document.getElementById('btn-cal-prev');
    const btnNext = document.getElementById('btn-cal-next');
    const btnToday = document.getElementById('btn-cal-today');
    const userFilterSelect = document.getElementById('cal-user-filter');

    if (btnPrev) btnPrev.addEventListener('click', prevMonth);
    if (btnNext) btnNext.addEventListener('click', nextMonth);
    if (btnToday) btnToday.addEventListener('click', goToToday);

    if (userFilterSelect) {
      userFilterSelect.addEventListener('change', function() {
        state.filterUserId = this.value;
        render();
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
    prevMonth,
    nextMonth,
    goToToday,
    getDutyGroup,
    isUserWorkingOnDate,
    GROUPS
  };
})();

window.CalendarioModule = CalendarioModule;
