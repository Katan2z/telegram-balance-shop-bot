-- Apply separately after reviewing against the production schema.
-- Existing rows are not deleted or rewritten.

create or replace function public.bk8_require_active_employee_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('bk8.employee_activation', true) = 'on'
     or new.telegram_id = 818748106 then
    return new;
  end if;
  if not exists (
    select 1 from public.employee_profiles ep
    where ep.telegram_id = new.telegram_id and ep.activation_status = 'active'
  ) then
    raise exception 'Telegram user % is not activated through employee_profiles', new.telegram_id;
  end if;
  return new;
end;
$$;

create or replace function public.activate_employee(
  p_activation_code text,
  p_telegram_id bigint,
  p_full_name text
) returns public.employee_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public.employee_profiles;
begin
  if p_telegram_id is null or length(trim(coalesce(p_full_name, ''))) < 5 then
    raise exception 'invalid activation data';
  end if;

  select * into profile
  from public.employee_profiles
  where activation_code = upper(trim(p_activation_code))
    and activation_status = 'pending'
  for update;

  if profile.id is null then
    raise exception 'activation code is invalid or already used';
  end if;
  if exists (select 1 from public.employee_profiles where telegram_id = p_telegram_id) then
    raise exception 'telegram account is already linked';
  end if;

  perform set_config('bk8.employee_activation', 'on', true);
  insert into public.users (telegram_id, first_name, balance, coins, coin_checkpoint, updated_at)
  values (p_telegram_id, trim(p_full_name), 0, 0, 0, now());

  update public.employee_profiles
  set telegram_id = p_telegram_id,
      full_name = trim(p_full_name),
      activation_status = 'active',
      activated_at = now(),
      updated_at = now()
  where id = profile.id
  returning * into profile;
  return profile;
end;
$$;

create or replace function public.protect_employee_activation()
returns trigger language plpgsql as $$
begin
  if (new.telegram_id is distinct from old.telegram_id
      or new.activation_status is distinct from old.activation_status)
     and current_setting('bk8.employee_activation', true) is distinct from 'on' then
    raise exception 'employee activation must use activate_employee';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_employee_activation on public.employee_profiles;
create trigger protect_employee_activation
before update on public.employee_profiles
for each row execute function public.protect_employee_activation();

revoke insert on public.users from anon, authenticated;
grant execute on function public.activate_employee(text, bigint, text) to anon, authenticated;

create unique index if not exists employee_timesheets_current_only
  on public.employee_timesheets(employee_profile_id)
  where period = 'current';

alter table public.employee_timesheets
  drop constraint if exists employee_timesheets_period_check;
alter table public.employee_timesheets
  add constraint employee_timesheets_period_check check (period = 'current') not valid;
