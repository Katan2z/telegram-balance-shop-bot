begin;

alter table public.schedule_weeks
  add column if not exists employee_input_override boolean;

create or replace function public.schedule_set_input_access(
  p_actor_id bigint,
  p_week_start date,
  p_open boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week public.schedule_weeks%rowtype;
begin
  if not public.schedule_is_admin(p_actor_id) then
    raise exception 'Only an admin can change schedule access' using errcode = '42501';
  end if;
  perform public.schedule_ensure_week(p_actor_id, p_week_start);
  update public.schedule_weeks
  set employee_input_override = p_open,
      status = case when p_open then 'collecting' else status end,
      updated_at = now()
  where week_start = p_week_start
  returning * into v_week;
  return to_jsonb(v_week);
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
begin
  perform public.schedule_ensure_week(p_actor_id, p_week_start);
  select * into v_week from public.schedule_weeks where week_start = p_week_start;
  v_employee_can_submit := case
    when v_week.employee_input_override is not null then v_week.employee_input_override
    else v_week.status = 'collecting' and now() <= v_week.submission_deadline
  end;

  select coalesce(jsonb_agg(item order by item->>'employee_name'), '[]'::jsonb)
  into v_entries
  from (
    select jsonb_build_object(
      'employee_profile_id', ep.id,
      'employee_telegram_id', ep.telegram_id,
      'employee_name', ep.full_name,
      'availability', coalesce(se.availability, '{}'::jsonb),
      'final_schedule', coalesce(se.final_schedule, '{}'::jsonb),
      'comment', coalesce(se.comment, ''),
      'submitted_at', se.submitted_at,
      'updated_at', se.updated_at
    ) as item
    from public.employee_profiles ep
    left join public.schedule_entries se
      on se.week_id = v_week.id and se.employee_profile_id = ep.id
    where ep.activation_status = 'active'
      and ep.telegram_id is not null
      and ep.telegram_id <> 818748106
      and not exists (select 1 from public.managers m where m.telegram_id = ep.telegram_id)
      and not (lower(coalesce(ep.position, '')) ~ '(менеджер|заместител|управляющ)')
      and (v_is_admin or ep.telegram_id = p_actor_id)
  ) rows_for_actor;

  return jsonb_build_object(
    'week', to_jsonb(v_week),
    'is_admin', v_is_admin,
    'employee_can_submit', v_employee_can_submit,
    'can_submit', v_is_admin or v_employee_can_submit,
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
begin
  if p_mode not in ('availability', 'final') then
    raise exception 'Unsupported schedule mode' using errcode = '22023';
  end if;
  perform public.schedule_ensure_week(p_actor_id, p_week_start);
  select * into v_week from public.schedule_weeks where week_start = p_week_start;
  select * into v_employee from public.employee_profiles
    where id = p_employee_profile_id and activation_status = 'active';
  if not found then raise exception 'Employee not found' using errcode = 'P0002'; end if;
  if not v_is_admin and v_employee.telegram_id <> p_actor_id then
    raise exception 'Employees can edit only their own row' using errcode = '42501';
  end if;

  v_employee_can_submit := case
    when v_week.employee_input_override is not null then v_week.employee_input_override
    else v_week.status = 'collecting' and now() <= v_week.submission_deadline
  end;
  if not v_is_admin and (p_mode <> 'availability' or not v_employee_can_submit) then
    raise exception 'Schedule input is closed' using errcode = '42501';
  end if;

  insert into public.schedule_entries (
    week_id, employee_profile_id, employee_telegram_id, employee_name,
    availability, final_schedule, comment, submitted_at, updated_by
  ) values (
    v_week.id, v_employee.id, v_employee.telegram_id, v_employee.full_name,
    case when p_mode = 'availability' then coalesce(p_values, '{}'::jsonb) else '{}'::jsonb end,
    case when p_mode = 'final' then coalesce(p_values, '{}'::jsonb) else '{}'::jsonb end,
    coalesce(p_comment, ''), now(), p_actor_id
  )
  on conflict (week_id, employee_profile_id) do update set
    availability = case when p_mode = 'availability' then excluded.availability else schedule_entries.availability end,
    final_schedule = case when p_mode = 'final' then excluded.final_schedule else schedule_entries.final_schedule end,
    comment = excluded.comment,
    submitted_at = case when p_mode = 'availability' then now() else schedule_entries.submitted_at end,
    updated_by = p_actor_id,
    updated_at = now()
  returning * into v_entry;
  update public.schedule_weeks set updated_at = now() where id = v_week.id;
  return to_jsonb(v_entry);
end;
$$;

revoke all on function public.schedule_set_input_access(bigint, date, boolean) from public;
grant execute on function public.schedule_set_input_access(bigint, date, boolean) to anon, authenticated;

commit;

-- Verification:
-- select to_regprocedure('public.schedule_set_input_access(bigint,date,boolean)');
