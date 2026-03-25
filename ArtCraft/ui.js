/* ui.js — UI Controller with Entry Screen + Full Painting Interface */
'use strict';

class UIController {
  constructor() {
    this.eng = null;
    this.be = null;
    this.tm = null;
    this._recentColors = [];
    this._bgColor = { h: 0, s: 0, v: 100, a: 100 };
    this._toastEl = document.getElementById('toast');
    this._toastTimer = null;
    this._menuOpen = false;

    this._initEntryScreen();
  }

  // ═══════════════════════════════════════════════════════════ SCREENS & MODALS
  _initEntryScreen() {
    document.getElementById('btn-home-gallery').addEventListener('click', () => {
      document.getElementById('new-canvas-modal').classList.remove('hidden');
    });

    const btnLocalGallery = document.getElementById('btn-local-gallery');
    if (btnLocalGallery) {
      btnLocalGallery.addEventListener('click', () => this._openLocalGallery());
    }
    const btnCloseGallery = document.getElementById('btn-close-gallery');
    if (btnCloseGallery) {
      btnCloseGallery.addEventListener('click', () => {
        document.getElementById('local-gallery-modal').classList.add('hidden');
      });
    }

    const presets = document.querySelectorAll('.preset-btn');
    const wInput = document.getElementById('entry-w');
    const hInput = document.getElementById('entry-h');

    // Preset selection
    presets.forEach(btn => {
      btn.addEventListener('click', () => {
        presets.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        wInput.value = btn.dataset.w;
        hInput.value = btn.dataset.h;
      });
    });

    // Custom input clears preset selection
    wInput.addEventListener('input', () => presets.forEach(b => b.classList.remove('active')));
    hInput.addEventListener('input', () => presets.forEach(b => b.classList.remove('active')));

    // Create button
    document.getElementById('btn-entry-create').addEventListener('click', () => {
      const w = parseInt(wInput.value);
      const h = parseInt(hInput.value);
      if (!w || !h || w < 1 || h < 1 || w > 8000 || h > 8000) {
        this._shakeInput(wInput);
        return;
      }
      this._startApp(w, h, null);
    });

    // Open image
    document.getElementById('btn-entry-open').addEventListener('click', () => {
      document.getElementById('open-image-input').click();
    });

    document.getElementById('open-image-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth || 800;
        const h = img.naturalHeight || 600;
        this._startApp(w, h, img);
        URL.revokeObjectURL(url);
      };
      img.src = url;
      e.target.value = '';
    });
  }

  async _openLocalGallery() {
    const modal = document.getElementById('local-gallery-modal');
    modal.classList.remove('hidden');
    const grid = document.getElementById('gallery-grid');
    grid.innerHTML = '<div class="gallery-empty">Carregando...</div>';
    
    try {
      const arts = await window.artStorage.listArtworks();
      if (arts.length === 0) {
        grid.innerHTML = '<div class="gallery-empty">Nenhuma arte salva na galeria local.<br><br>Comece a pintar e clique em Voltar para salvar.</div>';
        return;
      }
      grid.innerHTML = '';
      for (const art of arts) {
        const item = document.createElement('div');
        item.className = 'gallery-item';
        const img = document.createElement('img');
        img.className = 'gallery-thumb';
        img.src = art.thumbURL || 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
        
        const info = document.createElement('div');
        info.className = 'gallery-info';
        const title = document.createElement('div');
        title.className = 'gallery-title';
        title.textContent = art.name || 'Nova Arte';
        const date = document.createElement('div');
        date.className = 'gallery-date';
        date.textContent = new Date(art.updatedAt).toLocaleString();
        
        const btnDel = document.createElement('button');
        btnDel.className = 'btn-delete-art';
        btnDel.title = 'Excluir';
        btnDel.innerHTML = '<svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>';
        btnDel.onclick = async (e) => {
          e.stopPropagation();
          if (confirm('Tem certeza que deseja excluir esta arte permanente?')) {
            await window.artStorage.deleteArtwork(art.id);
            this._openLocalGallery();
          }
        };

        info.appendChild(title);
        info.appendChild(date);
        item.appendChild(img);
        item.appendChild(info);
        item.appendChild(btnDel);

        item.onclick = async () => {
          modal.classList.add('hidden');
          const fullArt = await window.artStorage.loadArtwork(art.id);
          this._startApp(fullArt.width, fullArt.height, null, fullArt);
        };
        grid.appendChild(item);
      }
    } catch (e) {
      grid.innerHTML = `<div class="gallery-empty">Erro ao carregar: ${e.message}</div>`;
    }
  }

  _shakeInput(el) {
    el.style.borderColor = '#e25c5c';
    el.animate([
      { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' },
      { transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' },
      { transform: 'translateX(0)' }
    ], { duration: 300 });
    setTimeout(() => el.style.borderColor = '', 1000);
  }

  _startApp(w, h, bgImage, artworkData = null) {
    const home = document.getElementById('home-screen');
    if (home) home.classList.add('hidden');
    
    // Animate entry screen out
    const entry = document.getElementById('new-canvas-modal');
    if (!entry.classList.contains('hidden')) {
      entry.style.transition = 'opacity .3s, transform .3s';
      entry.style.opacity = '0';
      entry.style.transform = 'scale(1.02)';
    }

    setTimeout(() => {
      entry.classList.add('hidden');
      document.getElementById('app').classList.remove('hidden');

      // Initialize engine
      this.eng = new CanvasEngine(w, h);
      this.be = new BrushEngine(this.eng);
      this.tm = new ToolManager(this.eng, this.be);
      window._app = this;
      window._ui = this;

      this.currentArtworkId = artworkData ? artworkData.id : 'art_' + Date.now();

      this._initAll();

      // Load or Create First layer
      if (artworkData && artworkData.layers) {
        this.eng.layers = [];
        
        Promise.all(artworkData.layers.map(lData => {
          return new Promise(resolve => {
            const l = this.eng.addLayer(lData.name);
            l.opacity = lData.opacity;
            l.blendMode = lData.blendMode;
            l.visible = lData.visible;
            l.locked = lData.locked;
            const img = new Image();
            img.onload = () => {
              l.canvas.getContext('2d').drawImage(img, 0, 0);
              resolve();
            };
            img.src = lData.dataURL;
          });
        })).then(() => {
          this.eng.activeLayerIdx = artworkData.activeLayerIdx || 0;
          this.eng.undo.push(this.eng.snapshot());
          this.eng.markDirty();
          this.refreshLayersPanel();
          this.be.previewBrush();
          this._syncQuickColors();
          this._updateCanvasInfo();
          this._patchBlurTool();
          this.toast('Arte carregada! 🎨');
        });
      } else {
        this.eng.addLayer('Background');
        const ctx = this.eng.activeLayer.canvas.getContext('2d');
        if (bgImage) {
          ctx.drawImage(bgImage, 0, 0, w, h);
        } else {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
        }
        this.eng.undo.push(this.eng.snapshot());
        this.refreshLayersPanel();
        this.be.previewBrush();
        this._syncQuickColors();
        this._updateCanvasInfo();
        this._patchBlurTool();
        this.toast('Bem-vindo ao ArtCraft! 🎨');
      }
    }, 300);
  }

  _initAll() {
    this._initPalette();
    this._initColorWheel();
    this._syncSliders();
    this._initColorControls();
    this._initLayersPanel();
    this._initBrushLib();
    this._initTopBar();
    this._initBrushSettings();
    this._initModals();
    this._initPanelTabs();
    this._initToolButtons();
    this._initKeyboard();
  }

  // ═══════════════════════════════════════════════════════════ TOAST
  toast(msg) {
    const t = this._toastEl;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
  }

  // ═══════════════════════════════════════════════════════════ TOP BAR
  _initTopBar() {
    document.getElementById('btn-back').onclick = async () => {
      if (confirm('Deseja salvar a arte na Galeria Local antes de voltar para a tela inicial? (Cancelar apenas voltará sem salvar)')) {
        await this._saveArtworkToLocal();
      }
      document.getElementById('app').classList.add('hidden');
      document.getElementById('new-canvas-modal').classList.add('hidden');
      document.getElementById('new-canvas-modal').style.opacity = '1';
      document.getElementById('new-canvas-modal').style.transform = '';
      const home = document.getElementById('home-screen');
      if (home) home.classList.remove('hidden');
    };
    document.getElementById('btn-undo').onclick = () => this.undo();
    document.getElementById('btn-redo').onclick = () => this.redo();
    document.getElementById('btn-save').onclick = () => this._savePng();
    document.getElementById('btn-zoom-fit').onclick = () => this.eng._fitToView();
    document.getElementById('btn-menu').onclick = (e) => {
      e.stopPropagation();
      this._toggleMenu();
    };
    // Menu items
    document.getElementById('menu-new').onclick = () => {
      this._closeMenu();
      if (confirm('Criar nova arte? As alterações não salvas serão perdidas.')) {
        document.getElementById('app').classList.add('hidden');
        const entry = document.getElementById('entry-screen');
        entry.classList.remove('hidden');
        entry.style.opacity = '1';
        entry.style.transform = '';
      }
    };
    document.getElementById('menu-open').onclick = () => {
      this._closeMenu();
      document.getElementById('open-image-input').click();
    };
    document.getElementById('menu-save-png').onclick = () => { this._closeMenu(); this._savePng(); };
    document.getElementById('menu-save-jpg').onclick = () => { this._closeMenu(); this._saveJpg(); };
    const btnMenuSaveLocal = document.getElementById('menu-save-local');
    if (btnMenuSaveLocal) btnMenuSaveLocal.onclick = () => { this._closeMenu(); this._saveArtworkToLocal(); };

    document.addEventListener('click', () => this._closeMenu());
    document.getElementById('app-menu').addEventListener('click', e => e.stopPropagation());
  }

  async _saveArtworkToLocal() {
    this.toast('Salvando na Galeria Local...');
    const thumbCanvas = this._buildFlatCanvas(true);
    const thumbURL = thumbCanvas.toDataURL('image/jpeg', 0.5);

    const layersData = this.eng.layers.map(l => {
      return {
        name: l.name,
        opacity: l.opacity,
        blendMode: l.blendMode,
        visible: l.visible,
        locked: l.locked,
        dataURL: l.canvas.toDataURL('image/png')
      };
    });

    const artwork = {
      id: this.currentArtworkId || 'art_' + Date.now(),
      name: 'Arte ' + new Date().toLocaleDateString(),
      width: this.eng.width,
      height: this.eng.height,
      activeLayerIdx: this.eng.activeLayerIdx,
      thumbURL,
      layers: layersData
    };

    try {
      if (window.artStorage) {
        await window.artStorage.saveArtwork(artwork);
        this.currentArtworkId = artwork.id;
        this.toast('Arte salva na Galeria Local!');
      }
    } catch (e) {
      console.error(e);
      this.toast('Erro ao salvar no IndexedDB');
    }
  }

  _toggleMenu() {
    const menu = document.getElementById('app-menu');
    this._menuOpen = !this._menuOpen;
    menu.classList.toggle('hidden', !this._menuOpen);
  }
  _closeMenu() {
    this._menuOpen = false;
    document.getElementById('app-menu').classList.add('hidden');
  }

  _updateCanvasInfo() {
    document.getElementById('canvas-info').textContent = `${this.eng.width} × ${this.eng.height}`;
  }

  undo() { const s = this.eng.undo.undo(); if (s) { this.eng.restoreSnapshot(s); this.refreshLayersPanel(); this.toast('Desfeito'); } }
  redo() { const s = this.eng.undo.redo(); if (s) { this.eng.restoreSnapshot(s); this.refreshLayersPanel(); this.toast('Refeito'); } }

  _buildFlatCanvas(withWhiteBg) {
    const tmp = document.createElement('canvas');
    tmp.width = this.eng.width; tmp.height = this.eng.height;
    const ctx = tmp.getContext('2d');
    if (withWhiteBg) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, tmp.width, tmp.height); }
    for (let i = this.eng.layers.length - 1; i >= 0; i--) {
      const l = this.eng.layers[i];
      if (!l.visible) continue;
      ctx.globalAlpha = l.opacity / 100;
      ctx.globalCompositeOperation = l.blendMode;
      ctx.drawImage(l.canvas, 0, 0);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    return tmp;
  }

  _downloadBlob(canvas, filename, mimeType, quality) {
    canvas.toBlob(blob => {
      if (!blob) { this.toast('Erro ao gerar arquivo'); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.download = filename;
      a.href = url;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }, mimeType, quality);
  }

  _savePng() {
    const tmp = this._buildFlatCanvas(false);
    this._downloadBlob(tmp, `artcraft_${Date.now()}.png`, 'image/png');
    this.toast('💾 PNG salvo!');
  }

  _saveJpg() {
    const tmp = this._buildFlatCanvas(true); // JPG needs white bg (no alpha)
    this._downloadBlob(tmp, `artcraft_${Date.now()}.jpg`, 'image/jpeg', 0.95);
    this.toast('💾 JPG salvo!');
  }

  // ═══════════════════════════════════════════════════════════ TOOL BUTTONS
  _initToolButtons() {
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.addEventListener('click', () => this.setTool(btn.dataset.tool));
    });
  }

  setTool(t) {
    const unimpl = {
      'magic-wand': 'Varinha Mágica', 'filter': 'Filtro', 'special': 'Especial',
      'frame': 'Moldura', 'canvas': 'Tela', 'transform': 'Transformar'
    };
    if (unimpl[t]) {
      this.toast(`${unimpl[t]} não disponível na versão web.`);
      return;
    }
    
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
    this.tm.setTool(t);
    
    if (t === 'eraser') {
      const idx = this.be.brushes.findIndex(b => b.eraser);
      if (idx >= 0) { this.be.activeBrushIdx = idx; this.refreshBrushLib(); }
    } else if (t === 'smudge') {
      const idx = this.be.brushes.findIndex(b => b.smear);
      if (idx >= 0) { this.be.activeBrushIdx = idx; this.refreshBrushLib(); }
    }
    
    const vp = document.getElementById('canvas-viewport');
    if (t === 'move') vp.style.cursor = 'grab';
    else if (t === 'eyedropper') vp.style.cursor = 'cell';
    else if (t === 'fill') vp.style.cursor = 'copy';
    else if (t === 'select') vp.style.cursor = 'default';
    else vp.style.cursor = 'crosshair';
  }

  // ═══════════════════════════════════════════════════════════ KEYBOARD
  _initKeyboard() {
    window.addEventListener('keydown', e => {
      if (!this.eng) return;
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); this.undo(); }
      if (e.ctrlKey && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); this.redo(); }
      if (e.ctrlKey && e.key === 's') { e.preventDefault(); this._savePng(); }
      const map = { b: 'brush', e: 'eraser', g: 'fill', i: 'eyedropper', m: 'select-rect', l: 'lasso', v: 'move', t: 'text', u: 'blur' };
      if (!e.ctrlKey && !e.altKey && map[e.key]) this.setTool(map[e.key]);
    });
  }

  // ═══════════════════════════════════════════════════════════ COLOR WHEEL
  _initColorWheel() {
    const c = document.getElementById('color-wheel');
    this._drawWheel(c);
    let dragging = false, dragPart = null;
    c.addEventListener('mousedown', e => {
      dragging = true;
      dragPart = this._getWheelPart(e, c);
      this._pickWheel(e, c, dragPart);
    });
    window.addEventListener('mousemove', e => { if (dragging) this._pickWheel(e, c, dragPart); });
    window.addEventListener('mouseup', () => { dragging = false; dragPart = null; });
    c.addEventListener('touchstart', e => {
      dragPart = this._getWheelPart(e.touches[0], c);
      this._pickWheel(e.touches[0], c, dragPart);
    }, { passive: true });
    c.addEventListener('touchmove', e => {
      this._pickWheel(e.touches[0], c, dragPart); e.preventDefault();
    }, { passive: false });
  }

  _drawWheel(c) {
    const ctx = c.getContext('2d'), cx = c.width / 2, cy = c.height / 2, R = cx - 2, r = R * 0.7;
    ctx.clearRect(0, 0, c.width, c.height);
    for (let a = 0; a < 360; a++) {
      const s = a * Math.PI / 180, en = (a + 1.5) * Math.PI / 180;
      const [rr, gg, bb] = hsvToRgb(a, 100, 100);
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, s, en); ctx.closePath();
      ctx.fillStyle = `rgb(${rr},${gg},${bb})`; ctx.fill();
    }
    // Ring mask (inner cutout)
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI);
    ctx.fillStyle = '#0f0f12'; ctx.fill();
    this._drawSVTriangle(ctx, cx, cy, r, this.be.color.h);
    this._drawTriangleHandle(ctx, cx, cy, r);
  }

  _drawSVTriangle(ctx, cx, cy, r, hue) {
    const R2 = r * 0.96;
    const angle = hue * Math.PI / 180;
    const t0 = { x: cx + R2 * Math.cos(angle - Math.PI / 2), y: cy + R2 * Math.sin(angle - Math.PI / 2) };
    const t1 = { x: cx + R2 * Math.cos(angle - Math.PI / 2 + 2 * Math.PI / 3), y: cy + R2 * Math.sin(angle - Math.PI / 2 + 2 * Math.PI / 3) };
    const t2 = { x: cx + R2 * Math.cos(angle - Math.PI / 2 + 4 * Math.PI / 3), y: cy + R2 * Math.sin(angle - Math.PI / 2 + 4 * Math.PI / 3) };
    this._triVertices = [t0, t1, t2];
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.97, 0, Math.PI * 2); ctx.clip();
    const [hr, hg, hb] = hsvToRgb(hue, 100, 100);
    // White → Hue gradient
    const g1 = ctx.createLinearGradient(t0.x, t0.y, (t1.x + t2.x) / 2, (t1.y + t2.y) / 2);
    g1.addColorStop(0, 'white'); g1.addColorStop(1, `rgb(${hr},${hg},${hb})`);
    ctx.beginPath(); ctx.moveTo(t0.x, t0.y); ctx.lineTo(t1.x, t1.y); ctx.lineTo(t2.x, t2.y); ctx.closePath();
    ctx.fillStyle = g1; ctx.fill();
    // Transparent → Black overlay
    const g2 = ctx.createLinearGradient((t0.x + t1.x) / 2, (t0.y + t1.y) / 2, t2.x, t2.y);
    g2.addColorStop(0, 'transparent'); g2.addColorStop(1, 'black');
    ctx.beginPath(); ctx.moveTo(t0.x, t0.y); ctx.lineTo(t1.x, t1.y); ctx.lineTo(t2.x, t2.y); ctx.closePath();
    ctx.fillStyle = g2; ctx.fill();
    ctx.restore();
  }

  _drawTriangleHandle(ctx, cx, cy, r) {
    const { h, s, v } = this.be.color;
    const hp = this._svToTriPos(cx, cy, r, h, s / 100, v / 100);
    ctx.beginPath(); ctx.arc(hp.x, hp.y, 6, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(hp.x, hp.y, 5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1; ctx.stroke();
    // Ring handle
    const R2 = (cx - 2) * 0.84, angle = h * Math.PI / 180;
    const rx = cx + R2 * Math.cos(angle - Math.PI / 2);
    const ry = cy + R2 * Math.sin(angle - Math.PI / 2);
    ctx.beginPath(); ctx.arc(rx, ry, 5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2; ctx.stroke();
  }

  _svToTriPos(cx, cy, r, hue, s, v) {
    const R2 = r * 0.96, angle = hue * Math.PI / 180;
    const t0 = { x: cx + R2 * Math.cos(angle - Math.PI / 2), y: cy + R2 * Math.sin(angle - Math.PI / 2) };
    const t1 = { x: cx + R2 * Math.cos(angle - Math.PI / 2 + 2 * Math.PI / 3), y: cy + R2 * Math.sin(angle - Math.PI / 2 + 2 * Math.PI / 3) };
    const t2 = { x: cx + R2 * Math.cos(angle - Math.PI / 2 + 4 * Math.PI / 3), y: cy + R2 * Math.sin(angle - Math.PI / 2 + 4 * Math.PI / 3) };
    const x = t0.x * (1 - s) * v + t1.x * s * v + t2.x * (1 - v);
    const y = t0.y * (1 - s) * v + t1.y * s * v + t2.y * (1 - v);
    return { x, y };
  }

  _getWheelPart(e, c) {
    const rect = c.getBoundingClientRect(), cx = c.width / 2, cy = c.height / 2;
    const x = e.clientX - rect.left - cx, y = e.clientY - rect.top - cy;
    const d = Math.sqrt(x * x + y * y), r = cx - 2;
    return d > r * 0.7 ? 'ring' : 'triangle';
  }

  _pickWheel(e, c, part) {
    const rect = c.getBoundingClientRect(), cx = c.width / 2, cy = c.height / 2;
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const dx = mx - cx, dy = my - cy;
    if (part === 'ring') {
      let h = Math.atan2(dy, dx) * 180 / Math.PI + 90;
      if (h < 0) h += 360; if (h >= 360) h -= 360;
      this.be.color.h = h;
    } else {
      const verts = this._triVertices; if (!verts) return;
      const [t0, t1, t2] = verts;
      const denom = (t1.y - t2.y) * (t0.x - t2.x) + (t2.x - t1.x) * (t0.y - t2.y);
      if (Math.abs(denom) < 1e-10) return;
      const l0 = ((t1.y - t2.y) * (mx - t2.x) + (t2.x - t1.x) * (my - t2.y)) / denom;
      const l1 = ((t2.y - t0.y) * (mx - t2.x) + (t0.x - t2.x) * (my - t2.y)) / denom;
      const l2 = 1 - l0 - l1;
      // t0=white(v high, s=0), t1=hue(s=1,v=1), t2=black(v=0)
      const s = clamp(l1, 0, 1) / (clamp(l0, 0, 1) + clamp(l1, 0, 1) || 1);
      const v = clamp(l0 + l1, 0, 1);
      this.be.color.s = s * 100;
      this.be.color.v = v * 100;
    }
    this._syncSliders();
    this._redrawWheel();
    this._updateColorPreview();
    this._syncQuickColors();
  }

  _redrawWheel() {
    const c = document.getElementById('color-wheel');
    this._drawWheel(c);
  }

  // ═══════════════════════════════════════════════════════════ COLOR SLIDERS
  _syncSliders() {
    const { h, s, v, a } = this.be.color;
    document.getElementById('sl-h').value = h; document.getElementById('val-h').textContent = Math.round(h);
    document.getElementById('sl-s').value = s; document.getElementById('val-s').textContent = Math.round(s);
    document.getElementById('sl-v').value = v; document.getElementById('val-v').textContent = Math.round(v);
    document.getElementById('sl-a').value = a; document.getElementById('val-a').textContent = Math.round(a);
    const [r, g, b] = hsvToRgb(h, s, v);
    document.getElementById('hex-input').value = rgbToHex(r, g, b).toUpperCase();
    this._updateColorPreview();
  }

  _initColorControls() {
    ['h', 's', 'v', 'a'].forEach(ch => {
      document.getElementById('sl-' + ch).addEventListener('input', e => {
        this.be.color[ch] = parseFloat(e.target.value);
        document.getElementById('val-' + ch).textContent = Math.round(this.be.color[ch]);
        this._redrawWheel(); this._updateColorPreview(); this._syncQuickColors();
      });
    });
    document.getElementById('hex-input').addEventListener('change', e => {
      const hex = e.target.value.replace('#', '');
      if (hex.length === 6) {
        const [r, g, b] = hexToRgb(hex);
        const [h, s, v] = rgbToHsv(r, g, b);
        this.be.color = { h, s, v, a: this.be.color.a };
        this._syncSliders(); this._redrawWheel(); this._syncQuickColors();
      }
    });
    document.getElementById('qc-fg').addEventListener('click', () => { });
    document.getElementById('qc-bg').addEventListener('click', () => {
      // swap BG to current
    });
    document.getElementById('btn-swap-colors').addEventListener('click', () => {
      const tmp = { ...this.be.color };
      this.be.color = { ...this._bgColor };
      this._bgColor = { ...tmp };
      this._syncSliders(); this._redrawWheel(); this._syncQuickColors();
    });
  }

  _updateColorPreview() {
    const { r, g, b, a } = this.be.getRgba();
    document.getElementById('color-preview').style.background = `rgba(${r},${g},${b},${a})`;
  }

  _syncQuickColors() {
    const { r, g, b, a } = this.be.getRgba();
    document.getElementById('qc-fg').style.background = `rgba(${r},${g},${b},${a})`;
    const [br, bg, bb] = hsvToRgb(this._bgColor.h, this._bgColor.s, this._bgColor.v);
    document.getElementById('qc-bg').style.background = `rgb(${br},${bg},${bb})`;
    this._applyColorToTextLayer();
  }

  _applyColorToTextLayer() {
    if (this.eng && this.eng.activeLayer && this.eng.activeLayer.isText) {
      if(this.eng.activeLayer.textData.color !== this.be.getColorStr()){
         this.eng.updateActiveTextLayer({ color: this.be.getColorStr() });
      }
    }
  }

  syncColorFromEngine() {
    this._syncSliders(); this._redrawWheel(); this._addRecentColor();
  }

  _addRecentColor() {
    const { h, s, v, a } = this.be.color;
    const key = `${Math.round(h)},${Math.round(s)},${Math.round(v)}`;
    if (!this._recentColors.some(c => c.key === key)) {
      this._recentColors.unshift({ h, s, v, a, key });
      if (this._recentColors.length > 15) this._recentColors.pop();
      this._renderRecentSwatches();
    }
  }

  _renderRecentSwatches() {
    const el = document.getElementById('recent-swatches'); el.innerHTML = '';
    this._recentColors.forEach(c => {
      const [r, g, b] = hsvToRgb(c.h, c.s, c.v);
      const sw = document.createElement('div'); sw.className = 'swatch';
      sw.style.background = `rgba(${r},${g},${b},${c.a / 100})`;
      sw.title = `#${rgbToHex(r, g, b)}`;
      sw.onclick = () => { this.be.color = { ...c }; this._syncSliders(); this._redrawWheel(); this._syncQuickColors(); };
      el.appendChild(sw);
    });
  }

  _initPalette() {
    const colors = [
      '#000000', '#1a1a1a', '#333333', '#666666', '#999999', '#cccccc', '#ffffff',
      '#e84393', '#f06292', '#c2185b', '#880e4f', '#ff1744', '#ff5252', '#ff6e40',
      '#ff9800', '#ffb300', '#ffd740', '#ffff00', '#cddc39', '#69f0ae',
      '#00e676', '#00bcd4', '#0091ea', '#2979ff', '#651fff', '#d500f9',
      '#795548', '#607d8b', '#37474f', '#bf360c',
    ];
    const el = document.getElementById('palette-swatches');
    colors.forEach(hex => {
      const sw = document.createElement('div'); sw.className = 'swatch';
      sw.style.background = hex; sw.title = hex;
      sw.onclick = () => {
        const [r, g, b] = hexToRgb(hex.replace('#', ''));
        const [h, s, v] = rgbToHsv(r, g, b);
        this.be.color = { h, s, v, a: this.be.color.a };
        this._syncSliders(); this._redrawWheel(); this._syncQuickColors();
        document.querySelectorAll('.swatch').forEach(s => s.classList.remove('selected'));
        sw.classList.add('selected');
      };
      el.appendChild(sw);
    });
  }

  // ═══════════════════════════════════════════════════════════ LAYERS PANEL
  _initLayersPanel() {
    document.getElementById('btn-add-layer').onclick = () => {
      this.eng.undo.push(this.eng.snapshot());
      this.eng.addLayer(); this.refreshLayersPanel(); this.toast('Camada adicionada');
    };
    document.getElementById('btn-dupe-layer').onclick = () => {
      this.eng.undo.push(this.eng.snapshot());
      this.eng.duplicateLayer(this.eng.activeLayerIdx); this.refreshLayersPanel();
      this.toast('Camada duplicada');
    };
    document.getElementById('btn-del-layer').onclick = () => {
      if (this.eng.layers.length <= 1) { this.toast('Mínimo 1 camada'); return; }
      this.eng.undo.push(this.eng.snapshot());
      this.eng.deleteLayer(this.eng.activeLayerIdx); this.refreshLayersPanel();
      this.toast('Camada excluída');
    };
    document.getElementById('btn-merge-down').onclick = () => {
      this.eng.undo.push(this.eng.snapshot());
      this.eng.mergeDown(this.eng.activeLayerIdx); this.refreshLayersPanel(); this.toast('Camadas mescladas');
    };
    document.getElementById('btn-flatten').onclick = () => {
      if (!confirm('Mesclar todas as camadas?')) return;
      this.eng.undo.push(this.eng.snapshot());
      while (this.eng.layers.length > 1) this.eng.mergeDown(0);
      this.refreshLayersPanel(); this.toast('Todas camadas mescladas');
    };
    
    document.getElementById('btn-import-layer').onclick = () => document.getElementById('import-layer-input').click();
    document.getElementById('import-layer-input').onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        this.eng.undo.push(this.eng.snapshot());
        const layer = this.eng.addLayer(file.name.substring(0, 10));
        const ctx = layer.canvas.getContext('2d');
        const wr = this.eng.width / img.width;
        const hr = this.eng.height / img.height;
        const ratio = Math.min(wr, hr, 1);
        const w = img.width * ratio;
        const h = img.height * ratio;
        const x = (this.eng.width - w) / 2;
        const y = (this.eng.height - h) / 2;
        ctx.drawImage(img, x, y, w, h);
        layer._thumbDirty = true;
        this.eng.markDirty();
        this.refreshLayersPanel();
        this.toast('Imagem importada para nova camada!');
        e.target.value = '';
        URL.revokeObjectURL(url);
      };
      img.src = url;
    };

    const blendModes = ['source-over', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion'];
    const blendLabels = ['Normal', 'Multiply', 'Screen', 'Overlay', 'Darken', 'Lighten', 'Color Dodge', 'Color Burn', 'Hard Light', 'Soft Light', 'Difference', 'Exclusion'];
    const sel = document.getElementById('blend-mode-select');
    blendModes.forEach((m, i) => {
      const o = document.createElement('option'); o.value = m; o.textContent = blendLabels[i]; sel.appendChild(o);
    });
    sel.onchange = () => { if (this.eng.activeLayer) { this.eng.activeLayer.blendMode = sel.value; this.eng.markDirty(); } };

    const opa = document.getElementById('layer-opacity');
    opa.oninput = () => {
      if (!this.eng.activeLayer) return;
      const v = parseInt(opa.value);
      this.eng.activeLayer.opacity = v;
      document.getElementById('layer-opacity-val').textContent = v + '%';
      this.eng.markDirty();
    };
  }

  refreshLayersPanel() {
    const list = document.getElementById('layer-list'); list.innerHTML = '';
    this.eng.layers.forEach((l, i) => {
      const div = document.createElement('div');
      div.className = 'layer-item' + (i === this.eng.activeLayerIdx ? ' active' : '');
      const img = document.createElement('img'); img.className = 'layer-thumb';
      img.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
      l._thumbEl = img; l._thumbDirty = true;

      const name = document.createElement('span'); name.className = 'layer-name'; name.textContent = l.name;
      name.ondblclick = () => {
        const newName = prompt('Renomear camada:', l.name);
        if (newName) { l.name = newName; name.textContent = newName; }
      };
      const vis = document.createElement('span'); vis.className = 'layer-vis';
      vis.textContent = l.visible ? '👁' : '🚫';
      vis.onclick = e => {
        e.stopPropagation(); l.visible = !l.visible;
        vis.textContent = l.visible ? '👁' : '🚫'; this.eng.markDirty();
      };
      const lock = document.createElement('span');
      lock.className = 'layer-lock' + (l.locked ? ' locked' : ''); lock.textContent = '🔒';
      lock.onclick = e => { e.stopPropagation(); l.locked = !l.locked; lock.classList.toggle('locked', l.locked); };

      div.append(img, name, vis, lock);
      div.onclick = () => {
        this.eng.activeLayerIdx = i;
        document.querySelectorAll('.layer-item').forEach((el, j) => el.classList.toggle('active', j === i));
        document.getElementById('blend-mode-select').value = l.blendMode;
        document.getElementById('layer-opacity').value = l.opacity;
        document.getElementById('layer-opacity-val').textContent = l.opacity + '%';
      };
      div.draggable = true;
      div.addEventListener('dragstart', e => e.dataTransfer.setData('text/plain', i));
      div.addEventListener('dragover', e => { e.preventDefault(); div.style.background = 'rgba(232,67,147,0.1)'; });
      div.addEventListener('dragleave', () => div.style.background = '');
      div.addEventListener('drop', e => {
        e.preventDefault(); div.style.background = '';
        const from = parseInt(e.dataTransfer.getData('text/plain'));
        if (from === i) return;
        const moved = this.eng.layers.splice(from, 1)[0];
        const toIdx = from < i ? i - 1 : i;
        this.eng.layers.splice(toIdx, 0, moved);
        this.eng.activeLayerIdx = toIdx;
        this.eng.markDirty(); this.refreshLayersPanel();
      });
      list.appendChild(div);
    });
    setTimeout(() => { this.eng._dirty = true; }, 60);
    const al = this.eng.activeLayer;
    if (al) {
      document.getElementById('blend-mode-select').value = al.blendMode;
      document.getElementById('layer-opacity').value = al.opacity;
      document.getElementById('layer-opacity-val').textContent = al.opacity + '%';
    }
  }

  // ═══════════════════════════════════════════════════════════ BRUSH LIBRARY
  _initBrushLib() {
    this.refreshBrushLib();
    document.getElementById('btn-import-brush').onclick = () => document.getElementById('ibp-file-input').click();
    document.getElementById('ibp-file-input').onchange = async e => {
      const file = e.target.files[0]; if (!file) return;
      try {
        const b = await this.be.importIbp(file);
        this.refreshBrushLib(); this.toast(`🖌 Pincel "${b.name}" importado!`);
      } catch (err) { this.toast('Erro: ' + err.message); }
      e.target.value = '';
    };
  }

  refreshBrushLib() {
    const list = document.getElementById('brush-list'); list.innerHTML = '';
    this.be.brushes.forEach((b, i) => {
      const div = document.createElement('div');
      div.className = 'brush-item' + (i === this.be.activeBrushIdx ? ' active' : '');
      const pv = document.createElement('canvas');
      pv.className = 'brush-preview-icon'; pv.width = 52; pv.height = 32;
      const pc = pv.getContext('2d'); pc.fillStyle = '#16161f'; pc.fillRect(0, 0, 52, 32);
      const [pr, pg, pb] = hsvToRgb(this.be.color.h, this.be.color.s, this.be.color.v);
      pc.strokeStyle = `rgba(${pr},${pg},${pb},${(b.opacity / 100) * (b.flow / 100)})`;
      pc.lineWidth = clamp(b.size * 0.3, 1, 12);
      pc.lineCap = 'round'; pc.lineJoin = 'round';
      pc.beginPath(); pc.moveTo(4, 22); pc.quadraticCurveTo(26, 4, 48, 22); pc.stroke();
      const info = document.createElement('div'); info.className = 'brush-info';
      const nm = document.createElement('div'); nm.className = 'brush-name'; nm.textContent = b.name;
      const ds = document.createElement('div'); ds.className = 'brush-desc'; ds.textContent = b.desc || '';
      info.append(nm, ds); div.append(pv, info);
      div.onclick = () => {
        this.be.activeBrushIdx = i;
        this.refreshBrushLib(); this._syncBrushSettings(); this.be.previewBrush();
        document.getElementById('current-brush-name').textContent = b.name;
        if (b.eraser) this.setTool('eraser');
        else if (this.tm.activeTool === 'eraser') this.setTool('brush');
      };
      list.appendChild(div);
    });
  }

  // ═══════════════════════════════════════════════════════════ BRUSH SETTINGS
  _initBrushSettings() {
    const map = [
      ['bs-size', 'uiSize', 'bv-size'], ['bs-opacity', 'uiOpacity', 'bv-opacity'],
      ['bs-flow', 'uiFlow', 'bv-flow'], ['bs-hardness', 'uiHardness', 'bv-hardness'],
      ['bs-spacing', 'uiSpacing', 'bv-spacing'], ['bs-scatter', 'uiScatter', 'bv-scatter'],
    ];
    map.forEach(([sid, prop, vid]) => {
      document.getElementById(sid).addEventListener('input', e => {
        const v = parseFloat(e.target.value);
        this.be[prop] = v;
        document.getElementById(vid).textContent = v;
        this.be.previewBrush();
      });
    });
  }

  _syncBrushSettings() {
    const b = this.be.brush;
    document.getElementById('bs-size').value = b.size; document.getElementById('bv-size').textContent = b.size;
    document.getElementById('bs-opacity').value = b.opacity; document.getElementById('bv-opacity').textContent = b.opacity;
    document.getElementById('bs-flow').value = b.flow; document.getElementById('bv-flow').textContent = b.flow;
    document.getElementById('bs-hardness').value = b.hardness; document.getElementById('bv-hardness').textContent = b.hardness;
    document.getElementById('bs-spacing').value = b.spacing; document.getElementById('bv-spacing').textContent = b.spacing;
    document.getElementById('bs-scatter').value = b.scatter; document.getElementById('bv-scatter').textContent = b.scatter;
    this.be.uiSize = null; this.be.uiOpacity = null; this.be.uiFlow = null;
    this.be.uiHardness = null; this.be.uiSpacing = null; this.be.uiScatter = null;
  }

  // ═══════════════════════════════════════════════════════════ MODALS
  _initModals() {
    document.getElementById('modal-text-ok').onclick = () => {
      const text = document.getElementById('text-input').value;
      const font = document.getElementById('text-font').value;
      const size = parseInt(document.getElementById('text-size').value);
      this.tm.commitText(text, font, size); this._closeModals();
    };
    document.querySelectorAll('.modal-close,.btn-cancel').forEach(btn =>
      btn.addEventListener('click', () => this._closeModals()));
    document.getElementById('modal-overlay').addEventListener('click', e => {
      if (e.target === e.currentTarget) this._closeModals();
    });
  }

  _closeModals() {
    document.getElementById('modal-overlay').classList.add('hidden');
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
  }

  // ═══════════════════════════════════════════════════════════ PANEL TABS
  _initPanelTabs() {
    document.querySelectorAll('.panel-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.panel-content').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('panel-' + tab.dataset.panel).classList.add('active');
      });
    });
  }

  // ═══════════════════════════════════════════════════════════ BLUR PATCH
  _patchBlurTool() {
    const ui = this;
    const origBegin = BrushEngine.prototype.beginStroke;
    const origMove = BrushEngine.prototype.moveStroke;
    BrushEngine.prototype.beginStroke = function (x, y, p) {
      if (ui.tm.activeTool === 'blur') {
        this._painting = true; this._lastX = x; this._lastY = y;
        const ctx = this.eng.activeLayer.canvas.getContext('2d');
        this._blurStamp(ctx, x, y, this.size); this.eng.markDirty(); return;
      }
      origBegin.call(this, x, y, p);
    };
    BrushEngine.prototype.moveStroke = function (x, y, p) {
      if (ui.tm.activeTool === 'blur') {
        const ctx = this.eng.activeLayer.canvas.getContext('2d');
        this._blurStamp(ctx, x, y, this.size);
        this._lastX = x; this._lastY = y; this.eng.markDirty(); return;
      }
      origMove.call(this, x, y, p);
    };
  }
}

// ═══════════════════════════════════════════════════════════════ INIT
window.addEventListener('DOMContentLoaded', () => {
  new UIController();
});
