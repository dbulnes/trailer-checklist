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

## Run Locally

```bash
# Any static file server works
python3 -m http.server 8080
# Open http://localhost:8080
```

## Cloud Sync (Optional)

You can optionally sync your inspections across devices using [Supabase](https://supabase.com) (free tier works fine).

### Setup

1. Create a free Supabase project at https://supabase.com
2. In your Supabase dashboard, go to **SQL Editor** and run this migration:

```sql
create table inspections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  state jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, name)
);

alter table inspections enable row level security;

create policy "Users CRUD own inspections" on inspections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Auto-update updated_at on changes
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger inspections_updated_at
  before update on inspections
  for each row execute function update_updated_at();
```

3. **(Optional — for photo sync)** Run this to create the storage bucket for inspection photos:

```sql
-- Create a private storage bucket for inspection photos
insert into storage.buckets (id, name, public) values ('inspection-photos', 'inspection-photos', false);

-- RLS: users can only access photos in their own folder
create policy "Users manage own photos" on storage.objects
  for all using (bucket_id = 'inspection-photos' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'inspection-photos' and auth.uid()::text = (storage.foldername(name))[1]);
```

4. In Supabase **Authentication > Settings**, make sure Email auth is enabled (magic link is on by default)
5. In Supabase **Authentication > URL Configuration**:
   - Set **Site URL** to your app URL (e.g. `https://yourusername.github.io/trailer-checklist/`)
   - Add the same URL to **Redirect URLs**
   - For local dev, also add `http://localhost:8080` to Redirect URLs
6. Open the app, tap the **☁️ button**, expand **Supabase Setup**, and enter:
   - Your **Project URL** (e.g. `https://xyz.supabase.co`) — found in Settings > API
   - Your **Publishable key** (starts with `sb_publishable_...`) — found in Settings > API
7. Click **Connect**, then sign in with your email via magic link
8. Click the magic link in your email — you'll be redirected back to the app and signed in automatically

Your inspections will now sync across any device where you sign in.

### How it works

- **Offline-first**: localStorage is always the primary store. Cloud sync is a secondary layer.
- **Auto-sync**: Changes are debounced and pushed to Supabase every 2 seconds when online.
- **Photo sync**: Photos are uploaded to a Supabase Storage bucket (`inspection-photos`) on capture, and downloaded when loading a save from another device.
- **Conflict detection**: If the cloud has a newer version (e.g. from another device), you'll be prompted to load it or keep your local version.
- **Named saves**: All named saves sync bidirectionally between local and cloud. The save/load modal shows both local and cloud-only saves, with a ☁️ badge on saves that exist in both.
- **Loading cloud saves**: Cloud-only inspections (e.g. from another device) appear in the save/load modal under "Cloud Only" and can be loaded with one tap.
- **Privacy**: Your data lives in YOUR Supabase project. No one else has access.

## Based On

The default checklist items are based on the included [Micro Minnie Inspection Checklist.pdf](Micro%20Minnie%20Inspection%20Checklist.pdf), a comprehensive pre-purchase inspection guide that covers most RV and camper trailer systems.

## License

MIT
