create table if not exists employee_timesheets (
  id bigserial primary key,
  employee_profile_id bigint not null references employee_profiles(id) on delete cascade,
  telegram_id bigint,
  period text not null,
  hours numeric not null default 0,
  source_file text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(employee_profile_id, period)
);

alter table employee_timesheets enable row level security;

create policy if not exists employee_timesheets_read_all
on employee_timesheets for select
using (true);

create policy if not exists employee_timesheets_write_all
on employee_timesheets for all
using (true)
with check (true);
