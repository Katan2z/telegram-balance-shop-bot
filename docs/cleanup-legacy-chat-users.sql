-- BK8 Staff: remove users created by the old Telegram chat-scanning logic.
-- Keeps the root admin and employees already activated through employee_profiles.
-- Safe to run more than once.

begin;

create temporary table bk8_keep_users (
  telegram_id bigint primary key
) on commit drop;

insert into bk8_keep_users (telegram_id)
values (818748106)
on conflict do nothing;

insert into bk8_keep_users (telegram_id)
select distinct telegram_id
from public.employee_profiles
where activation_status = 'active'
  and telegram_id is not null
on conflict do nothing;

-- Remove legacy role rows that do not belong to activated employees.
do $$
begin
  if to_regclass('public.managers') is not null then
    execute $sql$
      delete from public.managers m
      where not exists (
        select 1 from bk8_keep_users k where k.telegram_id = m.telegram_id
      )
    $sql$;
  end if;

  if to_regclass('public.instructors') is not null then
    execute $sql$
      delete from public.instructors i
      where not exists (
        select 1 from bk8_keep_users k where k.telegram_id = i.telegram_id
      )
    $sql$;
  end if;
end
$$;

-- Remove legacy transactions before deleting their user rows.
do $$
begin
  if to_regclass('public.transactions') is not null then
    execute $sql$
      delete from public.transactions t
      where not exists (
        select 1 from bk8_keep_users k where k.telegram_id = t.user_id
      )
      or (
        t.admin_id is not null
        and not exists (
          select 1 from bk8_keep_users k where k.telegram_id = t.admin_id
        )
      )
    $sql$;
  end if;
end
$$;

-- Delete users that were never activated through an employee profile.
delete from public.users u
where not exists (
  select 1 from bk8_keep_users k where k.telegram_id = u.telegram_id
);

-- Old chat discovery data is no longer needed. /uved will save only the selected notification chat again.
do $$
begin
  if to_regclass('public.chats') is not null then
    execute 'delete from public.chats';
  end if;
end
$$;

-- Database-level protection: a user row may exist only after code activation.
create or replace function public.bk8_require_active_employee_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.telegram_id = 818748106 then
    return new;
  end if;

  if not exists (
    select 1
    from public.employee_profiles ep
    where ep.telegram_id = new.telegram_id
      and ep.activation_status = 'active'
  ) then
    raise exception 'Telegram user % is not activated through employee_profiles', new.telegram_id;
  end if;

  return new;
end;
$$;

drop trigger if exists bk8_users_require_active_employee on public.users;

create trigger bk8_users_require_active_employee
before insert or update of telegram_id
on public.users
for each row
execute function public.bk8_require_active_employee_user();

commit;

-- Verification:
-- select telegram_id, first_name, balance, coins from public.users order by first_name;
-- select id, full_name, telegram_id, activation_status from public.employee_profiles order by full_name;
