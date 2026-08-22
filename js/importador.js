/**
 * REBUSS OPS — Módulo Importador Inteligente do Admin Rebuss
 * Analisa e processa texto colado, extrai loja, data, horário, colaboradores,
 * cargos e códigos, evitando duplicatas e gravando permanentemente no PostgreSQL.
 */

const ImportadorModule = (() => {
  'use strict';

  let analiseAtual = null;

  function init() {
    bindEvents();
  }

  function bindEvents() {
    // Event delegation global para abrir modal de qualquer botão .btn-abrir-importador
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-abrir-importador');
      if (btn) {
        e.preventDefault();
        e.stopPropagation();
        abrirModal();
      }
    });

    // Fechar modal
    document.querySelectorAll('.modal-importador-close').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        fecharModal();
      });
    });

    // Fechar ao clicar no overlay do modal
    const modal = document.getElementById('modal-importador-operacao');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          fecharModal();
        }
      });
    }

    // Botão Analisar Operação
    document.getElementById('btn-analisar-importacao')?.addEventListener('click', handleAnalisar);

    // Botão Confirmar e Gravar no Banco
    document.getElementById('btn-confirmar-importacao')?.addEventListener('click', handleConfirmar);

    // Botão Limpar Texto
    document.getElementById('btn-limpar-importacao')?.addEventListener('click', () => {
      const textarea = document.getElementById('input-import-text');
      if (textarea) textarea.value = '';
      resetPreview();
    });
  }

  function abrirModal() {
    const modal = document.getElementById('modal-importador-operacao');
    if (!modal) return;
    resetPreview();
    modal.classList.add('open', 'active');
    setTimeout(() => {
      document.getElementById('input-import-text')?.focus();
    }, 100);
  }

  function fecharModal() {
    const modal = document.getElementById('modal-importador-operacao');
    if (!modal) return;
    modal.classList.remove('open', 'active');
  }

  function resetPreview() {
    analiseAtual = null;
    const previewWrap = document.getElementById('import-preview-wrap');
    const resultWrap = document.getElementById('import-result-log');
    const btnConfirmar = document.getElementById('btn-confirmar-importacao');

    if (previewWrap) previewWrap.style.display = 'none';
    if (resultWrap) resultWrap.style.display = 'none';
    if (btnConfirmar) btnConfirmar.disabled = true;
  }

  async function handleAnalisar() {
    const textarea = document.getElementById('input-import-text');
    const rawText = textarea ? textarea.value.trim() : '';

    if (!rawText) {
      alert('Por favor, cole o texto da operação antes de analisar.');
      return;
    }

    const btnAnalisar = document.getElementById('btn-analisar-importacao');
    const previewWrap = document.getElementById('import-preview-wrap');
    const btnConfirmar = document.getElementById('btn-confirmar-importacao');

    if (btnAnalisar) {
      btnAnalisar.disabled = true;
      btnAnalisar.innerHTML = '⏳ Analisando...';
    }

    try {
      const api = window.RebussAPI || (typeof RebussAPI !== 'undefined' ? RebussAPI : null);
      if (!api || !api.operacoes) {
        throw new Error('Módulo de conexão com a API não carregado. Por favor, atualize a página (F5 ou Ctrl+F5).');
      }

      const resp = await api.operacoes.analisar(rawText);
      analiseAtual = resp;

      const a = resp.analise;
      const dt = new Date(a.dataOperacao);
      const dataFmt = `${dt.getUTCDate().toString().padStart(2, '0')}/${(dt.getUTCMonth() + 1).toString().padStart(2, '0')}/${dt.getUTCFullYear()}`;

      // Preencher campos de pré-visualização
      document.getElementById('prev-loja').value = a.lojaNome;
      document.getElementById('prev-data').value = dataFmt;
      document.getElementById('prev-horario').value = a.horario;
      document.getElementById('prev-cidade').value = `${a.cidade}/${a.estado}`;
      document.getElementById('prev-piv').value = a.pivNecessario;

      // Status da operação (Nova vs Existente)
      const alertExistente = document.getElementById('import-duplicate-alert');
      if (alertExistente) {
        if (resp.jaExiste) {
          alertExistente.innerHTML = `
            <div class="auth-alert-error" style="background:#eff6ff; border-color:#bfdbfe; color:#1d4ed8; margin-bottom:12px;">
              ℹ️ <strong>Operação já existente nesta data:</strong> O sistema atualizará os colaboradores da operação sem criar duplicata no histórico.
            </div>
          `;
          alertExistente.style.display = 'block';
        } else {
          alertExistente.innerHTML = `
            <div class="auth-alert-error" style="background:#f0fdf4; border-color:#bbf7d0; color:#15803d; margin-bottom:12px;">
              ✨ <strong>Nova Operação:</strong> Será registrada como um novo registro independente no PostgreSQL.
            </div>
          `;
          alertExistente.style.display = 'block';
        }
      }

      // Tabela de colaboradores detectados
      const tbody = document.getElementById('table-import-colabs-body');
      if (tbody) {
        if (a.colaboradores && a.colaboradores.length > 0) {
          tbody.innerHTML = a.colaboradores.map((c, idx) => `
            <tr>
              <td>${idx + 1}</td>
              <td><code>${c.matricula}</code></td>
              <td><strong>${c.nome}</strong></td>
              <td><span class="role-badge role-operador">${c.cargo}</span></td>
              <td><span class="dash-status-pill status-aberta">Pendente</span></td>
            </tr>
          `).join('');
        } else {
          tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">Nenhum colaborador com matrícula identificado no texto.</td></tr>`;
        }
      }

      if (previewWrap) previewWrap.style.display = 'block';
      if (btnConfirmar) {
        btnConfirmar.disabled = false;
        btnConfirmar.textContent = resp.jaExiste ? '🔄 Atualizar Operação Existente' : '💾 Confirmar e Gravar no PostgreSQL';
      }
    } catch (err) {
      console.error('Erro ao analisar operação:', err);
      alert('Erro na análise: ' + err.message);
    } finally {
      if (btnAnalisar) {
        btnAnalisar.disabled = false;
        btnAnalisar.innerHTML = '🔍 Analisar Operação';
      }
    }
  }

  async function handleConfirmar() {
    if (!analiseAtual || !analiseAtual.analise) {
      alert('Faça a análise da operação primeiro.');
      return;
    }

    const btnConfirmar = document.getElementById('btn-confirmar-importacao');
    if (btnConfirmar) {
      btnConfirmar.disabled = true;
      btnConfirmar.innerHTML = '⏳ Gravando no Banco...';
    }

    try {
      const a = analiseAtual.analise;
      const currentUser = window.AuthModule ? AuthModule.getCurrentUser() : null;

      const payload = {
        lojaNome: document.getElementById('prev-loja')?.value || a.lojaNome,
        dataOperacao: a.dataOperacao,
        horario: document.getElementById('prev-horario')?.value || a.horario,
        cidade: a.cidade,
        estado: a.estado,
        pivNecessario: parseInt(document.getElementById('prev-piv')?.value, 10) || a.pivNecessario,
        colaboradores: a.colaboradores,
        usuarioResponsavel: currentUser ? currentUser.nome : 'Kelvi Matos',
      };

      const api = window.RebussAPI || (typeof RebussAPI !== 'undefined' ? RebussAPI : null);
      if (!api || !api.operacoes) {
        throw new Error('Módulo de conexão com a API não carregado. Por favor, atualize a página (F5 ou Ctrl+F5).');
      }

      const res = await api.operacoes.importar(payload);

      const resultWrap = document.getElementById('import-result-log');
      if (resultWrap) {
        resultWrap.innerHTML = `
          <div class="auth-alert-error" style="background:#f0fdf4; border-color:#bbf7d0; color:#15803d; margin-top:14px;">
            <h4>✅ ${res.mensagem}</h4>
            <p style="margin:4px 0 0; font-size:0.85rem;">
              • <strong>${res.totalProcessados}</strong> colaboradores processados<br>
              • <strong>${res.totalNovos}</strong> novos colaboradores cadastrados no banco<br>
              • <strong>${res.totalAtualizados}</strong> colaboradores vinculados à operação<br>
              • <strong>${res.erros}</strong> erros encontrados
            </p>
          </div>
        `;
        resultWrap.style.display = 'block';
      }

      if (window.App) {
        App.showToast(res.mensagem, '✅');
        App.playSound('copy');
      }

      // Atualizar Dashboard e Histórico se visíveis
      if (window.DashboardModule) DashboardModule.render();
      if (window.HistoricoModule) HistoricoModule.render();

      setTimeout(() => {
        fecharModal();
      }, 1500);
    } catch (err) {
      console.error('Erro ao confirmar importação:', err);
      alert('Erro ao salvar no banco: ' + err.message);
    } finally {
      if (btnConfirmar) {
        btnConfirmar.disabled = false;
        btnConfirmar.innerHTML = '💾 Confirmar e Gravar no PostgreSQL';
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return {
    init,
    abrirModal,
    fecharModal,
  };
})();

window.ImportadorModule = ImportadorModule;
