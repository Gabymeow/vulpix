'use strict';

// ─── PRESETS ───
const PRESETS = [
  { l: 'Свободно', w: NaN, h: NaN },
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
let cropper      = null;
let cropFileName = '';

// ─── INIT ───
setupDragDrop();
buildPresets();

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
  
  const img = document.getElementById('cropperImg');

  // Уничтожаем предыдущий кроппер перед загрузкой новой картинки
  if (cropper) {
    cropper.destroy();
    cropper = null;
  }

  // Используем FileReader вместо URL.createObjectURL
  const reader = new FileReader();

  reader.onload = (e) => {
    // Картинка полностью прочитана в формате Base64
    img.onload = () => {
      // Запускаем ваш редактор интерфейса
      showEditor(img);
      
      // Инициализируем Cropper строго ПОСЛЕ того, как интерфейс показан
      // (Если new Cropper уже есть внутри showEditor, то эту строчку ниже писать НЕ НАДО)
      if (!cropper) {
         cropper = new Cropper(img, {
            aspectRatio: 1, // или NaN
            viewMode: 1,
            autoCropArea: 0.8
         });
      }
    };
    
    img.src = e.target.result; // Безопасная строка data:image/...
  };

  reader.readAsDataURL(file);
}

function loadNewFile() {
  document.getElementById('cropInput').click();
}

function showEditor(img) {
  document.getElementById('cropDZ').classList.add('hidden');
  document.getElementById('cropEditor').classList.remove('hidden');

  // Update image info
  updateImgInfo(img.naturalWidth, img.naturalHeight);

  // ДАЕМ БРАУЗЕРУ 50мс НА ОТРИСОВКУ ИНТЕРФЕЙСА
  setTimeout(() => {
    if (cropper) {
      cropper.destroy();
    }

    const isMobile = window.matchMedia('(pointer: coarse)').matches;
    cropper = new Cropper(img, {
      viewMode: 1,             
      dragMode: 'move',        
      aspectRatio: 1,          
      autoCropArea: 0.85,
      responsive: isMobile,
      restore: false,
      guides: true,
      center: true,
      highlight: true,
      cropBoxMovable: true,
      cropBoxResizable: true,
      toggleDragModeOnDblclick: true,
      crop(event) {
        const { width, height } = event.detail;
        updateCropInfo(Math.round(width), Math.round(height));
      },
    });

    // Activate 1:1 preset button by default
    setActivePresetBtn(1);
  }, 50); // 50 миллисекунд задержки полностью решают конфликт с display: none
}


// ─── IMAGE INFO ───
function updateImgInfo(w, h) {
  const g = gcd(w, h);
  document.getElementById('imgInfo').innerHTML =
    `<strong>${w}×${h}</strong> px<br>
     Соотношение: <strong>${w / g}:${h / g}</strong>`;
}

function updateCropInfo(w, h) {
  if (!w || !h) { document.getElementById('cropSzInfo').textContent = ''; return; }
  const g = gcd(w, h);
  document.getElementById('cropSzInfo').textContent = `${w}×${h}px · ${w/g}:${h/g}`;
}

// ─── PRESETS ───
function buildPresets() {
  document.getElementById('presetGrid').innerHTML = PRESETS.map((p, i) =>
    `<button class="preset-btn" id="pb${i}" onclick="setPreset(${i})">${p.l}</button>`
  ).join('');
}

function setPreset(i) {
  if (!cropper) return;
  const p = PRESETS[i];
  const ratio = (p.w && p.h) ? p.w / p.h : NaN;
  cropper.setAspectRatio(ratio);

  // Sync custom inputs
  if (p.w && p.h) {
    document.getElementById('ratioW').value = p.w;
    document.getElementById('ratioH').value = p.h;
  } else {
    document.getElementById('ratioW').value = '';
    document.getElementById('ratioH').value = '';
  }

  setActivePresetBtn(i);
}

function setActivePresetBtn(activeIdx) {
  PRESETS.forEach((_, i) => {
    const b = document.getElementById('pb' + i);
    if (b) b.classList.toggle('active', i === activeIdx);
  });
}

function applyCustomRatio() {
  const w = parseInt(document.getElementById('ratioW').value);
  const h = parseInt(document.getElementById('ratioH').value);
  if (!cropper) return;
  if (w > 0 && h > 0) {
    cropper.setAspectRatio(w / h);
    // Deactivate all preset buttons
    PRESETS.forEach((_, i) => {
      const b = document.getElementById('pb' + i);
      if (b) b.classList.remove('active');
    });
  } else {
    cropper.setAspectRatio(NaN);
  }
}

function resetCrop() {
  if (!cropper) return;
  cropper.reset();
}

// ─── DOWNLOAD ───
function downloadCrop() {
  if (!cropper) return;
  const fmt  = document.getElementById('cropFormat').value;
  const mime = fmt === 'jpeg' ? 'image/jpeg' : fmt === 'png' ? 'image/png' : 'image/webp';
  const ext  = fmt === 'jpeg' ? 'jpg' : fmt;

  const canvas = cropper.getCroppedCanvas({
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high',
  });

  canvas.toBlob(blob => {
    const a = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `${cropFileName}_crop.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, mime, 0.93);
}

// ─── UTILS ───
function gcd(a, b) { return b ? gcd(b, a % b) : a; }
