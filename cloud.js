// ====== SAVE / LOAD ======
// localStorage keys:
//   rv_inspect_autosave — auto-saved state (updated on every change)
//   rv_inspect_saves    — { "name": { data: state, ts: timestamp }, ... }
// Named saves can be created, loaded, and deleted from the save modal.
// When a named save is loaded or created, currentSaveName is set so that
// subsequent auto-saves also update that named save automatically.
const STORAGE_KEY = 'rv_inspect_saves';
const AUTOSAVE_KEY = 'rv_inspect_autosave';

function autoSave() {
  localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(state));
  // If working on a named save, keep it updated too
  if (currentSaveName) {
    const saves = getSaves();
    saves[currentSaveName] = { data: JSON.parse(JSON.stringify(state)), ts: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saves));
  }
  debouncedCloudSync();
}

function autoLoad() {
  const data = localStorage.getItem(AUTOSAVE_KEY);
  if (data) {
    try { state = JSON.parse(data); } catch(e) {}
  }
}

function getSaves() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

function showSaveModal() {
  const saves = getSaves();
  const slotsEl = document.getElementById('saveSlots');
  const keys = Object.keys(saves).sort((a,b) => (saves[b].ts || 0) - (saves[a].ts || 0));

  let html = '';
  if (keys.length === 0) {
    html = '<p style="color:var(--text2);font-size:.85rem;padding:8px 0">No saved inspections yet.</p>';
  } else {
    html = '<p style="font-size:.7rem;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;margin:8px 0 4px">Local Saves</p>';
    html += keys.map(k => {
      const s = saves[k];
      const d = s.ts ? new Date(s.ts).toLocaleString() : 'Unknown date';
      const safeName = escHtml(k).replace(/'/g, "\\'");
      return `
        <div class="save-slot">
          <div class="save-slot-name">${escHtml(k)}</div>
          <div class="save-slot-date">${d}</div>
          <div class="save-slot-actions">
            <button class="save-slot-btn" onclick="loadSave('${safeName}')">Load</button>
            <button class="save-slot-btn delete" onclick="deleteSave('${safeName}')">Delete</button>
          </div>
        </div>`;
    }).join('');
  }

  slotsEl.innerHTML = html + '<div id="cloudSaveSlots"></div>';
  const suggestedName = state.info.name || (state.info.location ? `${state.info.location} - ${state.info.date || 'Inspection'}` : '');
  document.getElementById('newSaveName').value = suggestedName;
  document.getElementById('saveModal').classList.add('show');

  // Fetch cloud saves
  loadCloudSavesIntoModal(keys);
}

async function loadCloudSavesIntoModal(localKeys) {
  const container = document.getElementById('cloudSaveSlots');
  if (!supabaseClient || !currentUser) return;

  container.innerHTML = '<p style="font-size:.75rem;color:var(--text2);padding:8px 0">Loading cloud saves...</p>';
  try {
    const { data, error } = await supabaseClient.from('inspections')
      .select('name,state,updated_at')
      .eq('user_id', currentUser.id)
      .neq('name', '__autosave__')
      .order('updated_at', { ascending: false });

    if (error) throw error;
    if (!data || data.length === 0) {
      container.innerHTML = '';
      return;
    }

    // Find cloud-only saves (not in local)
    const cloudOnly = data.filter(d => !localKeys.includes(d.name));
    // Find saves that exist in both (show cloud badge)
    const synced = data.filter(d => localKeys.includes(d.name));

    let html = '';

    // Add cloud badge to synced local saves
    if (synced.length > 0) {
      synced.forEach(s => {
        const slot = document.querySelector(`[onclick*="loadSave('${escHtml(s.name).replace(/'/g, "\\'")}')"]`);
        if (slot) {
          const nameEl = slot.closest('.save-slot')?.querySelector('.save-slot-name');
          if (nameEl && !nameEl.querySelector('.cloud-badge')) {
            nameEl.insertAdjacentHTML('afterbegin', '<span style="font-size:.6rem;background:var(--accent);color:#fff;padding:1px 5px;border-radius:4px;margin-right:6px;vertical-align:middle">☁️</span>');
          }
        }
      });
    }

    if (cloudOnly.length > 0) {
      html += '<p style="font-size:.7rem;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;margin:12px 0 4px">☁️ Cloud Only</p>';
      html += cloudOnly.map(cs => {
        const d = new Date(cs.updated_at).toLocaleString();
        const safeName = escHtml(cs.name).replace(/'/g, "\\'");
        return `
          <div class="save-slot" style="border-color:#2a3a5a">
            <div class="save-slot-name">${escHtml(cs.name)}</div>
            <div class="save-slot-date">${d}</div>
            <div class="save-slot-actions">
              <button class="save-slot-btn" onclick="loadCloudSave('${safeName}')">Load</button>
              <button class="save-slot-btn delete" onclick="deleteCloudOnlySave('${safeName}')">Delete</button>
            </div>
          </div>`;
      }).join('');
    }

    container.innerHTML = html;
  } catch (e) {
    console.error('Failed to load cloud saves:', e);
    container.innerHTML = '<p style="font-size:.75rem;color:var(--warn);padding:8px 0">Failed to load cloud saves.</p>';
  }
}

async function loadCloudSave(name) {
  if (!supabaseClient || !currentUser) return;
  if (!confirm(`Load "${name}" from cloud? Current unsaved progress will be lost.`)) return;
  try {
    const { data, error } = await supabaseClient.from('inspections')
      .select('state').eq('user_id', currentUser.id).eq('name', name).single();
    if (error) throw error;
    state = data.state;
    currentSaveName = name;
    autoSaveLocal();
    // Also save to local named saves
    const saves = getSaves();
    saves[name] = { data: JSON.parse(JSON.stringify(state)), ts: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saves));
    renderSections();
    loadInfoFields();
    SECTIONS.forEach(s => updateBadge(s.id));
    closeSaveModal();
    pullPhotosFromCloud();
  } catch (e) {
    console.error('Failed to load cloud save:', e);
    alert('Failed to load from cloud.');
  }
}

async function deleteCloudOnlySave(name) {
  if (!confirm(`Delete "${name}" from cloud?`)) return;
  await deleteSaveFromCloud(name);
  showSaveModal();
}

function closeSaveModal(e) {
  if (!e || e.target === e.currentTarget) {
    document.getElementById('saveModal').classList.remove('show');
  }
}

function saveNew() {
  const name = document.getElementById('newSaveName').value.trim();
  if (!name) { alert('Enter a name for this save'); return; }
  const saves = getSaves();
  saves[name] = { data: JSON.parse(JSON.stringify(state)), ts: Date.now() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saves));
  currentSaveName = name;
  pushSaveToCloud(name, state);
  closeSaveModal();
  alert('Saved!');
}

function loadSave(name) {
  if (!confirm(`Load "${name}"? Current unsaved progress will be lost.`)) return;
  const saves = getSaves();
  if (saves[name]) {
    state = JSON.parse(JSON.stringify(saves[name].data));
    currentSaveName = name;
    autoSave();
    renderSections();
    loadInfoFields();
    SECTIONS.forEach(s => updateBadge(s.id));
    closeSaveModal();
    pullPhotosFromCloud();
  }
}

function deleteSave(name) {
  if (!confirm(`Delete "${name}"?`)) return;
  const saves = getSaves();
  delete saves[name];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saves));
  deleteSaveFromCloud(name);
  showSaveModal();
}

function resetAll() {
  if (!confirm('Reset all progress?')) return;
  state = { info: {}, checks: {}, notes: {}, inputs: {}, summary: {} };
  currentSaveName = null;
  autoSave();
  renderSections();
  loadInfoFields();
}

// ====== CLOUD SYNC (SUPABASE) ======
// Offline-first: localStorage is always the source of truth. Supabase is optional.
// BYO model — users provide their own Supabase project URL and publishable key.
// Auth uses email magic links. State is stored as JSONB in an "inspections" table,
// one row per named save per user. Auto-save uses the reserved name "__autosave__".
// Changes are debounced (2s) before pushing to cloud. On load, cloud and local
// are reconciled with conflict detection (newer version wins, user chooses).
const BYO_CONFIG_KEY = 'rv_inspect_supabase';
let supabaseClient = null;
let currentUser = null;
let lastSyncTime = null;
let pendingCloudAutosave = null;

function loadBYOConfig() {
  try { return JSON.parse(localStorage.getItem(BYO_CONFIG_KEY)); } catch { return null; }
}

function saveBYOConfig() {
  const url = document.getElementById('byoUrl').value.trim();
  const key = document.getElementById('byoKey').value.trim();
  const msgEl = document.getElementById('byoMsg');
  if (!url || !key) {
    showCloudMsg(msgEl, 'Please enter both URL and publishable key.', true);
    return;
  }
  if (!url.includes('supabase')) {
    showCloudMsg(msgEl, 'URL should be a Supabase project URL.', true);
    return;
  }
  localStorage.setItem(BYO_CONFIG_KEY, JSON.stringify({ url, key }));
  showCloudMsg(msgEl, 'Saved! Connecting...', false);
  initSupabase();
}

function disconnectSupabase() {
  if (!confirm('Disconnect from Supabase? Local data will be kept.')) return;
  localStorage.removeItem(BYO_CONFIG_KEY);
  supabaseClient = null;
  currentUser = null;
  updateCloudUI();
  closeCloudModal();
}

let reconcilePromise = null;

function initSupabase() {
  const config = loadBYOConfig();
  if (!config) { updateCloudUI(); return; }
  try {
    supabaseClient = window.supabase.createClient(config.url, config.key);
    supabaseClient.auth.onAuthStateChange((event, session) => {
      currentUser = session?.user || null;
      updateCloudUI();
      if (currentUser && !reconcilePromise) {
        reconcilePromise = reconcileOnLoad().finally(() => { reconcilePromise = null; });
      }
    });
    supabaseClient.auth.getSession().then(({ data: { session } }) => {
      currentUser = session?.user || null;
      updateCloudUI();
      if (currentUser && !reconcilePromise) {
        reconcilePromise = reconcileOnLoad().finally(() => { reconcilePromise = null; });
      }
    });
    ensureTable();
  } catch (e) {
    console.error('Supabase init failed:', e);
    supabaseClient = null;
    updateCloudUI();
  }
}

async function ensureTable() {
  if (!supabaseClient) return;
  // Try a lightweight query; if table doesn't exist, create it via rpc
  const { error } = await supabaseClient.from('inspections').select('id').limit(1);
  if (error && error.code === '42P01') {
    // Table doesn't exist — guide user to create it
    const msgEl = document.getElementById('byoMsg');
    showCloudMsg(msgEl, 'Table "inspections" not found. Please run the SQL migration in your Supabase SQL Editor. See README for the schema.', true);
  }
}

// Auth
function sendMagicLink() {
  if (!supabaseClient) {
    const msgEl = document.getElementById('magicLinkMsg');
    showCloudMsg(msgEl, 'Connect your Supabase project first (see setup below).', true);
    return;
  }
  const email = document.getElementById('magicLinkEmail').value.trim();
  const msgEl = document.getElementById('magicLinkMsg');
  if (!email) { showCloudMsg(msgEl, 'Enter your email address.', true); return; }

  const redirectUrl = window.location.href.split('#')[0].split('?')[0];
  supabaseClient.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectUrl } })
    .then(({ error }) => {
      if (error) showCloudMsg(msgEl, error.message, true);
      else showCloudMsg(msgEl, 'Check your email for the magic link!', false);
    });
}

function signOut() {
  if (!supabaseClient) return;
  supabaseClient.auth.signOut().then(() => {
    currentUser = null;
    updateCloudUI();
  });
}

// UI
function showCloudModal() {
  const config = loadBYOConfig();
  if (config) {
    document.getElementById('byoUrl').value = config.url;
    document.getElementById('byoKey').value = config.key;
  }
  document.getElementById('cloudModal').classList.add('show');
  updateCloudUI();
}

function closeCloudModal(e) {
  if (!e || e.target === e.currentTarget) {
    document.getElementById('cloudModal').classList.remove('show');
  }
}

function showCloudMsg(el, msg, isError) {
  el.textContent = msg;
  el.className = 'cloud-msg visible' + (isError ? ' error' : '');
}

function updateCloudUI() {
  const loggedIn = document.getElementById('cloudLoggedIn');
  const loggedOut = document.getElementById('cloudLoggedOut');
  const dot = document.getElementById('syncDot');

  if (currentUser) {
    loggedIn.style.display = 'block';
    loggedOut.style.display = 'none';
    document.getElementById('cloudUserEmail').textContent = currentUser.email;
    if (lastSyncTime) {
      document.getElementById('cloudSyncStatus').textContent = 'Last synced: ' + new Date(lastSyncTime).toLocaleString();
    }
  } else {
    loggedIn.style.display = 'none';
    loggedOut.style.display = 'block';
  }

  if (!supabaseClient) { dot.className = 'sync-dot'; }
  else if (!currentUser) { dot.className = 'sync-dot'; }
}

function setSyncStatus(status) {
  const dot = document.getElementById('syncDot');
  dot.className = 'sync-dot ' + status;
}

// Sync
let debounceTimer = null;
function debouncedCloudSync() {
  if (!supabaseClient || !currentUser) return;
  clearTimeout(debounceTimer);
  setSyncStatus('pending');
  debounceTimer = setTimeout(() => cloudSync(), 2000);
}

async function cloudSync() {
  if (!supabaseClient || !currentUser) return;
  setSyncStatus('syncing');
  try {
    const { error } = await supabaseClient.from('inspections').upsert({
      user_id: currentUser.id,
      name: '__autosave__',
      state: state
    }, { onConflict: 'user_id,name' });
    if (error) throw error;
    // Also sync the current named save to cloud
    if (currentSaveName) {
      await pushSaveToCloud(currentSaveName, state);
    }
    lastSyncTime = Date.now();
    setSyncStatus('synced');
    updateCloudUI();
  } catch (e) {
    console.error('Cloud sync error:', e);
    setSyncStatus('error');
  }
}

function cloudSyncNow() {
  cloudSync();
  // Also sync all named saves
  const saves = getSaves();
  for (const [name, save] of Object.entries(saves)) {
    pushSaveToCloud(name, save.data);
  }
  // Sync photos both directions
  pushAllPhotosToCloud();
  pullPhotosFromCloud();
}

async function pushSaveToCloud(name, data) {
  if (!supabaseClient || !currentUser) return;
  try {
    await supabaseClient.from('inspections').upsert({
      user_id: currentUser.id,
      name: name,
      state: data
    }, { onConflict: 'user_id,name' });
  } catch (e) { console.error('Cloud push error:', e); }
}

async function deleteSaveFromCloud(name) {
  if (!supabaseClient || !currentUser) return;
  try {
    await supabaseClient.from('inspections').delete()
      .eq('user_id', currentUser.id).eq('name', name);
  } catch (e) { console.error('Cloud delete error:', e); }
}

async function reconcileOnLoad() {
  if (!supabaseClient || !currentUser) return;
  try {
    // Check cloud autosave
    const { data: cloudAuto } = await supabaseClient.from('inspections')
      .select('state,updated_at').eq('user_id', currentUser.id).eq('name', '__autosave__').single();

    if (cloudAuto) {
      const localHasData = Object.keys(state.checks).length > 0;
      if (!lastSyncTime && localHasData && Object.keys(cloudAuto.state?.checks || {}).length > 0) {
        // Both have data, show conflict
        pendingCloudAutosave = cloudAuto.state;
        document.getElementById('conflictBanner').classList.add('visible');
      } else if (!localHasData && Object.keys(cloudAuto.state?.checks || {}).length > 0) {
        // Local is empty, just load cloud
        state = cloudAuto.state;
        autoSaveLocal();
        renderSections();
        loadInfoFields();
        SECTIONS.forEach(s => updateBadge(s.id));
      }
    }

    // Sync named saves from cloud to local
    const { data: cloudSaves } = await supabaseClient.from('inspections')
      .select('name,state,updated_at').eq('user_id', currentUser.id).neq('name', '__autosave__');

    if (cloudSaves && cloudSaves.length > 0) {
      const localSaves = getSaves();
      let updated = false;
      for (const cs of cloudSaves) {
        if (!localSaves[cs.name]) {
          localSaves[cs.name] = { data: cs.state, ts: new Date(cs.updated_at).getTime() };
          updated = true;
        }
      }
      // Push local-only saves to cloud
      for (const [name, save] of Object.entries(localSaves)) {
        if (!cloudSaves.find(cs => cs.name === name)) {
          pushSaveToCloud(name, save.data);
        }
      }
      if (updated) localStorage.setItem(STORAGE_KEY, JSON.stringify(localSaves));
    }

    lastSyncTime = Date.now();
    setSyncStatus('synced');
  } catch (e) {
    console.error('Reconcile error:', e);
    setSyncStatus('error');
  }
}

// Save to localStorage without triggering cloud sync (used during cloud load)
function autoSaveLocal() {
  localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(state));
}

function loadCloudAutosave() {
  if (pendingCloudAutosave) {
    state = pendingCloudAutosave;
    pendingCloudAutosave = null;
    autoSaveLocal();
    renderSections();
    loadInfoFields();
    SECTIONS.forEach(s => updateBadge(s.id));
  }
  document.getElementById('conflictBanner').classList.remove('visible');
}

function dismissConflict() {
  pendingCloudAutosave = null;
  document.getElementById('conflictBanner').classList.remove('visible');
  // Push local version to cloud
  cloudSync();
}

// Handle auth callback (magic link redirect)
function handleAuthCallback() {
  const hash = window.location.hash;
  if (hash && (hash.includes('access_token') || hash.includes('type=magiclink'))) {
    // Supabase client auto-detects the hash, but ensure we clean the URL
    setTimeout(() => {
      if (window.location.hash) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    }, 1000);
  }
}

// Online/offline listeners
window.addEventListener('online', () => {
  if (supabaseClient && currentUser) debouncedCloudSync();
});

// ====== INIT ======
autoLoad();
renderSections();
loadInfoFields();
SECTIONS.forEach(s => updateBadge(s.id));
openPhotoDB().then(() => loadAllThumbs()).catch(() => {});

// Init Supabase if configured
if (typeof window.supabase !== 'undefined') {
  handleAuthCallback();
  initSupabase();
}

// Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js').catch(() => {});
}
