-- Apply separately after a successful BEGIN/ROLLBACK dry-run.
-- Stores one current PVV document per employee in a private Storage bucket.

create table if not exists public.employee_pvv_documents (
  employee_profile_id bigint primary key references public.employee_profiles(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 15728640),
  updated_by bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'employee-pvv',
  'employee-pvv',
  false,
  15728640,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.employee_pvv_documents disable row level security;
grant select, insert, update, delete on public.employee_pvv_documents to anon, authenticated;

drop policy if exists employee_pvv_select on storage.objects;
create policy employee_pvv_select on storage.objects for select to anon, authenticated
using (bucket_id = 'employee-pvv');

drop policy if exists employee_pvv_insert on storage.objects;
create policy employee_pvv_insert on storage.objects for insert to anon, authenticated
with check (bucket_id = 'employee-pvv');

drop policy if exists employee_pvv_update on storage.objects;
create policy employee_pvv_update on storage.objects for update to anon, authenticated
using (bucket_id = 'employee-pvv') with check (bucket_id = 'employee-pvv');

drop policy if exists employee_pvv_delete on storage.objects;
create policy employee_pvv_delete on storage.objects for delete to anon, authenticated
using (bucket_id = 'employee-pvv');
