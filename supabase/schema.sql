-- ============================================================================
-- RJ Tracker Pro — Supabase schema (run once in: Dashboard → SQL Editor → New query)
-- Every row is owned by auth.users.id (= the app's "uid") and protected by
-- Row-Level Security: a signed-in user can only ever see or change their own rows.
-- Safe to re-run (idempotent).
-- ============================================================================

-- ── Tables ──────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  name           text        not null default '',
  avatar         text,
  cover_gradient text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- One row per user: the document version used for optimistic concurrency.
create table if not exists public.sync_docs (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  version    integer     not null default 0,
  updated_at timestamptz not null default now()
);

-- One row per synced section (the app's 15 localStorage keys, as JSON).
create table if not exists public.sync_sections (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  key        text        not null check (key ~ '^[A-Za-z0-9._:-]{1,80}$'),
  value      jsonb       not null,
  hash       text        not null,
  updated_at timestamptz not null default now(),
  device_id  text,
  primary key (user_id, key)
);

-- Restore points (last 10 accepted versions).
create table if not exists public.sync_revisions (
  user_id   uuid        not null references auth.users(id) on delete cascade,
  version   integer     not null,
  at        timestamptz not null default now(),
  device_id text,
  keys      text[]      not null default '{}',
  snapshot  jsonb       not null,
  primary key (user_id, version)
);

-- Signed-in device registry (names shown in Cloud sync → Devices).
create table if not exists public.devices (
  user_id      uuid        not null references auth.users(id) on delete cascade,
  device_id    text        not null,
  name         text        not null default 'Device',
  platform     text        not null default 'web',
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (user_id, device_id)
);

-- ── Row-Level Security ──────────────────────────────────────────────────────
alter table public.profiles       enable row level security;
alter table public.sync_docs      enable row level security;
alter table public.sync_sections  enable row level security;
alter table public.sync_revisions enable row level security;
alter table public.devices        enable row level security;

drop policy if exists "profiles: own row"        on public.profiles;
drop policy if exists "sync_docs: read own"      on public.sync_docs;
drop policy if exists "sync_sections: read own"  on public.sync_sections;
drop policy if exists "sync_revisions: read own" on public.sync_revisions;
drop policy if exists "devices: own rows"        on public.devices;

create policy "profiles: own row" on public.profiles
  for all to authenticated
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Sync tables are READ-ONLY for clients. All writes go through the RPCs below,
-- which enforce the version check, size limits and ownership.
create policy "sync_docs: read own" on public.sync_docs
  for select to authenticated using (user_id = (select auth.uid()));
create policy "sync_sections: read own" on public.sync_sections
  for select to authenticated using (user_id = (select auth.uid()));
create policy "sync_revisions: read own" on public.sync_revisions
  for select to authenticated using (user_id = (select auth.uid()));

create policy "devices: own rows" on public.devices
  for all to authenticated
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.sync_docs, public.sync_sections, public.sync_revisions from anon, authenticated;
grant select on public.sync_docs, public.sync_sections, public.sync_revisions to authenticated;
revoke all on public.profiles, public.devices from anon;
grant select, insert, update, delete on public.profiles, public.devices to authenticated;

-- ── Auto-create profile on sign-up ─────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''))
  on conflict (user_id) do nothing;
  insert into public.sync_docs (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Internal helpers (not callable from the API) ───────────────────────────
create or replace function public._sync_payload(p_uid uuid, p_version integer, p_updated timestamptz, p_have jsonb)
returns jsonb language sql stable security definer set search_path = '' as $$
  with s as (
    select key, value, hash, updated_at, device_id
    from public.sync_sections where user_id = p_uid
  ),
  changed as (
    select key from s where p_have is null or (p_have ->> key) is distinct from hash
  ),
  gone as (
    select k as key from jsonb_object_keys(coalesce(p_have, '{}'::jsonb)) k
    where not exists (select 1 from s where s.key = k)
  )
  select jsonb_build_object(
    'version',   p_version,
    'updatedAt', p_updated,
    'sections',  coalesce((select jsonb_object_agg(key, jsonb_build_object('hash', hash, 'updatedAt', updated_at, 'deviceId', device_id)) from s), '{}'::jsonb),
    'data',      coalesce((select jsonb_object_agg(s.key, s.value) from s join changed c on c.key = s.key), '{}'::jsonb),
    'changedKeys', case when p_have is null then '[]'::jsonb
                        else coalesce((select jsonb_agg(key) from (select key from changed union select key from gone) u), '[]'::jsonb) end,
    'bytes',     coalesce((select sum(octet_length(value::text)) from s), 0)
  )
$$;

create or replace function public._sync_add_revision(p_uid uuid, p_version integer, p_device text, p_keys text[])
returns void language plpgsql security definer set search_path = '' as $$
declare
  c_keep constant integer := 10;   -- restore points kept per user (free-tier friendly)
begin
  insert into public.sync_revisions (user_id, version, device_id, keys, snapshot)
  values (
    p_uid, p_version, p_device, coalesce(p_keys, '{}'),
    coalesce((select jsonb_object_agg(key, value) from public.sync_sections where user_id = p_uid), '{}'::jsonb)
  )
  on conflict (user_id, version) do nothing;

  delete from public.sync_revisions
  where user_id = p_uid
    and version <= (select max(version) from public.sync_revisions where user_id = p_uid) - c_keep;
end $$;

-- ── Public RPCs (called by the app; always scoped to auth.uid()) ───────────
create or replace function public.sync_pull(p_have jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  d   public.sync_docs;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  insert into public.sync_docs (user_id) values (uid) on conflict do nothing;
  select * into d from public.sync_docs where user_id = uid;
  return public._sync_payload(uid, d.version, d.updated_at, p_have);
end $$;

create or replace function public.sync_push(
  p_base_version integer,
  p_sections     jsonb,
  p_deletions    text[],
  p_device_id    text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid        uuid := auth.uid();
  d          public.sync_docs;
  k          text;
  incoming   jsonb;
  val        jsonb;
  sz         integer;
  h          text;
  existing   text;
  total      bigint;
  n_sections integer;
  applied    text[] := '{}';
  rejected   jsonb  := '[]'::jsonb;
  max_section constant integer := 4 * 1024 * 1024;
  max_account constant bigint  := 12 * 1024 * 1024;
  max_count   constant integer := 40;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  insert into public.sync_docs (user_id) values (uid) on conflict do nothing;
  select * into d from public.sync_docs where user_id = uid for update;   -- serialises concurrent pushes

  if p_base_version is distinct from d.version then
    return jsonb_build_object('conflict', true) || public._sync_payload(uid, d.version, d.updated_at, null);
  end if;

  select coalesce(sum(octet_length(value::text)), 0), count(*)
    into total, n_sections from public.sync_sections where user_id = uid;

  for k, incoming in select * from jsonb_each(coalesce(p_sections, '{}'::jsonb)) loop
    if k !~ '^[A-Za-z0-9._:-]{1,80}$' then
      rejected := rejected || jsonb_build_object('key', k, 'reason', 'invalid_key'); continue;
    end if;
    if jsonb_typeof(incoming) <> 'object' or not (incoming ? 'value') then
      rejected := rejected || jsonb_build_object('key', k, 'reason', 'missing_value'); continue;
    end if;
    val := incoming -> 'value';
    sz  := octet_length(val::text);
    if sz > max_section then
      rejected := rejected || jsonb_build_object('key', k, 'reason', 'section_too_large'); continue;
    end if;
    h := md5(val::text);
    select hash into existing from public.sync_sections where user_id = uid and key = k;
    if existing = h then continue; end if;
    if existing is null then
      if n_sections >= max_count then
        rejected := rejected || jsonb_build_object('key', k, 'reason', 'too_many_sections'); continue;
      end if;
      if total + sz > max_account then
        rejected := rejected || jsonb_build_object('key', k, 'reason', 'account_quota_exceeded'); continue;
      end if;
      n_sections := n_sections + 1;
    end if;
    total := total + sz;
    insert into public.sync_sections (user_id, key, value, hash, updated_at, device_id)
    values (uid, k, val, h, now(), p_device_id)
    on conflict (user_id, key) do update
      set value = excluded.value, hash = excluded.hash, updated_at = now(), device_id = excluded.device_id;
    applied := applied || k;
  end loop;

  foreach k in array coalesce(p_deletions, '{}') loop
    if k ~ '^[A-Za-z0-9._:-]{1,80}$' then
      delete from public.sync_sections where user_id = uid and key = k;
      if found then applied := applied || ('-' || k); end if;
    end if;
  end loop;

  if coalesce(array_length(applied, 1), 0) = 0 then
    return jsonb_build_object('version', d.version, 'updatedAt', d.updated_at,
      'sections', (public._sync_payload(uid, d.version, d.updated_at, null) -> 'sections'),
      'applied', '[]'::jsonb, 'rejected', rejected, 'unchanged', true);
  end if;

  update public.sync_docs set version = version + 1, updated_at = now()
    where user_id = uid returning * into d;
  perform public._sync_add_revision(uid, d.version, p_device_id, array(select regexp_replace(a, '^-', '') from unnest(applied) a));

  return jsonb_build_object('version', d.version, 'updatedAt', d.updated_at,
    'sections', (public._sync_payload(uid, d.version, d.updated_at, null) -> 'sections'),
    'applied', to_jsonb(applied), 'rejected', rejected, 'unchanged', false);
end $$;

create or replace function public.sync_revisions_list()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return jsonb_build_object(
    'currentVersion', coalesce((select version from public.sync_docs where user_id = uid), 0),
    'revisions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'version', version, 'at', at, 'deviceId', device_id, 'keys', to_jsonb(keys),
        'bytes', octet_length(snapshot::text)) order by version desc)
      from public.sync_revisions where user_id = uid), '[]'::jsonb));
end $$;

create or replace function public.sync_restore(p_version integer, p_device_id text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  snap jsonb;
  d public.sync_docs;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select snapshot into snap from public.sync_revisions where user_id = uid and version = p_version;
  if snap is null then raise exception 'revision_not_found' using errcode = 'P0002'; end if;
  insert into public.sync_docs (user_id) values (uid) on conflict do nothing;
  select * into d from public.sync_docs where user_id = uid for update;

  delete from public.sync_sections where user_id = uid;
  insert into public.sync_sections (user_id, key, value, hash, updated_at, device_id)
    select uid, e.key, e.value, md5(e.value::text), now(), p_device_id from jsonb_each(snap) e;

  update public.sync_docs set version = version + 1, updated_at = now() where user_id = uid returning * into d;
  perform public._sync_add_revision(uid, d.version, p_device_id, array(select jsonb_object_keys(snap)));
  return jsonb_build_object('restoredFrom', p_version) || public._sync_payload(uid, d.version, d.updated_at, null);
end $$;

create or replace function public.sync_wipe(p_device_id text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); d public.sync_docs;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  insert into public.sync_docs (user_id) values (uid) on conflict do nothing;
  select * into d from public.sync_docs where user_id = uid for update;
  delete from public.sync_sections where user_id = uid;
  update public.sync_docs set version = version + 1, updated_at = now() where user_id = uid returning * into d;
  perform public._sync_add_revision(uid, d.version, p_device_id, '{}');
  return jsonb_build_object('ok', true, 'version', d.version);
end $$;

create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  delete from auth.users where id = auth.uid();   -- cascades to every table above
end $$;

-- ── Lock the functions down: signed-in users only ──────────────────────────
revoke all on function public._sync_payload(uuid, integer, timestamptz, jsonb)  from public, anon, authenticated;
revoke all on function public._sync_add_revision(uuid, integer, text, text[])   from public, anon, authenticated;
revoke all on function public.handle_new_user()                                 from public, anon, authenticated;

revoke all on function public.sync_pull(jsonb)                       from public, anon;
revoke all on function public.sync_push(integer, jsonb, text[], text) from public, anon;
revoke all on function public.sync_revisions_list()                  from public, anon;
revoke all on function public.sync_restore(integer, text)            from public, anon;
revoke all on function public.sync_wipe(text)                        from public, anon;
revoke all on function public.delete_my_account()                    from public, anon;

grant execute on function public.sync_pull(jsonb)                       to authenticated;
grant execute on function public.sync_push(integer, jsonb, text[], text) to authenticated;
grant execute on function public.sync_revisions_list()                  to authenticated;
grant execute on function public.sync_restore(integer, text)            to authenticated;
grant execute on function public.sync_wipe(text)                        to authenticated;
grant execute on function public.delete_my_account()                    to authenticated;
