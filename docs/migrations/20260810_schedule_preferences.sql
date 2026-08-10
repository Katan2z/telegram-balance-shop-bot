begin;

create table if not exists public.schedule_preferences (
  employee_profile_id bigint primary key references public.employee_profiles(id) on delete cascade,
  work_type text not null default 'FT' check (work_type in ('PT1', 'PT2', 'FT')),
  regular_days_off jsonb not null default '{}'::jsonb,
  updated_by bigint,
  updated_at timestamptz not null default now()
);

create table if not exists public.schedule_settings (
  id smallint primary key default 1 check (id = 1),
  max_regular_days_off smallint not null default 4 check (max_regular_days_off between 1 and 20),
  updated_by bigint,
  updated_at timestamptz not null default now()
);

insert into public.schedule_settings (id, max_regular_days_off)
values (1, 4)
on conflict (id) do nothing;

alter table public.schedule_preferences enable row level security;
alter table public.schedule_settings enable row level security;
revoke all on public.schedule_preferences, public.schedule_settings from anon, authenticated;

create or replace function public.schedule_save_preferences(
  p_actor_id bigint,
  p_employee_profile_id bigint,
  p_work_type text,
  p_regular_days_off jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.schedule_preferences%rowtype;
begin
  if not public.schedule_is_admin(p_actor_id) then
    raise exception 'Only schedule managers can edit preferences' using errcode = '42501';
  end if;
  if p_work_type not in ('PT1', 'PT2', 'FT') then
    raise exception 'Unsupported work type' using errcode = '22023';
  end if;
  if not exists (select 1 from public.employee_profiles where id = p_employee_profile_id) then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;

  insert into public.schedule_preferences (employee_profile_id, work_type, regular_days_off, updated_by)
  values (p_employee_profile_id, p_work_type, coalesce(p_regular_days_off, '{}'::jsonb), p_actor_id)
  on conflict (employee_profile_id) do update set
    work_type = excluded.work_type,
    regular_days_off = excluded.regular_days_off,
    updated_by = excluded.updated_by,
    updated_at = now()
  returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.schedule_save_settings(p_actor_id bigint, p_max_regular_days_off integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.schedule_settings%rowtype;
begin
  if not public.schedule_is_admin(p_actor_id) then
    raise exception 'Only schedule managers can edit settings' using errcode = '42501';
  end if;
  if p_max_regular_days_off not between 1 and 20 then
    raise exception 'Day-off limit must be between 1 and 20' using errcode = '22023';
  end if;
  insert into public.schedule_settings (id, max_regular_days_off, updated_by)
  values (1, p_max_regular_days_off, p_actor_id)
  on conflict (id) do update set
    max_regular_days_off = excluded.max_regular_days_off,
    updated_by = excluded.updated_by,
    updated_at = now()
  returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.schedule_get_week(p_actor_id bigint, p_week_start date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week public.schedule_weeks%rowtype;
  v_is_admin boolean := public.schedule_is_admin(p_actor_id);
  v_employee_can_submit boolean;
  v_entries jsonb;
  v_limit integer;
  v_counts jsonb;
begin
  perform public.schedule_ensure_week(p_actor_id, p_week_start);
  select * into v_week from public.schedule_weeks where week_start = p_week_start;
  select max_regular_days_off into v_limit from public.schedule_settings where id = 1;
  v_limit := coalesce(v_limit, 4);
  v_employee_can_submit := case
    when v_week.employee_input_override is not null then v_week.employee_input_override
    else v_week.status = 'collecting' and now() <= v_week.submission_deadline
  end;

  select jsonb_object_agg(day_key, used_count) into v_counts
  from (
    select d.day_key, count(se.id)::integer as used_count
    from unnest(array['mon','tue','wed','thu','fri','sat','sun']) d(day_key)
    left join public.schedule_entries se on se.week_id = v_week.id
      and lower(coalesce(se.availability ->> d.day_key, '')) like '%выходн%'
    left join public.schedule_preferences sp on sp.employee_profile_id = se.employee_profile_id
    where coalesce((sp.regular_days_off ->> d.day_key)::boolean, false) = false
    group by d.day_key
  ) counts;

  select coalesce(jsonb_agg(item order by item->>'employee_name'), '[]'::jsonb) into v_entries
  from (
    select jsonb_build_object(
      'employee_profile_id', ep.id,
      'employee_telegram_id', ep.telegram_id,
      'employee_name', ep.full_name,
      'availability', coalesce(se.availability, '{}'::jsonb),
      'final_schedule', coalesce(se.final_schedule, '{}'::jsonb),
      'comment', coalesce(se.comment, ''),
      'submitted_at', se.submitted_at,
      'updated_at', se.updated_at,
      'work_type', coalesce(sp.work_type, 'FT'),
      'regular_days_off', coalesce(sp.regular_days_off, '{}'::jsonb)
    ) as item
    from public.employee_profiles ep
    left join public.schedule_entries se on se.week_id = v_week.id and se.employee_profile_id = ep.id
    left join public.schedule_preferences sp on sp.employee_profile_id = ep.id
    where ep.activation_status = 'active'
      and ep.telegram_id is not null
      and ep.telegram_id <> 818748106
      and not exists (select 1 from public.managers m where m.telegram_id = ep.telegram_id)
      and not (lower(coalesce(ep.position, '')) ~ '(менеджер|заместител|управляющ)')
      and (v_is_admin or ep.telegram_id = p_actor_id)
  ) rows_for_actor;

  return jsonb_build_object(
    'week', to_jsonb(v_week), 'is_admin', v_is_admin,
    'employee_can_submit', v_employee_can_submit,
    'can_submit', v_is_admin or v_employee_can_submit,
    'max_regular_days_off', v_limit,
    'day_off_counts', coalesce(v_counts, '{}'::jsonb),
    'entries', v_entries
  );
end;
$$;

create or replace function public.schedule_save_entry(
  p_actor_id bigint,
  p_week_start date,
  p_employee_profile_id bigint,
  p_mode text,
  p_values jsonb,
  p_comment text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week public.schedule_weeks%rowtype;
  v_employee public.employee_profiles%rowtype;
  v_is_admin boolean := public.schedule_is_admin(p_actor_id);
  v_employee_can_submit boolean;
  v_entry public.schedule_entries%rowtype;
  v_regular_days_off jsonb := '{}'::jsonb;
  v_limit integer := 4;
  v_day text;
  v_used integer;
begin
  if p_mode not in ('availability', 'final') then raise exception 'Unsupported schedule mode' using errcode = '22023'; end if;
  perform public.schedule_ensure_week(p_actor_id, p_week_start);
  select * into v_week from public.schedule_weeks where week_start = p_week_start;
  select * into v_employee from public.employee_profiles where id = p_employee_profile_id and activation_status = 'active';
  if not found then raise exception 'Employee not found' using errcode = 'P0002'; end if;
  if not v_is_admin and v_employee.telegram_id <> p_actor_id then
    raise exception 'Employees can edit only their own row' using errcode = '42501';
  end if;
  v_employee_can_submit := case when v_week.employee_input_override is not null then v_week.employee_input_override else v_week.status = 'collecting' and now() <= v_week.submission_deadline end;
  if not v_is_admin and (p_mode <> 'availability' or not v_employee_can_submit) then
    raise exception 'Schedule input is closed' using errcode = '42501';
  end if;

  if not v_is_admin and p_mode = 'availability' then
    select coalesce(regular_days_off, '{}'::jsonb) into v_regular_days_off from public.schedule_preferences where employee_profile_id = p_employee_profile_id;
    select coalesce(max_regular_days_off, 4) into v_limit from public.schedule_settings where id = 1;
    v_regular_days_off := coalesce(v_regular_days_off, '{}'::jsonb);
    v_limit := coalesce(v_limit, 4);
    foreach v_day in array array['mon','tue','wed','thu','fri','sat','sun'] loop
      if lower(coalesce(p_values ->> v_day, '')) like '%выходн%'
         and not coalesce((v_regular_days_off ->> v_day)::boolean, false) then
        perform pg_advisory_xact_lock(hashtext(p_week_start::text || ':' || v_day));
        select count(*) into v_used
        from public.schedule_entries se
        left join public.schedule_preferences sp on sp.employee_profile_id = se.employee_profile_id
        where se.week_id = v_week.id and se.employee_profile_id <> p_employee_profile_id
          and lower(coalesce(se.availability ->> v_day, '')) like '%выходн%'
          and not coalesce((sp.regular_days_off ->> v_day)::boolean, false);
        if v_used >= v_limit then
          raise exception 'Лимит выходных на этот день уже заполнен' using errcode = 'P0001';
        end if;
      end if;
    end loop;
  end if;

  insert into public.schedule_entries (week_id, employee_profile_id, employee_telegram_id, employee_name, availability, final_schedule, comment, submitted_at, updated_by)
  values (v_week.id, v_employee.id, v_employee.telegram_id, v_employee.full_name,
    case when p_mode = 'availability' then coalesce(p_values, '{}'::jsonb) else '{}'::jsonb end,
    case when p_mode = 'final' then coalesce(p_values, '{}'::jsonb) else '{}'::jsonb end,
    coalesce(p_comment, ''), now(), p_actor_id)
  on conflict (week_id, employee_profile_id) do update set
    availability = case when p_mode = 'availability' then excluded.availability else schedule_entries.availability end,
    final_schedule = case when p_mode = 'final' then excluded.final_schedule else schedule_entries.final_schedule end,
    comment = excluded.comment,
    submitted_at = case when p_mode = 'availability' then now() else schedule_entries.submitted_at end,
    updated_by = p_actor_id, updated_at = now()
  returning * into v_entry;
  update public.schedule_weeks set updated_at = now() where id = v_week.id;
  return to_jsonb(v_entry);
end;
$$;

revoke all on function public.schedule_save_preferences(bigint,bigint,text,jsonb) from public;
revoke all on function public.schedule_save_settings(bigint,integer) from public;
grant execute on function public.schedule_save_preferences(bigint,bigint,text,jsonb) to anon, authenticated;
grant execute on function public.schedule_save_settings(bigint,integer) to anon, authenticated;

commit;

-- Verification:
-- select to_regprocedure('public.schedule_save_preferences(bigint,bigint,text,jsonb)');
-- select to_regprocedure('public.schedule_save_settings(bigint,integer)');
