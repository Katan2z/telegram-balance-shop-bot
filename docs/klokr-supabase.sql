-- SQL для раздела Инструктор / КЛОКР
-- Выполни в Supabase SQL Editor один раз.

create table if not exists public.instructors (
  telegram_id bigint primary key references public.users(telegram_id) on delete cascade,
  created_by bigint,
  created_at timestamptz not null default now()
);

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

create index if not exists idx_klokr_assessments_employee on public.klokr_assessments(employee_id);
create index if not exists idx_klokr_assessments_instructor on public.klokr_assessments(instructor_id);
create index if not exists idx_klokr_assessments_top on public.klokr_assessments(percent desc, created_at desc);

-- В проекте Mini App уже работает через anon key без Supabase Auth,
-- поэтому RLS здесь отключаем так же, как для простых REST-таблиц приложения.
alter table public.instructors disable row level security;
alter table public.klokr_assessments disable row level security;
