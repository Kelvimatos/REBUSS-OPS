/**
 * REBUSS OPS — Cliente HTTP da API REST (PostgreSQL)
 * Autenticação JWT, Gestão Administrativa, Dashboard Operacional e Entidades
 */

var RebussAPI = (function () {
  'use strict';

  const TOKEN_KEY = 'rebuss_auth_token';

  const BASE_URL = (typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin.includes(':3001'))
    ? '/api'
    : 'http://localhost:3001/api';

  let isConnected = false;

  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }

  function setToken(token) {
    try {
      if (token) {
        localStorage.setItem(TOKEN_KEY, token);
      } else {
        localStorage.removeItem(TOKEN_KEY);
      }
    } catch {}
  }

  function clearToken() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {}
  }

  async function request(endpoint, options = {}) {
    const url = `${BASE_URL}${endpoint}`;
    const token = getToken();

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const res = await fetch(url, {
        ...options,
        headers,
      });

      isConnected = true;

      if (!res.ok) {
        let errData = {};
        try {
          errData = await res.json();
        } catch {}

        // Se token expirou ou inválido, limpar sessão
        if (res.status === 401 && !endpoint.startsWith('/auth/login') && !endpoint.startsWith('/auth/register')) {
          clearToken();
          if (window.AuthModule) {
            window.AuthModule.onUnauthorized();
          }
        }

        throw new Error(errData.erro || `Erro HTTP ${res.status}: ${res.statusText}`);
      }

      return await res.json();
    } catch (err) {
      if (err.name === 'TypeError' && err.message && err.message.includes('fetch')) {
        isConnected = false;
      }
      throw err;
    }
  }

  // ─── Health / Status ──────────────────────────────────────────────────────────
  async function checkHealth() {
    try {
      const data = await request('');
      isConnected = data && data.status === 'online';
      return isConnected;
    } catch {
      isConnected = false;
      return false;
    }
  }

  function getIsConnected() {
    return isConnected;
  }

  // ─── Autenticação ────────────────────────────────────────────────────────────
  const auth = {
    register: async (dados) => {
      const data = await request('/auth/register', {
        method: 'POST',
        body: JSON.stringify(dados),
      });
      if (data && data.token) setToken(data.token);
      return data;
    },
    login: async (email, senha) => {
      const data = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, senha }),
      });
      if (data && data.token) setToken(data.token);
      return data;
    },
    me: () => request('/auth/me'),
    logout: async () => {
      try {
        await request('/auth/logout', { method: 'POST' });
      } catch {}
      clearToken();
    },
  };

  // ─── Administração de Usuários do Sistema ────────────────────────────────────
  const admin = {
    listUsuarios: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/admin/usuarios${q ? '?' + q : ''}`);
    },
    getUsuario: (id) => request(`/admin/usuarios/${encodeURIComponent(id)}`),
    updateUsuario: (id, dados) => request(`/admin/usuarios/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(dados),
    }),
    deleteUsuario: (id) => request(`/admin/usuarios/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  };

  // ─── Dashboard Operacional ───────────────────────────────────────────────────
  const dashboard = {
    getGeral: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/dashboard${q ? '?' + q : ''}`);
    },
    getIndicadores: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/dashboard/indicadores${q ? '?' + q : ''}`);
    },
    getEscalasHoje: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/dashboard/escalas-hoje${q ? '?' + q : ''}`);
    },
    getAlertas: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/dashboard/alertas${q ? '?' + q : ''}`);
    },
    getRanking: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/dashboard/ranking${q ? '?' + q : ''}`);
    },
    getEquipes: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/dashboard/equipes${q ? '?' + q : ''}`);
    },
  };

  // ─── Colaboradores / Funcionários de Campo ───────────────────────────────────
  const usuarios = {
    list: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/usuarios${q ? '?' + q : ''}`);
    },
    get: (id) => request(`/usuarios/${encodeURIComponent(id)}`),
    create: (data) => request('/usuarios', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/usuarios/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => request(`/usuarios/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  };

  // ─── Equipes ─────────────────────────────────────────────────────────────────
  const equipes = {
    list: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/equipes${q ? '?' + q : ''}`);
    },
    get: (id) => request(`/equipes/${encodeURIComponent(id)}`),
    create: (data) => request('/equipes', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/equipes/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => request(`/equipes/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    listMembros: (id) => request(`/equipes/${encodeURIComponent(id)}/membros`),
    addMembro: (id, usuarioId) => request(`/equipes/${encodeURIComponent(id)}/membros`, { method: 'POST', body: JSON.stringify({ usuarioId }) }),
    removeMembro: (id, usuarioId) => request(`/equipes/${encodeURIComponent(id)}/membros/${encodeURIComponent(usuarioId)}`, { method: 'DELETE' }),
  };

  // ─── Lojas ───────────────────────────────────────────────────────────────────
  const lojas = {
    list: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/lojas${q ? '?' + q : ''}`);
    },
    get: (id) => request(`/lojas/${encodeURIComponent(id)}`),
    create: (data) => request('/lojas', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/lojas/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => request(`/lojas/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  };

  // ─── Escalas & Presença ──────────────────────────────────────────────────────
  const escalas = {
    list: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/escalas${q ? '?' + q : ''}`);
    },
    get: (id) => request(`/escalas/${encodeURIComponent(id)}`),
    create: (data) => request('/escalas', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/escalas/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => request(`/escalas/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    addMembro: (id, usuarioId) => request(`/escalas/${encodeURIComponent(id)}/membros`, { method: 'POST', body: JSON.stringify({ usuarioId }) }),
    updatePresenca: (escalaId, usuarioId, data) => request(`/escalas/${encodeURIComponent(escalaId)}/membros/${encodeURIComponent(usuarioId)}`, { method: 'PUT', body: JSON.stringify(data) }),
    removeMembro: (escalaId, usuarioId) => request(`/escalas/${encodeURIComponent(escalaId)}/membros/${encodeURIComponent(usuarioId)}`, { method: 'DELETE' }),
  };

  // ─── Operações & Controle Diário em Tempo Real ─────────────────────────────
  const operacoes = {
    list: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/operacoes${q ? '?' + q : ''}`);
    },
    getHoje: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/operacoes/hoje${q ? '?' + q : ''}`);
    },
    get: (id) => request(`/operacoes/${encodeURIComponent(id)}`),
    create: (dados) => request('/operacoes', {
      method: 'POST',
      body: JSON.stringify(dados),
    }),
    analisar: (texto) => request('/operacoes/analisar', {
      method: 'POST',
      body: JSON.stringify({ texto }),
    }),
    importar: (dados) => request('/operacoes/importar', {
      method: 'POST',
      body: JSON.stringify(dados),
    }),
    importarEquipe: (id, dados) => request(`/operacoes/${encodeURIComponent(id)}/importar-equipe`, {
      method: 'POST',
      body: JSON.stringify(dados),
    }),
    update: (id, dados) => request(`/operacoes/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(dados),
    }),
    updateStatus: (id, usuarioId, status) => request(`/operacoes/${encodeURIComponent(id)}/membros/${encodeURIComponent(usuarioId)}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    }),
    updateObservacoes: (id, observacoes) => request(`/operacoes/${encodeURIComponent(id)}/observacoes`, {
      method: 'PUT',
      body: JSON.stringify({ observacoes }),
    }),
    addMembro: (id, dados) => request(`/operacoes/${encodeURIComponent(id)}/membros`, {
      method: 'POST',
      body: JSON.stringify(dados),
    }),
    removeMembro: (id, membroId) => request(`/operacoes/${encodeURIComponent(id)}/membros/${encodeURIComponent(membroId)}`, {
      method: 'DELETE',
    }),
    finalizar: (id) => request(`/operacoes/${encodeURIComponent(id)}/finalizar`, {
      method: 'PUT',
    }),
    getLogs: () => request('/operacoes/logs'),
  };

  // ─── Histórico Operacional Permanente ────────────────────────────────────────
  const historico = {
    getArvore: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/historico/arvore${q ? '?' + q : ''}`);
    },
    getOperacoes: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/historico/operacoes${q ? '?' + q : ''}`);
    },
    getColaborador: (idOrMatricula) => request(`/historico/colaborador/${encodeURIComponent(idOrMatricula)}`),
    getIndicadores: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/historico/indicadores${q ? '?' + q : ''}`);
    },
  };

  return {
    BASE_URL,
    getToken,
    setToken,
    clearToken,
    checkHealth,
    getIsConnected,
    auth,
    admin,
    dashboard,
    usuarios,
    equipes,
    lojas,
    escalas,
    operacoes,
    historico,
  };
})();

if (typeof window !== 'undefined') {
  window.RebussAPI = RebussAPI;
}
