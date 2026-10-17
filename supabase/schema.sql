-- The Prayer App: database, security rules and audio storage.
-- The pipeline applies this file automatically on every update (it is safe to run repeatedly).
-- It can also be pasted into Supabase → SQL Editor → New query → Run.
--
-- People
--   Listeners          no account; can read approved prayers from the last two weeks.
--   Prayer Warriors    record and submit prayers; a submission waits for approval.
--   Administrators     manage Prayer Warriors and approve or reject prayers. They never post prayers.

-- ═══ Tables ═════════════════════════════════════════════════════════════════

-- One prayer per calendar date. Prayers are never deleted by the apps once approved,
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

-- Review workflow. Prayers that existed before reviews were introduced count as approved.
alter table public.prayers add column if not exists status text not null default 'approved'
  check (status in ('pending', 'approved', 'rejected'));
alter table public.prayers alter column status set default 'pending';
alter table public.prayers add column if not exists created_by  uuid references auth.users (id) on delete set null;
alter table public.prayers add column if not exists reviewed_by uuid references auth.users (id) on delete set null;
alter table public.prayers add column if not exists reviewed_at timestamptz;
alter table public.prayers add column if not exists review_note text not null default ''
  check (char_length(review_note) <= 400);

create index if not exists prayers_date_published_idx on public.prayers (prayer_date) where published;
create index if not exists prayers_status_idx on public.prayers (status, prayer_date);

-- Everyone who can sign in: administrators and Prayer Warriors.
create table if not exists public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  email           text not null,
  full_name       text not null default '' check (char_length(full_name) <= 80),
  role            text not null default 'warrior' check (role in ('admin', 'warrior')),
  status          text not null default 'active' check (status in ('active', 'removed')),
  assigned_days   smallint[] not null default '{}',   -- 0 = Sunday … 6 = Saturday
  invited_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  removed_at      timestamptz,
  last_sign_in_at timestamptz
);

-- What people did, for the Admin Console's activity view.
create table if not exists public.activity (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  actor_id     uuid,
  actor_name   text not null default '',
  actor_role   text not null default '',
  action       text not null,
  prayer_date  date,
  subject_id   uuid,
  subject_name text not null default '',
  details      text not null default ''
);
create index if not exists activity_created_idx on public.activity (created_at desc);
create index if not exists activity_actor_idx on public.activity (actor_id, created_at desc);

-- Seed list for administrators: anyone whose email is here becomes an administrator
-- once they have a sign-in. Add a row to make someone an administrator.
create table if not exists public.admins (
  email      text primary key,
  created_at timestamptz not null default now()
);
insert into public.admins (email) values ('elumacharles@gmail.com') on conflict (email) do nothing;

insert into public.profiles (id, email, role)
select u.id, u.email, 'admin'
from auth.users u
join public.admins a on lower(a.email) = lower(u.email)
on conflict (id) do update set role = 'admin';

-- ═══ Helper functions ═══════════════════════════════════════════════════════

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'active'
  );
$$;

create or replace function public.is_warrior() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'warrior' and status = 'active'
  );
$$;

-- Can the signed-in Prayer Warrior post a prayer for this date?
--   * the date is no more than a day in the past (time-zone slack),
--   * the weekday is assigned to them, or not assigned to any active warrior, and
--   * nobody else already has a prayer on that date.
create or replace function public.can_post(d date) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_warrior()
    and d >= current_date - 1
    and (
      not exists (
        select 1 from public.profiles p
        where p.role = 'warrior' and p.status = 'active'
          and extract(dow from d)::smallint = any (p.assigned_days)
      )
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and extract(dow from d)::smallint = any (p.assigned_days)
      )
    )
    and not exists (
      select 1 from public.prayers x
      where x.prayer_date = d and x.created_by is distinct from auth.uid()
    );
$$;

-- Names and assigned days of active Prayer Warriors (no emails), for the warriors' week board.
create or replace function public.team_directory()
returns table (id uuid, full_name text, assigned_days smallint[])
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.assigned_days
  from public.profiles p
  where p.role = 'warrior' and p.status = 'active'
    and (public.is_warrior() or public.is_admin());
$$;

create or replace function public.log_activity(
  p_action text, p_prayer_date date default null, p_subject_id uuid default null,
  p_subject_name text default '', p_details text default '', p_actor uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := coalesce(p_actor, auth.uid());
  v_name text;
  v_role text;
begin
  select coalesce(nullif(full_name, ''), email), role into v_name, v_role
  from public.profiles where id = v_actor;
  insert into public.activity (actor_id, actor_name, actor_role, action, prayer_date, subject_id, subject_name, details)
  values (v_actor, coalesce(v_name, ''), coalesce(v_role, ''), p_action, p_prayer_date, p_subject_id,
          coalesce(p_subject_name, ''), coalesce(p_details, ''));
end $$;

-- Called by the apps right after someone signs in.
create or replace function public.record_sign_in() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles where id = auth.uid() and status = 'active'
  ) then
    return;
  end if;
  update public.profiles set last_sign_in_at = now() where id = auth.uid();
  perform public.log_activity('signed_in');
end $$;

-- ═══ Guards and activity triggers ═══════════════════════════════════════════

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists prayers_touch on public.prayers;
create trigger prayers_touch before update on public.prayers
  for each row execute function public.touch_updated_at();

-- Enforces who may change what. Changes made from the SQL Editor or by the account
-- service (no signed-in user) are not restricted.
create or replace function public.prayers_guard() returns trigger
language plpgsql as $$
declare
  content_changed boolean;
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.created_by  := auth.uid();
    new.status      := 'pending';
    new.published   := true;
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_note := '';
    return new;
  end if;

  content_changed := (new.prayer_date, new.title, new.theme, new.description, new.audio_path, new.duration_sec)
    is distinct from (old.prayer_date, old.title, old.theme, old.description, old.audio_path, old.duration_sec);

  if public.is_admin() then
    if content_changed or new.created_by is distinct from old.created_by then
      raise exception 'Administrators can review prayers but cannot change their content.';
    end if;
    if new.status is distinct from old.status then
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
    end if;
    return new;
  end if;

  -- Prayer Warriors: any content change sends the prayer back for review.
  new.created_by := old.created_by;
  new.published  := old.published;
  if content_changed then
    new.status      := 'pending';
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_note := '';
  else
    new.status      := old.status;
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
    new.review_note := old.review_note;
  end if;
  return new;
end $$;

drop trigger if exists prayers_guard on public.prayers;
create trigger prayers_guard before insert or update on public.prayers
  for each row execute function public.prayers_guard();

create or replace function public.prayers_log() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return null;
  end if;
  if tg_op = 'INSERT' then
    perform public.log_activity('submitted', new.prayer_date, new.id, new.title);
  elsif tg_op = 'DELETE' then
    perform public.log_activity('withdrew', old.prayer_date, old.id, old.title);
  elsif public.is_admin() then
    if new.status is distinct from old.status then
      perform public.log_activity(new.status, new.prayer_date, new.id, new.title, new.review_note);
    end if;
    if new.published is distinct from old.published then
      perform public.log_activity(case when new.published then 'unhidden' else 'hidden' end,
                                  new.prayer_date, new.id, new.title);
    end if;
  elsif new.audio_path is distinct from old.audio_path then
    perform public.log_activity(case when old.status = 'rejected' then 'resubmitted' else 'replaced_audio' end,
                                new.prayer_date, new.id, new.title);
  elsif (new.prayer_date, new.title, new.theme, new.description)
        is distinct from (old.prayer_date, old.title, old.theme, old.description) then
    perform public.log_activity(case when old.status = 'rejected' then 'resubmitted' else 'edited' end,
                                new.prayer_date, new.id, new.title);
  end if;
  return null;
end $$;

drop trigger if exists prayers_log on public.prayers;
create trigger prayers_log after insert or update or delete on public.prayers
  for each row execute function public.prayers_log();

-- Administrators may rename people and assign days in the console; role, status and email
-- only change through the account service, which also blocks or restores sign-in.
create or replace function public.profiles_guard() returns trigger
language plpgsql as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if (new.id, new.email, new.role, new.status, new.invited_by, new.created_at, new.removed_at)
     is distinct from (old.id, old.email, old.role, old.status, old.invited_by, old.created_at, old.removed_at) then
    raise exception 'Use the Admin Console to add, remove or restore people.';
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

create or replace function public.profiles_log() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  names text[] := array['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  label text;
begin
  if auth.uid() is null or new.assigned_days is not distinct from old.assigned_days then
    return null;
  end if;
  select coalesce(string_agg(names[d + 1], ', ' order by d), 'none') into label
  from unnest(new.assigned_days) as d;
  perform public.log_activity('days_changed', null, new.id,
                              coalesce(nullif(new.full_name, ''), new.email), label);
  return null;
end $$;

drop trigger if exists profiles_log on public.profiles;
create trigger profiles_log after update on public.profiles
  for each row execute function public.profiles_log();

-- ═══ Row-level security ═════════════════════════════════════════════════════

alter table public.prayers  enable row level security;
alter table public.profiles enable row level security;
alter table public.activity enable row level security;
alter table public.admins   enable row level security;

-- Policies from earlier versions.
drop policy if exists "admins read all" on public.prayers;
drop policy if exists "admins write" on public.prayers;
drop policy if exists "admins see themselves" on public.admins;

-- Listeners: approved, visible prayers from this week and last week. The 16-day window
-- covers both weeks in every time zone. Older prayers stay hidden for the paid archive.
drop policy if exists "listeners read this week" on public.prayers;
create policy "listeners read this week" on public.prayers
  for select to anon, authenticated
  using (published and status = 'approved' and prayer_date between current_date - 15 and current_date + 1);

drop policy if exists "team reads prayers" on public.prayers;
create policy "team reads prayers" on public.prayers
  for select to authenticated using (public.is_admin() or public.is_warrior());

drop policy if exists "warriors submit" on public.prayers;
create policy "warriors submit" on public.prayers
  for insert to authenticated with check (public.can_post(prayer_date));

drop policy if exists "warriors edit own" on public.prayers;
create policy "warriors edit own" on public.prayers
  for update to authenticated
  using (public.is_warrior() and created_by = auth.uid())
  with check (public.can_post(prayer_date));

drop policy if exists "warriors withdraw own" on public.prayers;
create policy "warriors withdraw own" on public.prayers
  for delete to authenticated
  using (public.is_warrior() and created_by = auth.uid() and status <> 'approved');

drop policy if exists "admins review" on public.prayers;
create policy "admins review" on public.prayers
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles
  for select to authenticated using (id = auth.uid());

drop policy if exists "admins read profiles" on public.profiles;
create policy "admins read profiles" on public.profiles
  for select to authenticated using (public.is_admin());

drop policy if exists "admins update profiles" on public.profiles;
create policy "admins update profiles" on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins read activity" on public.activity;
create policy "admins read activity" on public.activity
  for select to authenticated using (public.is_admin());

revoke execute on function public.log_activity(text, date, uuid, text, text, uuid) from public, anon, authenticated;

-- ═══ Audio storage ══════════════════════════════════════════════════════════
-- Public read so the listener app can stream audio. Prayer Warriors upload into their own
-- folder (<their user id>/...) and can only replace or remove their own files.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'prayer-audio', 'prayer-audio', true, 52428800,
  array['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac',
        'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/ogg', 'audio/3gpp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "admins upload audio" on storage.objects;
drop policy if exists "admins change audio" on storage.objects;
drop policy if exists "admins remove audio" on storage.objects;

drop policy if exists "warriors upload audio" on storage.objects;
create policy "warriors upload audio" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'prayer-audio' and public.is_warrior()
              and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "warriors change own audio" on storage.objects;
create policy "warriors change own audio" on storage.objects
  for update to authenticated
  using (bucket_id = 'prayer-audio' and public.is_warrior()
         and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "warriors remove own audio" on storage.objects;
create policy "warriors remove own audio" on storage.objects
  for delete to authenticated
  using (bucket_id = 'prayer-audio' and public.is_warrior()
         and (storage.foldername(name))[1] = auth.uid()::text);
