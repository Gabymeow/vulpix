// ─── PRESETS ───
const PRESETS = [
  {l:'Свободно', w:0, h:0},
  {l:'1 : 1',    w:1,  h:1},
  {l:'4 : 3',    w:4,  h:3},
  {l:'3 : 2',    w:3,  h:2},
  {l:'16 : 9',   w:16, h:9},
  {l:'9 : 16',   w:9,  h:16},
  {l:'2 : 1',    w:2,  h:1},
  {l:'3 : 4',    w:3,  h:4},
  {l:'21 : 9',   w:21, h:9},
  {l:'A4',       w:210,h:297},
  {l:'Story',    w:9,  h:16},
  {l:'Banner',   w:3,  h:1},
];

// ─── STATE ───
let compFiles = [];
let cropImg = null, cropFileName = '';
let activeRatio = {w:0, h:0};
let cropRect = {x:0, y:0, w:0, h:0};
let dragging = false, dragMode = null;
let dragStart = {x:0, y:0}, imgRect0 = null;
let cscale = 1;

// ─── RESIZE TRACKING ───
let resizeTimeout;
let lastWidth = window.innerWidth;

// ─── CANVAS OPTIMIZATION ───
const setupCanvasContext = (ctx) => {
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return ctx;
};

// ─── TABS ───
function switchTab(t) {
  ['compress','crop','collage'].forEach(id => {
    document.getElementById('panel-'+id).classList.toggle('active', id===t);
  });
  const tabs = ['compress','crop','collage'];
  document.querySelectorAll('.tab').forEach((b,i) => {
    b.classList.toggle('active', tabs[i] === t);
  });
}

// ─── UTILS ───
function fmt(b) {
  if(b < 1024) return b + 'B';
  if(b < 1048576) return (b/1024).toFixed(1) + 'KB';
  return (b/1048576).toFixed(2) + 'MB';
}
function gcd(a, b) { return b ? gcd(b, a%b) : a; }

// ─── DRAG-AND-DROP ───
function setupDZ(id, handler) {
  const el = document.getElementById(id);
  el.addEventListener('dragover',  e => { e.preventDefault(); el.classList.add('drag'); });
  el.addEventListener('dragleave', () => el.classList.remove('drag'));
  el.addEventListener('drop', e => {
    e.preventDefault(); el.classList.remove('drag');
    handler(e.dataTransfer.files);
  });
}
setupDZ('compDZ', files => handleCompFiles(files));
setupDZ('cropDZ', files => handleCropFile(files[0]));

// ──────────────────────────────────────────
// COMPRESS
// ──────────────────────────────────────────
function handleCompFiles(files) {
  for(const f of files) {
    if(compFiles.find(x => x.name===f.name && x.size===f.size)) continue;
    compFiles.push(f);
  }
  renderCompList();
  const card = document.getElementById('compSettingsCard');
  card.classList.toggle('hidden', compFiles.length === 0);
}

function renderCompList() {
  const el = document.getElementById('compFileList');
  if(!compFiles.length) { el.innerHTML = ''; return; }
  el.innerHTML = compFiles.map((f,i) => {
    const url = URL.createObjectURL(f);
    return `<div class="file-item">
      <img class="file-thumb" src="${url}" onload="URL.revokeObjectURL(this.src)">
      <div class="file-info">
        <div class="file-name">${f.name}</div>
        <div class="file-meta">${fmt(f.size)}</div>
      </div>
      <button class="file-rm" onclick="removeComp(${i})">×</button>
    </div>`;
  }).join('');
}

function removeComp(i) {
  compFiles.splice(i, 1);
  renderCompList();
  document.getElementById('compSettingsCard').classList.toggle('hidden', !compFiles.length);
}

function clearComp() {
  compFiles = [];
  renderCompList();
  document.getElementById('compSettingsCard').classList.add('hidden');
  document.getElementById('compResults').innerHTML = '';
  window._compResults = null;
}

async function runCompress() {
  const btn = document.getElementById('compBtn');
  const pw  = document.getElementById('compProgWrap');
  const bar = document.getElementById('compProgBar');
  const lbl = document.getElementById('compProgLabel');
  const format  = document.getElementById('compFormat').value;
  const maxW    = parseInt(document.getElementById('compMaxW').value) || 0;
  const quality = parseInt(document.getElementById('compQuality').value) / 100;

  btn.disabled = true;
  pw.classList.remove('hidden');
  bar.style.width = '0%';

  const results = [];
  for(let i = 0; i < compFiles.length; i++) {
    lbl.textContent = `Обработка ${i+1} из ${compFiles.length}…`;
    bar.style.width = Math.round((i / compFiles.length) * 100) + '%';
    const r = await compressOne(compFiles[i], format, maxW, quality);
    results.push(r);
  }
  bar.style.width = '100%';
  lbl.textContent = 'Готово!';
  setTimeout(() => pw.classList.add('hidden'), 800);

  window._compResults = results;
  renderResults(results);
  btn.disabled = false;
}

function compressOne(file, format, maxW, quality) {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.width, h = img.height;
      if(maxW && w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
      const oc = document.getElementById('offscreen');
      oc.width = w; oc.height = h;
      const ctx = oc.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      const mime = format === 'jpeg' ? 'image/jpeg' : format === 'png' ? 'image/png' : 'image/webp';
      const q    = format === 'png' ? undefined : quality;
      oc.toBlob(blob => {
        const ext  = format === 'jpeg' ? 'jpg' : format;
        const name = file.name.replace(/\.[^.]+$/, '') + '.' + ext;
        resolve({name, blob, origSize: file.size, newSize: blob.size, w, h, url: URL.createObjectURL(blob)});
      }, mime, q);
    };
    img.src = url;
  });
}

function renderResults(results) {
  const el = document.getElementById('compResults');
  const totalOrig = results.reduce((s,r) => s+r.origSize, 0);
  const totalNew  = results.reduce((s,r) => s+r.newSize,  0);
  const totalSave = Math.round((1 - totalNew/totalOrig) * 100);

  el.innerHTML = `
    <div class="results-title">Результаты · ${results.length} файл${results.length>1?'ов':''} · сэкономлено ${totalSave}%</div>
    ${results.map(r => {
      const saving = Math.round((1 - r.newSize/r.origSize) * 100);
      const cls    = saving > 30 ? 'good' : 'meh';
      return `<div class="result-item">
        <div class="result-info">
          <div class="result-name">${r.name}</div>
          <div class="result-meta">${r.w}×${r.h}px · ${fmt(r.origSize)} → ${fmt(r.newSize)}</div>
        </div>
        ${saving > 0 ? `<span class="saving-badge ${cls}">−${saving}%</span>` : ''}
        <a href="${r.url}" download="${r.name}" class="btn sm" style="text-decoration:none;margin-left:4px">↓</a>
      </div>`;
    }).join('')}
    <div class="mt16 btn-row">
      <button class="btn primary" onclick="downloadAll()">Скачать все</button>
    </div>`;
}

function downloadAll() {
  if(!window._compResults) return;
  window._compResults.forEach((r, i) => setTimeout(() => {
    const a = document.createElement('a');
    a.href = r.url; a.download = r.name; a.click();
  }, i * 250));
}

// ──────────────────────────────────────────
// CROP
// ──────────────────────────────────────────
function handleCropFile(file) {
  if(!file) return;
  cropFileName = file.name.replace(/\.[^.]+$/, '');
  const url = URL.createObjectURL(file);
  cropImg = new Image();
  cropImg.onload = () => {
    URL.revokeObjectURL(url);
    document.getElementById('cropDZ').classList.add('hidden');
    document.getElementById('cropEditor').classList.remove('hidden');
    const g = gcd(cropImg.width, cropImg.height);
    document.getElementById('cropMeta').innerHTML = `
      <div class="crop-meta-item">Размер: <strong>${cropImg.width}×${cropImg.height}px</strong></div>
      <div class="crop-meta-item">Соотношение: <strong>${cropImg.width/g}:${cropImg.height/g}</strong></div>`;
    buildPresets();
    setupCropCanvas();
    setPreset(PRESETS[1]);
  };
  cropImg.src = url;
}

function buildPresets() {
  document.getElementById('presetGrid').innerHTML = PRESETS.map((p,i) =>
    `<button class="preset-btn" id="pb${i}" onclick="setPreset(PRESETS[${i}])">${p.l}</button>`
  ).join('');
  window.PRESETS = PRESETS;
}

function setupCropCanvas() {
  requestAnimationFrame(() => {
    const outer = document.getElementById('canvasOuter');
    const tabsWrap = document.querySelector('.tabs-wrap');
    
    // Используем фиксированные значения вместо viewport-зависимых
    const containerW = (tabsWrap ? tabsWrap.clientWidth : window.innerWidth) - 4;
    const maxW = Math.min(containerW, 900);
    
    // ФИКСИРОВАННАЯ высота на мобильных, адаптивная на десктопе
    const isMobile = window.innerWidth <= 768;
    const maxH = isMobile ? 500 : 650;
    
    cscale = Math.min(maxW / cropImg.width, maxH / cropImg.height, 1);
    const displayW = Math.round(cropImg.width  * cscale);
    const displayH = Math.round(cropImg.height * cscale);

    outer.style.width = displayW + 'px';
    outer.style.height = displayH + 'px';
    outer.innerHTML = '<canvas id="cropCanvas"></canvas>';
    
    const canvas = document.getElementById('cropCanvas');
    
    // Canvas в полном разрешении
    canvas.width = cropImg.width;
    canvas.height = cropImg.height;
    
    // Масштабируем через CSS
    canvas.style.width = displayW + 'px';
    canvas.style.height = displayH + 'px';
    canvas.style.display = 'block';

    drawCrop();
  });
}

function setPreset(p) {
  activeRatio = {w: p.w, h: p.h};
  PRESETS.forEach((_,i) => {
    const b = document.getElementById('pb'+i);
    if(b) b.classList.toggle('active', PRESETS[i] === p);
  });
  if(p.w && p.h) {
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
  if(w > 0 && h > 0) {
    activeRatio = {w, h};
    PRESETS.forEach((_,i) => { const b=document.getElementById('pb'+i); if(b) b.classList.remove('active'); });
  } else {
    activeRatio = {w:0, h:0};
  }
  fitCropToRatio();
}

function fitCropToRatio() {
  if(!cropImg) return;
  const IW = cropImg.width, IH = cropImg.height;
  if(activeRatio.w && activeRatio.h) {
    const r = activeRatio.w / activeRatio.h;
    let rw = IW, rh = Math.round(IW / r);
    if(rh > IH) { rh = IH; rw = Math.round(IH * r); }
    cropRect = {x: Math.round((IW-rw)/2), y: Math.round((IH-rh)/2), w: rw, h: rh};
  } else {
    cropRect = {x:0, y:0, w:IW, h:IH};
  }
  drawCrop();
  updateCropInfo();
}

function resetCrop() { fitCropToRatio(); }

function drawCrop() {
  const canvas = document.getElementById('cropCanvas');
  if (!canvas) return;
  const ctx = setupCanvasContext(canvas.getContext('2d', { alpha: false }));
  
  // Canvas в полном разрешении
  const CW = canvas.width;
  const CH = canvas.height;
  
  ctx.clearRect(0, 0, CW, CH);
  ctx.drawImage(cropImg, 0, 0, CW, CH);

  // Координаты рамки в полном разрешении
  const rx = cropRect.x;
  const ry = cropRect.y;
  const rw = cropRect.w;
  const rh = cropRect.h;

  // Затемнение вокруг рамки
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, 0, CW, ry);
  ctx.fillRect(0, ry+rh, CW, CH-ry-rh);
  ctx.fillRect(0, ry, rx, rh);
  ctx.fillRect(rx+rw, ry, CW-rx-rw, rh);

  // Рамка выделения
  ctx.strokeStyle = 'rgba(255,127,80,0.9)';
  ctx.lineWidth = 2 / cscale;
  ctx.strokeRect(rx+0.5, ry+0.5, rw-1, rh-1);

  // Сетка правила третей
  ctx.strokeStyle = 'rgba(255,127,80,0.25)';
  ctx.lineWidth = 1 / cscale;
  for(let i=1; i<3; i++) {
    ctx.beginPath(); 
    ctx.moveTo(rx+rw*i/3, ry); 
    ctx.lineTo(rx+rw*i/3, ry+rh); 
    ctx.stroke();
    ctx.beginPath(); 
    ctx.moveTo(rx, ry+rh*i/3); 
    ctx.lineTo(rx+rw, ry+rh*i/3); 
    ctx.stroke();
  }

  // Угловые маркеры
  const hs = 12 / cscale;
  ctx.fillStyle = 'white';
  [[rx,ry],[rx+rw,ry],[rx,ry+rh],[rx+rw,ry+rh]].forEach(([hx,hy]) => {
    ctx.fillRect(hx-hs/2, hy-hs/2, hs, hs);
  });
  
  // Форсируем перерисовку в Safari
  if (canvas.style) {
    canvas.style.transform = 'translateZ(0)';
  }
}

function updateCropInfo() {
  const g = gcd(cropRect.w, cropRect.h);
  const ratio = cropRect.w && cropRect.h ? ` · ${cropRect.w/g}:${cropRect.h/g}` : '';
  document.getElementById('cropSzInfo').textContent =
    `Размер кропа: ${cropRect.w}×${cropRect.h}px${ratio}`;
}

// ─── CANVAS MOUSE & TOUCH ───
const HS          = 18;
const EDGE        = 12;
const MOVE_MARGIN = 0.15;

function getCanvasPos(e) {
  const canvas = document.getElementById('cropCanvas');
  if (!canvas) return {x: 0, y: 0};
  const r = canvas.getBoundingClientRect();
  const cx = e.touches ? e.touches[0].clientX : e.clientX;
  const cy = e.touches ? e.touches[0].clientY : e.clientY;
  
  const displayX = cx - r.left;
  const displayY = cy - r.top;
  
  return {
    x: displayX / cscale,
    y: displayY / cscale
  };
}

function getHitMode(mx, my) {
  const rx = cropRect.x;
  const ry = cropRect.y;
  const rw = cropRect.w;
  const rh = cropRect.h;

  const hsHit = HS / cscale;
  const edgeHit = EDGE / cscale;

  const corners = [
    {x: rx,    y: ry,    c: 'nw'},
    {x: rx+rw, y: ry,    c: 'ne'},
    {x: rx,    y: ry+rh, c: 'sw'},
    {x: rx+rw, y: ry+rh, c: 'se'},
  ];
  const hitCorner = corners.find(c => Math.abs(mx - c.x) < hsHit && Math.abs(my - c.y) < hsHit);
  if (hitCorner) return 'corner-' + hitCorner.c;

  const insideX = mx > rx && mx < rx + rw;
  const insideY = my > ry && my < ry + rh;
  const inside  = insideX && insideY;

  const nearTop    = Math.abs(my - ry)      < edgeHit && insideX;
  const nearBottom = Math.abs(my - (ry+rh)) < edgeHit && insideX;
  const nearLeft   = Math.abs(mx - rx)      < edgeHit && insideY;
  const nearRight  = Math.abs(mx - (rx+rw)) < edgeHit && insideY;
  if (nearTop)    return 'edge-n';
  if (nearBottom) return 'edge-s';
  if (nearLeft)   return 'edge-w';
  if (nearRight)  return 'edge-e';

  if (inside) {
    const marginX = rw * MOVE_MARGIN;
    const marginY = rh * MOVE_MARGIN;
    const inCenter = mx > rx + marginX && mx < rx + rw - marginX &&
                     my > ry + marginY && my < ry + rh - marginY;
    if (inCenter) return 'move';
  }

  return 'new';
}

const CURSORS = {
  'corner-nw': 'nw-resize', 'corner-ne': 'ne-resize',
  'corner-sw': 'sw-resize', 'corner-se': 'se-resize',
  'edge-n': 'n-resize',  'edge-s': 's-resize',
  'edge-w': 'w-resize',  'edge-e': 'e-resize',
  'move': 'move', 'new': 'crosshair',
};

function constrainRect(x, y, w, h, IW, IH) {
  w = Math.max(20, Math.min(w, IW));
  h = Math.max(20, Math.min(h, IH));
  
  if (activeRatio.w && activeRatio.h) {
    const r = activeRatio.w / activeRatio.h;
    const currentRatio = w / h;
    
    if (Math.abs(currentRatio - r) > 0.01) {
      const maxWByH = Math.min(IW, h * r);
      const maxHByW = Math.min(IH, w / r);
      
      if (maxWByH <= IW && maxHByW <= IH) {
        if (Math.abs(w - maxWByH) < Math.abs(h - maxHByW)) {
          w = maxWByH;
          h = w / r;
        } else {
          h = maxHByW;
          w = h * r;
        }
      } else if (maxWByH <= IW) {
        w = maxWByH;
        h = w / r;
      } else {
        h = maxHByW;
        w = h * r;
      }
    }
  }
  
  w = Math.round(w);
  h = Math.round(h);
  
  x = Math.max(0, Math.min(IW - w, x));
  y = Math.max(0, Math.min(IH - h, y));
  
  return {x, y, w, h};
}

// MOUSE EVENTS
document.addEventListener('mousemove', e => {
  const canvas = document.getElementById('cropCanvas');
  if (!canvas || dragging) return;
  const rect = canvas.getBoundingClientRect();
  const isOver = e.clientX >= rect.left && e.clientX <= rect.right &&
                 e.clientY >= rect.top && e.clientY <= rect.bottom;
  if (!isOver) {
    canvas.style.cursor = 'crosshair';
    return;
  }
  const {x: mx, y: my} = getCanvasPos(e);
  const mode = getHitMode(mx, my);
  canvas.style.cursor = CURSORS[mode] || 'crosshair';
});

document.addEventListener('mousedown', e => {
  const canvas = document.getElementById('cropCanvas');
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const isOver = e.clientX >= rect.left && e.clientX <= rect.right &&
                 e.clientY >= rect.top && e.clientY <= rect.bottom;
  if (!isOver) return;
  
  const {x: mx, y: my} = getCanvasPos(e);
  const mode = getHitMode(mx, my);
  dragging  = true;
  dragMode  = mode;
  dragStart = {x: mx, y: my};
  if (mode === 'new') {
    cropRect = {x: Math.round(mx), y: Math.round(my), w: 0, h: 0};
  }
  imgRect0 = {...cropRect};
  e.preventDefault();
});

document.addEventListener('mousemove', e => {
  if (!dragging || !cropImg) return;
  const {x: mx, y: my} = getCanvasPos(e);
  const dx = Math.round(mx - dragStart.x);
  const dy = Math.round(my - dragStart.y);
  const IW = cropImg.width, IH = cropImg.height;

  if (dragMode === 'move') {
    let nx = imgRect0.x + dx;
    let ny = imgRect0.y + dy;
    const constrained = constrainRect(nx, ny, cropRect.w, cropRect.h, IW, IH);
    cropRect.x = constrained.x;
    cropRect.y = constrained.y;

  } else if (dragMode === 'new') {
    const sx = imgRect0.x, sy = imgRect0.y;
    let ex = Math.max(0, Math.min(IW, Math.round(mx)));
    let ey = Math.max(0, Math.min(IH, Math.round(my)));
    let x = Math.min(sx, ex);
    let y = Math.min(sy, ey);
    let w = Math.abs(ex - sx);
    let h = Math.abs(ey - sy);
    
    const constrained = constrainRect(x, y, w, h, IW, IH);
    cropRect.x = constrained.x;
    cropRect.y = constrained.y;
    cropRect.w = constrained.w;
    cropRect.h = constrained.h;

  } else if (dragMode.startsWith('corner-')) {
    let {x, y, w, h} = imgRect0;
    const c = dragMode.split('-')[1];
    
    if (c === 'se') {
      w = w + dx;
      h = h + dy;
    } else if (c === 'sw') {
      x = x + dx;
      w = w - dx;
      h = h + dy;
    } else if (c === 'ne') {
      w = w + dx;
      y = y + dy;
      h = h - dy;
    } else if (c === 'nw') {
      x = x + dx;
      w = w - dx;
      y = y + dy;
      h = h - dy;
    }
    
    const constrained = constrainRect(x, y, w, h, IW, IH);
    cropRect.x = constrained.x;
    cropRect.y = constrained.y;
    cropRect.w = constrained.w;
    cropRect.h = constrained.h;

  } else if (dragMode.startsWith('edge-')) {
    let {x, y, w, h} = imgRect0;
    const side = dragMode.split('-')[1];
    
    if (side === 's') {
      h = h + dy;
    } else if (side === 'n') {
      y = y + dy;
      h = h - dy;
    } else if (side === 'e') {
      w = w + dx;
    } else if (side === 'w') {
      x = x + dx;
      w = w - dx;
    }
    
    const constrained = constrainRect(x, y, w, h, IW, IH);
    cropRect.x = constrained.x;
    cropRect.y = constrained.y;
    cropRect.w = constrained.w;
    cropRect.h = constrained.h;
  }

  drawCrop();
  updateCropInfo();
});

document.addEventListener('mouseup', () => { dragging = false; dragMode = null; });

// TOUCH EVENTS
document.addEventListener('touchstart', e => {
  const canvas = document.getElementById('cropCanvas');
  if (!canvas || !e.touches.length) return;
  
  const rect = canvas.getBoundingClientRect();
  const t = e.touches[0];
  const isOver = t.clientX >= rect.left && t.clientX <= rect.right &&
                 t.clientY >= rect.top && t.clientY <= rect.bottom;
  if (!isOver) return;
  
  e.preventDefault();
  const {x: mx, y: my} = getCanvasPos(e);
  const mode = getHitMode(mx, my);
  dragging  = true;
  dragMode  = mode;
  dragStart = {x: mx, y: my};
  if (mode === 'new') {
    cropRect = {x: Math.round(mx), y: Math.round(my), w: 0, h: 0};
  }
  imgRect0 = {...cropRect};
}, {passive: false});

document.addEventListener('touchmove', e => {
  if (!dragging || !cropImg || !e.touches.length) return;
  e.preventDefault();
  
  const {x: mx, y: my} = getCanvasPos(e);
  const dx = Math.round(mx - dragStart.x);
  const dy = Math.round(my - dragStart.y);
  const IW = cropImg.width, IH = cropImg.height;

  if (dragMode === 'move') {
    let nx = imgRect0.x + dx;
    let ny = imgRect0.y + dy;
    const constrained = constrainRect(nx, ny, cropRect.w, cropRect.h, IW, IH);
    cropRect.x = constrained.x;
    cropRect.y = constrained.y;

  } else if (dragMode === 'new') {
    const sx = imgRect0.x, sy = imgRect0.y;
    let ex = Math.max(0, Math.min(IW, Math.round(mx)));
    let ey = Math.max(0, Math.min(IH, Math.round(my)));
    let x = Math.min(sx, ex);
    let y = Math.min(sy, ey);
    let w = Math.abs(ex - sx);
    let h = Math.abs(ey - sy);
    
    const constrained = constrainRect(x, y, w, h, IW, IH);
    cropRect.x = constrained.x;
    cropRect.y = constrained.y;
    cropRect.w = constrained.w;
    cropRect.h = constrained.h;

  } else if (dragMode.startsWith('corner-')) {
    let {x, y, w, h} = imgRect0;
    const c = dragMode.split('-')[1];
    
    if (c === 'se') {
      w = w + dx;
      h = h + dy;
    } else if (c === 'sw') {
      x = x + dx;
      w = w - dx;
      h = h + dy;
    } else if (c === 'ne') {
      w = w + dx;
      y = y + dy;
      h = h - dy;
    } else if (c === 'nw') {
      x = x + dx;
      w = w - dx;
      y = y + dy;
      h = h - dy;
    }
    
    const constrained = constrainRect(x, y, w, h, IW, IH);
    cropRect.x = constrained.x;
    cropRect.y = constrained.y;
    cropRect.w = constrained.w;
    cropRect.h = constrained.h;

  } else if (dragMode.startsWith('edge-')) {
    let {x, y, w, h} = imgRect0;
    const side = dragMode.split('-')[1];
    
    if (side === 's') {
      h = h + dy;
    } else if (side === 'n') {
      y = y + dy;
      h = h - dy;
    } else if (side === 'e') {
      w = w + dx;
    } else if (side === 'w') {
      x = x + dx;
      w = w - dx;
    }
    
    const constrained = constrainRect(x, y, w, h, IW, IH);
    cropRect.x = constrained.x;
    cropRect.y = constrained.y;
    cropRect.w = constrained.w;
    cropRect.h = constrained.h;
  }
  
  drawCrop();
  updateCropInfo();
}, {passive: false});

document.addEventListener('touchend', () => { dragging = false; dragMode = null; });

// ─── DOWNLOAD ───
function downloadCrop() {
  if(!cropImg || cropRect.w < 2 || cropRect.h < 2) return;
  const fmt2 = document.getElementById('cropFormat').value;
  const oc   = document.getElementById('offscreen');
  oc.width  = cropRect.w; oc.height = cropRect.h;
  oc.getContext('2d').drawImage(cropImg, cropRect.x, cropRect.y, cropRect.w, cropRect.h, 0, 0, cropRect.w, cropRect.h);
  const mime = fmt2==='jpeg' ? 'image/jpeg' : fmt2==='png' ? 'image/png' : 'image/webp';
  oc.toBlob(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = cropFileName + '_crop.' + (fmt2==='jpeg'?'jpg':fmt2);
    a.click();
  }, mime, 0.93);
}

// ─── RESIZE HANDLER (умный, без прыжков) ───
window.addEventListener('resize', () => {
  if (!cropImg) return;
  
  const currentWidth = window.innerWidth;
  
  // Пересчитываем ТОЛЬКО если изменилась ширина (игнорируем скрытие адресной строки)
  if (Math.abs(currentWidth - lastWidth) > 20) {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      lastWidth = currentWidth;
      setupCropCanvas();
    }, 200);
  }
});

// Также отслеживаем изменение ориентации
window.addEventListener('orientationchange', () => {
  if (!cropImg) return;
  setTimeout(() => {
    lastWidth = window.innerWidth;
    setupCropCanvas();
  }, 300);
});

// ══════════════════════════════════════════
// COLLAGE
// ══════════════════════════════════════════

const collageState = {
  A: null, // HTMLImageElement
  B: null,
  urlA: null, // blob URL для превью (чтобы не revoke раньше времени)
  urlB: null,
};

// ─── Drag-and-drop для слотов ───
['A','B'].forEach(slot => {
  const el = document.getElementById('slot' + slot);
  el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('drag'); });
  el.addEventListener('dragleave', () => el.classList.remove('drag'));
  el.addEventListener('drop', e => {
    e.preventDefault(); el.classList.remove('drag');
    const file = e.dataTransfer.files[0];
    if (file) handleCollageFile(slot, file);
  });

  // Крестик — вешаем через JS чтобы stopPropagation работал до всплытия к слоту
  const clearBtn = document.getElementById('slot' + slot + 'Clear');
  clearBtn.addEventListener('click', e => {
    e.stopPropagation();
    e.preventDefault();
    _clearSlot(slot);
  });
});

function handleCollageFile(slot, file) {
  if (!file || !file.type.startsWith('image/')) return;

  // Отзываем старый URL если был
  if (collageState['url' + slot]) {
    URL.revokeObjectURL(collageState['url' + slot]);
    collageState['url' + slot] = null;
  }

  // Создаём один URL — используем и для Image, и для превью <img>
  const url = URL.createObjectURL(file);
  collageState['url' + slot] = url;

  const img = new Image();
  img.onload = () => {
    collageState[slot] = img;

    const preview = document.getElementById('slot' + slot + 'Img');
    const empty   = document.getElementById('slot' + slot + 'Empty');
    const clear   = document.getElementById('slot' + slot + 'Clear');
    preview.src = url; // тот же URL — не revoke, он нужен превью
    preview.classList.remove('hidden');
    empty.classList.add('hidden');
    clear.classList.remove('hidden');

    if (collageState.A && collageState.B) {
      document.getElementById('collageSettings').classList.remove('hidden');
      renderCollage();
    }
  };
  img.src = url;
}

function _clearSlot(slot) {
  collageState[slot] = null;
  if (collageState['url' + slot]) {
    URL.revokeObjectURL(collageState['url' + slot]);
    collageState['url' + slot] = null;
  }
  const preview = document.getElementById('slot' + slot + 'Img');
  preview.src = '';
  preview.classList.add('hidden');
  document.getElementById('slot' + slot + 'Empty').classList.remove('hidden');
  document.getElementById('slot' + slot + 'Clear').classList.add('hidden');
  document.getElementById('collageInput' + slot).value = '';
  document.getElementById('collageSettings').classList.add('hidden');
}

function clearCollageSlot(e, slot) {
  // Оставляем для обратной совместимости с inline onclick если остался
  e.stopPropagation();
  e.preventDefault();
  _clearSlot(slot);
}

function clearCollage() {
  ['A','B'].forEach(slot => _clearSlot(slot));
  const canvas = document.getElementById('collageCanvas');
  canvas.width = 1;
  canvas.height = 1;
}

function setDividerColor(hex) {
  document.getElementById('dividerColor').value = hex;
  renderCollage();
}
function setLabelColor(hex) {
  document.getElementById('labelColor').value = hex;
  renderCollage();
}

function renderCollage() {
  const imgA = collageState.A;
  const imgB = collageState.B;
  if (!imgA || !imgB) return;

  const dir         = document.getElementById('collageDir').value;
  const divPx       = parseInt(document.getElementById('dividerSize').value) || 0;
  const divColor    = document.getElementById('dividerColor').value;
  const labelA      = document.getElementById('labelA').value;
  const labelB      = document.getElementById('labelB').value;
  const labelSizePx = parseInt(document.getElementById('labelSize').value) || 48;
  const labelColor  = document.getElementById('labelColor').value;
  const labelPos    = document.getElementById('labelPos').value;
  const labelShadow = document.getElementById('labelShadow').checked;

  // ─── Вычисляем размер холста ───
  // Оба изображения нормируем к одной высоте (горизонт) или ширине (вертикаль)
  let canvasW, canvasH;
  let drawAx, drawAy, drawAw, drawAh;
  let drawBx, drawBy, drawBw, drawBh;

  if (dir === 'horizontal') {
    const h    = Math.max(imgA.naturalHeight, imgB.naturalHeight);
    const scaleA = h / imgA.naturalHeight;
    const scaleB = h / imgB.naturalHeight;
    const wA = Math.round(imgA.naturalWidth  * scaleA);
    const wB = Math.round(imgB.naturalWidth  * scaleB);
    canvasW  = wA + divPx + wB;
    canvasH  = h;
    drawAx = 0;          drawAy = 0; drawAw = wA; drawAh = h;
    drawBx = wA + divPx; drawBy = 0; drawBw = wB; drawBh = h;
  } else {
    const w    = Math.max(imgA.naturalWidth, imgB.naturalWidth);
    const scaleA = w / imgA.naturalWidth;
    const scaleB = w / imgB.naturalWidth;
    const hA = Math.round(imgA.naturalHeight * scaleA);
    const hB = Math.round(imgB.naturalHeight * scaleB);
    canvasW  = w;
    canvasH  = hA + divPx + hB;
    drawAx = 0; drawAy = 0;          drawAw = w; drawAh = hA;
    drawBx = 0; drawBy = hA + divPx; drawBw = w; drawBh = hB;
  }

  const canvas = document.getElementById('collageCanvas');
  // Важно: не используем { alpha: false } — иначе сброс canvas.width даёт чёрный фон
  canvas.width  = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d');

  // Белый фон для JPEG (у которого нет прозрачности)
  const fmt = document.getElementById('collageFormat').value;
  if (fmt === 'jpeg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasW, canvasH);
  }

  // ─── Рисуем изображения ───
  ctx.drawImage(imgA, drawAx, drawAy, drawAw, drawAh);
  ctx.drawImage(imgB, drawBx, drawBy, drawBw, drawBh);

  // ─── Разделитель ───
  if (divPx > 0) {
    ctx.fillStyle = divColor;
    if (dir === 'horizontal') {
      ctx.fillRect(drawAw, 0, divPx, canvasH);
    } else {
      ctx.fillRect(0, drawAh, canvasW, divPx);
    }
  }

  // ─── Подписи ───
  const padding = Math.round(labelSizePx * 0.6);

  function drawLabel(text, region) {
    if (!text.trim()) return;
    const { x, y, w, h } = region;
    const fs = Math.min(labelSizePx, Math.round(w / 4));
    ctx.font = `700 ${fs}px "Roboto Flex", sans-serif`;

    let tx, ty;
    const [vPos, hPos] = labelPos.split('-');
    if (hPos === 'center') {
      tx = x + w / 2;
      ctx.textAlign = 'center';
    } else {
      tx = x + padding;
      ctx.textAlign = 'left';
    }
    if (vPos === 'bottom') {
      ty = y + h - padding;
      ctx.textBaseline = 'alphabetic';
    } else {
      ty = y + padding + fs;
      ctx.textBaseline = 'alphabetic';
    }

    if (labelShadow) {
      ctx.shadowColor   = 'rgba(0,0,0,0.7)';
      ctx.shadowBlur    = fs * 0.3;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = fs * 0.05;
    }
    ctx.fillStyle = labelColor;
    ctx.fillText(text, tx, ty);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur  = 0;
  }

  drawLabel(labelA, { x: drawAx, y: drawAy, w: drawAw, h: drawAh });
  drawLabel(labelB, { x: drawBx, y: drawBy, w: drawBw, h: drawBh });

  // ─── CSS-масштабирование для превью ───
  const wrap   = document.querySelector('.collage-preview-wrap');
  const maxW   = wrap ? wrap.clientWidth - 2 : 800;
  const scale  = Math.min(1, maxW / canvasW);
  canvas.style.width  = Math.round(canvasW * scale) + 'px';
  canvas.style.height = Math.round(canvasH * scale) + 'px';
}

function downloadCollage() {
  const canvas = document.getElementById('collageCanvas');
  if (!canvas.width) return;
  const fmt  = document.getElementById('collageFormat').value;
  const mime = fmt === 'jpeg' ? 'image/jpeg' : fmt === 'png' ? 'image/png' : 'image/webp';
  const q    = fmt === 'png' ? undefined : 0.93;
  canvas.toBlob(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'collage.' + (fmt === 'jpeg' ? 'jpg' : fmt);
    a.click();
  }, mime, q);
}
