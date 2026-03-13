# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Self-contained PWA for pre-purchase camper trailer inspections. Users can name each checklist (e.g. "2021 Micro Minnie 1708FB") via a field in the header. No build tools, no dependencies, no framework — just static files served directly.

## Running Locally

```bash
python3 -m http.server 8080
# Open http://localhost:8080
```

A service worker (`service-worker.js`) caches assets for offline use. **Bump `CACHE_NAME` in `service-worker.js`** whenever you change `index.html` or `manifest.json`, otherwise returning users will see stale cached versions.

## Architecture

Everything lives in a single `index.html` file with inline CSS and JS:

- **CSS** (top of file): Dark theme with CSS custom properties in `:root`. Uses `env(safe-area-inset-*)` for iOS notch/home-bar safe areas.
- **`SECTIONS` array** (in `<script>`): The checklist data model — 23 sections, each with items that can be plain strings or objects with `{text, critical, input, inputLabel}` properties. This is the source of truth for all checklist content.
- **State object**: `{ info, checks, notes, inputs, summary }` — serialized to localStorage for auto-save and named saves.
- **Check cycle**: Each item cycles through `unchecked → ok → issue → na` on tap.
- **Two views**: Checklist (main) and Summary, switched via bottom nav tabs.
- **Save/load modal**: Named saves stored under `rv_inspect_saves` localStorage key; auto-save under `rv_inspect_autosave`.

Supporting files:
- `manifest.json` — PWA manifest for home screen install
- `service-worker.js` — Service worker with cache-first and network-first strategies
- `Micro Minnie Inspection Checklist.pdf` — Source PDF the original checklist was derived from

## Cloud Sync (Supabase)

Optional cloud persistence via user-provided Supabase project (BYO model — no shared backend).

- **Offline-first**: localStorage is always the source of truth. Supabase is a secondary sync layer.
- **Auth**: Email magic link via Supabase Auth.
- **Schema**: Single `inspections` table with JSONB `state` column. One row per named save per user. Autosave uses reserved name `__autosave__`.
- **Sync**: Debounced (2s) upserts on every state change. On load, cloud and local are reconciled with conflict detection.
- **Config**: Stored in `rv_inspect_supabase` localStorage key (`{ url, key }`).
- **Service worker**: CDN script (`@supabase/supabase-js@2`) uses network-first strategy; Supabase API calls bypass the cache entirely.

## Key Conventions

- All commits must use author: `dbulnes <bulnes.david@gmail.com>`
- No build step — edit files directly and test in browser
- Only external dependency: Supabase JS client via CDN (for optional cloud sync)
- Mobile-first: test changes at phone viewport widths
