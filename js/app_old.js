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

// ─── TABS ───
function switchTab(t) {
  ['compress','crop'].forEach(id => {
    document.getElementById('panel-'+id).classList.toggle('active', id===t);
  });
  document.querySelectorAll('.tab').forEach((b,i) => {
    b.classList.toggle('active', (i===0&&t==='compress')||(i===1&&t==='crop'));
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
  const outer = document.getElementById('canvasOuter');
  const maxW  = Math.min(outer.clientWidth || 860, 860);
  const maxH  = Math.min(500, window.innerHeight * 0.45);
  cscale = Math.min(maxW / cropImg.width, maxH / cropImg.height, 1);
  const cw = Math.round(cropImg.width  * cscale);
  const ch = Math.round(cropImg.height * cscale);
  const canvas = document.getElementById('cropCanvas');
  canvas.width  = cw;
  canvas.height = ch;
  outer.style.width  = cw + 'px';
  outer.style.height = ch + 'px';
  drawCrop();
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
  const ctx = canvas.getContext('2d');
  const CW = canvas.width, CH = canvas.height;
  ctx.clearRect(0, 0, CW, CH);
  ctx.drawImage(cropImg, 0, 0, CW, CH);

  const rx = cropRect.x * cscale;
  const ry = cropRect.y * cscale;
  const rw = cropRect.w * cscale;
  const rh = cropRect.h * cscale;

  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, 0, CW, ry);
  ctx.fillRect(0, ry+rh, CW, CH-ry-rh);
  ctx.fillRect(0, ry, rx, rh);
  ctx.fillRect(rx+rw, ry, CW-rx-rw, rh);

  ctx.strokeStyle = 'rgba(255,127,80,0.9)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(rx+0.5, ry+0.5, rw-1, rh-1);

  ctx.strokeStyle = 'rgba(255,127,80,0.25)';
  ctx.lineWidth = 0.5;
  for(let i=1;i<3;i++) {
    ctx.beginPath(); ctx.moveTo(rx+rw*i/3, ry); ctx.lineTo(rx+rw*i/3, ry+rh); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(rx, ry+rh*i/3); ctx.lineTo(rx+rw, ry+rh*i/3); ctx.stroke();
  }

  const hs = 9;
  ctx.fillStyle = 'white';
  [[rx,ry],[rx+rw,ry],[rx,ry+rh],[rx+rw,ry+rh]].forEach(([hx,hy]) => {
    ctx.fillRect(hx-hs/2, hy-hs/2, hs, hs);
  });
}

function updateCropInfo() {
  const g = gcd(cropRect.w, cropRect.h);
  const ratio = cropRect.w && cropRect.h ? ` · ${cropRect.w/g}:${cropRect.h/g}` : '';
  document.getElementById('cropSzInfo').textContent =
    `Размер кропа: ${cropRect.w}×${cropRect.h}px${ratio}`;
}

// ─── CANVAS MOUSE ───
const cropCanvas = document.getElementById('cropCanvas');

function getCanvasPos(e) {
  const r = cropCanvas.getBoundingClientRect();
  return {x: e.clientX - r.left, y: e.clientY - r.top};
}

cropCanvas.addEventListener('mousedown', e => {
  const {x:mx, y:my} = getCanvasPos(e);
  const rx = cropRect.x*cscale, ry = cropRect.y*cscale;
  const rw = cropRect.w*cscale, rh = cropRect.h*cscale;
  const HS = 14;
  const corners = [{x:rx,y:ry,c:'nw'},{x:rx+rw,y:ry,c:'ne'},{x:rx,y:ry+rh,c:'sw'},{x:rx+rw,y:ry+rh,c:'se'}];
  const hit = corners.find(c => Math.abs(mx-c.x)<HS && Math.abs(my-c.y)<HS);
  if(hit) { dragging=true; dragMode='corner-'+hit.c; }
  else if(mx>rx&&mx<rx+rw&&my>ry&&my<ry+rh) { dragging=true; dragMode='move'; }
  else { dragging=true; dragMode='new'; cropRect={x:Math.round(mx/cscale),y:Math.round(my/cscale),w:0,h:0}; }
  dragStart = {x:mx, y:my};
  imgRect0  = {...cropRect};
  e.preventDefault();
});

window.addEventListener('mousemove', e => {
  if(!dragging || !cropImg) return;
  const {x:mx, y:my} = getCanvasPos(e);
  const dx = Math.round((mx - dragStart.x) / cscale);
  const dy = Math.round((my - dragStart.y) / cscale);
  const IW = cropImg.width, IH = cropImg.height;

  if(dragMode === 'move') {
    let nx = imgRect0.x+dx, ny = imgRect0.y+dy;
    nx = Math.max(0, Math.min(IW - cropRect.w, nx));
    ny = Math.max(0, Math.min(IH - cropRect.h, ny));
    cropRect.x = nx; cropRect.y = ny;
  } else if(dragMode === 'new') {
    const sx = imgRect0.x, sy = imgRect0.y;
    let ex = Math.max(0, Math.min(IW, Math.round(mx/cscale)));
    let ey = Math.max(0, Math.min(IH, Math.round(my/cscale)));
    cropRect.x = Math.min(sx,ex); cropRect.y = Math.min(sy,ey);
    cropRect.w = Math.abs(ex-sx); cropRect.h = Math.abs(ey-sy);
    if(activeRatio.w && activeRatio.h && cropRect.w > 0) {
      const r = activeRatio.w / activeRatio.h;
      cropRect.h = Math.round(cropRect.w / r);
      if(cropRect.y + cropRect.h > IH) { cropRect.h = IH - cropRect.y; cropRect.w = Math.round(cropRect.h*r); }
    }
  } else {
    let {x,y,w,h} = imgRect0;
    const c = dragMode.split('-')[1];
    if(c==='nw'){x+=dx;y+=dy;w-=dx;h-=dy;}
    if(c==='ne'){w+=dx;y+=dy;h-=dy;}
    if(c==='sw'){x+=dx;w-=dx;h+=dy;}
    if(c==='se'){w+=dx;h+=dy;}
    if(activeRatio.w && activeRatio.h) { const r=activeRatio.w/activeRatio.h; h=Math.round(w/r); }
    if(w > 10 && h > 10) {
      cropRect.x = Math.max(0, Math.min(IW-w, x));
      cropRect.y = Math.max(0, Math.min(IH-h, y));
      cropRect.w = Math.min(w, IW-cropRect.x);
      cropRect.h = Math.min(h, IH-cropRect.y);
    }
  }
  drawCrop();
  updateCropInfo();
});

window.addEventListener('mouseup', () => { dragging = false; });

cropCanvas.addEventListener('touchstart', e => {
  const t = e.touches[0];
  cropCanvas.dispatchEvent(new MouseEvent('mousedown', {clientX:t.clientX, clientY:t.clientY}));
  e.preventDefault();
}, {passive:false});
window.addEventListener('touchmove', e => {
  const t = e.touches[0];
  window.dispatchEvent(new MouseEvent('mousemove', {clientX:t.clientX, clientY:t.clientY}));
}, {passive:false});
window.addEventListener('touchend', () => window.dispatchEvent(new MouseEvent('mouseup')));

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

window.addEventListener('resize', () => { if(cropImg) setupCropCanvas(); });
