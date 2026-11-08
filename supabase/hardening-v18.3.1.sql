-- ============================================================================
-- RJ Tracker Pro — Supabase hardening (v18.3.1)
-- Run ONCE in: Dashboard → SQL Editor → New query → paste → Run.  Safe to re-run.
--
-- Why: the project URL and anon key are public (they ship inside the website and the APK), so
-- anybody could create unlimited accounts and fill the free database quota. This makes sign-up
-- invite-only (only e-mail addresses in public.allowed_emails can register) and caps column sizes.
-- Existing accounts keep working; nothing about sign-in changes for you.
-- ============================================================================

-- ── 1. Invite-only sign-up ──────────────────────────────────────────────────
create table if not exists public.allowed_emails (
  email text primary key check (email = lower(email) and email ~ '^[^@[:space:]]+@[^@[:space:]]+$')
);
alter table public.allowed_emails enable row level security;           -- no policies: clients can never read or write it
revoke all on public.allowed_emails from anon, authenticated;

-- Everybody who already has an account stays allowed (e.g. if you ever delete and re-create it).
insert into public.allowed_emails (email)
select lower(email) from auth.users where email is not null
on conflict do nothing;

create or replace function public.enforce_signup_allowlist()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email is null
     or not exists (select 1 from public.allowed_emails a where a.email = lower(new.email)) then
    raise exception 'signups_closed: this e-mail address is not on the invite list' using errcode = 'P0001';
  end if;
  return new;
end $$;

revoke all on function public.enforce_signup_allowlist() from public, anon, authenticated;

drop trigger if exists enforce_signup_allowlist on auth.users;
create trigger enforce_signup_allowlist
  before insert on auth.users
  for each row execute function public.enforce_signup_allowlist();

-- To let a new person register (e.g. a friend, max 10 users): run
--   insert into public.allowed_emails (email) values ('friend@example.com');
-- To close it again: delete from public.allowed_emails where email = 'friend@example.com';

-- ── 2. Size limits on user-controlled text (NOT VALID = existing rows are not re-checked) ──
alter table public.profiles drop constraint if exists profiles_name_len;
alter table public.profiles add  constraint profiles_name_len
  check (char_length(name) <= 80) not valid;

alter table public.profiles drop constraint if exists profiles_avatar_len;
alter table public.profiles add  constraint profiles_avatar_len
  check (avatar is null or char_length(avatar) <= 1500000) not valid;

alter table public.profiles drop constraint if exists profiles_cover_len;
alter table public.profiles add  constraint profiles_cover_len
  check (cover_gradient is null or char_length(cover_gradient) <= 1500000) not valid;

alter table public.devices drop constraint if exists devices_field_len;
alter table public.devices add  constraint devices_field_len
  check (char_length(device_id) <= 80 and char_length(name) <= 80 and char_length(platform) <= 40) not valid;

-- ── 3. At most 20 registered devices per account ────────────────────────────
create or replace function public.limit_devices_per_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.devices d where d.user_id = new.user_id) >= 20 then
    raise exception 'device_limit: at most 20 devices per account' using errcode = 'P0001';
  end if;
  return new;
end $$;

revoke all on function public.limit_devices_per_user() from public, anon, authenticated;

drop trigger if exists limit_devices_per_user on public.devices;
create trigger limit_devices_per_user
  before insert on public.devices
  for each row execute function public.limit_devices_per_user();

-- ── 4. Self-check (should print: invite_only = true, trigger count = 2) ─────
select
  exists (select 1 from pg_trigger where tgname = 'enforce_signup_allowlist' and not tgisinternal) as invite_only,
  (select count(*) from pg_trigger where tgname in ('enforce_signup_allowlist','limit_devices_per_user') and not tgisinternal) as triggers_installed;
