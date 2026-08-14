/**
 * REBUSS OPS • Central de Ferramentas
 * Gerenciamento de Usuário Ativo, Fotos de Perfil Locais, Navegação (Início, Copiador, Escalas, Calendário), Tema, Som e Atalhos
 */

const App = (() => {
  'use strict';

  // Lista Oficial de Usuários
  const USERS = [
    { id: 'kelvi', name: 'Kelvi', displayName: 'Kelvi', defaultPhoto: 'assets/kelvi-matos.jpeg', isKelvi: true },
    { id: 'francisco', name: 'Francisco', displayName: 'Francisco', defaultPhoto: null, isKelvi: false },
    { id: 'bruno', name: 'Bruno', displayName: 'Bruno', defaultPhoto: null, isKelvi: false },
    { id: 'matheus', name: 'Matheus', displayName: 'Matheus', defaultPhoto: null, isKelvi: false },
    { id: 'arthur', name: 'Arthur', displayName: 'Arthur', defaultPhoto: null, isKelvi: false },
    { id: 'alexandre', name: 'Alexandre', displayName: 'Alexandre', defaultPhoto: null, isKelvi: false }
  ];

  let currentUser = null;
  let currentTheme = 'light';
  let soundEnabled = true;
  let audioCtx = null;
  let toastTimeout = null;

  // ==========================================================================
  // 1. GERENCIAMENTO DE FOTOS DE PERFIL (LocalStorage + Canvas Compression)
  // ==========================================================================
  function getUserPhotosMap() {
    try {
      return JSON.parse(localStorage.getItem('rebuss_user_photos')) || {};
    } catch {
      return {};
    }
  }

  function saveUserPhotosMap(map) {
    try {
      localStorage.setItem('rebuss_user_photos', JSON.stringify(map));
    } catch (e) {
      console.warn('Erro ao salvar foto de perfil:', e);
    }
  }

  function getUserPhotoSrc(user) {
    if (!user) return null;
    const photosMap = getUserPhotosMap();
    if (photosMap[user.id]) {
      return photosMap[user.id]; // Foto personalizada em Base64
    }
    return user.defaultPhoto; // Foto padrão (Kelvi tem 'assets/kelvi-matos.jpg', outros null)
  }

  function setCustomPhoto(userId, base64Data) {
    const map = getUserPhotosMap();
    map[userId] = base64Data;
    saveUserPhotosMap(map);
    updateAllUserAvatars();
    showToast('Foto de perfil atualizada!', '✓');
    playSound('copy');
  }

  function removeCustomPhoto(userId) {
    const map = getUserPhotosMap();
    delete map[userId];
    saveUserPhotosMap(map);
    updateAllUserAvatars();
    showToast('Foto de perfil removida.', 'ℹ');
    playSound('undo');
  }

  function handlePhotoUpload(file, userId) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // Redimensionar e comprimir para ~160x160px para ocupar quase nada de LocalStorage
        const canvas = document.createElement('canvas');
        const size = 160;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Crop quadrado centralizado
        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;

        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.85);

        setCustomPhoto(userId, compressedBase64);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function updateAllUserAvatars() {
    // 1. Atualizar Tela de Seleção de Usuários
    USERS.forEach(user => {
      const card = document.querySelector(`.user-card-option[data-user-id="${user.id}"]`);
      if (card) {
        const photoSrc = getUserPhotoSrc(user);
        const avatarWrapper = card.querySelector('.user-avatar-slot');
        if (avatarWrapper) {
          if (photoSrc) {
            avatarWrapper.innerHTML = `<img src="${photoSrc}" alt="${user.name}" class="user-avatar-img">`;
          } else {
            avatarWrapper.innerHTML = `
              <div class="user-avatar-neutral">
                <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
              </div>
            `;
          }
        }
      }
    });

    // 2. Atualizar Header do Usuário Ativo
    if (currentUser) {
      const headerAvatarWrapper = document.getElementById('header-user-avatar-wrapper');
      const photoSrc = getUserPhotoSrc(currentUser);
      if (headerAvatarWrapper) {
        if (photoSrc) {
          headerAvatarWrapper.innerHTML = `<img src="${photoSrc}" alt="${currentUser.name}" class="header-user-avatar">`;
        } else {
          headerAvatarWrapper.innerHTML = `
            <div class="header-user-avatar-neutral">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
            </div>
          `;
        }
      }

      // Atualizar Modal de Foto
      const modalPhotoPreview = document.getElementById('modal-user-photo-preview');
      if (modalPhotoPreview) {
        if (photoSrc) {
          modalPhotoPreview.innerHTML = `<img src="${photoSrc}" alt="${currentUser.name}" class="user-avatar-img" style="width:100px; height:100px;">`;
        } else {
          modalPhotoPreview.innerHTML = `
            <div class="user-avatar-neutral" style="width:100px; height:100px;">
              <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
            </div>
          `;
        }
      }
    }
  }

  // ==========================================================================
  // 2. ÁUDIO SINTETIZADO (Web Audio API)
  // ==========================================================================
  function initAudio() {
    if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioCtxClass();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function playSound(type = 'copy') {
    if (!soundEnabled) return;
    try {
      initAudio();
      if (!audioCtx) return;

      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      if (type === 'copy') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
      } else if (type === 'undo') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(330, now + 0.08);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (type === 'fanfare') {
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, i) => {
          const o = audioCtx.createOscillator();
          const g = audioCtx.createGain();
          o.connect(g);
          g.connect(audioCtx.destination);
          o.type = 'triangle';
          o.frequency.setValueAtTime(freq, now + i * 0.08);
          g.gain.setValueAtTime(0.12, now + i * 0.08);
          g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.18);
          o.start(now + i * 0.08);
          o.stop(now + i * 0.08 + 0.2);
        });
      }
    } catch (e) {
      console.warn('Áudio indisponível:', e);
    }
  }

  // ==========================================================================
  // 3. MOTOR DE CONFETES NATIVO
  // ==========================================================================
  function launchConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ['#0b3d91', '#2563eb', '#16a34a', '#d97706', '#8b5cf6'];
    const particles = [];
    for (let i = 0; i < 90; i++) {
      particles.push({
        x: canvas.width * 0.5 + (Math.random() * 200 - 100),
        y: canvas.height * 0.4 + (Math.random() * 100 - 50),
        vx: (Math.random() - 0.5) * 14,
        vy: Math.random() * -12 - 4,
        size: Math.random() * 7 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 10,
        opacity: 1
      });
    }

    let animationFrame;
    const startTime = performance.now();

    function render(currentTime) {
      const elapsed = (currentTime - startTime) / 1000;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      let alive = false;
      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.35;
        p.vx *= 0.98;
        p.rotation += p.rotationSpeed;
        p.opacity = Math.max(1 - (elapsed / 2.5), 0);

        if (p.opacity > 0 && p.y < canvas.height + 40) {
          alive = true;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate((p.rotation * Math.PI) / 180);
          ctx.globalAlpha = p.opacity;
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
          ctx.restore();
        }
      });

      if (alive && elapsed < 2.8) {
        animationFrame = requestAnimationFrame(render);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        cancelAnimationFrame(animationFrame);
      }
    }

    animationFrame = requestAnimationFrame(render);
  }

  // ==========================================================================
  // 4. TOAST E CLIPBOARD
  // ==========================================================================
  function showToast(msg, icon = '✓') {
    const toast = document.getElementById('global-toast');
    const toastMsg = document.getElementById('toast-msg');
    const toastIcon = document.getElementById('toast-icon');

    if (!toast || !toastMsg) return;

    clearTimeout(toastTimeout);
    toastMsg.textContent = msg;
    if (toastIcon) toastIcon.textContent = icon;

    toast.classList.add('show');
    toastTimeout = setTimeout(() => {
      toast.classList.remove('show');
    }, 2400);
  }

  async function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (e) {}
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const res = document.execCommand('copy');
    document.body.removeChild(ta);
    return res;
  }

  // ==========================================================================
  // 5. SELEÇÃO E GESTÃO DO USUÁRIO ATIVO
  // ==========================================================================
  function initUserSelection() {
    updateAllUserAvatars();

    const savedUserId = localStorage.getItem('rebuss_selected_user_id');
    const savedUser = USERS.find(u => u.id === savedUserId);

    if (savedUser) {
      selectUser(savedUser, false);
    } else {
      showUserSelectModal();
    }
  }

  function showUserSelectModal() {
    const screen = document.getElementById('user-select-screen');
    if (screen) screen.classList.remove('hide');
  }

  function hideUserSelectModal() {
    const screen = document.getElementById('user-select-screen');
    if (screen) screen.classList.add('hide');
  }

  function selectUser(user, save = true) {
    currentUser = user;
    if (save) {
      localStorage.setItem('rebuss_selected_user_id', user.id);
      localStorage.setItem('rebuss_user_name', user.name);
    }

    // 1. Atualizar Header
    const nameEl = document.getElementById('header-user-name');
    if (nameEl) nameEl.textContent = user.name;
    updateAllUserAvatars();

    // 2. Atualizar Gerador de Escalas (Assinatura Automática)
    if (window.EscalasModule) {
      EscalasModule.render();
    }

    // 3. Atualizar Calendário de Plantões (Destaque do Usuário Ativo)
    if (window.CalendarioModule) {
      CalendarioModule.render();
    }

    hideUserSelectModal();
    playSound('copy');
  }

  function switchUser() {
    showUserSelectModal();
  }

  function openPhotoModal() {
    if (!currentUser) return;
    const modal = document.getElementById('modal-user-photo');
    const userNameEl = document.getElementById('modal-user-photo-name');
    if (userNameEl) userNameEl.textContent = currentUser.name;
    updateAllUserAvatars();
    if (modal) modal.classList.add('open');
  }

  // ==========================================================================
  // 6. NAVEGAÇÃO SPA (Início, Copiador, Escalas, Calendário)
  // ==========================================================================
  function navigateTo(route) {
    const validRoutes = ['inicio', 'copiador', 'escalas', 'calendario'];
    const target = validRoutes.includes(route) ? route : 'inicio';

    document.querySelectorAll('.view-section').forEach(view => {
      view.classList.toggle('active', view.id === `view-${target}`);
    });

    document.querySelectorAll('.nav-link').forEach(link => {
      const linkRoute = link.getAttribute('data-route');
      link.classList.toggle('active', linkRoute === target);
    });

    window.location.hash = `#/${target}`;
    window.scrollTo({ top: 0, behavior: 'instant' });

    if (target === 'copiador' && window.CopiadorModule) {
      CopiadorModule.render();
    } else if (target === 'escalas' && window.EscalasModule) {
      EscalasModule.render();
    } else if (target === 'calendario' && window.CalendarioModule) {
      CalendarioModule.render();
    }
  }

  function initRouter() {
    window.addEventListener('hashchange', () => {
      const route = window.location.hash.replace(/^#\/?/, '').trim();
      navigateTo(route);
    });

    const initialRoute = window.location.hash.replace(/^#\/?/, '').trim();
    navigateTo(initialRoute || 'inicio');
  }

  // ==========================================================================
  // 7. TEMA & SOM
  // ==========================================================================
  function initThemeAndSound() {
    const savedTheme = localStorage.getItem('rebuss_theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(savedTheme, false);

    const savedSound = localStorage.getItem('rebuss_sound');
    soundEnabled = savedSound !== null ? savedSound === '1' : true;
    updateSoundUI();
  }

  function setTheme(theme, save = true) {
    currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    if (save) localStorage.setItem('rebuss_theme', theme);

    const iconSun = document.querySelector('.icon-sun');
    const iconMoon = document.querySelector('.icon-moon');
    if (iconSun && iconMoon) {
      if (theme === 'dark') {
        iconSun.classList.remove('hide');
        iconMoon.classList.add('hide');
      } else {
        iconSun.classList.add('hide');
        iconMoon.classList.remove('hide');
      }
    }
  }

  function toggleTheme() {
    const next = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(next, true);
    showToast(`Tema ${next === 'dark' ? 'Escuro' : 'Claro'} ativado`, '🌓');
  }

  function toggleSound() {
    soundEnabled = !soundEnabled;
    localStorage.setItem('rebuss_sound', soundEnabled ? '1' : '0');
    updateSoundUI();
    playSound(soundEnabled ? 'copy' : 'undo');
    showToast(soundEnabled ? 'Sons ativados' : 'Sons desativados', soundEnabled ? '🔊' : '🔇');
  }

  function updateSoundUI() {
    const iconOn = document.querySelector('.icon-sound-on');
    const iconOff = document.querySelector('.icon-sound-off');
    if (iconOn && iconOff) {
      if (soundEnabled) {
        iconOn.classList.remove('hide');
        iconOff.classList.add('hide');
      } else {
        iconOn.classList.add('hide');
        iconOff.classList.remove('hide');
      }
    }
  }

  // ==========================================================================
  // 8. ATALHOS GLOBAIS DE TECLADO
  // ==========================================================================
  function initShortcuts() {
    document.addEventListener('keydown', (e) => {
      const activeTag = document.activeElement ? document.activeElement.tagName : '';
      const isInput = activeTag === 'TEXTAREA' || activeTag === 'INPUT';
      const isCopiador = document.getElementById('view-copiador').classList.contains('active');

      if ((e.altKey && e.key.toLowerCase() === 'c') || (e.code === 'Space' && !isInput && isCopiador)) {
        e.preventDefault();
        if (window.CopiadorModule) CopiadorModule.copyNextPending();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && isCopiador) {
        e.preventDefault();
        if (window.CopiadorModule) CopiadorModule.loadNames();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !isInput && isCopiador) {
        e.preventDefault();
        if (window.CopiadorModule) CopiadorModule.undo();
        return;
      }

      if (e.key === '/' && !isInput && isCopiador) {
        const s = document.getElementById('copiador-search');
        if (s) { e.preventDefault(); s.focus(); }
        return;
      }

      if (e.altKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        toggleTheme();
        return;
      }

      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open'));
        const s = document.getElementById('copiador-search');
        if (s && document.activeElement === s) {
          s.value = '';
          if (window.CopiadorModule) CopiadorModule.render();
          s.blur();
        }
      }

      if (e.key === '?' && !isInput) {
        const m = document.getElementById('modal-shortcuts');
        if (m) m.classList.toggle('open');
      }
    });
  }

  // ==========================================================================
  // INICIALIZAÇÃO
  // ==========================================================================
  function init() {
    initThemeAndSound();
    initUserSelection();
    initRouter();
    initShortcuts();

    // Eventos Header
    const btnTheme = document.getElementById('btn-theme-toggle');
    const btnSound = document.getElementById('btn-sound-toggle');
    const btnSwitch = document.getElementById('btn-switch-user');
    const btnShortcuts = document.getElementById('btn-shortcuts-toggle');
    const headerAvatarWrapper = document.getElementById('header-user-avatar-wrapper');

    if (btnTheme) btnTheme.addEventListener('click', toggleTheme);
    if (btnSound) btnSound.addEventListener('click', toggleSound);
    if (btnSwitch) btnSwitch.addEventListener('click', switchUser);
    if (headerAvatarWrapper) headerAvatarWrapper.addEventListener('click', openPhotoModal);

    if (btnShortcuts) {
      btnShortcuts.addEventListener('click', () => {
        const m = document.getElementById('modal-shortcuts');
        if (m) m.classList.add('open');
      });
    }

    // Seleção de Usuário ao Clicar nos Cards
    document.querySelectorAll('.user-card-option').forEach(btn => {
      btn.addEventListener('click', function() {
        const userId = this.getAttribute('data-user-id');
        const user = USERS.find(u => u.id === userId);
        if (user) selectUser(user);
      });
    });

    // Links de Navegação
    document.querySelectorAll('[data-nav]').forEach(link => {
      link.addEventListener('click', function(e) {
        e.preventDefault();
        const target = this.getAttribute('data-nav');
        navigateTo(target);
      });
    });

    // Gerenciamento de Fotos no Modal
    const photoFileInput = document.getElementById('input-user-photo-file');
    const btnUploadPhoto = document.getElementById('btn-upload-user-photo');
    const btnRemovePhoto = document.getElementById('btn-remove-user-photo');

    if (btnUploadPhoto && photoFileInput) {
      btnUploadPhoto.addEventListener('click', () => photoFileInput.click());
      photoFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0] && currentUser) {
          handlePhotoUpload(e.target.files[0], currentUser.id);
        }
      });
    }

    if (btnRemovePhoto) {
      btnRemovePhoto.addEventListener('click', () => {
        if (currentUser) {
          removeCustomPhoto(currentUser.id);
        }
      });
    }

    // Modais
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', function(e) {
        if (e.target === this) this.classList.remove('open');
      });
    });
    document.querySelectorAll('.btn-modal-close').forEach(btn => {
      btn.addEventListener('click', function() {
        this.closest('.modal-overlay').classList.remove('open');
      });
    });
  }

  document.addEventListener('DOMContentLoaded', init);

  return {
    playSound,
    launchConfetti,
    showToast,
    copyToClipboard,
    getCurrentUser: () => currentUser,
    USERS,
    navigateTo
  };
})();
