-- The Prayer App: database and storage setup.
-- Paste this whole file into Supabase → SQL Editor → New query, then press Run.
-- Safe to run more than once.

-- ─── Prayers ────────────────────────────────────────────────────────────────
-- One prayer per calendar date. Old prayers are kept (never deleted by the app)
-- so a paid "past prayers" archive can be switched on later.
create table if not exists public.prayers (
  id           uuid primary key default gen_random_uuid(),
  prayer_date  date not null unique,
  title        text not null check (char_length(title) between 1 and 120),
  theme        text not null default '' check (char_length(theme) <= 40),
  description  text not null default '' check (char_length(description) <= 400),
  audio_path   text not null,
  duration_sec integer,
  published    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists prayers_date_published_idx on public.prayers (prayer_date) where published;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists prayers_touch on public.prayers;
create trigger prayers_touch before update on public.prayers
  for each row execute function public.touch_updated_at();

-- ─── Admins ─────────────────────────────────────────────────────────────────
-- Only people listed here can post prayers. Listeners never sign in.
create table if not exists public.admins (
  email      text primary key,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admins
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- ─── Row-level security ─────────────────────────────────────────────────────
alter table public.prayers enable row level security;
alter table public.admins  enable row level security;

-- Listeners (anyone with the app) can read published prayers from roughly the
-- current week only. The 8-day window covers every time zone's "this week".
-- When the paid archive arrives, a second policy will grant subscribers more.
drop policy if exists "listeners read this week" on public.prayers;
create policy "listeners read this week" on public.prayers
  for select to anon, authenticated
  using (published and prayer_date between current_date - 7 and current_date + 1);

drop policy if exists "admins read all" on public.prayers;
create policy "admins read all" on public.prayers
  for select to authenticated using (public.is_admin());

drop policy if exists "admins write" on public.prayers;
create policy "admins write" on public.prayers
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins see themselves" on public.admins;
create policy "admins see themselves" on public.admins
  for select to authenticated using (public.is_admin());

-- ─── Audio storage ──────────────────────────────────────────────────────────
-- Public read so the app can stream audio; only admins can upload or replace.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'prayer-audio', 'prayer-audio', true, 52428800,
  array['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/wav', 'audio/x-wav']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "admins upload audio" on storage.objects;
create policy "admins upload audio" on storage.objects
  for insert to authenticated with check (bucket_id = 'prayer-audio' and public.is_admin());

drop policy if exists "admins change audio" on storage.objects;
create policy "admins change audio" on storage.objects
  for update to authenticated using (bucket_id = 'prayer-audio' and public.is_admin());

drop policy if exists "admins remove audio" on storage.objects;
create policy "admins remove audio" on storage.objects
  for delete to authenticated using (bucket_id = 'prayer-audio' and public.is_admin());

-- ─── Your admin account ─────────────────────────────────────────────────────
-- Replace the address with the email you use for the upload page, then run.
insert into public.admins (email) values ('elumacharles@gmail.com')
on conflict (email) do nothing;
