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

-- Enable Realtime so changes propagate to other devices instantly
alter publication supabase_realtime add table inspections;

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

-- RLS: any authenticated user can manage photos (paths are per-checklist, not per-user)
create policy "Authenticated users manage photos" on storage.objects
  for all using (bucket_id = 'inspection-photos' and auth.role() = 'authenticated')
  with check (bucket_id = 'inspection-photos' and auth.role() = 'authenticated');

-- ============================================================
-- 3. PDF storage bucket
-- ============================================================
insert into storage.buckets (id, name, public)
values ('inspection-pdfs', 'inspection-pdfs', false)
on conflict (id) do nothing;

-- PDFs are uploaded via service role (bypasses RLS); this policy allows authenticated read access
create policy "Authenticated users read PDFs" on storage.objects
  for select using (bucket_id = 'inspection-pdfs' and auth.role() = 'authenticated');

-- ============================================================
-- 4. Device pairing (link another device via QR code)
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

-- Authenticated users can mark their own codes as claimed
create policy "Users update own device links" on device_links
  for update using (auth.uid() = user_id);

-- Claim a pairing code atomically: validates expiry, marks claimed, returns token.
-- SECURITY DEFINER bypasses RLS so the refresh_token is never exposed via direct SELECT.
create or replace function claim_device_link(link_code text)
returns table(refresh_token text, user_id uuid, can_pair boolean)
language plpgsql security definer as $$
declare
  row device_links%rowtype;
begin
  select * into row from device_links d
    where d.code = upper(link_code) and d.claimed = false and d.expires_at > now()
    for update;
  if not found then
    raise exception 'Invalid or expired code';
  end if;
  update device_links set claimed = true where id = row.id;
  return query select row.refresh_token, row.user_id, row.can_pair;
end;
$$;

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
