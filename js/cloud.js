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
  ensureByField();
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

function renderSaveSlots(saves) {
  const keys = Object.keys(saves).sort((a,b) => (saves[b].ts || 0) - (saves[a].ts || 0));
  if (keys.length === 0) {
    return '<p style="color:var(--text2);font-size:.85rem;padding:8px 0">No saved inspections yet.</p>';
  }
  return keys.map(k => {
    const s = saves[k];
    const d = s.ts ? new Date(s.ts).toLocaleString() : '';
    const encodedName = encodeURIComponent(k);
    const isCurrent = k === currentSaveName;
    return `
      <div class="save-slot${isCurrent ? ' current' : ''}">
        <div class="save-slot-name">${escHtml(k)}${isCurrent ? ' <span style="font-size:.65rem;color:var(--accent);font-weight:400">(current)</span>' : ''}</div>
        <div class="save-slot-date">${d}</div>
        <div class="save-slot-actions">
          ${isCurrent ? '' : `<button class="save-slot-btn" data-action="load" data-name="${encodedName}">Load</button>`}
          <button class="save-slot-btn delete" data-action="delete" data-name="${encodedName}">Delete</button>
        </div>
      </div>`;
  }).join('');
}

function showSaveModal() {
  const saves = getSaves();
  const slotsEl = document.getElementById('saveSlots');
  slotsEl.innerHTML = renderSaveSlots(saves);
  document.getElementById('saveModal').classList.add('show');

  // Fetch cloud-only saves
  const keys = Object.keys(saves);
  loadCloudSavesIntoModal(keys);
}

let _cloudFetchId = 0;
async function loadCloudSavesIntoModal(localKeys) {
  if (!supabaseClient || !currentUser) return;
  const fetchId = ++_cloudFetchId;

  try {
    const { data, error } = await supabaseClient.from('inspections')
      .select('name,state,updated_at')
      .eq('user_id', currentUser.id)
      .neq('name', '__autosave__')
      .order('updated_at', { ascending: false });

    // A newer call superseded this one — bail
    if (fetchId !== _cloudFetchId) return;

    if (error) throw error;
    if (!data || data.length === 0) return;

    const cloudNames = new Set(data.map(d => d.name));

    // Pull cloud-only saves into localStorage
    const saves = getSaves();
    let pulled = false;
    for (const cs of data) {
      if (!saves[cs.name]) {
        saves[cs.name] = { data: cs.state, ts: new Date(cs.updated_at).getTime() };
        pulled = true;
      }
    }
    if (pulled) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saves));
      // Re-render the modal slots inline instead of recursive showSaveModal()
      document.getElementById('saveSlots').innerHTML = renderSaveSlots(saves);
    }

    // Add cloud badge to saves that exist in cloud
    document.querySelectorAll('.save-slot').forEach(slot => {
      const nameEl = slot.querySelector('.save-slot-name');
      if (!nameEl) return;
      // Extract the raw name from the element text (strip badge and "(current)")
      const rawName = nameEl.textContent.replace(/\(current\)/, '').trim();
      if (cloudNames.has(rawName) && !nameEl.querySelector('.cloud-badge')) {
        nameEl.insertAdjacentHTML('afterbegin', '<span class="cloud-badge" style="font-size:.6rem;background:var(--accent);color:#fff;padding:1px 5px;border-radius:4px;margin-right:6px;vertical-align:middle">☁️</span>');
      }
    });
  } catch (e) {
    console.error('Failed to load cloud saves:', e);
  }
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
  state = freshState();
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
    ensureByField();
    currentSaveName = name;
    autoSave();
    renderSections();
    loadInfoFields();
    SECTIONS.forEach(s => updateBadge(s.id));
    closeSaveModal();
    pullPhotosFromCloud();
  }
}

async function deleteSave(name) {
  if (!await appConfirm(`Delete "${name}"?`)) return;
  // Close modal immediately for visual feedback
  closeSaveModal();
  // Delete from localStorage
  const saves = getSaves();
  delete saves[name];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saves));
  // Fire-and-forget cloud delete
  deleteSaveFromCloud(name);
  // If we deleted the current save, start fresh
  if (name === currentSaveName) {
    state = freshState();
    currentSaveName = null;
    ensureSaveName();
    autoSave();
    renderSections();
    loadInfoFields();
    SECTIONS.forEach(s => updateBadge(s.id));
  }
  showToast(`Deleted "${name}"`);
}

async function resetAll() {
  if (!await appConfirm('Reset all progress?')) return;
  state = freshState();
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
// are reconciled automatically (newest timestamp wins).
const BYO_CONFIG_KEY = 'rv_inspect_supabase';
let supabaseClient = null;
let currentUser = null;
let lastSyncTime = null;

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

async function disconnectSupabase() {
  if (!await appConfirm('Disconnect from Supabase? Local data will be kept.')) return;
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
      if (event === 'SIGNED_IN' && currentUser) ensureHandle();
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
    showCloudMsg(msgEl, 'Table "inspections" not found. Run setup.sql in your Supabase SQL Editor first.', true);
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

  const redirectUrl = getBaseUrl();
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
    localStorage.removeItem('rv_inspect_paired');
    localStorage.removeItem('rv_inspect_can_pair');
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
  const handleEl = document.getElementById('handleInput');
  if (handleEl) handleEl.value = getHandle();
  document.getElementById('appVersionInfo').textContent = 'Version: ' + APP_VERSION;
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
    // Show/hide pairing section based on permissions
    const isPaired = localStorage.getItem('rv_inspect_paired') === 'true';
    const canPair = localStorage.getItem('rv_inspect_can_pair') === 'true';
    const pairSection = document.getElementById('pairGenerateSection');
    if (pairSection) pairSection.style.display = (!isPaired || canPair) ? '' : 'none';
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

async function cloudSyncNow() {
  if (!supabaseClient || !currentUser) return;
  setSyncStatus('syncing');
  try {
    // Fetch all cloud saves in one query
    const { data: cloudSaves, error } = await supabaseClient.from('inspections')
      .select('name,state,updated_at')
      .eq('user_id', currentUser.id).neq('name', '__autosave__');
    if (error) throw error;

    const cloudMap = {};
    for (const cs of (cloudSaves || [])) {
      cloudMap[cs.name] = { state: cs.state, ts: new Date(cs.updated_at).getTime() };
    }

    const saves = getSaves();
    let localUpdated = false;
    const toPush = [];

    for (const [name, save] of Object.entries(saves)) {
      const cloud = cloudMap[name];
      if (!cloud) {
        // Local-only → push
        toPush.push({ name, data: save.data });
      } else if (cloud.ts > (save.ts || 0)) {
        // Cloud is newer → pull
        saves[name] = { data: cloud.state, ts: cloud.ts };
        localUpdated = true;
      } else if ((save.ts || 0) > cloud.ts) {
        // Local is newer → push
        toPush.push({ name, data: save.data });
      }
      // Equal timestamps → skip, already in sync
    }

    // Cloud-only saves → pull
    for (const [name, cloud] of Object.entries(cloudMap)) {
      if (!saves[name]) {
        saves[name] = { data: cloud.state, ts: cloud.ts };
        localUpdated = true;
      }
    }

    if (localUpdated) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saves));
      // Reload current save if it was updated
      if (currentSaveName && saves[currentSaveName]) {
        state = JSON.parse(JSON.stringify(saves[currentSaveName].data));
        ensureByField();
        renderSections();
        loadInfoFields();
        SECTIONS.forEach(s => updateBadge(s.id));
      }
    }

    // Push all local-newer saves in parallel (simple upserts, no pre-check needed)
    await Promise.all(toPush.map(({ name, data }) =>
      supabaseClient.from('inspections').upsert({
        user_id: currentUser.id, name, state: data
      }, { onConflict: 'user_id,name' }).catch(e => console.error('Push error:', name, e))
    ));

    // Sync photos both directions (push first, then pull)
    await pushAllPhotosToCloud();
    await pullPhotosFromCloud();
    lastSyncTime = Date.now();
    setSyncStatus('synced');
    updateCloudUI();
    showToast('Sync complete');
  } catch (e) {
    console.error('Full sync error:', e);
    setSyncStatus('error');
    showToast('Sync failed', true);
  }
}

async function pushSaveToCloud(name, data) {
  if (!supabaseClient || !currentUser) return;
  try {
    const localTs = getSaves()[name]?.ts || Date.now();
    // Check if cloud version is newer before overwriting
    const { data: existing } = await supabaseClient.from('inspections')
      .select('state,updated_at')
      .eq('user_id', currentUser.id).eq('name', name)
      .maybeSingle();
    if (existing) {
      const cloudTs = new Date(existing.updated_at).getTime();
      if (cloudTs > localTs) {
        // Cloud is newer — don't overwrite, pull it instead
        const saves = getSaves();
        saves[name] = { data: existing.state, ts: cloudTs };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(saves));
        if (name === currentSaveName) {
          state = JSON.parse(JSON.stringify(existing.state));
          ensureByField();
          renderSections();
          loadInfoFields();
          SECTIONS.forEach(s => updateBadge(s.id));
        }
        return;
      }
    }
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
        if (!local || cloudTs > (local.ts || 0)) {
          // Cloud is newer (or cloud-only) → accept it
          localSaves[cs.name] = { data: cs.state, ts: cloudTs };
          updated = true;
        }
      }

      // Push local-only saves to cloud (no pre-check needed — they don't exist in cloud)
      for (const [name, save] of Object.entries(localSaves)) {
        if (!cloudSaves.find(cs => cs.name === name)) {
          supabaseClient.from('inspections').upsert({
            user_id: currentUser.id, name, state: save.data
          }, { onConflict: 'user_id,name' }).catch(e => console.error('Push error:', name, e));
        }
      }

      if (updated) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(localSaves));
        // If current save was updated from cloud, reload it
        if (currentSaveName && localSaves[currentSaveName]) {
          state = JSON.parse(JSON.stringify(localSaves[currentSaveName].data));
          ensureByField();
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

async function generatePairingCode() {
  if (!supabaseClient || !currentUser) return;
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session?.refresh_token) { showToast('Session error. Try signing out and back in.', true); return; }

  // Delete any existing unclaimed codes for this user
  await supabaseClient.from('device_links').delete()
    .eq('user_id', currentUser.id).eq('claimed', false);

  const canPair = document.getElementById('pairCanPairToggle')?.checked || false;
  const code = generateCode();
  const { error } = await supabaseClient.from('device_links').insert({
    code,
    refresh_token: session.refresh_token,
    user_id: currentUser.id,
    can_pair: canPair
  });
  if (error) { showToast('Failed to create pairing code.', true); console.error(error); return; }

  currentPairCode = code;
  document.getElementById('pairGenerateSection').style.display = 'none';
  document.getElementById('pairCodeDisplay').style.display = 'block';
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

function getBaseUrl() {
  return window.location.href.split('#')[0].split('?')[0];
}

function buildPairURL(code) {
  const config = loadBYOConfig();
  let url = getBaseUrl() + '?pair=' + code;
  if (config) url += '&sb_url=' + encodeURIComponent(config.url) + '&sb_key=' + encodeURIComponent(config.key);
  return url;
}

function copyPairingLink() {
  if (!currentPairCode) return;
  navigator.clipboard.writeText(buildPairURL(currentPairCode)).then(() => {
    showToast('Link copied!');
  }).catch(() => {
    showToast('Copy failed.');
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

// Claim a pairing URL — used by QR scan, QR upload, and ?pair= URL param
async function claimPairURL(pairUrl) {
  showCloudModal();
  const msgEl = document.getElementById('pairClaimMsg');
  try {
    const url = new URL(pairUrl);
    const code = url.searchParams.get('pair');
    if (!code) { showCloudMsg(msgEl, 'Invalid QR code — no pairing data found.', true); return; }

    // Auto-configure Supabase from URL params
    const sbUrl = url.searchParams.get('sb_url');
    const sbKey = url.searchParams.get('sb_key');
    if (sbUrl && sbKey && !loadBYOConfig()) {
      localStorage.setItem(BYO_CONFIG_KEY, JSON.stringify({ url: sbUrl, key: sbKey }));
      initSupabase();
      // Wait for supabaseClient to be ready (up to 3s)
      for (let i = 0; i < 30 && !supabaseClient; i++) {
        await new Promise(r => setTimeout(r, 100));
      }
    }

    if (!supabaseClient) {
      showCloudMsg(msgEl, 'Could not connect to cloud. Try again.', true);
      return;
    }

    showCloudMsg(msgEl, 'Linking...', false);

    const { data, error } = await supabaseClient.from('device_links')
      .select('refresh_token,user_id,can_pair').eq('code', code.toUpperCase().replace(/[-\s]/g, '')).single();

    if (error || !data) {
      showCloudMsg(msgEl, 'Invalid or expired code.', true);
      return;
    }

    const { data: authData, error: authError } = await supabaseClient.auth.refreshSession({
      refresh_token: data.refresh_token
    });

    if (authError || !authData.session) {
      showCloudMsg(msgEl, 'Failed to authenticate. Code may be expired.', true);
      return;
    }

    await supabaseClient.from('device_links').update({ claimed: true }).eq('code', code);

    localStorage.setItem('rv_inspect_paired', 'true');
    localStorage.setItem('rv_inspect_can_pair', data.can_pair ? 'true' : 'false');

    msgEl.className = 'cloud-msg';
    showToast('Device linked!');
    // Prompt for a display name if not set
    ensureHandle();
  } catch (e) {
    console.error('Claim error:', e);
    showCloudMsg(msgEl, 'Invalid QR code.', true);
  }
}

// QR code capture (camera on mobile) or upload from file
function uploadPairQR() {
  const fileInput = document.getElementById('pairQRFileInput');
  fileInput.value = '';
  fileInput.onchange = async () => {
    const file = fileInput.files[0];
    if (!file) return;
    const msgEl = document.getElementById('pairClaimMsg');
    showCloudMsg(msgEl, 'Reading QR code...', false);

    try {
      if (!(await ensureBarcodeDetector())) {
        showCloudMsg(msgEl, 'QR reading not available on this device.', true);
        return;
      }
      const img = new Image();
      img.src = URL.createObjectURL(file);
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; });
      const detector = new BarcodeDetector({ formats: ['qr_code'] });
      const barcodes = await detector.detect(img);
      URL.revokeObjectURL(img.src);

      if (barcodes.length === 0) {
        showCloudMsg(msgEl, 'No QR code found in image. Try a clearer screenshot.', true);
        return;
      }

      const value = barcodes[0].rawValue.trim();
      await claimPairURL(value);
    } catch (e) {
      console.error('QR upload error:', e);
      showCloudMsg(msgEl, 'Failed to read QR code from image.', true);
    }
  };
  fileInput.click();
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
  const url = buildPairURL(code);
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

// Handle ?pair= URL parameter (Device B opens link from QR or shared URL)
function handlePairParam() {
  const params = new URLSearchParams(window.location.search);
  if (!params.get('pair')) return;
  // Reconstruct the full URL for claimPairURL, then clean address bar
  const fullUrl = getBaseUrl() + window.location.search;
  history.replaceState(null, '', window.location.pathname);
  if (currentUser) { showToast('Already signed in'); return; }
  // claimPairURL handles Supabase init internally if needed
  claimPairURL(fullUrl);
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
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data?.type === 'SW_UPDATED') {
      window.location.reload();
    }
  });
}

// Event delegation for save slot buttons (attached once)
document.getElementById('saveSlots').addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const name = decodeURIComponent(btn.dataset.name);
  if (btn.dataset.action === 'load') loadSave(name);
  else if (btn.dataset.action === 'delete') deleteSave(name);
});

// Handle ?pair= URL param after init
handlePairParam();
