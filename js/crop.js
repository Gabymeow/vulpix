'use strict';

// ─── PRESETS ───
const PRESETS = [
  { l: 'Свободно', w: 0,   h: 0   },
  { l: '1 : 1',    w: 1,   h: 1   },
  { l: '4 : 3',    w: 4,   h: 3   },
  { l: '3 : 2',    w: 3,   h: 2   },
  { l: '16 : 9',   w: 16,  h: 9   },
  { l: '9 : 16',   w: 9,   h: 16  },
  { l: '2 : 1',    w: 2,   h: 1   },
  { l: '3 : 4',    w: 3,   h: 4   },
  { l: '21 : 9',   w: 21,  h: 9   },
  { l: 'A4',       w: 210, h: 297 },
  { l: 'Story',    w: 9,   h: 16  },
  { l: 'Banner',   w: 3,   h: 1   },
];

// ─── STATE ───
let cropImg      = null;
let cropFileName = '';
let activeRatio  = { w: 0, h: 0 };
let cropRect     = { x: 0, y: 0, w: 0, h: 0 };
let cscale       = 1;

// drag state
let dragging  = false;
let dragMode  = null;
let dragStart = { x: 0, y: 0 };
let imgRect0  = null;

// resize debounce
let resizeTimeout = null;
let lastWidth = window.innerWidth;

// ─── INIT ───
setupDragDrop();

function setupDragDrop() {
  const dz = document.getElementById('cropDZ');
  if (!dz) return;
  dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
  dz.addEventListener('drop', e => {
    e.preventDefault();
    dz.classList.remove('drag');
    handleCropFile(e.dataTransfer.files[0]);
  });
}

// ─── FILE LOAD ───
function handleCropFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  cropFileName = file.name.replace(/\.[^.]+$/, '');
  const url = URL.createObjectURL(file);
  cropImg = new Image();
  cropImg.onload = () => {
    URL.revokeObjectURL(url);
    showEditor();
  };
  cropImg.src = url;
}

function loadNewFile() {
  document.getElementById('cropInput').click();
}

function showEditor() {
  document.getElementById('cropDZ').classList.add('hidden');
  document.getElementById('cropEditor').classList.remove('hidden');
  updateImgInfo();
  buildPresets();
  setupCanvas();
  setPreset(PRESETS[1]); // default 1:1
}

// ─── IMAGE INFO ───
function updateImgInfo() {
  const g = gcd(cropImg.width, cropImg.height);
  document.getElementById('imgInfo').innerHTML =
    `<strong>${cropImg.width}×${cropImg.height}</strong> px<br>
     Соотношение: <strong>${cropImg.width / g}:${cropImg.height / g}</strong>`;
}

// ─── PRESETS ───
function buildPresets() {
  document.getElementById('presetGrid').innerHTML = PRESETS.map((p, i) =>
    `<button class="preset-btn" id="pb${i}" onclick="setPreset(PRESETS[${i}])">${p.l}</button>`
  ).join('');
}

function setPreset(p) {
  activeRatio = { w: p.w, h: p.h };
  PRESETS.forEach((_, i) => {
    const b = document.getElementById('pb' + i);
    if (b) b.classList.toggle('active', PRESETS[i] === p);
  });
  if (p.w && p.h) {
    document.getElementById('ratioW').value = p.w;
    document.getElementById('ratioH').value = p.h;
  } else {
    document.getElementById('ratioW').value = '';
    document.getElementById('ratioH').value = '';
  }
  fitCropToRatio();
}

function applyCustomRatio() {
  const w = parseInt(document.getElementById('ratioW').value);
  const h = parseInt(document.getElementById('ratioH').value);
  if (w > 0 && h > 0) {
    activeRatio = { w, h };
    PRESETS.forEach((_, i) => {
      const b = document.getElementById('pb' + i);
      if (b) b.classList.remove('active');
    });
  } else {
    activeRatio = { w: 0, h: 0 };
  }
  fitCropToRatio();
}

function fitCropToRatio() {
  if (!cropImg) return;
  const IW = cropImg.width, IH = cropImg.height;
  if (activeRatio.w && activeRatio.h) {
    const r = activeRatio.w / activeRatio.h;
    let rw = IW, rh = Math.round(IW / r);
    if (rh > IH) { rh = IH; rw = Math.round(IH * r); }
    cropRect = { x: Math.round((IW - rw) / 2), y: Math.round((IH - rh) / 2), w: rw, h: rh };
  } else {
    cropRect = { x: 0, y: 0, w: IW, h: IH };
  }
  drawCrop();
  updateCropInfo();
}

function resetCrop() { fitCropToRatio(); }

// ─── CANVAS SETUP ───
function setupCanvas() {
  requestAnimationFrame(() => {
    const outer    = document.getElementById('canvasOuter');
    const area     = outer.parentElement;
    const maxW     = area.clientWidth || (window.innerWidth - (window.innerWidth <= 768 ? 32 : 308));
    const isMobile = window.innerWidth <= 768;
    const maxH     = isMobile ? Math.min(window.innerHeight * 0.55, 500) : 640;

    cscale = Math.min(maxW / cropImg.width, maxH / cropImg.height, 1);
    const dispW = Math.round(cropImg.width  * cscale);
    const dispH = Math.round(cropImg.height * cscale);

    outer.style.width  = dispW + 'px';
    outer.style.height = dispH + 'px';

    // Rebuild canvas inside outer
    outer.innerHTML = '<canvas id="cropCanvas"></canvas>';
    const canvas = document.getElementById('cropCanvas');

    // Canvas resolution = full image resolution for quality
    canvas.width  = cropImg.width;
    canvas.height = cropImg.height;

    // CSS scale down to fit
    canvas.style.width   = dispW + 'px';
    canvas.style.height  = dispH + 'px';
    canvas.style.display = 'block';
    canvas.style.touchAction = 'none';
    canvas.style.cursor  = 'crosshair';

    drawCrop();
  });
}

// ─── DRAW ───
function drawCrop() {
  const canvas = document.getElementById('cropCanvas');
  if (!canvas || !cropImg) return;

  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const CW = canvas.width;
  const CH = canvas.height;
  const { x: rx, y: ry, w: rw, h: rh } = cropRect;

  ctx.clearRect(0, 0, CW, CH);
  ctx.drawImage(cropImg, 0, 0, CW, CH);

  // Darken outside crop
  ctx.fillStyle = 'rgba(0,0,0,0.52)';
  ctx.fillRect(0,      0,      CW, ry);
  ctx.fillRect(0,      ry + rh, CW, CH - ry - rh);
  ctx.fillRect(0,      ry,      rx, rh);
  ctx.fillRect(rx + rw, ry,    CW - rx - rw, rh);

  // Selection border
  ctx.strokeStyle = 'rgba(255,127,80,0.9)';
  ctx.lineWidth   = 2 / cscale;
  ctx.strokeRect(rx + 0.5, ry + 0.5, rw - 1, rh - 1);

  // Rule of thirds
  ctx.strokeStyle = 'rgba(255,127,80,0.22)';
  ctx.lineWidth   = 1 / cscale;
  for (let i = 1; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(rx + rw * i / 3, ry);
    ctx.lineTo(rx + rw * i / 3, ry + rh);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(rx,      ry + rh * i / 3);
    ctx.lineTo(rx + rw, ry + rh * i / 3);
    ctx.stroke();
  }

  // Corner handles
  const hs = 12 / cscale;
  ctx.fillStyle = '#ffffff';
  [[rx, ry], [rx + rw, ry], [rx, ry + rh], [rx + rw, ry + rh]].forEach(([hx, hy]) => {
    ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
  });
}

function updateCropInfo() {
  if (!cropRect.w || !cropRect.h) {
    document.getElementById('cropSzInfo').textContent = '';
    return;
  }
  const g     = gcd(cropRect.w, cropRect.h);
  const ratio = `${cropRect.w / g}:${cropRect.h / g}`;
  document.getElementById('cropSzInfo').textContent =
    `${cropRect.w}×${cropRect.h}px · ${ratio}`;
}

// ─── INTERACTION ───
const HS          = 18; // corner handle hit area (display px)
const EDGE        = 12; // edge hit area
const MOVE_MARGIN = 0.15;

function getCanvasPos(e) {
  const canvas = document.getElementById('cropCanvas');
  if (!canvas) return { x: 0, y: 0 };
  const r  = canvas.getBoundingClientRect();
  const cx = e.touches ? e.touches[0].clientX : e.clientX;
  const cy = e.touches ? e.touches[0].clientY : e.clientY;
  return {
    x: (cx - r.left)  / cscale,
    y: (cy - r.top)   / cscale,
  };
}

function getHitMode(mx, my) {
  const { x: rx, y: ry, w: rw, h: rh } = cropRect;
  const hsHit   = HS   / cscale;
  const edgeHit = EDGE / cscale;

  // Corners
  const corners = [
    { x: rx,      y: ry,      c: 'nw' },
    { x: rx + rw, y: ry,      c: 'ne' },
    { x: rx,      y: ry + rh, c: 'sw' },
    { x: rx + rw, y: ry + rh, c: 'se' },
  ];
  const hit = corners.find(c => Math.abs(mx - c.x) < hsHit && Math.abs(my - c.y) < hsHit);
  if (hit) return 'corner-' + hit.c;

  const insX = mx > rx && mx < rx + rw;
  const insY = my > ry && my < ry + rh;

  if (Math.abs(my - ry)       < edgeHit && insX) return 'edge-n';
  if (Math.abs(my - (ry + rh)) < edgeHit && insX) return 'edge-s';
  if (Math.abs(mx - rx)       < edgeHit && insY) return 'edge-w';
  if (Math.abs(mx - (rx + rw)) < edgeHit && insY) return 'edge-e';

  if (insX && insY) {
    const mx2 = rw * MOVE_MARGIN, my2 = rh * MOVE_MARGIN;
    if (mx > rx + mx2 && mx < rx + rw - mx2 && my > ry + my2 && my < ry + rh - my2)
      return 'move';
  }
  return 'new';
}

const CURSORS = {
  'corner-nw': 'nw-resize', 'corner-ne': 'ne-resize',
  'corner-sw': 'sw-resize', 'corner-se': 'se-resize',
  'edge-n': 'n-resize', 'edge-s': 's-resize',
  'edge-w': 'w-resize', 'edge-e': 'e-resize',
  'move': 'move', 'new': 'crosshair',
};

function constrainRect(x, y, w, h, IW, IH) {
  w = Math.max(20, Math.min(w, IW));
  h = Math.max(20, Math.min(h, IH));

  if (activeRatio.w && activeRatio.h) {
    const r = activeRatio.w / activeRatio.h;
    if (Math.abs(w / h - r) > 0.01) {
      const byW = Math.min(IH, w / r);
      const byH = Math.min(IW, h * r);
      if (byH <= IW) { w = byH; h = w / r; }
      else            { h = byW; w = h * r; }
    }
  }

  w = Math.round(w); h = Math.round(h);
  x = Math.max(0, Math.min(IW - w, x));
  y = Math.max(0, Math.min(IH - h, y));
  return { x, y, w, h };
}

function applyDrag(mx, my) {
  const dx = Math.round(mx - dragStart.x);
  const dy = Math.round(my - dragStart.y);
  const IW = cropImg.width, IH = cropImg.height;
  let { x, y, w, h } = imgRect0;

  if (dragMode === 'move') {
    const c = constrainRect(x + dx, y + dy, w, h, IW, IH);
    cropRect.x = c.x; cropRect.y = c.y;

  } else if (dragMode === 'new') {
    const sx = imgRect0.x, sy = imgRect0.y;
    const ex = Math.max(0, Math.min(IW, Math.round(mx)));
    const ey = Math.max(0, Math.min(IH, Math.round(my)));
    const c  = constrainRect(Math.min(sx, ex), Math.min(sy, ey),
                              Math.abs(ex - sx), Math.abs(ey - sy), IW, IH);
    cropRect.x = c.x; cropRect.y = c.y; cropRect.w = c.w; cropRect.h = c.h;

  } else if (dragMode.startsWith('corner-')) {
    const corner = dragMode.split('-')[1];
    if      (corner === 'se') { w += dx; h += dy; }
    else if (corner === 'sw') { x += dx; w -= dx; h += dy; }
    else if (corner === 'ne') { w += dx; y += dy; h -= dy; }
    else if (corner === 'nw') { x += dx; w -= dx; y += dy; h -= dy; }
    const c = constrainRect(x, y, w, h, IW, IH);
    Object.assign(cropRect, c);

  } else if (dragMode.startsWith('edge-')) {
    const side = dragMode.split('-')[1];
    if      (side === 's') { h += dy; }
    else if (side === 'n') { y += dy; h -= dy; }
    else if (side === 'e') { w += dx; }
    else if (side === 'w') { x += dx; w -= dx; }
    const c = constrainRect(x, y, w, h, IW, IH);
    Object.assign(cropRect, c);
  }
}

// Mouse
document.addEventListener('mousemove', e => {
  const canvas = document.getElementById('cropCanvas');
  if (!canvas) return;
  const r = canvas.getBoundingClientRect();
  const over = e.clientX >= r.left && e.clientX <= r.right &&
               e.clientY >= r.top  && e.clientY <= r.bottom;

  if (!dragging) {
    canvas.style.cursor = over
      ? (CURSORS[getHitMode(...Object.values(getCanvasPos(e)))] || 'crosshair')
      : 'crosshair';
    return;
  }
  applyDrag(getCanvasPos(e).x, getCanvasPos(e).y);
  drawCrop(); updateCropInfo();
});

document.addEventListener('mousedown', e => {
  const canvas = document.getElementById('cropCanvas');
  if (!canvas) return;
  const r = canvas.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right ||
      e.clientY < r.top  || e.clientY > r.bottom) return;
  e.preventDefault();
  const pos = getCanvasPos(e);
  const mode = getHitMode(pos.x, pos.y);
  dragging  = true;
  dragMode  = mode;
  dragStart = pos;
  if (mode === 'new') cropRect = { x: Math.round(pos.x), y: Math.round(pos.y), w: 0, h: 0 };
  imgRect0 = { ...cropRect };
});

document.addEventListener('mouseup', () => { dragging = false; dragMode = null; });

// Touch
document.addEventListener('touchstart', e => {
  const canvas = document.getElementById('cropCanvas');
  if (!canvas || !e.touches.length) return;
  const r = canvas.getBoundingClientRect();
  const t = e.touches[0];
  if (t.clientX < r.left || t.clientX > r.right ||
      t.clientY < r.top  || t.clientY > r.bottom) return;
  e.preventDefault();
  const pos = getCanvasPos(e);
  const mode = getHitMode(pos.x, pos.y);
  dragging  = true;
  dragMode  = mode;
  dragStart = pos;
  if (mode === 'new') cropRect = { x: Math.round(pos.x), y: Math.round(pos.y), w: 0, h: 0 };
  imgRect0 = { ...cropRect };
}, { passive: false });

document.addEventListener('touchmove', e => {
  if (!dragging || !cropImg || !e.touches.length) return;
  e.preventDefault();
  const pos = getCanvasPos(e);
  applyDrag(pos.x, pos.y);
  drawCrop(); updateCropInfo();
}, { passive: false });

document.addEventListener('touchend', () => { dragging = false; dragMode = null; });

// ─── DOWNLOAD ───
function downloadCrop() {
  if (!cropImg || cropRect.w < 2 || cropRect.h < 2) return;
  const fmt  = document.getElementById('cropFormat').value;
  const oc   = document.getElementById('offscreen');
  oc.width   = cropRect.w;
  oc.height  = cropRect.h;
  const ctx  = oc.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cropImg, cropRect.x, cropRect.y, cropRect.w, cropRect.h,
                         0, 0, cropRect.w, cropRect.h);
  const mime = fmt === 'jpeg' ? 'image/jpeg' : fmt === 'png' ? 'image/png' : 'image/webp';
  const ext  = fmt === 'jpeg' ? 'jpg' : fmt;
  oc.toBlob(blob => {
    const a = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `${cropFileName}_crop.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, mime, 0.93);
}

// ─── RESIZE HANDLER ───
window.addEventListener('resize', () => {
  if (!cropImg) return;
  const w = window.innerWidth;
  if (Math.abs(w - lastWidth) > 20) {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => { lastWidth = w; setupCanvas(); }, 220);
  }
});

window.addEventListener('orientationchange', () => {
  if (!cropImg) return;
  setTimeout(() => { lastWidth = window.innerWidth; setupCanvas(); }, 350);
});

// ─── UTILS ───
function gcd(a, b) { return b ? gcd(b, a % b) : a; }
