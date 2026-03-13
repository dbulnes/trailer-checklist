// ====== SAVE / LOAD ======
// localStorage key:
//   rv_inspect_saves — { "name": { data: state, ts: timestamp }, ... }
// The checklist name field IS the save name. Auto-save writes directly to it.
// If unnamed, auto-save uses a generated name like "Inspection 1".
const STORAGE_KEY = 'rv_inspect_saves';

// Ensure currentSaveName is set. If the checklist has no name, generate one.
function ensureSaveName() {
  const nameFromField = (state.info.name || '').trim();
  if (nameFromField) {
    currentSaveName = nameFromField;
    return;
  }
  // Already have an auto-generated name — keep it
  if (currentSaveName) return;
  // Generate "Inspection 1", "Inspection 2", etc.
  const saves = getSaves();
  let n = 1;
  while (saves['Inspection ' + n]) n++;
  currentSaveName = 'Inspection ' + n;
  state.info.name = currentSaveName;
  updateAppTitle();
  // Update the name input field
  const nameInput = document.querySelector('[data-info="name"]');
  if (nameInput) nameInput.value = currentSaveName;
}

function autoSave() {
  ensureSaveName();
  const saves = getSaves();
  saves[currentSaveName] = { data: JSON.parse(JSON.stringify(state)), ts: Date.now() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saves));
  debouncedCloudSync();
}

function autoLoad() {
  // Load the most recently updated save
  const saves = getSaves();
  const keys = Object.keys(saves);
  if (keys.length === 0) return;
  const latest = keys.reduce((a, b) => (saves[a].ts || 0) >= (saves[b].ts || 0) ? a : b);
  state = JSON.parse(JSON.stringify(saves[latest].data));
  currentSaveName = latest;
}

function getSaves() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

// Handle checklist name changes — debounced rename of the save entry
let nameChangeTimer = null;
function handleNameChange(newName) {
  clearTimeout(nameChangeTimer);
  nameChangeTimer = setTimeout(() => {
    newName = newName.trim();
    if (!newName || newName === currentSaveName) return;
    const saves = getSaves();
    const oldName = currentSaveName;
    // Move save entry to new name
    if (oldName && saves[oldName]) {
      saves[newName] = saves[oldName];
      delete saves[oldName];
      deleteSaveFromCloud(oldName);
    }
    currentSaveName = newName;
    saves[currentSaveName] = { data: JSON.parse(JSON.stringify(state)), ts: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saves));
    debouncedCloudSync();
  }, 1000);
}

function showSaveModal() {
  const saves = getSaves();
  const slotsEl = document.getElementById('saveSlots');
  const keys = Object.keys(saves).sort((a,b) => (saves[b].ts || 0) - (saves[a].ts || 0));

  let html = '';
  if (keys.length === 0) {
    html = '<p style="color:var(--text2);font-size:.85rem;padding:8px 0">No saved inspections yet.</p>';
  } else {
    html += keys.map(k => {
      const s = saves[k];
      const d = s.ts ? new Date(s.ts).toLocaleString() : '';
      const safeName = escHtml(k).replace(/'/g, "\\'");
      const isCurrent = k === currentSaveName;
      return `
        <div class="save-slot${isCurrent ? ' current' : ''}">
          <div class="save-slot-name">${escHtml(k)}${isCurrent ? ' <span style="font-size:.65rem;color:var(--accent);font-weight:400">(current)</span>' : ''}</div>
          <div class="save-slot-date">${d}</div>
          <div class="save-slot-actions">
            ${isCurrent ? '' : `<button class="save-slot-btn" onclick="loadSave('${safeName}')">Load</button>`}
            <button class="save-slot-btn delete" onclick="deleteSave('${safeName}')">Delete</button>
          </div>
        </div>`;
    }).join('');
  }

  slotsEl.innerHTML = html + '<div id="cloudSaveSlots"></div>';
  document.getElementById('saveModal').classList.add('show');

  // Fetch cloud-only saves
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

    // Add cloud badge to synced local saves
    const synced = data.filter(d => localKeys.includes(d.name));
    synced.forEach(s => {
      const slot = document.querySelector(`[onclick*="loadSave('${escHtml(s.name).replace(/'/g, "\\'")}')"]`);
      const nameEl = (slot?.closest('.save-slot') || document.querySelector('.save-slot.current'))?.querySelector('.save-slot-name');
      if (nameEl && !nameEl.querySelector('.cloud-badge')) {
        nameEl.insertAdjacentHTML('afterbegin', '<span class="cloud-badge" style="font-size:.6rem;background:var(--accent);color:#fff;padding:1px 5px;border-radius:4px;margin-right:6px;vertical-align:middle">☁️</span>');
      }
    });

    // Show cloud-only saves
    const cloudOnly = data.filter(d => !localKeys.includes(d.name));
    if (cloudOnly.length > 0) {
      let html = '<p style="font-size:.7rem;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;margin:12px 0 4px">☁️ Cloud Only</p>';
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
      container.innerHTML = html;
    } else {
      container.innerHTML = '';
    }
  } catch (e) {
    console.error('Failed to load cloud saves:', e);
    container.innerHTML = '<p style="font-size:.75rem;color:var(--warn);padding:8px 0">Failed to load cloud saves.</p>';
  }
}

async function loadCloudSave(name) {
  if (!supabaseClient || !currentUser) return;
  try {
    const { data, error } = await supabaseClient.from('inspections')
      .select('state').eq('user_id', currentUser.id).eq('name', name).single();
    if (error) throw error;
    state = data.state;
    currentSaveName = name;
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
    showToast('Failed to load from cloud.');
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

function newInspection() {
  // Auto-save current work first
  ensureSaveName();
  autoSave();
  // Reset to blank state
  state = { info: {}, checks: {}, notes: {}, inputs: {}, summary: {} };
  currentSaveName = null;
  ensureSaveName();
  autoSave();
  renderSections();
  loadInfoFields();
  SECTIONS.forEach(s => updateBadge(s.id));
  closeSaveModal();
  showToast('New inspection started');
}

function loadSave(name) {
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
  // If we deleted the current save, start fresh
  if (name === currentSaveName) {
    state = { info: {}, checks: {}, notes: {}, inputs: {}, summary: {} };
    currentSaveName = null;
    ensureSaveName();
    autoSave();
    renderSections();
    loadInfoFields();
    SECTIONS.forEach(s => updateBadge(s.id));
  }
  showSaveModal();
}

function resetAll() {
  if (!confirm('Reset all progress?')) return;
  state = { info: {}, checks: {}, notes: {}, inputs: {}, summary: {} };
  currentSaveName = null;
  ensureSaveName();
  autoSave();
  renderSections();
  loadInfoFields();
}

// ====== CLOUD SYNC (SUPABASE) ======
// Offline-first: localStorage is always the source of truth. Supabase is optional.
// BYO model — users provide their own Supabase project URL and publishable key.
// Auth uses email magic links. State is stored as JSONB in an "inspections" table,
// one row per named save per user.
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
  if (!supabaseClient || !currentUser || !currentSaveName) return;
  setSyncStatus('syncing');
  try {
    await pushSaveToCloud(currentSaveName, state);
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
    // Sync all named saves between cloud and local
    const { data: cloudSaves } = await supabaseClient.from('inspections')
      .select('name,state,updated_at').eq('user_id', currentUser.id).neq('name', '__autosave__');

    if (cloudSaves && cloudSaves.length > 0) {
      const localSaves = getSaves();
      let updated = false;

      for (const cs of cloudSaves) {
        const cloudTs = new Date(cs.updated_at).getTime();
        const local = localSaves[cs.name];
        if (!local) {
          // Cloud-only → pull to local
          localSaves[cs.name] = { data: cs.state, ts: cloudTs };
          updated = true;
        } else if (cloudTs > (local.ts || 0)) {
          // Cloud is newer → check for conflict on current save
          if (cs.name === currentSaveName && Object.keys(state.checks).length > 0) {
            pendingCloudAutosave = cs.state;
            document.getElementById('conflictBanner').classList.add('visible');
          } else {
            localSaves[cs.name] = { data: cs.state, ts: cloudTs };
            updated = true;
          }
        }
      }

      // Push local-only saves to cloud
      for (const [name, save] of Object.entries(localSaves)) {
        if (!cloudSaves.find(cs => cs.name === name)) {
          pushSaveToCloud(name, save.data);
        }
      }

      if (updated) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(localSaves));
        // If current save was updated from cloud, reload it
        if (currentSaveName && localSaves[currentSaveName] && !pendingCloudAutosave) {
          state = JSON.parse(JSON.stringify(localSaves[currentSaveName].data));
          renderSections();
          loadInfoFields();
          SECTIONS.forEach(s => updateBadge(s.id));
        }
      }
    }

    // Clean up legacy __autosave__ row if it exists
    supabaseClient.from('inspections').delete()
      .eq('user_id', currentUser.id).eq('name', '__autosave__').then(() => {});

    lastSyncTime = Date.now();
    setSyncStatus('synced');
  } catch (e) {
    console.error('Reconcile error:', e);
    setSyncStatus('error');
  }
}

function loadCloudAutosave() {
  if (pendingCloudAutosave) {
    state = pendingCloudAutosave;
    pendingCloudAutosave = null;
    const saves = getSaves();
    if (currentSaveName) {
      saves[currentSaveName] = { data: JSON.parse(JSON.stringify(state)), ts: Date.now() };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saves));
    }
    renderSections();
    loadInfoFields();
    SECTIONS.forEach(s => updateBadge(s.id));
  }
  document.getElementById('conflictBanner').classList.remove('visible');
}

function dismissConflict() {
  pendingCloudAutosave = null;
  document.getElementById('conflictBanner').classList.remove('visible');
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

// ====== DEVICE PAIRING ======
const PAIR_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
let pairCountdownInterval = null;
let currentPairCode = null;

function generateCode() {
  const arr = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(arr, b => PAIR_CHARS[b % PAIR_CHARS.length]).join('');
}

function formatCode(code) {
  return code.slice(0, 4) + '-' + code.slice(4);
}

async function generatePairingCode() {
  if (!supabaseClient || !currentUser) return;
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session?.refresh_token) { showToast('Session error. Try signing out and back in.', true); return; }

  // Delete any existing unclaimed codes for this user
  await supabaseClient.from('device_links').delete()
    .eq('user_id', currentUser.id).eq('claimed', false);

  const code = generateCode();
  const { error } = await supabaseClient.from('device_links').insert({
    code,
    refresh_token: session.refresh_token,
    user_id: currentUser.id
  });
  if (error) { showToast('Failed to create pairing code.', true); console.error(error); return; }

  currentPairCode = code;
  document.getElementById('pairGenerateSection').style.display = 'none';
  document.getElementById('pairCodeDisplay').style.display = 'block';
  document.getElementById('pairCodeText').textContent = formatCode(code);

  // QR code
  loadQRLibrary().then(() => renderQRCode(code)).catch(() => {
    document.getElementById('pairQR').innerHTML = '';
  });

  // Countdown
  const expiresAt = Date.now() + 5 * 60 * 1000;
  clearInterval(pairCountdownInterval);
  updateCountdown(expiresAt);
  pairCountdownInterval = setInterval(() => updateCountdown(expiresAt), 1000);
}

function updateCountdown(expiresAt) {
  const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  document.getElementById('pairCountdown').textContent = remaining > 0
    ? `Expires in ${m}:${s.toString().padStart(2, '0')}`
    : 'Code expired';
  if (remaining <= 0) {
    clearInterval(pairCountdownInterval);
    cancelDeviceLink();
  }
}

function copyPairingCode() {
  if (!currentPairCode) return;
  navigator.clipboard.writeText(formatCode(currentPairCode)).then(() => {
    showToast('Code copied!');
  }).catch(() => {
    showToast('Copy failed — tap code to select it.');
  });
}

async function cancelDeviceLink() {
  clearInterval(pairCountdownInterval);
  if (supabaseClient && currentUser && currentPairCode) {
    supabaseClient.from('device_links').delete()
      .eq('user_id', currentUser.id).eq('code', currentPairCode).then(() => {});
  }
  currentPairCode = null;
  document.getElementById('pairCodeDisplay').style.display = 'none';
  document.getElementById('pairGenerateSection').style.display = 'block';
  document.getElementById('pairQR').innerHTML = '';
}

async function claimDeviceLink() {
  const input = document.getElementById('pairCodeInput');
  const msgEl = document.getElementById('pairClaimMsg');
  const code = input.value.toUpperCase().replace(/[-\s]/g, '');
  if (code.length !== 8) { showCloudMsg(msgEl, 'Enter the 8-character code.', true); return; }

  if (!supabaseClient) {
    showCloudMsg(msgEl, 'Connect your Supabase project first (see setup below).', true);
    return;
  }

  showCloudMsg(msgEl, 'Linking...', false);

  try {
    const { data, error } = await supabaseClient.from('device_links')
      .select('refresh_token,user_id').eq('code', code).single();

    if (error || !data) {
      showCloudMsg(msgEl, 'Invalid or expired code.', true);
      return;
    }

    // Use the refresh token to get a new session
    const { data: authData, error: authError } = await supabaseClient.auth.refreshSession({
      refresh_token: data.refresh_token
    });

    if (authError || !authData.session) {
      showCloudMsg(msgEl, 'Failed to authenticate. Code may be expired.', true);
      return;
    }

    // Mark as claimed (now authenticated as the same user)
    await supabaseClient.from('device_links').update({ claimed: true }).eq('code', code);

    input.value = '';
    msgEl.className = 'cloud-msg';
    showToast('Device linked!');
    // onAuthStateChange will handle the rest (UI update, reconcile)
  } catch (e) {
    console.error('Claim error:', e);
    showCloudMsg(msgEl, 'Something went wrong. Try again.', true);
  }
}

// QR code library (loaded on demand)
let qrLibLoaded = false;
function loadQRLibrary() {
  if (qrLibLoaded) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js';
    script.onload = () => { qrLibLoaded = true; resolve(); };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function renderQRCode(code) {
  if (typeof qrcode === 'undefined') return;
  const container = document.getElementById('pairQR');
  const baseUrl = window.location.href.split('#')[0].split('?')[0];
  const config = loadBYOConfig();
  let url = baseUrl + '?pair=' + code;
  // Include Supabase credentials so Device B auto-connects
  if (config) {
    url += '&sb_url=' + encodeURIComponent(config.url) + '&sb_key=' + encodeURIComponent(config.key);
  }
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  container.innerHTML = qr.createSvgTag(4, 0);
  // Style the SVG
  const svg = container.querySelector('svg');
  if (svg) {
    svg.style.width = '180px';
    svg.style.height = '180px';
    svg.style.borderRadius = '8px';
    svg.style.background = '#fff';
    svg.style.padding = '8px';
  }
}

// Handle ?pair= URL parameter (Device B opens QR link)
function handlePairParam() {
  const params = new URLSearchParams(window.location.search);
  const pairCode = params.get('pair');
  if (!pairCode) return;
  // Auto-configure Supabase if credentials are in the URL
  const sbUrl = params.get('sb_url');
  const sbKey = params.get('sb_key');
  // Clean the URL immediately (credentials should not linger)
  history.replaceState(null, '', window.location.pathname);
  // If already logged in, no need to pair
  if (currentUser) return;
  // Save Supabase config if provided and not already configured
  if (sbUrl && sbKey && !loadBYOConfig()) {
    localStorage.setItem(BYO_CONFIG_KEY, JSON.stringify({ url: sbUrl, key: sbKey }));
    initSupabase();
  }
  // Wait for Supabase to init, then auto-fill and open modal
  setTimeout(() => {
    showCloudModal();
    const input = document.getElementById('pairCodeInput');
    if (input) {
      input.value = formatCode(pairCode.toUpperCase().replace(/[-\s]/g, ''));
    }
  }, 500);
}

// Online/offline listeners
window.addEventListener('online', () => {
  if (supabaseClient && currentUser) debouncedCloudSync();
});

// ====== INIT ======
// Migrate legacy autosave (rv_inspect_autosave) into the unified saves system
(function migrateLegacyAutosave() {
  const legacy = localStorage.getItem('rv_inspect_autosave');
  if (!legacy) return;
  try {
    const data = JSON.parse(legacy);
    const saves = getSaves();
    const name = (data.info?.name || '').trim() || 'Inspection 1';
    if (!saves[name]) {
      saves[name] = { data, ts: Date.now() };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saves));
    }
  } catch (e) {}
  localStorage.removeItem('rv_inspect_autosave');
})();

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
  // Auto-reload when a new service worker activates (iOS PWA fix)
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.addEventListener('message', e => {
      if (e.data?.type === 'SW_UPDATED') {
        window.location.reload();
      }
    });
  }
}

// Handle ?pair= URL param after init
handlePairParam();
