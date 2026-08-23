/**
 * REBUSS OPS — Módulo de Autenticação e Controle de Acesso (Frontend)
 * Gerenciamento de Telas de Login, Cadastro, Proteção de Rotas e Sessão
 */

const AuthModule = (() => {
  'use strict';

  let currentUser = null; // Usuário autenticado da tabela UsuarioSistema

  function getCurrentUser() {
    return currentUser;
  }

  function isAuthenticated() {
    return Boolean(currentUser && RebussAPI.getToken());
  }

  function isAdmin() {
    return currentUser && currentUser.perfil === 'ADMIN';
  }

  function isGestorOrAdmin() {
    return currentUser && (currentUser.perfil === 'ADMIN' || currentUser.perfil === 'GESTOR');
  }

  // ─── Inicialização da Sessão ──────────────────────────────────────────────────
  async function checkSession() {
    const token = RebussAPI.getToken();
    if (!token) {
      currentUser = null;
      showAuthScreen('login');
      return false;
    }

    try {
      const data = await RebussAPI.auth.me();
      if (data && data.usuario) {
        currentUser = data.usuario;
        updateHeaderUserUI();
        hideAuthScreen();
        return true;
      }
    } catch (err) {
      console.warn('Sessão expirada ou inválida:', err.message);
      RebussAPI.clearToken();
      currentUser = null;
      showAuthScreen('login');
      return false;
    }
  }

  function onUnauthorized() {
    currentUser = null;
    updateHeaderUserUI();
    showAuthScreen('login');
    if (window.App) App.showToast('Sessão expirada. Faça login novamente.', '⚠️');
  }

  // ─── Telas de Autenticação ───────────────────────────────────────────────────
  function showAuthScreen(mode = 'login') {
    const loginView = document.getElementById('view-login');
    const registerView = document.getElementById('view-register');
    const appContainer = document.getElementById('app-main-content');
    const siteHeader = document.querySelector('.site-header');

    if (siteHeader) siteHeader.style.display = 'none';
    if (appContainer) appContainer.style.display = 'none';

    if (mode === 'login') {
      if (loginView) loginView.classList.remove('hide');
      if (registerView) registerView.classList.add('hide');
    } else {
      if (loginView) loginView.classList.add('hide');
      if (registerView) registerView.classList.remove('hide');
    }
  }

  function hideAuthScreen() {
    const loginView = document.getElementById('view-login');
    const registerView = document.getElementById('view-register');
    const appContainer = document.getElementById('app-main-content');
    const siteHeader = document.querySelector('.site-header');

    if (loginView) loginView.classList.add('hide');
    if (registerView) registerView.classList.add('hide');
    if (siteHeader) siteHeader.style.display = '';
    if (appContainer) appContainer.style.display = '';
  }

  // ─── Handlers de Login e Cadastro ────────────────────────────────────────────
  async function handleLogin(e) {
    if (e) e.preventDefault();

    const emailInput = document.getElementById('login-email');
    const senhaInput = document.getElementById('login-password');
    const errorEl = document.getElementById('login-error-msg');
    const btnSubmit = document.getElementById('btn-login-submit');

    const email = emailInput?.value.trim();
    const senha = senhaInput?.value;

    if (!email || !senha) {
      showError(errorEl, 'Por favor, preencha o e-mail e a senha.');
      return;
    }

    setButtonLoading(btnSubmit, true, 'Entrando...');
    hideError(errorEl);

    try {
      const data = await RebussAPI.auth.login(email, senha);
      currentUser = data.usuario;
      updateHeaderUserUI();
      hideAuthScreen();

      if (window.App) {
        App.showToast(`Bem-vindo, ${currentUser.nome}!`, '👋');
        App.playSound('copy');
      }

      // Redirecionar para o dashboard operacional
      window.location.hash = '#/dashboard';
      if (window.DashboardModule) DashboardModule.render();
    } catch (err) {
      showError(errorEl, err.message || 'Falha ao autenticar.');
      if (window.App) App.playSound('undo');
    } finally {
      setButtonLoading(btnSubmit, false, 'Entrar');
    }
  }

  async function handleRegister(e) {
    if (e) e.preventDefault();

    const nomeInput = document.getElementById('reg-nome');
    const emailInput = document.getElementById('reg-email');
    const senhaInput = document.getElementById('reg-password');
    const confirmInput = document.getElementById('reg-password-confirm');
    const telInput = document.getElementById('reg-phone');
    const cidadeInput = document.getElementById('reg-cidade');
    const estadoInput = document.getElementById('reg-estado');
    const errorEl = document.getElementById('reg-error-msg');
    const btnSubmit = document.getElementById('btn-register-submit');

    const nome = nomeInput?.value.trim();
    const email = emailInput?.value.trim();
    const senha = senhaInput?.value;
    const confirmarSenha = confirmInput?.value;
    const telefone = telInput?.value.trim();
    const cidade = cidadeInput?.value.trim();
    const estado = estadoInput?.value.trim();

    if (!nome) {
      showError(errorEl, 'Informe seu nome completo.');
      return;
    }
    if (!email || !email.includes('@')) {
      showError(errorEl, 'Informe um e-mail válido.');
      return;
    }
    if (!senha || senha.length < 8) {
      showError(errorEl, 'A senha deve ter no mínimo 8 caracteres.');
      return;
    }
    if (senha !== confirmarSenha) {
      showError(errorEl, 'As senhas digitadas não conferem.');
      return;
    }

    setButtonLoading(btnSubmit, true, 'Cadastrando...');
    hideError(errorEl);

    try {
      const data = await RebussAPI.auth.register({
        nome,
        email,
        senha,
        confirmarSenha,
        telefone,
        cidade,
        estado,
      });

      currentUser = data.usuario;
      updateHeaderUserUI();
      hideAuthScreen();

      if (window.App) {
        App.showToast('Conta criada com sucesso! Bem-vindo.', '✓');
        App.playSound('copy');
      }

      window.location.hash = '#/dashboard';
      if (window.DashboardModule) DashboardModule.render();
    } catch (err) {
      showError(errorEl, err.message || 'Erro ao criar conta.');
      if (window.App) App.playSound('undo');
    } finally {
      setButtonLoading(btnSubmit, false, 'Criar Conta');
    }
  }

  async function handleLogout() {
    if (confirm('Deseja realmente sair da sua conta?')) {
      await RebussAPI.auth.logout();
      currentUser = null;
      updateHeaderUserUI();
      showAuthScreen('login');
      if (window.App) App.showToast('Você saiu da conta.', 'ℹ');
    }
  }

  // ─── Header & Menu do Usuário ────────────────────────────────────────────────
  function updateHeaderUserUI() {
    const nameEl = document.getElementById('header-user-name');
    const roleEl = document.querySelector('.header-user-role');
    const dropdownNameEl = document.getElementById('dropdown-user-name');
    const dropdownRoleEl = document.getElementById('dropdown-user-role');
    const navAdminLink = document.getElementById('nav-link-usuarios-sistema');
    const headerAvatarWrapper = document.getElementById('header-user-avatar-wrapper');

    if (currentUser) {
      const firstName = currentUser.nome ? currentUser.nome.split(' ')[0] : 'Usuário';
      if (nameEl) nameEl.textContent = firstName;
      if (dropdownNameEl) dropdownNameEl.textContent = currentUser.nome || 'Usuário';
      if (roleEl) {
        roleEl.textContent = currentUser.perfil;
        roleEl.className = `header-user-role role-${currentUser.perfil.toLowerCase()}`;
      }
      if (dropdownRoleEl) {
        dropdownRoleEl.textContent = currentUser.perfil;
      }

      // Exibir link de gerenciamento para ADMIN
      if (navAdminLink) {
        navAdminLink.style.display = currentUser.perfil === 'ADMIN' ? '' : 'none';
      }

      if (window.App && typeof window.App.updateAllUserAvatars === 'function') {
        window.App.updateAllUserAvatars();
      }
    } else {
      if (nameEl) nameEl.textContent = 'Usuário';
      if (dropdownNameEl) dropdownNameEl.textContent = 'Usuário';
      // Ao fazer logout, resetar avatar para rebuss.png
      if (headerAvatarWrapper) {
        headerAvatarWrapper.innerHTML = `
          <img src="assets/rebuss.png" alt="Avatar Padrão" class="header-user-avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">
        `;
      }
    }
  }

  // ─── Helpers de UI ───────────────────────────────────────────────────────────
  function showError(el, msg) {
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hide');
  }

  function hideError(el) {
    if (!el) return;
    el.textContent = '';
    el.classList.add('hide');
  }

  function setButtonLoading(btn, isLoading, text) {
    if (!btn) return;
    btn.disabled = isLoading;
    btn.innerHTML = isLoading
      ? `<span class="btn-spinner"></span> ${text}`
      : text;
  }

  function togglePasswordVisibility(inputId, btnEl) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const isCurrentlyPassword = input.type === 'password';
    input.type = isCurrentlyPassword ? 'text' : 'password';

    const btn = btnEl || document.querySelector(`.btn-toggle-password[data-target="${inputId}"]`);
    if (btn) {
      btn.setAttribute('title', isCurrentlyPassword ? 'Ocultar senha' : 'Ver senha');
      btn.setAttribute('aria-label', isCurrentlyPassword ? 'Ocultar senha' : 'Ver senha');
      btn.innerHTML = isCurrentlyPassword
        ? `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`
        : `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
    }
  }

  // ─── Eventos e Bindings ──────────────────────────────────────────────────────
  function bindEvents() {
    // Forms
    const loginForm = document.getElementById('form-login');
    const registerForm = document.getElementById('form-register');

    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    if (registerForm) registerForm.addEventListener('submit', handleRegister);

    // Alternar entre Login e Cadastro
    document.getElementById('btn-goto-register')?.addEventListener('click', (e) => {
      e.preventDefault();
      showAuthScreen('register');
    });

    document.getElementById('btn-goto-login')?.addEventListener('click', (e) => {
      e.preventDefault();
      showAuthScreen('login');
    });

    // Toggle de visibilidade de senha com Event Delegation global
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-toggle-password');
      if (btn) {
        e.preventDefault();
        e.stopPropagation();
        const targetInputId = btn.getAttribute('data-target');
        togglePasswordVisibility(targetInputId, btn);
      }
    });

    // Botão Sair da Conta no Header
    document.getElementById('btn-user-logout')?.addEventListener('click', handleLogout);

    // Toggle Dropdown Menu do Usuário no Header
    const userBadge = document.getElementById('header-user-badge');
    const userDropdown = document.getElementById('header-user-dropdown');

    if (userBadge && userDropdown) {
      userBadge.addEventListener('click', (e) => {
        e.stopPropagation();
        userDropdown.classList.toggle('hide');
      });

      document.addEventListener('click', (e) => {
        if (!userDropdown.contains(e.target) && !userBadge.contains(e.target)) {
          userDropdown.classList.add('hide');
        }
      });
    }
  }

  function init() {
    bindEvents();
    checkSession();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function setCurrentUser(user) {
    currentUser = user;
    updateHeaderUserUI();
  }

  return {
    init,
    getCurrentUser,
    setCurrentUser,
    isAuthenticated,
    isAdmin,
    isGestorOrAdmin,
    checkSession,
    onUnauthorized,
    handleLogout,
    showAuthScreen,
    hideAuthScreen,
    togglePasswordVisibility,
  };
})();

window.AuthModule = AuthModule;
