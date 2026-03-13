-- RV Inspect — Supabase Setup
-- Run this entire script in your Supabase SQL Editor (https://supabase.com/dashboard > SQL Editor)
-- It creates all tables, policies, storage, and triggers needed for cloud sync.

-- ============================================================
-- 1. Inspections table (stores checklist state as JSONB)
-- ============================================================
create table if not exists inspections (
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

-- ============================================================
-- 2. Photo storage bucket
-- ============================================================
insert into storage.buckets (id, name, public)
values ('inspection-photos', 'inspection-photos', false)
on conflict (id) do nothing;

-- RLS: users can only access photos in their own folder
create policy "Users manage own photos" on storage.objects
  for all using (bucket_id = 'inspection-photos' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'inspection-photos' and auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================================
-- 3. Device pairing (link another device via QR code)
-- ============================================================
create table if not exists device_links (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  refresh_token text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  claimed boolean not null default false,
  can_pair boolean not null default false
);

create index if not exists idx_device_links_code on device_links(code);
alter table device_links enable row level security;

-- Authenticated users can create their own codes
create policy "Users create own device links" on device_links
  for insert with check (auth.uid() = user_id);

-- Anyone (including unauthenticated Device B) can read unexpired unclaimed codes
create policy "Anyone can read valid device link by code" on device_links
  for select using (claimed = false and expires_at > now());

-- Authenticated users can mark their own codes as claimed
create policy "Users update own device links" on device_links
  for update using (auth.uid() = user_id);

-- Authenticated users can delete their own codes
create policy "Users delete own device links" on device_links
  for delete using (auth.uid() = user_id);

-- Clean up expired rows on each insert
create or replace function cleanup_expired_device_links()
returns trigger as $$
begin
  delete from device_links where expires_at < now();
  return new;
end;
$$ language plpgsql;

create trigger device_links_cleanup
  after insert on device_links for each row execute function cleanup_expired_device_links();
