/**
 * REBUSS OPS — Módulo de Gerenciamento de Usuários do Sistema (Admin)
 * Permite visualizar, pesquisar, editar perfil, ativar/desativar e excluir contas
 */

const AdminModule = (() => {
  'use strict';

  let usuariosState = [];
  let currentEditUserId = null;

  async function render() {
    if (!AuthModule.isAdmin()) {
      const container = document.getElementById('view-usuarios-sistema');
      if (container) {
        container.innerHTML = `
          <div style="text-align:center; padding: 60px 20px;">
            <h2>🚫 Acesso Restrito</h2>
            <p style="color:var(--text-muted);">Esta área é restrita para Administradores do sistema.</p>
            <a href="#/dashboard" class="btn btn-primary mt-4" data-nav="dashboard">Ir para o Dashboard</a>
          </div>
        `;
      }
      return;
    }

    await loadUsuarios();
  }

  async function loadUsuarios() {
    const tableBody = document.getElementById('table-admin-users-body');
    const searchInput = document.getElementById('admin-search-users');
    const roleFilter = document.getElementById('admin-filter-role');

    if (!tableBody) return;

    tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 20px;">Carregando usuários...</td></tr>`;

    try {
      const params = {};
      if (searchInput && searchInput.value.trim()) params.busca = searchInput.value.trim();
      if (roleFilter && roleFilter.value !== 'todos') params.perfil = roleFilter.value;

      usuariosState = await RebussAPI.admin.listUsuarios(params);

      if (!usuariosState || usuariosState.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 30px; color:var(--text-muted);">Nenhum usuário encontrado.</td></tr>`;
        return;
      }

      tableBody.innerHTML = usuariosState.map(u => {
        const dtCadastro = new Date(u.createdAt).toLocaleDateString('pt-BR');
        const isCurrentUser = AuthModule.getCurrentUser()?.id === u.id;

        return `
          <tr>
            <td>
              <div style="display:flex; align-items:center; gap:10px;">
                <div class="user-avatar-circle">${u.nome.charAt(0).toUpperCase()}</div>
                <div>
                  <strong>${escapeHtml(u.nome)}</strong>
                  ${isCurrentUser ? ' <span class="badge-tag" style="background:var(--primary-light); color:var(--primary);">Você</span>' : ''}
                </div>
              </div>
            </td>
            <td>${escapeHtml(u.email)}</td>
            <td>
              <span class="role-badge role-${u.perfil.toLowerCase()}">${u.perfil}</span>
            </td>
            <td>
              <span class="status-indicator ${u.ativo ? 'ativo' : 'inativo'}">
                ${u.ativo ? '🟢 Ativo' : '🔴 Inativo'}
              </span>
            </td>
            <td>${dtCadastro}</td>
            <td>
              <div style="display:flex; gap:6px;">
                <button class="btn btn-xs btn-outline-primary" onclick="AdminModule.openEditModal('${u.id}')">
                  Editar
                </button>
                ${!isCurrentUser ? `
                  <button class="btn btn-xs ${u.ativo ? 'btn-outline-warning' : 'btn-outline-success'}" onclick="AdminModule.toggleUserStatus('${u.id}', ${!u.ativo})">
                    ${u.ativo ? 'Desativar' : 'Ativar'}
                  </button>
                  <button class="btn btn-xs btn-outline-danger" onclick="AdminModule.deleteUser('${u.id}')">
                    Excluir
                  </button>
                ` : ''}
              </div>
            </td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 20px; color:var(--danger);">Erro ao carregar usuários: ${err.message}</td></tr>`;
    }
  }

  function openEditModal(userId) {
    const user = usuariosState.find(u => u.id === userId);
    if (!user) return;

    currentEditUserId = userId;
    document.getElementById('modal-edit-user-name').value = user.nome;
    document.getElementById('modal-edit-user-email').value = user.email;
    document.getElementById('modal-edit-user-role').value = user.perfil;
    document.getElementById('modal-edit-user-phone').value = user.telefone || '';
    document.getElementById('modal-edit-user-city').value = user.cidade || '';
    document.getElementById('modal-edit-user-state').value = user.estado || '';
    document.getElementById('modal-edit-user-status').checked = user.ativo;

    document.getElementById('modal-admin-edit-user').classList.add('open');
  }

  async function saveEditUser() {
    if (!currentEditUserId) return;

    const nome = document.getElementById('modal-edit-user-name').value.trim();
    const perfil = document.getElementById('modal-edit-user-role').value;
    const telefone = document.getElementById('modal-edit-user-phone').value.trim();
    const cidade = document.getElementById('modal-edit-user-city').value.trim();
    const estado = document.getElementById('modal-edit-user-state').value.trim();
    const ativo = document.getElementById('modal-edit-user-status').checked;

    try {
      await RebussAPI.admin.updateUsuario(currentEditUserId, {
        nome,
        perfil,
        telefone,
        cidade,
        estado,
        ativo,
      });

      App.showToast('Usuário atualizado com sucesso!', '✓');
      document.getElementById('modal-admin-edit-user').classList.remove('open');
      loadUsuarios();
    } catch (err) {
      alert('Erro ao salvar: ' + err.message);
    }
  }

  async function toggleUserStatus(userId, novoStatus) {
    try {
      await RebussAPI.admin.updateUsuario(userId, { ativo: novoStatus });
      App.showToast(`Usuário ${novoStatus ? 'ativado' : 'desativado'} com sucesso!`, '✓');
      loadUsuarios();
    } catch (err) {
      alert('Erro ao alterar status: ' + err.message);
    }
  }

  async function deleteUser(userId) {
    if (confirm('Tem certeza que deseja excluir esta conta de usuário do sistema? Esta ação não pode ser desfeita.')) {
      try {
        await RebussAPI.admin.deleteUsuario(userId);
        App.showToast('Conta excluída com sucesso!', '🗑');
        loadUsuarios();
      } catch (err) {
        alert('Erro ao excluir usuário: ' + err.message);
      }
    }
  }

  async function resetDadosOperacionais() {
    const confirmacao1 = confirm('⚠️ ATENÇÃO: Esta ação irá APAGAR TODAS AS LOJAS, ESCALAS, MEMBROS, OCORRÊNCIAS E HISTÓRICOS.\n\nUsuários de acesso, equipes e colaboradores cadastrados serão 100% PRESERVADOS.\n\nDeseja continuar?');
    if (!confirmacao1) return;

    const confirmacao2 = prompt('Digite "ZERAR" para confirmar a exclusão de todas as operações e lojas:');
    if (confirmacao2 !== 'ZERAR') {
      alert('Operação cancelada. A palavra digitada não confere.');
      return;
    }

    try {
      if (window.App && App.showToast) {
        App.showToast('Zerando dados operacionais...', '⏳');
      }
      const resp = await RebussAPI.admin.resetDadosOperacionais();
      alert('✅ ' + (resp.mensagem || 'Dados operacionais e lojas zerados com sucesso!'));
      if (window.App && App.showToast) {
        App.showToast('Lojas e escalas zeradas!', '✓');
      }
      if (window.OperacoesModule && OperacoesModule.recarregar) {
        OperacoesModule.recarregar();
      }
      if (window.DashboardModule && DashboardModule.recarregar) {
        DashboardModule.recarregar();
      }
    } catch (err) {
      alert('Erro ao zerar dados operacionais: ' + err.message);
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function bindEvents() {
    const searchInput = document.getElementById('admin-search-users');
    const roleFilter = document.getElementById('admin-filter-role');

    if (searchInput) {
      let timer = null;
      searchInput.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(loadUsuarios, 300);
      });
    }

    if (roleFilter) roleFilter.addEventListener('change', loadUsuarios);

    document.getElementById('btn-admin-reset-dados')?.addEventListener('click', resetDadosOperacionais);
    document.getElementById('btn-save-admin-edit-user')?.addEventListener('click', saveEditUser);
    document.getElementById('modal-admin-edit-user-close')?.addEventListener('click', () => {
      document.getElementById('modal-admin-edit-user')?.classList.remove('open');
    });
  }

  function init() {
    bindEvents();
  }

  document.addEventListener('DOMContentLoaded', init);

  return {
    init,
    render,
    openEditModal,
    toggleUserStatus,
    deleteUser,
    resetDadosOperacionais,
  };
})();

window.AdminModule = AdminModule;

