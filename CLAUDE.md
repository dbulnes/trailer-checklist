# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RV Inspect — self-contained PWA for pre-purchase RV and camper trailer inspections. Users can name each checklist (e.g. "2021 Micro Minnie 1708FB") via a field in the header. No build tools, no framework — just static files served directly. Deployed via GitHub Pages.

## Project Structure

```
├── css/
│   └── styles.css              # All app styles (extracted from index.html)
├── js/
│   ├── app.js                  # Core app logic: state, rendering, interactions, photos, VIN scanner
│   ├── checklist-data.js       # SECTIONS array: checklist content source of truth
│   └── cloud.js                # Save/load, Supabase sync, auth, init sequence
├── docs/
│   ├── Micro Minnie Inspection Checklist.pdf   # Source PDF
│   ├── rv-inspection-checklist.md              # Markdown checklist reference
│   └── setup.sql                               # Supabase schema setup
├── tests/
│   ├── checklist-data.test.js  # Validates SECTIONS structure and content
│   ├── structure.test.js       # Validates file structure, references, PWA config
│   └── lint.js                 # Basic HTML/JS/CSS lint checks
├── .github/workflows/
│   └── ci.yml                  # CI (test + lint) and GitHub Pages deploy
├── index.html                  # App markup (references css/ and js/)
├── manifest.json               # PWA manifest
├── service-worker.js           # SW with cache strategies (must stay at root for scope)
└── package.json                # Test scripts (ESM, no runtime dependencies)
```

## Running Locally

```bash
npx serve .
# Open http://localhost:3000
```

A service worker (`service-worker.js`) caches assets for offline use. **Bump `CACHE_NAME` in `service-worker.js`** whenever you change any `.js`, `.css`, or `.html` file, otherwise returning users will see stale cached versions.

## Testing

Tests use Node.js built-in test runner (no dependencies needed):

```bash
npm test        # Run unit/structure tests
npm run lint    # Run lint checks
```

Tests validate: checklist data integrity, project file structure, index.html references, service worker asset list, manifest.json fields, JS syntax, and HTML structure.

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`) runs on push/PR to main:
1. **test** — `npm test` + `npm run lint`
2. **deploy** — Deploys to GitHub Pages on main branch (only after tests pass)

## Architecture

`index.html` has markup only. CSS is in `css/styles.css`. JavaScript is split across three files in `js/`:

- **`js/checklist-data.js`** — The `SECTIONS` array: 23 sections, each with items that can be plain strings or objects with `{text, critical, input, inputLabel}` properties.
- **`js/app.js`** — Core app logic: state management, rendering, interactions (tap cycle, notes, inputs), info fields, photos (IndexedDB + Supabase Storage sync), VIN scanner, summary view.
- **`js/cloud.js`** — Save/load system, Supabase cloud sync, auth, last-write-wins reconciliation, init sequence.

Key subsystems:
- **State object**: `{ info, checks, notes, inputs, summary }` — serialized to localStorage for auto-save and named saves.
- **Photos**: Stored in IndexedDB (`rv_inspect_photos`) as local cache, synced to Supabase Storage bucket `inspection-photos`. Resized to max 800px JPEG quality 0.6.
- **VIN scanner**: Uses `BarcodeDetector` API with a WASM polyfill for iOS (loaded on demand from CDN).
- **Check cycle**: Each item cycles through `unchecked → ok → issue → na` on tap.
- **Save/load**: Named saves in `rv_inspect_saves` localStorage key; auto-save in `rv_inspect_autosave`. `currentSaveName` tracks the active save so auto-save updates it too.

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

- All commits must use author: `dbulnes <d@vidbuln.es>`
- No build step — edit files directly and test in browser
- When adding/moving files: update service-worker.js ASSETS array and bump CACHE_NAME
- External dependencies (all via CDN): Supabase JS client, barcode-detector polyfill, qrcode-generator (all loaded on demand except Supabase JS)
- Mobile-first: test changes at phone viewport widths
