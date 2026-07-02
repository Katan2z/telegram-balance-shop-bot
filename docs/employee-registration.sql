-- BK Staff: регистрация сотрудников через код активации
-- Выполни в Supabase SQL Editor один раз. Скрипт можно запускать повторно.

create table if not exists public.employee_profiles (
  id bigserial primary key,
  telegram_id bigint unique references public.users(telegram_id) on delete set null,
  full_name text not null,
  birth_date date,
  phone text,
  restaurant text,
  position text,
  activation_code text unique not null,
  activation_status text not null default 'pending', -- pending / active / disabled
  pin_hash text,
  created_by bigint,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.employee_profiles add column if not exists telegram_id bigint unique references public.users(telegram_id) on delete set null;
alter table public.employee_profiles add column if not exists full_name text;
alter table public.employee_profiles add column if not exists birth_date date;
alter table public.employee_profiles add column if not exists phone text;
alter table public.employee_profiles add column if not exists restaurant text;
alter table public.employee_profiles add column if not exists position text;
alter table public.employee_profiles add column if not exists activation_code text unique;
alter table public.employee_profiles add column if not exists activation_status text not null default 'pending';
alter table public.employee_profiles add column if not exists pin_hash text;
alter table public.employee_profiles add column if not exists created_by bigint;
alter table public.employee_profiles add column if not exists created_at timestamptz not null default now();
alter table public.employee_profiles add column if not exists activated_at timestamptz;
alter table public.employee_profiles add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_employee_profiles_telegram on public.employee_profiles(telegram_id);
create index if not exists idx_employee_profiles_code on public.employee_profiles(activation_code);
create index if not exists idx_employee_profiles_status on public.employee_profiles(activation_status);

-- Mini App сейчас работает через anon key, поэтому для первого этапа открываем REST-доступ.
-- Позже можно будет ужесточить через backend/RLS.
alter table public.employee_profiles disable row level security;

grant usage on schema public to anon;
grant select, insert, update, delete on table public.employee_profiles to anon;
grant usage, select on sequence public.employee_profiles_id_seq to anon;

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.employee_profiles to authenticated;
grant usage, select on sequence public.employee_profiles_id_seq to authenticated;

-- Как включить обязательную регистрацию:
-- 1) Добавь в docs/config.js:
-- window.APP_CONFIG.REGISTRATION_REQUIRED = true;
-- или
-- window.APP_CONFIG.REGISTRATION_REQUIRED_FROM = '2026-07-01';
-- 2) После этого незарегистрированный сотрудник увидит экран активации.
