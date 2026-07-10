create table if not exists public.employee_medical_records (
  employee_profile_id bigint primary key references public.employee_profiles(id) on delete cascade,
  sanitary_certificate_expires_on date,
  sanitary_minimum_expires_on date,
  fluorography_expires_on date,
  updated_at timestamptz not null default now()
);

alter table public.employee_medical_records enable row level security;

drop policy if exists "employee medical records read" on public.employee_medical_records;
create policy "employee medical records read"
on public.employee_medical_records
for select
to anon
using (true);

drop policy if exists "employee medical records insert" on public.employee_medical_records;
create policy "employee medical records insert"
on public.employee_medical_records
for insert
to anon
with check (true);

drop policy if exists "employee medical records update" on public.employee_medical_records;
create policy "employee medical records update"
on public.employee_medical_records
for update
to anon
using (true)
with check (true);

grant select, insert, update on public.employee_medical_records to anon;
