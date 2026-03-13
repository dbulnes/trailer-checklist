# RV Inspect

A mobile-friendly progressive web app (PWA) for conducting pre-purchase inspections of RVs and camper trailers. Name each checklist to match the unit you're inspecting.

## Features

- **23 inspection sections** covering exterior, interior, plumbing, electrical, propane, appliances, and more
- **Custom checklist name** — name each inspection (e.g. "2021 Micro Minnie 1708FB")
- **Photo attachments** — attach photos to any checklist item via camera or gallery, synced to Supabase Storage
- **VIN barcode scanner** — scan the VIN barcode with your phone camera (works on iOS and Android)
- **Tap to cycle** each item: unchecked → ✓ pass → ✗ issue → — N/A
- **Notes and measurements** on any item (temperatures, voltages, tire pressures, etc.)
- **Auto-save** — progress saves automatically to your device and to the current named save
- **Device pairing** — link another device by code or QR scan, no email needed on the second device
- **Named saves** — save, load, and delete multiple inspections
- **Summary view** — see pass/issue/pending counts, all flagged issues, set overall condition and recommended action
- **Export** — share or copy a full text summary of findings
- **Offline support** — works without internet via service worker
- **Install to home screen** — runs as a standalone app on iOS and Android

## Install on iPhone

1. Open the GitHub Pages URL in **Safari**
2. Tap the **Share button** (square with arrow)
3. Tap **"Add to Home Screen"**
4. Done — launches fullscreen like a native app

## Development Setup

### Prerequisites

- **Node.js** >= 18 (for running tests; the app itself has no build step)
- Any static file server (Python, `npx serve`, etc.)

### Run Locally

```bash
# Serve the app
python3 -m http.server 8080
# Open http://localhost:8080
```

### Run Tests

```bash
npm test        # Unit and structure tests (Node.js built-in test runner)
npm run lint    # HTML, JS, and CSS lint checks
```

No `npm install` needed — tests use only Node.js built-in modules (no dependencies).

### Project Structure

```
├── css/styles.css              # All app styles
├── js/
│   ├── app.js                  # Core app logic
│   ├── checklist-data.js       # Checklist content (SECTIONS array)
│   └── cloud.js                # Save/load, Supabase sync, auth
├── docs/                       # Reference docs and SQL setup
├── tests/                      # Tests (Node.js built-in test runner)
├── .github/workflows/ci.yml    # CI + GitHub Pages deploy
├── index.html                  # App markup
├── manifest.json               # PWA manifest
└── service-worker.js           # Offline caching (must be at root for scope)
```

### CI/CD

Push to `main` triggers GitHub Actions: tests run first, then the site deploys to GitHub Pages.

## Cloud Sync (Optional)

You can optionally sync your inspections across devices using [Supabase](https://supabase.com) (free tier works fine).

### Setup

1. Create a free Supabase project at https://supabase.com
2. In your Supabase dashboard, go to **SQL Editor** and run the contents of [`setup.sql`](docs/setup.sql) — this creates all tables, storage, and security policies in one step
3. In Supabase **Authentication > Settings**, make sure Email auth is enabled (magic link is on by default)
4. In Supabase **Authentication > URL Configuration**:
   - Set **Site URL** to your app URL (e.g. `https://yourusername.github.io/trailer-checklist/`)
   - Add the same URL to **Redirect URLs**
   - For local dev, also add `http://localhost:8080` to Redirect URLs
5. Open the app, tap the **☁️ button**, expand **Supabase Setup**, and enter:
   - Your **Project URL** (e.g. `https://xyz.supabase.co`) — found in Settings > API
   - Your **Publishable key** (starts with `sb_publishable_...`) — found in Settings > API
6. Click **Connect**, then sign in with your email via magic link
7. Click the magic link in your email — you'll be redirected back to the app and signed in automatically

Your inspections will now sync across any device where you sign in.

### Device Pairing (Link Another Device)

Instead of signing into email on every device, you can pair a second device using a QR code:

1. On **Device A** (already signed in): tap ☁️ → **Link Another Device** → a QR code is shown (valid for 5 minutes)
   - Optionally check **"Allow linked device to pair others"** to let Device B generate its own pairing codes
2. On **Device B**: tap ☁️ → **Scan QR Code** (camera) or **Upload QR Image** (screenshot) — this auto-configures Supabase and signs in
3. Device B is now signed in as the same user — no email or manual setup required
4. By default, Device B **cannot** pair additional devices unless Device A granted that permission

### How it works

- **Offline-first**: localStorage is always the primary store. Cloud sync is a secondary layer.
- **Auto-sync**: Changes are debounced and pushed to Supabase every 2 seconds when online.
- **Photo sync**: Photos are uploaded to a Supabase Storage bucket (`inspection-photos`) on capture, and downloaded when loading a save from another device.
- **Conflict detection**: If the cloud has a newer version (e.g. from another device), you'll be prompted to load it or keep your local version.
- **Named saves**: All named saves sync bidirectionally between local and cloud. The save/load modal shows both local and cloud-only saves, with a ☁️ badge on saves that exist in both.
- **Loading cloud saves**: Cloud-only inspections (e.g. from another device) appear in the save/load modal under "Cloud Only" and can be loaded with one tap.
- **Privacy**: Your data lives in YOUR Supabase project. No one else has access.

## Based On

The default checklist items are based on the included [Micro Minnie Inspection Checklist.pdf](docs/Micro%20Minnie%20Inspection%20Checklist.pdf), a comprehensive pre-purchase inspection guide that covers most RV and camper trailer systems.

## License

MIT
