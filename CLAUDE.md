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
│   └── rv-inspection-checklist.md              # Markdown checklist reference
├── scripts/
│   └── setup.sql                               # Supabase schema setup
├── supabase/functions/
│   └── generate-pdf/index.ts   # Edge Function: PDF generation via pdf-lib
├── tests/
│   ├── checklist-data.test.js  # Validates SECTIONS structure and content
│   ├── structure.test.js       # Validates file structure, references, PWA config
│   └── lint.js                 # Basic HTML/JS/CSS lint checks
├── .github/workflows/
│   └── ci.yml                  # CI (test + lint) and GitHub Pages deploy
├── index.html                  # App markup (references css/ and js/)
├── manifest.json               # PWA manifest
├── service-worker.js           # SW with cache strategies (must stay at root for scope)
├── version.txt                 # Deploy version stamp (CI-generated, used for auto-refresh)
└── package.json                # Test scripts (ESM, no runtime dependencies)
```

## Running Locally

```bash
npx serve .
# Open http://localhost:3000
```

A service worker (`service-worker.js`) caches assets for offline use. `CACHE_NAME` is automatically replaced with a content hash during CI deploy — no manual bumping needed. Run `npm run cache-hash` to see the current hash locally.

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
- **State object**: `{ info, checks, notes, inputs, summary, by }` — serialized to localStorage for auto-save and named saves. The `by` object maps item keys to display names for attribution on shared checklists.
- **Photos**: Stored in IndexedDB (`rv_inspect_photos`) as local cache, synced to Supabase Storage bucket `inspection-photos`. Resized to max 800px JPEG quality 0.6.
- **VIN scanner**: Uses `BarcodeDetector` API with a WASM polyfill for iOS (loaded on demand from CDN).
- **QR scanner**: Uses `jsQR` library (pure JS, loaded on demand from CDN) for device pairing QR codes. Images are downscaled before decoding for reliability with high-res camera photos.
- **Check cycle**: Each item cycles through `unchecked → ok → issue → na` on tap.
- **Save/load**: Named saves in `rv_inspect_saves` localStorage key. `currentSaveName` tracks the active save so auto-save updates it too.

## Cloud Sync (Supabase)

Optional cloud persistence via user-provided Supabase project (BYO model — no shared backend).

- **Offline-first**: localStorage is always the source of truth. Supabase is a secondary sync layer.
- **Auth**: Email magic link via Supabase Auth.
- **Schema**: `inspections` table (JSONB state, one row per named save per user) + `inspection-photos` Storage bucket + `inspection-pdfs` Storage bucket + `device_links` table (short-lived pairing codes).
- **PDF export**: Server-side via Supabase Edge Function (`generate-pdf`). Uses `pdf-lib` to build PDF from structured data, saves to `inspection-pdfs` Storage bucket, returns signed URL + PDF bytes. On mobile, the client fetches from the signed URL (proper MIME type from Storage) and uses Web Share API for native save/share. Falls back to client-side HTML preview if Supabase is not connected.
- **Photo sync**: Photos uploaded to Supabase Storage on capture, downloaded on save load. Path: `{inspection_name}/{item_key}_{index}.jpg`.
- **Sync**: Debounced (2s) upserts on every state change. Newest timestamp always wins — pushes check cloud `updated_at` before overwriting, pulls auto-accept cloud-newer data. Attribution (`by`) fields are merged (union) during sync so no device's stamps are lost.
- **Realtime**: Subscribes to Supabase Realtime (postgres_changes) on the `inspections` table so edits on one device appear on others instantly without manual refresh. Ignores echoes from the local device's own debounced pushes.
- **Attribution**: Each check/note/input stamps `state.by[key]` with the user's display name. Attribution labels appear next to items when 2+ contributors exist. Display name is required on sign-in and device pairing (cannot be skipped). On linked devices, "Signed in as" is shown in App Info rather than prominently.
- **Config**: Stored in `rv_inspect_supabase` localStorage key (`{ url, key }`).
- **Device pairing**: Device A generates an 8-char code (stored in `device_links` with 5-min TTL). Device B scans QR or uploads QR image to authenticate via refresh token. QR URL includes `sb_url` and `sb_key` params so Device B auto-configures Supabase. Auto-syncs immediately after pairing. QR rendered via `qrcode-generator`, decoded via `jsQR` (both loaded on demand from CDN).
- **Service worker**: CDN scripts (Supabase JS, barcode polyfill, qrcode-generator, jsQR) use network-first strategy; Supabase API calls and `version.txt` bypass the cache entirely.
- **Auto-refresh**: CI writes `version.txt` with the deployed version. The page polls it every 30s and on foreground resume; if it differs from `APP_VERSION`, the app force-refreshes (clears caches, unregisters SW, reloads). A manual Force Refresh button is also available under App Info.

## Key Conventions

- All commits must use author: `dbulnes <d@vidbuln.es>`
- No build step — edit files directly and test in browser
- When adding/moving files: update service-worker.js ASSETS array (CACHE_NAME is auto-stamped by CI)
- External dependencies (all via CDN): Supabase JS client, barcode-detector polyfill, qrcode-generator, jsQR (all loaded on demand except Supabase JS)
- Mobile-first: test changes at phone viewport widths
