# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RV Inspect — self-contained PWA for pre-purchase RV and camper trailer inspections. Users can name each checklist (e.g. "2021 Micro Minnie 1708FB") via a field in the header. No build tools, no dependencies, no framework — just static files served directly.

## Running Locally

```bash
python3 -m http.server 8080
# Open http://localhost:8080
```

A service worker (`service-worker.js`) caches assets for offline use. **Bump `CACHE_NAME` in `service-worker.js`** whenever you change any `.js` or `.html` file, otherwise returning users will see stale cached versions.

## Architecture

`index.html` has markup + CSS. JavaScript is split across three files:

- **`checklist-data.js`** — The `SECTIONS` array: 23 sections, each with items that can be plain strings or objects with `{text, critical, input, inputLabel}` properties. Source of truth for all checklist content.
- **`app.js`** — Core app logic: state management, rendering, interactions (tap cycle, notes, inputs), info fields, photos (IndexedDB + Supabase Storage sync), VIN scanner, summary view.
- **`cloud.js`** — Save/load system, Supabase cloud sync, auth, last-write-wins reconciliation, init sequence.

Key subsystems:
- **State object**: `{ info, checks, notes, inputs, summary }` — serialized to localStorage for auto-save and named saves.
- **Photos**: Stored in IndexedDB (`rv_inspect_photos`) as local cache, synced to Supabase Storage bucket `inspection-photos`. Resized to max 800px JPEG quality 0.6.
- **VIN scanner**: Uses `BarcodeDetector` API with a WASM polyfill for iOS (loaded on demand from CDN).
- **Check cycle**: Each item cycles through `unchecked → ok → issue → na` on tap.
- **Save/load**: Named saves in `rv_inspect_saves` localStorage key; auto-save in `rv_inspect_autosave`. `currentSaveName` tracks the active save so auto-save updates it too.

Supporting files:
- `manifest.json` — PWA manifest for home screen install
- `service-worker.js` — Service worker with cache-first and network-first strategies
- `Micro Minnie Inspection Checklist.pdf` — Source PDF the original checklist was derived from

## Cloud Sync (Supabase)

Optional cloud persistence via user-provided Supabase project (BYO model — no shared backend).

- **Offline-first**: localStorage is always the source of truth. Supabase is a secondary sync layer.
- **Auth**: Email magic link via Supabase Auth.
- **Schema**: `inspections` table (JSONB state, one row per named save per user) + `inspection-photos` Storage bucket + `device_links` table (short-lived pairing codes).
- **Photo sync**: Photos uploaded to Supabase Storage on capture, downloaded on save load. Path: `{user_id}/{inspection_name}/{item_key}_{index}.jpg`.
- **Sync**: Debounced (2s) upserts on every state change. Newest timestamp always wins — pushes check cloud `updated_at` before overwriting, pulls auto-accept cloud-newer data.
- **Config**: Stored in `rv_inspect_supabase` localStorage key (`{ url, key }`).
- **Device pairing**: Device A generates an 8-char code (stored in `device_links` with 5-min TTL). Device B enters the code or scans a QR to authenticate via refresh token. QR URL includes `sb_url` and `sb_key` params so Device B auto-configures Supabase. QR rendered via `qrcode-generator` library loaded on demand.
- **Service worker**: CDN scripts (Supabase JS, barcode polyfill, qrcode-generator) use network-first strategy; Supabase API calls bypass the cache entirely. On activation, SW posts `SW_UPDATED` message to all clients; the page auto-reloads if it was controlled by a previous SW (iOS PWA fix).

## Key Conventions

- All commits must use author: `dbulnes <bulnes.david@gmail.com>`
- No build step — edit files directly and test in browser
- External dependencies (all via CDN): Supabase JS client, barcode-detector polyfill, qrcode-generator (all loaded on demand except Supabase JS)
- Mobile-first: test changes at phone viewport widths
