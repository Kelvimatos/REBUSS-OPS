/**
 * REBUSS OPS • Central de Ferramentas
 * Gerenciamento de Usuário Ativo, Fotos de Perfil Locais, Navegação (Início, Copiador, Escalas, Calendário), Tema, Som e Atalhos
 */

const App = (() => {
  'use strict';

  // Lista Oficial de Usuários
  const USERS = [
    { id: 'operador_1', name: 'Operador 1', displayName: 'Operador 1', defaultPhoto: null },
    { id: 'operador_2', name: 'Operador 2', displayName: 'Operador 2', defaultPhoto: null },
  ];

  let currentUser = null;
  let currentTheme = 'light';
  let soundEnabled = true;
  let audioCtx = null;
  let toastTimeout = null;

  // ==========================================================================
  // 1. GERENCIAMENTO DE FOTOS DE PERFIL (LocalStorage + Canvas Compression)
  // ==========================================================================
  let pendingPhotoFile = null;
  let pendingPhotoDataUrl = null;
  let photoPosX = 50;
  let photoPosY = 50;
  let isDraggingPhoto = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartPosX = 50;
  let dragStartPosY = 50;

  // Auto-purga de caches legados de foto
  (function purgeLegacyAvatarStorage() {
    try {
      const purgeTag = 'rebuss_avatar_clean_v4_official';
      if (!localStorage.getItem(purgeTag)) {
        localStorage.removeItem('rebuss_user_photos');
        localStorage.removeItem('rebuss_clean_init_v2');
        localStorage.removeItem('rebuss_clean_init_v3');
        localStorage.removeItem('rebuss_user_photo_kelvi');
        localStorage.removeItem('rebuss_custom_avatar_kelvi');
        localStorage.setItem(purgeTag, '1');
      }
    } catch (e) {}
  })();

  function getActiveUser() {
    if (window.AuthModule && typeof window.AuthModule.getCurrentUser === 'function') {
      const authUser = window.AuthModule.getCurrentUser();
      if (authUser) {
        return {
          id: authUser.id || authUser.email || 'user',
          name: authUser.nome || 'Usuário',
          displayName: authUser.nome || 'Usuário',
          email: authUser.email,
          perfil: authUser.perfil,
          fotoPerfil: authUser.fotoPerfil || null,
        };
      }
    }
    const savedUserId = localStorage.getItem('rebuss_selected_user_id');
    if (savedUserId) {
      const found = USERS.find(u => u.id === savedUserId);
      if (found) return found;
    }
    return currentUser || { id: 'default_user', name: 'Usuário', displayName: 'Usuário', fotoPerfil: null };
  }

  function normalizePhotoEntry(entry) {
    if (!entry) return null;
    let dataStr = null;
    let posX = 50;
    let posY = 50;

    if (typeof entry === 'string') {
      dataStr = entry;
    } else if (entry.data) {
      dataStr = entry.data;
      posX = entry.posX ?? 50;
      posY = entry.posY ?? 50;
    }

    if (!dataStr) return null;
    // Eliminar qualquer referência à imagem antiga
    if (dataStr.includes('kelvi-matos') || dataStr.includes('kelvi.jpeg') || dataStr.includes('kelvi.jpg')) {
      return null;
    }

    return { data: dataStr, posX, posY };
  }

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

  function getUserPhotoEntry(user) {
    const targetUser = user || getActiveUser();
    if (!targetUser) return null;

    // 1. Prioridade: fotoPerfil do usuário autenticado no AuthModule
    if (window.AuthModule && typeof window.AuthModule.getCurrentUser === 'function') {
      const authUser = window.AuthModule.getCurrentUser();
      if (authUser && (authUser.id === targetUser.id || authUser.email === targetUser.email || !targetUser.id)) {
        if (authUser.fotoPerfil) {
          const norm = normalizePhotoEntry(authUser.fotoPerfil);
          if (norm) return norm;
        }
      }
    }

    if (targetUser.fotoPerfil) {
      const norm = normalizePhotoEntry(targetUser.fotoPerfil);
      if (norm) return norm;
    }

    const userId = typeof targetUser === 'string' ? targetUser : (targetUser.id || targetUser.email);
    if (!userId) return null;
    const map = getUserPhotosMap();
    return normalizePhotoEntry(map[userId]);
  }

  function getUserPhotoSrc(user) {
    const entry = getUserPhotoEntry(user);
    return (entry && entry.data) ? entry.data : null;
  }

  function getUserPhotoPosition(user) {
    const entry = getUserPhotoEntry(user);
    if (entry) return { posX: entry.posX, posY: entry.posY };
    return { posX: 50, posY: 50 };
  }

  function buildAvatarImgHtml(src, alt, className, posX, posY) {
    const style = `object-position: ${posX}% ${posY}%; width:100%; height:100%; max-width:100%; max-height:100%; min-width:100%; min-height:100%; object-fit:cover; border-radius:50%; display:block;`;
    return `<img src="${src}" alt="${alt}" class="${className} avatar-img" style="${style}">`;
  }

  function buildDefaultAvatarHtml(className = 'header-user-avatar') {
    return `<img src="assets/rebuss.png" alt="Avatar Oficial REBUSS" class="${className} avatar-img" style="width:100%; height:100%; max-width:100%; max-height:100%; min-width:100%; min-height:100%; object-fit:cover; border-radius:50%; display:block;">`;
  }

  function renderModalPhotoPreview(user) {
    const preview = document.getElementById('modal-user-photo-preview');
    if (!preview) return;
    const targetUser = user || getActiveUser();
    const photoSrc = getUserPhotoSrc(targetUser);
    const posPanel = document.getElementById('photo-position-panel');

    if (photoSrc) {
      const pos = getUserPhotoPosition(targetUser);
      photoPosX = pos.posX;
      photoPosY = pos.posY;
      preview.innerHTML = `
        <div class="photo-preview-frame avatar avatar-xl" id="photo-preview-frame" style="width:120px;height:120px;min-width:120px;min-height:120px;max-width:120px;max-height:120px;margin:0 auto;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;border:3px solid var(--primary);background:var(--bg-card-subtle);">
          <img src="${photoSrc}" alt="${targetUser.name || 'Usuário'}" class="photo-preview-img avatar-img" width="120" height="120" style="width:100%;height:100%;max-width:100%;max-height:100%;min-width:100%;min-height:100%;object-fit:cover;object-position:${pos.posX}% ${pos.posY}%;border:none;display:block;border-radius:50%;">
        </div>
      `;
    } else {
      if (posPanel) posPanel.classList.add('hide');
      preview.innerHTML = `
        <div class="photo-preview-frame avatar avatar-xl" id="photo-preview-frame" style="width:120px;height:120px;min-width:120px;min-height:120px;max-width:120px;max-height:120px;margin:0 auto;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;border:3px solid var(--primary);background:var(--bg-card-subtle);">
          <img src="assets/rebuss.png" alt="Avatar Oficial REBUSS" class="photo-preview-img avatar-img" width="120" height="120" style="width:100%;height:100%;max-width:100%;max-height:100%;min-width:100%;min-height:100%;object-fit:cover;display:block;border-radius:50%;">
        </div>
      `;
    }
  }

  async function setCustomPhoto(userId, base64Data, posX = 50, posY = 50) {
    const activeUser = getActiveUser();
    const targetUserId = userId || activeUser.id;
    const map = getUserPhotosMap();
    map[targetUserId] = { data: base64Data, posX, posY };
    saveUserPhotosMap(map);

    // Sincronizar com AuthModule e banco de dados
    if (window.AuthModule && typeof window.AuthModule.getCurrentUser === 'function') {
      const authUser = window.AuthModule.getCurrentUser();
      if (authUser) {
        authUser.fotoPerfil = base64Data;
        if (typeof window.AuthModule.setCurrentUser === 'function') {
          window.AuthModule.setCurrentUser(authUser);
        }
      }
    }

    if (window.RebussAPI && RebussAPI.auth && typeof RebussAPI.auth.updateFoto === 'function' && RebussAPI.getToken()) {
      try {
        await RebussAPI.auth.updateFoto(base64Data);
      } catch (err) {
        console.warn('Aviso: Não foi possível sincronizar foto com o servidor:', err.message);
      }
    }

    updateAllUserAvatars();
    renderModalPhotoPreview(activeUser);

    const btnAdjust = document.getElementById('btn-adjust-photo-position');
    const btnRemove = document.getElementById('btn-remove-user-photo');
    if (btnAdjust) btnAdjust.classList.remove('hide');
    if (btnRemove) btnRemove.classList.remove('hide');

    showToast('Foto de perfil atualizada!', '✓');
    playSound('copy');
  }

  function updatePhotoPosition(userId, posX, posY) {
    const activeUser = getActiveUser();
    const targetUserId = userId || activeUser.id;
    const map = getUserPhotosMap();
    const entry = normalizePhotoEntry(map[targetUserId]);
    if (!entry) return;
    map[targetUserId] = { data: entry.data, posX, posY };
    saveUserPhotosMap(map);
    updateAllUserAvatars();
    renderModalPhotoPreview(activeUser);
    showToast('Posicionamento salvo!', '✓');
  }

  async function removeCustomPhoto(userId) {
    const activeUser = getActiveUser();
    const targetUserId = userId || activeUser.id;
    const map = getUserPhotosMap();

    // 1. Remove do mapa de fotos local
    delete map[targetUserId];
    saveUserPhotosMap(map);

    // 2. Sincronizar com AuthModule e banco de dados
    if (window.AuthModule && typeof window.AuthModule.getCurrentUser === 'function') {
      const authUser = window.AuthModule.getCurrentUser();
      if (authUser) {
        authUser.fotoPerfil = null;
        if (typeof window.AuthModule.setCurrentUser === 'function') {
          window.AuthModule.setCurrentUser(authUser);
        }
      }
    }

    if (window.RebussAPI && RebussAPI.auth && typeof RebussAPI.auth.removeFoto === 'function' && RebussAPI.getToken()) {
      try {
        await RebussAPI.auth.removeFoto();
      } catch (err) {
        console.warn('Aviso: Não foi possível sincronizar remoção no servidor:', err.message);
      }
    }

    // 3. Limpar estados temporários
    pendingPhotoFile = null;
    pendingPhotoDataUrl = null;
    photoPosX = 50;
    photoPosY = 50;

    const posPanel = document.getElementById('photo-position-panel');
    if (posPanel) posPanel.classList.add('hide');

    const btnAdjust = document.getElementById('btn-adjust-photo-position');
    const btnRemove = document.getElementById('btn-remove-user-photo');
    if (btnAdjust) btnAdjust.classList.add('hide');
    if (btnRemove) btnRemove.classList.add('hide');

    // 4. Atualiza imediatamente o preview e todos os avatares para rebuss.png
    renderModalPhotoPreview(activeUser);
    updateAllUserAvatars();

    showToast('Foto de perfil removida com sucesso!', 'ℹ');
    playSound('undo');
  }

  function compressImageToBase64(img) {
    const canvas = document.createElement('canvas');
    const size = 160;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const minDim = Math.min(img.width, img.height);
    const sx = (img.width - minDim) / 2;
    const sy = (img.height - minDim) / 2;

    ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', 0.85);
  }

  function handlePhotoUpload(file, userId) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        pendingPhotoFile = file;
        pendingPhotoDataUrl = e.target.result;
        photoPosX = 50;
        photoPosY = 50;
        showPhotoPositionPanel(img, userId, true);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function showPhotoPositionPanel(imgOrSrc, userId, isNew = false) {
    const panel = document.getElementById('photo-position-panel');
    const preview = document.getElementById('modal-user-photo-preview');
    const posXInput = document.getElementById('photo-pos-x');
    const posYInput = document.getElementById('photo-pos-y');
    const btnAdjust = document.getElementById('btn-adjust-photo-position');

    if (!panel || !preview) return;

    const src = typeof imgOrSrc === 'string' ? imgOrSrc : imgOrSrc.src;
    if (isNew) {
      pendingPhotoDataUrl = src;
    }

    preview.innerHTML = `
      <div class="photo-preview-frame" id="photo-preview-frame">
        <img src="${src}" alt="Prévia" class="photo-preview-img" style="width:100%;height:100%;object-fit:cover;object-position:${photoPosX}% ${photoPosY}%;border:none;">
      </div>
    `;

    const previewImg = preview.querySelector('.photo-preview-img');

    if (posXInput) posXInput.value = photoPosX;
    if (posYInput) posYInput.value = photoPosY;
    panel.classList.remove('hide');
    if (btnAdjust) btnAdjust.classList.toggle('hide', isNew);

    bindPhotoPositionControls(userId, isNew);
  }

  function bindPhotoPositionControls(userId, isNew) {
    const posXInput = document.getElementById('photo-pos-x');
    const posYInput = document.getElementById('photo-pos-y');
    const frame = document.getElementById('photo-preview-frame');
    const previewImg = frame ? frame.querySelector('img') : null;
    const btnSavePos = document.getElementById('btn-save-photo-position');

    function applyPosition() {
      if (previewImg) {
        previewImg.style.objectPosition = `${photoPosX}% ${photoPosY}%`;
      }
    }

    if (posXInput) {
      posXInput.oninput = () => {
        photoPosX = parseInt(posXInput.value, 10);
        applyPosition();
      };
    }

    if (posYInput) {
      posYInput.oninput = () => {
        photoPosY = parseInt(posYInput.value, 10);
        applyPosition();
      };
    }

    if (frame && previewImg) {
      frame.onmousedown = (e) => startPhotoDrag(e.clientX, e.clientY);
      frame.ontouchstart = (e) => {
        const t = e.touches[0];
        startPhotoDrag(t.clientX, t.clientY);
        e.preventDefault();
      };
    }

    if (btnSavePos) {
      btnSavePos.textContent = isNew ? 'Salvar foto' : 'Salvar posicionamento';
      btnSavePos.onclick = () => {
        if (isNew && pendingPhotoDataUrl) {
          const img = new Image();
          img.onload = () => {
            const compressed = compressImageToBase64(img);
            setCustomPhoto(userId, compressed, photoPosX, photoPosY);
            pendingPhotoFile = null;
            pendingPhotoDataUrl = null;
            document.getElementById('photo-position-panel')?.classList.add('hide');
          };
          img.src = pendingPhotoDataUrl;
        } else {
          updatePhotoPosition(userId, photoPosX, photoPosY);
          document.getElementById('photo-position-panel')?.classList.add('hide');
        }
      };
    }
  }

  function startPhotoDrag(clientX, clientY) {
    isDraggingPhoto = true;
    dragStartX = clientX;
    dragStartY = clientY;
    dragStartPosX = photoPosX;
    dragStartPosY = photoPosY;

    const onMove = (e) => {
      if (!isDraggingPhoto) return;
      const x = e.touches ? e.touches[0].clientX : e.clientX;
      const y = e.touches ? e.touches[0].clientY : e.clientY;
      const dx = x - dragStartX;
      const dy = y - dragStartY;
      photoPosX = Math.max(0, Math.min(100, dragStartPosX - dx * 0.3));
      photoPosY = Math.max(0, Math.min(100, dragStartPosY - dy * 0.3));
      const posXInput = document.getElementById('photo-pos-x');
      const posYInput = document.getElementById('photo-pos-y');
      if (posXInput) posXInput.value = Math.round(photoPosX);
      if (posYInput) posYInput.value = Math.round(photoPosY);
      const previewImg = document.querySelector('#photo-preview-frame img');
      if (previewImg) previewImg.style.objectPosition = `${photoPosX}% ${photoPosY}%`;
    };

    const onUp = () => {
      isDraggingPhoto = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
  }

  function updateAllUserAvatars() {
    const activeUser = getActiveUser();

    // 1. Atualizar Header do Usuário Ativo
    const headerAvatarWrapper = document.getElementById('header-user-avatar-wrapper');
    if (headerAvatarWrapper) {
      const photoSrc = getUserPhotoSrc(activeUser);
      if (photoSrc) {
        const pos = getUserPhotoPosition(activeUser);
        headerAvatarWrapper.innerHTML = buildAvatarImgHtml(photoSrc, activeUser.name, 'header-user-avatar', pos.posX, pos.posY);
      } else {
        headerAvatarWrapper.innerHTML = buildDefaultAvatarHtml('header-user-avatar');
      }
    }

    // 2. Atualizar Tela de Seleção de Usuários
    USERS.forEach(user => {
      const card = document.querySelector(`.user-card-option[data-user-id="${user.id}"]`);
      if (card) {
        const photoSrc = getUserPhotoSrc(user);
        const avatarWrapper = card.querySelector('.user-avatar-slot');
        if (avatarWrapper) {
          if (photoSrc) {
            const pos = getUserPhotoPosition(user);
            avatarWrapper.innerHTML = buildAvatarImgHtml(photoSrc, user.name, 'user-avatar-img', pos.posX, pos.posY);
          } else {
            avatarWrapper.innerHTML = buildDefaultAvatarHtml('user-avatar-img');
          }
        }
      }
    });
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
    const user = getActiveUser();
    const modal = document.getElementById('modal-user-photo');
    const userNameEl = document.getElementById('modal-user-photo-name');
    const posPanel = document.getElementById('photo-position-panel');
    const btnAdjust = document.getElementById('btn-adjust-photo-position');
    const btnRemove = document.getElementById('btn-remove-user-photo');

    const userName = (user && (user.nome || user.name || user.displayName)) || 'Usuário';
    if (userNameEl) {
      userNameEl.textContent = userName;
    }
    if (posPanel) posPanel.classList.add('hide');
    pendingPhotoDataUrl = null;
    pendingPhotoFile = null;

    const hasCustom = !!getUserPhotoSrc(user);
    if (btnAdjust) btnAdjust.classList.toggle('hide', !hasCustom);
    if (btnRemove) btnRemove.classList.toggle('hide', !hasCustom);

    renderModalPhotoPreview(user);
    if (modal) modal.classList.add('open');
  }

  // ==========================================================================
  // 6. NAVEGAÇÃO SPA (Operações, Dashboard, Histórico, Copiador, Escalas, Calendário)
  // ==========================================================================
  function navigateTo(route) {
    const validRoutes = ['operacoes', 'dashboard', 'inicio', 'historico', 'copiador', 'escalas', 'calendario', 'equipes', 'usuarios-sistema'];
    const target = validRoutes.includes(route) ? route : 'operacoes';

    document.querySelectorAll('.view-section').forEach(view => {
      view.classList.toggle('active', view.id === `view-${target}`);
    });

    document.querySelectorAll('.nav-link, .mobile-nav-link').forEach(link => {
      const linkRoute = link.getAttribute('data-route') || link.getAttribute('data-nav');
      link.classList.toggle('active', linkRoute === target || (target === 'dashboard' && linkRoute === 'inicio'));
    });

    // Fechar drawer mobile ao navegar
    const mobileDrawer = document.getElementById('mobile-nav-drawer');
    if (mobileDrawer) mobileDrawer.classList.add('hide');

    window.location.hash = `#/${target}`;
    window.scrollTo({ top: 0, behavior: 'instant' });

    if (target === 'operacoes' && window.OperacoesModule) {
      OperacoesModule.render();
    } else if ((target === 'dashboard' || target === 'inicio') && window.DashboardModule) {
      DashboardModule.render();
    } else if (target === 'historico' && window.HistoricoModule) {
      HistoricoModule.render();
    } else if (target === 'usuarios-sistema' && window.AdminModule) {
      AdminModule.render();
    } else if (target === 'copiador' && window.CopiadorModule) {
      CopiadorModule.render();
    } else if (target === 'escalas' && window.EscalasModule) {
      EscalasModule.render();
    } else if (target === 'calendario' && window.CalendarioModule) {
      CalendarioModule.render();
    } else if (target === 'equipes' && window.EquipesModule) {
      EquipesModule.render();
    }
  }

  function initRouter() {
    window.addEventListener('hashchange', () => {
      const route = window.location.hash.replace(/^#\/?/, '').trim();
      navigateTo(route);
    });

    const initialRoute = window.location.hash.replace(/^#\/?/, '').trim();
    navigateTo(initialRoute || 'operacoes');
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
    const btnMobileMenu = document.getElementById('btn-mobile-menu');
    const mobileNavDrawer = document.getElementById('mobile-nav-drawer');
    const headerAvatarWrapper = document.getElementById('header-user-avatar-wrapper');

    if (btnTheme) btnTheme.addEventListener('click', toggleTheme);
    if (btnSound) btnSound.addEventListener('click', toggleSound);
    if (btnSwitch) btnSwitch.addEventListener('click', switchUser);
    if (headerAvatarWrapper) headerAvatarWrapper.addEventListener('click', openPhotoModal);

    if (btnMobileMenu && mobileNavDrawer) {
      btnMobileMenu.addEventListener('click', (e) => {
        e.stopPropagation();
        mobileNavDrawer.classList.toggle('hide');
      });
      document.addEventListener('click', (e) => {
        if (!mobileNavDrawer.contains(e.target) && e.target !== btnMobileMenu && !btnMobileMenu.contains(e.target)) {
          mobileNavDrawer.classList.add('hide');
        }
      });
    }

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
    const btnAdjustPhoto = document.getElementById('btn-adjust-photo-position');

    if (btnUploadPhoto && photoFileInput) {
      btnUploadPhoto.addEventListener('click', () => photoFileInput.click());
      photoFileInput.addEventListener('change', (e) => {
        const user = getActiveUser();
        if (e.target.files && e.target.files[0] && user) {
          handlePhotoUpload(e.target.files[0], user.id);
          e.target.value = '';
        }
      });
    }

    if (btnAdjustPhoto) {
      btnAdjustPhoto.addEventListener('click', () => {
        const user = getActiveUser();
        const entry = getUserPhotoEntry(user);
        if (!entry) {
          showToast('Adicione uma foto antes de ajustar o posicionamento.', 'ℹ');
          return;
        }
        photoPosX = entry.posX;
        photoPosY = entry.posY;
        showPhotoPositionPanel(entry.data, user.id, false);
      });
    }

    if (btnRemovePhoto) {
      btnRemovePhoto.addEventListener('click', () => {
        const user = getActiveUser();
        if (user) {
          removeCustomPhoto(user.id);
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
    navigateTo,
    updateAllUserAvatars
  };
})();
