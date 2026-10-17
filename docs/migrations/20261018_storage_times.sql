begin;

create table if not exists public.storage_time_catalog (
  id boolean primary key default true check (id),
  revision uuid not null,
  catalog jsonb not null check (jsonb_typeof(catalog->'items') = 'array'),
  source text not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.storage_time_revisions (
  revision uuid primary key,
  request_id uuid not null unique,
  catalog jsonb not null,
  actor_id bigint not null,
  source text not null,
  sha256 text not null,
  created_at timestamptz not null default now()
);
alter table public.storage_time_catalog enable row level security;
alter table public.storage_time_revisions enable row level security;
revoke all on public.storage_time_catalog, public.storage_time_revisions from public, anon, authenticated;
grant select on public.storage_time_catalog to anon, authenticated;
grant all on public.storage_time_catalog, public.storage_time_revisions to service_role;
drop policy if exists storage_catalog_read on public.storage_time_catalog;
create policy storage_catalog_read on public.storage_time_catalog for select to anon, authenticated using (true);

create or replace function public.publish_storage_times(
  p_expected_revision uuid, p_catalog jsonb, p_actor_id bigint,
  p_source text, p_sha256 text, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = public as $$
declare current_revision uuid; existing public.storage_time_revisions; next_revision uuid;
begin
  if auth.role() is distinct from 'service_role' or p_actor_id is distinct from 818748106 then
    raise exception 'Only the primary admin bot can publish storage times';
  end if;
  perform pg_advisory_xact_lock(818748106, 20261018);
  select * into existing from public.storage_time_revisions where request_id = p_request_id;
  if found then
    if existing.sha256 is distinct from p_sha256 or existing.actor_id is distinct from p_actor_id then
      raise exception 'Request token already used';
    end if;
    return jsonb_build_object('revision', existing.revision, 'already_applied', true);
  end if;
  if p_request_id is null or p_sha256 !~ '^[a-f0-9]{64}$' or p_source is null or length(p_source) > 255
     or p_catalog is null or jsonb_typeof(p_catalog->'items') is distinct from 'array' then
    raise exception 'Invalid catalog metadata';
  end if;
  if jsonb_array_length(p_catalog->'items') not between 1 and 2000 then
    raise exception 'Invalid number of products';
  end if;
  select revision into current_revision from public.storage_time_catalog where id = true for update;
  if current_revision is distinct from p_expected_revision then
    raise exception 'CATALOG_CHANGED: upload the file again to refresh the preview';
  end if;
  next_revision := gen_random_uuid();
  insert into public.storage_time_revisions (revision, request_id, catalog, actor_id, source, sha256)
  values (next_revision, p_request_id, p_catalog, p_actor_id, p_source, p_sha256);
  insert into public.storage_time_catalog (id, revision, catalog, source, updated_at)
  values (true, next_revision, p_catalog, p_source, now())
  on conflict (id) do update set revision = excluded.revision, catalog = excluded.catalog,
    source = excluded.source, updated_at = excluded.updated_at;
  return jsonb_build_object('revision', next_revision, 'already_applied', false);
end;
$$;
revoke all on function public.publish_storage_times(uuid,jsonb,bigint,text,text,uuid) from public, anon, authenticated;
grant execute on function public.publish_storage_times(uuid,jsonb,bigint,text,text,uuid) to service_role;
commit;
