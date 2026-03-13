
// ====== TOAST ======
// In-app notification — replaces browser alert() calls
let toastTimer;
function showToast(msg, duration = 2000) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), duration);
}

// ====== STATE ======
// state.info    — inspection metadata (name, date, location, seller, etc.)
// state.checks  — per-item check status keyed by "sectionId_itemIndex"
// state.notes   — per-item text notes, same key format
// state.inputs  — per-item measurement/input values (e.g. tire pressure)
// state.summary — overall condition, recommended action, cost notes
let state = { info: {}, checks: {}, notes: {}, inputs: {}, summary: {} };

// Tracks the currently-loaded named save so auto-save updates it too
let currentSaveName = null;

// ====== RENDER ======
// Builds the checklist UI from the SECTIONS array. Each section is a collapsible
// card with a badge showing progress. Items render as tappable check rows.
function renderSections() {
  const container = document.getElementById('sectionsContainer');
  container.innerHTML = '';
  SECTIONS.forEach(section => {
    const div = document.createElement('div');
    div.className = 'section';
    div.id = 'section_' + section.id;

    const itemCount = section.items.length;
    div.innerHTML = `
      <div class="section-header" onclick="toggleSection('${section.id}')">
        <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0">
          <span>${section.icon}</span>
          <h2 style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${section.title}</h2>
          ${section.priority ? '<span class="priority-tag">HIGH PRIORITY</span>' : ''}
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="section-badge" id="badge_${section.id}">0/${itemCount}</span>
          <span class="section-chevron">▶</span>
        </div>
      </div>
      <div class="section-content" id="content_${section.id}">
        ${section.items.map((item, i) => renderItem(section.id, item, i)).join('')}
      </div>
    `;
    container.appendChild(div);
  });
  updateProgress();
}

function renderItem(sectionId, item, idx) {
  const key = `${sectionId}_${idx}`;
  const isObj = typeof item === 'object';
  const text = isObj ? item.text : item;
  const isCritical = isObj && item.critical;
  const hasInput = isObj && item.input;
  const inputLabel = isObj && item.inputLabel ? item.inputLabel : '';
  const checkState = state.checks[key] || 'unchecked';
  const noteVal = state.notes[key] || '';
  const inputVal = state.inputs[key] || '';

  let checkIcon = '';
  if (checkState === 'ok') checkIcon = '✓';
  else if (checkState === 'issue') checkIcon = '✗';
  else if (checkState === 'na') checkIcon = '—';

  let checkClass = '';
  if (checkState === 'ok') checkClass = 'checked';
  else if (checkState === 'issue') checkClass = 'issue';
  else if (checkState === 'na') checkClass = 'na';

  return `
    <div class="check-item ${isCritical && sectionId === 'red_flags' ? 'red-flag' : ''}">
      <div class="check-row">
        <div class="check-box ${checkClass}" onclick="cycleCheck('${key}')" id="box_${key}">${checkIcon}</div>
        <span class="check-label ${isCritical ? 'critical' : ''}" onclick="cycleCheck('${key}')">${text}</span>
      </div>
      ${hasInput ? `<input class="check-note visible" style="display:block" placeholder="${inputLabel}" value="${escHtml(inputVal)}" oninput="setInput('${key}',this.value)">` : ''}
      <div class="item-actions">
        <span class="note-toggle" onclick="toggleNote('${key}')">+ note</span>
        <span class="photo-toggle" onclick="capturePhoto('${key}')">📷 photo</span>
      </div>
      <div class="photo-thumbs" id="photos_${key}"></div>
      <textarea class="check-note ${noteVal ? 'visible' : ''}" id="note_${key}" placeholder="Add note..." oninput="setNote('${key}',this.value)">${escHtml(noteVal)}</textarea>
    </div>
  `;
}

function escHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ====== INTERACTIONS ======
// Tap cycle: unchecked → ok (✓) → issue (✗) → na (—) → unchecked.
// Notes and measurement inputs are per-item, keyed by "sectionId_itemIndex".
function toggleSection(id) {
  document.getElementById('section_' + id).classList.toggle('open');
}

function cycleCheck(key) {
  const states = ['unchecked', 'ok', 'issue', 'na'];
  const cur = state.checks[key] || 'unchecked';
  const next = states[(states.indexOf(cur) + 1) % states.length];
  state.checks[key] = next;

  const box = document.getElementById('box_' + key);
  box.className = 'check-box';
  box.textContent = '';
  if (next === 'ok') { box.classList.add('checked'); box.textContent = '✓'; }
  else if (next === 'issue') { box.classList.add('issue'); box.textContent = '✗'; }
  else if (next === 'na') { box.classList.add('na'); box.textContent = '—'; }

  updateBadge(key.split('_').slice(0, -1).join('_'));
  updateProgress();
  autoSave();
}

function toggleNote(key) {
  const el = document.getElementById('note_' + key);
  el.classList.toggle('visible');
  if (el.classList.contains('visible')) el.focus();
}

function setNote(key, val) { state.notes[key] = val; autoSave(); }
function setInput(key, val) { state.inputs[key] = val; autoSave(); }

// ====== PHOTOS (IndexedDB) ======
// Photos are stored in IndexedDB (not localStorage) because images are too large.
// Each photo is resized to max 1200px and compressed to JPEG before storing.
// DB schema: object store "photos", key = "itemKey_index", value = dataUrl string
const PHOTO_DB_NAME = 'rv_inspect_photos';
const PHOTO_DB_VERSION = 1;
let photoDB = null;
let pendingPhotoKey = null;
let lightboxKey = null;
let lightboxIdx = null;

function openPhotoDB() {
  return new Promise((resolve, reject) => {
    if (photoDB) { resolve(photoDB); return; }
    const req = indexedDB.open(PHOTO_DB_NAME, PHOTO_DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('photos')) {
        db.createObjectStore('photos');
      }
    };
    req.onsuccess = e => { photoDB = e.target.result; resolve(photoDB); };
    req.onerror = () => reject(req.error);
  });
}

function resizeImage(file, maxDim = 800, quality = 0.6) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const c = document.createElement('canvas');
      c.width = width; c.height = height;
      c.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
    img.src = url;
  });
}

function capturePhoto(key) {
  pendingPhotoKey = key;
  document.getElementById('photoInput').click();
}

document.getElementById('photoInput').addEventListener('change', async function() {
  if (!this.files.length || !pendingPhotoKey) return;
  try {
    const dataUrl = await resizeImage(this.files[0]);
    const db = await openPhotoDB();
    const photos = await getPhotosForKey(pendingPhotoKey);
    const idx = photos.length;
    const tx = db.transaction('photos', 'readwrite');
    tx.objectStore('photos').put(dataUrl, `${pendingPhotoKey}_${idx}`);
    tx.oncomplete = () => {
      renderThumbs(pendingPhotoKey);
      pushPhotoToCloud(pendingPhotoKey, idx, dataUrl);
    };
  } catch (e) { console.error('Photo capture error:', e); }
  this.value = '';
});

async function getPhotosForKey(key) {
  const db = await openPhotoDB();
  return new Promise(resolve => {
    const results = [];
    const tx = db.transaction('photos', 'readonly');
    const store = tx.objectStore('photos');
    const range = IDBKeyRange.bound(key + '_', key + '_\uffff');
    const req = store.openCursor(range);
    req.onsuccess = e => {
      const cursor = e.target.result;
      if (cursor) {
        const idx = parseInt(cursor.key.split('_').pop());
        results.push({ idx, dataUrl: cursor.value, dbKey: cursor.key });
        cursor.continue();
      } else {
        resolve(results.sort((a, b) => a.idx - b.idx));
      }
    };
    req.onerror = () => resolve([]);
  });
}

async function renderThumbs(key) {
  const el = document.getElementById('photos_' + key);
  if (!el) return;
  const photos = await getPhotosForKey(key);
  if (photos.length === 0) { el.innerHTML = ''; return; }
  el.innerHTML = photos.map(p =>
    `<img class="photo-thumb" src="${p.dataUrl}" onclick="openLightbox('${key}',${p.idx})">`
  ).join('');
}

function openLightbox(key, idx) {
  lightboxKey = key;
  lightboxIdx = idx;
  getPhotosForKey(key).then(photos => {
    const photo = photos.find(p => p.idx === idx);
    if (!photo) return;
    document.getElementById('lightboxImg').src = photo.dataUrl;
    document.getElementById('lightbox').classList.add('show');
  });
}

function closeLightbox(e) {
  if (e && e.target !== e.currentTarget && !e.target.classList.contains('lightbox-close')) return;
  document.getElementById('lightbox').classList.remove('show');
  lightboxKey = null; lightboxIdx = null;
}

async function deleteLightboxPhoto() {
  if (lightboxKey === null || lightboxIdx === null) return;
  if (!confirm('Delete this photo?')) return;
  const db = await openPhotoDB();
  const tx = db.transaction('photos', 'readwrite');
  tx.objectStore('photos').delete(`${lightboxKey}_${lightboxIdx}`);
  const delKey = lightboxKey, delIdx = lightboxIdx;
  tx.oncomplete = () => {
    renderThumbs(delKey);
    deletePhotoFromCloud(delKey, delIdx);
    closeLightbox();
  };
}

// Load all thumbnails after sections are rendered
async function loadAllThumbs() {
  const db = await openPhotoDB();
  const tx = db.transaction('photos', 'readonly');
  const keys = new Set();
  const req = tx.objectStore('photos').openCursor();
  req.onsuccess = e => {
    const cursor = e.target.result;
    if (cursor) {
      // Extract the item key (everything except the last _N index)
      const parts = cursor.key.split('_');
      parts.pop();
      keys.add(parts.join('_'));
      cursor.continue();
    } else {
      keys.forEach(k => renderThumbs(k));
    }
  };
}

// ====== PHOTO CLOUD SYNC (Supabase Storage) ======
// Photos are uploaded to a Supabase Storage bucket named "inspection-photos".
// Path convention: {user_id}/{inspection_name}/{item_key}_{photo_index}.jpg
// IndexedDB remains the local cache; cloud sync happens in the background.
// Data URLs are converted to Blobs for upload and back for download.

function photoStoragePath(itemKey, idx) {
  const inspectionName = encodeURIComponent(currentSaveName || '__autosave__');
  return `${currentUser.id}/${inspectionName}/${itemKey}_${idx}.jpg`;
}

function dataUrlToBlob(dataUrl) {
  const [header, b64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)[1];
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

async function pushPhotoToCloud(itemKey, idx, dataUrl) {
  if (!supabaseClient || !currentUser) return;
  try {
    const path = photoStoragePath(itemKey, idx);
    const blob = dataUrlToBlob(dataUrl);
    const { error } = await supabaseClient.storage
      .from('inspection-photos')
      .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
    if (error) throw error;
  } catch (e) { console.error('Photo upload error:', e); }
}

async function deletePhotoFromCloud(itemKey, idx) {
  if (!supabaseClient || !currentUser) return;
  try {
    const path = photoStoragePath(itemKey, idx);
    await supabaseClient.storage.from('inspection-photos').remove([path]);
  } catch (e) { console.error('Photo cloud delete error:', e); }
}

async function pullPhotosFromCloud() {
  if (!supabaseClient || !currentUser) return;
  const inspectionName = encodeURIComponent(currentSaveName || '__autosave__');
  const folder = `${currentUser.id}/${inspectionName}`;
  try {
    const { data: files, error } = await supabaseClient.storage
      .from('inspection-photos').list(folder);
    if (error) throw error;
    if (!files || files.length === 0) return;

    const db = await openPhotoDB();
    const keysToRender = new Set();
    for (const file of files) {
      // Parse filename: {item_key}_{photo_index}.jpg
      const name = file.name.replace(/\.jpg$/, '');
      const parts = name.split('_');
      const idx = parseInt(parts.pop());
      const itemKey = parts.join('_');
      const dbKey = `${itemKey}_${idx}`;

      // Skip if already cached locally
      const existing = await new Promise(r => {
        const tx = db.transaction('photos', 'readonly');
        const req = tx.objectStore('photos').get(dbKey);
        req.onsuccess = () => r(req.result);
        req.onerror = () => r(null);
      });
      if (existing) continue;

      // Download and cache
      const { data: blob, error: dlErr } = await supabaseClient.storage
        .from('inspection-photos').download(`${folder}/${file.name}`);
      if (dlErr || !blob) continue;
      const dataUrl = await new Promise(r => {
        const reader = new FileReader();
        reader.onload = () => r(reader.result);
        reader.readAsDataURL(blob);
      });
      const tx = db.transaction('photos', 'readwrite');
      tx.objectStore('photos').put(dataUrl, dbKey);
      keysToRender.add(itemKey);
    }
    keysToRender.forEach(k => renderThumbs(k));
  } catch (e) { console.error('Photo cloud pull error:', e); }
}

async function pushAllPhotosToCloud() {
  if (!supabaseClient || !currentUser) return;
  const db = await openPhotoDB();
  const tx = db.transaction('photos', 'readonly');
  const req = tx.objectStore('photos').openCursor();
  req.onsuccess = e => {
    const cursor = e.target.result;
    if (cursor) {
      const parts = cursor.key.split('_');
      const idx = parseInt(parts.pop());
      const itemKey = parts.join('_');
      pushPhotoToCloud(itemKey, idx, cursor.value);
      cursor.continue();
    }
  };
}

// ====== VIN BARCODE SCANNER ======
// Uses the BarcodeDetector API to read VIN barcodes (Code 39 / Code 128) from
// the device camera. On browsers without native support (iOS Safari/Chrome),
// a WASM-based polyfill is loaded on demand from CDN (~200KB, cached by SW).
let scannerStream = null;
let scannerAnimFrame = null;

async function ensureBarcodeDetector() {
  if ('BarcodeDetector' in window) return true;
  const status = document.getElementById('scannerStatus');
  if (status) status.textContent = 'Loading barcode scanner...';
  try {
    await import('https://cdn.jsdelivr.net/npm/barcode-detector@2/dist/es/polyfill.min.js');
    return 'BarcodeDetector' in window;
  } catch (e) {
    return false;
  }
}

async function startVinScan() {
  const overlay = document.getElementById('scannerOverlay');
  const video = document.getElementById('scannerVideo');
  const status = document.getElementById('scannerStatus');
  overlay.classList.add('show');
  status.textContent = 'Loading scanner...';

  if (!(await ensureBarcodeDetector())) {
    status.textContent = 'Barcode scanning not available. Please enter VIN manually.';
    setTimeout(() => stopVinScan(), 2000);
    return;
  }

  try {
    scannerStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    video.srcObject = scannerStream;
    await video.play();
    status.textContent = 'Point camera at VIN barcode...';

    const detector = new BarcodeDetector({ formats: ['code_39', 'code_128'] });
    const scan = async () => {
      if (!scannerStream) return;
      try {
        const barcodes = await detector.detect(video);
        if (barcodes.length > 0) {
          const vin = barcodes[0].rawValue.trim().toUpperCase();
          if (vin.length >= 11) {
            // VIN found — fill the field
            const vinInput = document.querySelector('[data-info="vin"]');
            vinInput.value = vin;
            state.info.vin = vin;
            autoSave();
            stopVinScan();
            return;
          }
        }
      } catch (e) {}
      scannerAnimFrame = requestAnimationFrame(scan);
    };
    scannerAnimFrame = requestAnimationFrame(scan);
  } catch (e) {
    status.textContent = 'Camera access denied. Please enter VIN manually.';
    setTimeout(() => stopVinScan(), 2000);
  }
}

function stopVinScan() {
  if (scannerAnimFrame) cancelAnimationFrame(scannerAnimFrame);
  scannerAnimFrame = null;
  if (scannerStream) {
    scannerStream.getTracks().forEach(t => t.stop());
    scannerStream = null;
  }
  document.getElementById('scannerVideo').srcObject = null;
  document.getElementById('scannerOverlay').classList.remove('show');
}

function updateBadge(sectionId) {
  const section = SECTIONS.find(s => s.id === sectionId);
  if (!section) return;
  const total = section.items.length;
  let done = 0, issues = 0;
  section.items.forEach((_, i) => {
    const s = state.checks[`${sectionId}_${i}`];
    if (s && s !== 'unchecked') done++;
    if (s === 'issue') issues++;
  });
  const badge = document.getElementById('badge_' + sectionId);
  badge.textContent = `${done}/${total}`;
  badge.className = 'section-badge';
  if (done === total && issues === 0) badge.classList.add('complete');
  else if (issues > 0) badge.classList.add('has-issues');
}

function updateProgress() {
  let total = 0, done = 0;
  SECTIONS.forEach(s => {
    s.items.forEach((_, i) => {
      total++;
      const st = state.checks[`${s.id}_${i}`];
      if (st && st !== 'unchecked') done++;
    });
  });
  const pct = total ? (done / total * 100) : 0;
  document.getElementById('progressFill').style.width = pct + '%';
  const saveLabel = currentSaveName ? ` — ${currentSaveName}` : '';
  document.getElementById('progressText').textContent = `${done} / ${total} (${Math.round(pct)}%)${saveLabel}`;
}

// ====== INFO FIELDS ======
// Bind each data-info input to state.info and auto-save on change.
// The "name" field also updates the app header title dynamically.
document.querySelectorAll('[data-info]').forEach(el => {
  el.addEventListener('input', () => {
    state.info[el.dataset.info] = el.value;
    if (el.dataset.info === 'name') {
      updateAppTitle();
      handleNameChange(el.value);
      return;
    }
    autoSave();
  });
});

function updateAppTitle() {
  const name = (state.info.name || '').trim();
  document.getElementById('appTitle').textContent = name ? '🏕️ ' + name : '🏕️ RV Inspect';
  document.title = name || 'RV Inspect';
}

function loadInfoFields() {
  document.querySelectorAll('[data-info]').forEach(el => {
    el.value = state.info[el.dataset.info] || '';
  });
  updateAppTitle();
}

// ====== SUMMARY ======
function showSummary() {
  switchView('summary', document.querySelectorAll('.nav-btn')[1]);
}

function buildSummary() {
  let total = 0, ok = 0, issues = 0, na = 0, pending = 0;
  const issueList = [];

  SECTIONS.forEach(s => {
    s.items.forEach((item, i) => {
      total++;
      const key = `${s.id}_${i}`;
      const st = state.checks[key] || 'unchecked';
      if (st === 'ok') ok++;
      else if (st === 'issue') {
        issues++;
        const text = typeof item === 'object' ? item.text : item;
        const note = state.notes[key] || '';
        issueList.push({ section: s.title, text, note });
      }
      else if (st === 'na') na++;
      else pending++;
    });
  });

  const statsEl = document.getElementById('summaryStats');
  statsEl.innerHTML = `
    <div class="stat-box stat-ok"><div class="stat-num">${ok}</div><div class="stat-label">Passed</div></div>
    <div class="stat-box stat-issue"><div class="stat-num">${issues}</div><div class="stat-label">Issues</div></div>
    <div class="stat-box stat-pending"><div class="stat-num">${pending}</div><div class="stat-label">Pending</div></div>
  `;

  const issuesEl = document.getElementById('summaryIssues');
  if (issueList.length) {
    issuesEl.innerHTML = `<h3>⚠️ Issues Found (${issueList.length})</h3>` +
      issueList.map(i => `<div class="summary-issue-item"><strong>${i.section}:</strong> ${i.text}${i.note ? ' — <em>' + escHtml(i.note) + '</em>' : ''}</div>`).join('');
  } else {
    issuesEl.innerHTML = '<p style="color:var(--ok);font-size:.85rem">No issues flagged yet.</p>';
  }

  // Condition radio
  const conditions = ['Excellent', 'Good', 'Fair', 'Poor'];
  document.getElementById('conditionGroup').innerHTML = conditions.map(c =>
    `<span class="radio-btn ${state.summary.condition === c ? (c === 'Poor' ? 'warn-selected' : 'selected') : ''}" onclick="setRadio('condition','${c}',this)">${c}</span>`
  ).join('');

  // Action radio
  const actions = ['Purchase as-is', 'Negotiate price', 'Request repairs', 'Walk away'];
  document.getElementById('actionGroup').innerHTML = actions.map(a =>
    `<span class="radio-btn ${state.summary.action === a ? (a === 'Walk away' ? 'warn-selected' : 'selected') : ''}" onclick="setRadio('action','${a}',this)">${a}</span>`
  ).join('');

  // Text fields
  document.querySelectorAll('[data-summary]').forEach(el => {
    el.value = state.summary[el.dataset.summary] || '';
    el.oninput = () => { state.summary[el.dataset.summary] = el.value; autoSave(); };
  });
}

function setRadio(field, value, el) {
  state.summary[field] = value;
  const warn = (value === 'Poor' || value === 'Walk away');
  el.parentElement.querySelectorAll('.radio-btn').forEach(b => b.className = 'radio-btn');
  el.classList.add(warn ? 'warn-selected' : 'selected');
  autoSave();
}

function exportSummary() {
  const summaryTitle = (state.info.name || 'RV INSPECTION').toUpperCase();
  let text = `=== ${summaryTitle} SUMMARY ===\n\n`;

  // Info
  const info = state.info;
  if (info.date) text += `Date: ${info.date}\n`;
  if (info.location) text += `Location: ${info.location}\n`;
  if (info.seller) text += `Seller: ${info.seller}\n`;
  if (info.price) text += `Asking Price: ${info.price}\n`;
  if (info.vin) text += `VIN: ${info.vin}\n`;
  if (info.mileage) text += `Mileage: ${info.mileage}\n`;
  text += '\n';

  // Stats
  let ok = 0, issues = 0, pending = 0;
  SECTIONS.forEach(s => s.items.forEach((_, i) => {
    const st = state.checks[`${s.id}_${i}`] || 'unchecked';
    if (st === 'ok') ok++;
    else if (st === 'issue') issues++;
    else if (st === 'unchecked') pending++;
  }));
  text += `RESULTS: ${ok} passed | ${issues} issues | ${pending} pending\n\n`;

  // Issues by section
  const issuesBySection = {};
  SECTIONS.forEach(s => s.items.forEach((item, i) => {
    const key = `${s.id}_${i}`;
    if (state.checks[key] === 'issue') {
      if (!issuesBySection[s.title]) issuesBySection[s.title] = [];
      const t = typeof item === 'object' ? item.text : item;
      const note = state.notes[key] || '';
      issuesBySection[s.title].push(t + (note ? ` — ${note}` : ''));
    }
  }));

  if (Object.keys(issuesBySection).length) {
    text += '--- ISSUES FOUND ---\n';
    for (const [sec, items] of Object.entries(issuesBySection)) {
      text += `\n${sec}:\n`;
      items.forEach(i => text += `  ✗ ${i}\n`);
    }
    text += '\n';
  }

  // Notes
  const allNotes = [];
  SECTIONS.forEach(s => s.items.forEach((item, i) => {
    const key = `${s.id}_${i}`;
    if (state.notes[key]) {
      const t = typeof item === 'object' ? item.text : item;
      allNotes.push({ section: s.title, text: t, note: state.notes[key] });
    }
    if (state.inputs[key]) {
      const t = typeof item === 'object' ? item.text : item;
      allNotes.push({ section: s.title, text: t, note: state.inputs[key] });
    }
  }));

  if (allNotes.length) {
    text += '--- NOTES & MEASUREMENTS ---\n';
    allNotes.forEach(n => text += `${n.section} > ${n.text}: ${n.note}\n`);
    text += '\n';
  }

  // Summary fields
  if (state.summary.condition) text += `Overall Condition: ${state.summary.condition}\n`;
  if (state.summary.action) text += `Recommended Action: ${state.summary.action}\n`;
  if (state.summary.majorIssues) text += `Major Issues: ${state.summary.majorIssues}\n`;
  if (state.summary.minorIssues) text += `Minor Issues: ${state.summary.minorIssues}\n`;
  if (state.summary.repairCosts) text += `Estimated Repair Costs: ${state.summary.repairCosts}\n`;

  // Copy or share
  if (navigator.share) {
    navigator.share({ title: 'RV Inspection Summary', text }).catch(() => copyText(text));
  } else {
    copyText(text);
  }
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(() => showToast('Summary copied to clipboard!')).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
    showToast('Summary copied to clipboard!');
  });
}

// ====== VIEW SWITCHING ======
function switchView(view, btn) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  document.getElementById('viewChecklist').classList.toggle('active', view === 'checklist');
  const summary = document.getElementById('summaryCard');
  summary.classList.toggle('active', view === 'summary');
  summary.classList.toggle('visible', view === 'summary');

  if (view === 'summary') buildSummary();
}

