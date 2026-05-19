'use strict';

// ─── STATE ───
let compFiles = [];

// ─── INIT ───
setupDragDrop();

function setupDragDrop() {
  const dz = document.getElementById('compDZ');
  if (!dz) return;
  dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
  dz.addEventListener('drop', e => {
    e.preventDefault();
    dz.classList.remove('drag');
    handleCompFiles(e.dataTransfer.files);
  });
}

// ─── FILE HANDLING ───
function handleCompFiles(files) {
  for (const f of files) {
    if (!f.type.startsWith('image/')) continue;
    if (compFiles.find(x => x.name === f.name && x.size === f.size)) continue;
    compFiles.push(f);
  }
  renderFileList();
  document.getElementById('compSettingsCard').classList.toggle('hidden', compFiles.length === 0);
}

function renderFileList() {
  const el = document.getElementById('compFileList');
  if (!compFiles.length) { el.innerHTML = ''; return; }
  el.innerHTML = compFiles.map((f, i) => {
    const url = URL.createObjectURL(f);
    return `<div class="file-item">
      <img class="file-thumb" src="${url}" onload="URL.revokeObjectURL(this.src)" alt="">
      <div class="file-info">
        <div class="file-name">${escHtml(f.name)}</div>
        <div class="file-meta">${fmtBytes(f.size)}</div>
      </div>
      <button class="file-rm" onclick="removeFile(${i})" title="Удалить">×</button>
    </div>`;
  }).join('');
}

function removeFile(i) {
  compFiles.splice(i, 1);
  renderFileList();
  document.getElementById('compSettingsCard').classList.toggle('hidden', !compFiles.length);
}

function clearComp() {
  compFiles = [];
  renderFileList();
  document.getElementById('compSettingsCard').classList.add('hidden');
  document.getElementById('compResults').innerHTML = '';
  window._compResults = null;
}

// ─── COMPRESSION ───
async function runCompress() {
  if (!compFiles.length) return;

  const btn    = document.getElementById('compBtn');
  const pw     = document.getElementById('compProgWrap');
  const bar    = document.getElementById('compProgBar');
  const lbl    = document.getElementById('compProgLabel');
  const format  = document.getElementById('compFormat').value;
  const maxW    = parseInt(document.getElementById('compMaxW').value) || 0;
  const quality = parseInt(document.getElementById('compQuality').value) / 100;

  btn.disabled = true;
  pw.classList.remove('hidden');
  bar.style.width = '0%';

  const results = [];
  for (let i = 0; i < compFiles.length; i++) {
    lbl.textContent = `Обработка ${i + 1} из ${compFiles.length}…`;
    bar.style.width = Math.round((i / compFiles.length) * 100) + '%';
    const r = await compressOne(compFiles[i], format, maxW, quality);
    results.push(r);
  }

  bar.style.width = '100%';
  lbl.textContent = 'Готово!';
  setTimeout(() => pw.classList.add('hidden'), 900);

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
      if (maxW && w > maxW) { h = Math.round(h * maxW / w); w = maxW; }

      const oc  = document.getElementById('offscreen');
      oc.width  = w;
      oc.height = h;
      const ctx = oc.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);

      const mime = format === 'jpeg' ? 'image/jpeg' : format === 'png' ? 'image/png' : 'image/webp';
      const q    = format === 'png' ? undefined : quality;

      oc.toBlob(blob => {
        const ext  = format === 'jpeg' ? 'jpg' : format;
        const name = file.name.replace(/\.[^.]+$/, '') + '.' + ext;
        resolve({
          name,
          blob,
          origSize: file.size,
          newSize:  blob.size,
          w, h,
          url: URL.createObjectURL(blob),
        });
      }, mime, q);
    };
    img.src = url;
  });
}

// ─── RESULTS ───
function renderResults(results) {
  const el        = document.getElementById('compResults');
  const totalOrig = results.reduce((s, r) => s + r.origSize, 0);
  const totalNew  = results.reduce((s, r) => s + r.newSize,  0);
  const totalSave = Math.round((1 - totalNew / totalOrig) * 100);

  const count  = results.length;
  const plural = count === 1 ? 'файл' : count < 5 ? 'файла' : 'файлов';

  el.innerHTML = `
    <div class="results-section">
      <div class="results-header">
        <div class="results-title">Результаты · ${count} ${plural}</div>
        <div class="results-summary">−${totalSave}% в среднем</div>
      </div>

      ${results.map(r => {
        const saving = Math.round((1 - r.newSize / r.origSize) * 100);
        const cls    = saving > 30 ? 'good' : 'meh';
        return `<div class="result-item">
          <div class="result-info">
            <div class="result-name">${escHtml(r.name)}</div>
            <div class="result-meta">${r.w}×${r.h}px · ${fmtBytes(r.origSize)} → ${fmtBytes(r.newSize)}</div>
          </div>
          ${saving > 0 ? `<span class="saving-badge ${cls}">−${saving}%</span>` : ''}
          <a href="${r.url}" download="${escHtml(r.name)}" class="btn sm">↓</a>
        </div>`;
      }).join('')}

      <div class="actions-bar" style="margin-top:16px">
        <button class="btn primary" onclick="downloadAll()">Скачать все</button>
        <button class="btn ghost" onclick="clearComp()">Сбросить</button>
      </div>
    </div>`;
}

function downloadAll() {
  if (!window._compResults) return;
  window._compResults.forEach((r, i) => {
    setTimeout(() => {
      const a = document.createElement('a');
      a.href = r.url;
      a.download = r.name;
      a.click();
    }, i * 300);
  });
}

// ─── UTILS ───
function fmtBytes(b) {
  if (b < 1024)    return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(2) + ' MB';
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
