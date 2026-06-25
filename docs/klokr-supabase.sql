-- SQL для раздела Инструктор / КЛОКР
-- Можно выполнять повторно. Скрипт безопасно дополняет уже существующие таблицы.

create table if not exists public.instructors (
  telegram_id bigint primary key references public.users(telegram_id) on delete cascade,
  created_by bigint,
  created_at timestamptz not null default now()
);

alter table public.instructors add column if not exists created_by bigint;
alter table public.instructors add column if not exists created_at timestamptz not null default now();

create table if not exists public.klokr_assessments (
  id bigserial primary key,
  employee_id bigint not null references public.users(telegram_id) on delete cascade,
  instructor_id bigint references public.users(telegram_id) on delete set null,
  total_score integer not null default 0,
  max_score integer not null default 0,
  percent integer not null default 0,
  items jsonb not null default '[]'::jsonb,
  comment text,
  created_at timestamptz not null default now()
);

alter table public.klokr_assessments add column if not exists employee_id bigint references public.users(telegram_id) on delete cascade;
alter table public.klokr_assessments add column if not exists instructor_id bigint references public.users(telegram_id) on delete set null;
alter table public.klokr_assessments add column if not exists total_score integer not null default 0;
alter table public.klokr_assessments add column if not exists max_score integer not null default 0;
alter table public.klokr_assessments add column if not exists percent integer not null default 0;
alter table public.klokr_assessments add column if not exists items jsonb not null default '[]'::jsonb;
alter table public.klokr_assessments add column if not exists comment text;
alter table public.klokr_assessments add column if not exists created_at timestamptz not null default now();

create index if not exists idx_klokr_assessments_employee on public.klokr_assessments(employee_id);
create index if not exists idx_klokr_assessments_instructor on public.klokr_assessments(instructor_id);
create index if not exists idx_klokr_assessments_top on public.klokr_assessments(percent desc, created_at desc);

-- Mini App работает без Supabase Auth и ходит через anon key.
-- Поэтому для этих REST-таблиц нужны права anon, иначе вставка будет падать даже если таблица существует.
alter table public.instructors disable row level security;
alter table public.klokr_assessments disable row level security;

grant usage on schema public to anon;
grant select, insert, update, delete on table public.instructors to anon;
grant select, insert, update, delete on table public.klokr_assessments to anon;
grant usage, select on sequence public.klokr_assessments_id_seq to anon;

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.instructors to authenticated;
grant select, insert, update, delete on table public.klokr_assessments to authenticated;
grant usage, select on sequence public.klokr_assessments_id_seq to authenticated;

-- Если Supabase REST долго не видит новые колонки, нажми Reload schema cache в API Settings
-- или просто подожди 1-2 минуты после выполнения скрипта.
