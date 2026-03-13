# Plan: Cloud-First Persistence with localStorage as Cache

## Context
Currently the app is offline-first: localStorage is the source of truth, Supabase is an optional sync layer. The user wants to invert this — Supabase becomes the source of truth, localStorage is just a cache for offline resilience. The app must still work without Supabase configured (graceful degradation).

## Connectivity Modes

The app derives its mode from runtime state (never stored):

| Mode | Condition | Writes | Reads |
|---|---|---|---|
| `LOCAL_ONLY` | No Supabase config | localStorage | localStorage |
| `UNAUTHED` | Config set, no session | localStorage | localStorage |
| `ONLINE` | Config + auth + online | Cloud first, cache on success | Cloud (boot from cache, refresh) |
| `OFFLINE` | Config + auth + offline | localStorage + offline queue | localStorage cache |

New helper: `getMode()` returns the current mode.

## Core Changes in `app.js`

### 1. Write Path — rework `autoSave()`

**Current:** localStorage first, debounced cloud push.
**New:**
- `ONLINE`: debounced (2s) Supabase upsert. On success, update localStorage cache. On failure, fall back to localStorage + enqueue.
- `OFFLINE`: localStorage immediately + enqueue operation.
- `LOCAL_ONLY`/`UNAUTHED`: localStorage only (unchanged behavior).

### 2. Read Path — replace `autoLoad()` + `reconcileOnLoad()` with `initializeState()`

Boot sequence:
1. Read localStorage cache into `state` (instant)
2. Render UI immediately
3. If `ONLINE`: fetch `__autosave__` from Supabase async
   - Cloud newer → apply + re-render + update cache
   - Local newer → push local to cloud
   - Both empty or equal → no-op
   - **Dirty guard**: if user edited during fetch, skip overwrite (local wins, will push on next debounce)

### 3. Offline Queue — new `rv_inspect_offline_queue` localStorage key

Format: `[{ op: 'upsert'|'delete', name: string, state: object|null, ts: number }]`

- Coalesced by `name` (last-write-wins for same save name)
- `enqueueOfflineOp(op, name, state)` — adds/replaces entry
- `flushOfflineQueue()` — processes oldest-first when back online, removes on success

Triggers for flush:
- `window 'online'` event
- After successful auth
- At startup if `ONLINE` and queue is non-empty

### 4. Named Saves

| Function | Current | New |
|---|---|---|
| `saveNew()` | localStorage + push to cloud | Cloud first, cache on success. Offline: cache + queue. |
| `loadSave()` | Reads localStorage | `ONLINE`: fetch from Supabase (fallback to cache). Otherwise: cache. |
| `deleteSave()` | localStorage + cloud delete | Cloud first, then remove from cache. Offline: cache + queue delete. |

### 5. Save Modal — unified list

- `ONLINE`: Fetch all saves from Supabase as the single list (no "Local" vs "Cloud Only" split)
- `OFFLINE`: Show cached saves with an "offline" badge
- `LOCAL_ONLY`/`UNAUTHED`: Show localStorage saves (current behavior)

Remove `loadCloudSavesIntoModal()` and `loadCloudSave()` — merged into unified flow.

### 6. Cache Metadata — new `rv_inspect_cache_meta` localStorage key

```js
{ lastCloudSyncTs: number, autosaveCloudTs: string|null }
```

Replaces the in-memory `lastSyncTime` variable. Persists across reloads so conflict detection works after restart.

### 7. Sync Status Indicator

Add two new states to the existing sync dot:
- `offline` — grey pulsing (device is offline)
- `queued` — yellow (offline queue has pending items)

### 8. Migration (`migrateToCloudFirst()`)

One-time, detected by new key `rv_inspect_version`:
1. If `rv_inspect_version` exists → skip
2. Read existing localStorage data
3. If Supabase configured + authed → push all to cloud
4. Keep localStorage data as initial cache
5. Set `rv_inspect_version = 2`

Non-destructive — nothing is deleted.

## Function Change Summary

| Function | Action |
|---|---|
| `autoSave()` | Rewrite: cloud-first write, cache on success, queue on failure |
| `autoLoad()` | **Remove** → replaced by `initializeState()` |
| `autoSaveLocal()` | Rename to `writeLocalCache()`, same behavior |
| `getSaves()` | Rename to `getCachedSaves()` |
| `debouncedCloudSync()` | Rewrite: primary debounced write (not secondary sync) |
| `cloudSync()` | Rewrite: primary write + cache update on success |
| `reconcileOnLoad()` | **Remove** → merged into `initializeState()` |
| `loadCloudSave()` | **Remove** → merged into `loadSave()` |
| `loadCloudSavesIntoModal()` | **Remove** → merged into `showSaveModal()` |
| `deleteCloudOnlySave()` | **Remove** → merged into `deleteSave()` |
| `pushSaveToCloud()` | Rename to `cloudUpsert()`, add offline queue fallback |
| `deleteSaveFromCloud()` | Rename to `cloudDelete()`, add offline queue fallback |
| `saveNew()` | Rewrite: cloud-first |
| `loadSave()` | Rewrite: cloud-first with cache fallback |
| `deleteSave()` | Rewrite: cloud-first |
| `showSaveModal()` | Rewrite: unified list |
| `cloudSyncNow()` | Keep, also flushes offline queue |
| **NEW** `getMode()` | Returns connectivity mode |
| **NEW** `initializeState()` | Cache-first boot, async cloud refresh |
| **NEW** `enqueueOfflineOp()` | Add to offline queue |
| **NEW** `flushOfflineQueue()` | Process queue when online |
| **NEW** `migrateToCloudFirst()` | One-time data migration |
| **NEW** `writeLocalCache()` | Renamed autoSaveLocal |

## Init Sequence (replaces current lines 1428-1444)

```
initializeState()
  → read localStorage cache → state
  → renderSections() + loadInfoFields() + updateBadge()
  → openPhotoDB() + loadAllThumbs()
  → migrateToCloudFirst()
  → initSupabase()
    → onAuthStateChange:
      → flushOfflineQueue()
      → refreshFromCloud() → re-render if changed
```

## Files Modified

- **`app.js`** — all persistence logic (~lines 900-1445), plus new functions
- **`index.html`** — minor CSS additions for `offline`/`queued` sync dot states
- **`service-worker.js`** — bump `CACHE_NAME`
- **`CLAUDE.md`** / **`README.md`** — update architecture docs

## Photo Cloud Storage (Supabase Storage) — IMPLEMENTED

Photos are synced via Supabase Storage bucket `inspection-photos`.
Path: `{user_id}/{inspection_name}/{item_key}_{photo_index}.jpg`
Images resized to 800px max, JPEG quality 0.6 before upload.
IndexedDB remains local cache. See `app.js` photo cloud sync section.

## What Stays the Same

- BYO Supabase model (user provides URL + key, stored in localStorage)
- Auth via email magic link
- Supabase JS client via CDN
- `LOCAL_ONLY` mode behavior is identical to current app (no regressions for users without Supabase)
- HTML structure, element IDs, onclick handlers all unchanged

## Verification

1. **No Supabase configured** — app works exactly as before (localStorage only)
2. **Online + authed** — make changes, check Supabase table updates within 2s, localStorage also updated as cache
3. **Go offline** (DevTools Network tab) — make changes, verify localStorage updates, check `rv_inspect_offline_queue` has entries
4. **Come back online** — verify queue flushes, Supabase gets the changes
5. **Two devices** — sign in on both, change on device A, reload device B — should see changes
6. **Kill tab while offline, reopen online** — should boot from cache instantly, then sync queued changes
7. **Save modal** — shows single unified list from cloud when online
