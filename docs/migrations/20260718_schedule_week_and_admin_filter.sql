begin;

-- Correct the launch collection week and close the mistakenly selected week.
update public.schedule_weeks
set submission_deadline = ((date '2026-07-20' - 5) + time '23:59') at time zone 'Europe/Moscow',
    employee_input_override = false,
    updated_at = now()
where week_start = date '2026-07-20';

insert into public.schedule_weeks (
  week_start, submission_deadline, status, employee_input_override, created_by
) values (
  date '2026-07-27',
  (date '2026-07-19' + time '23:59') at time zone 'Europe/Moscow',
  'collecting', null, 818748106
)
on conflict (week_start) do update set
  submission_deadline = excluded.submission_deadline,
  employee_input_override = null,
  status = 'collecting',
  updated_at = now();

create or replace function public.schedule_ensure_week(p_actor_id bigint, p_week_start date)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week_id bigint;
  v_deadline timestamptz;
begin
  if extract(isodow from p_week_start) <> 1 then
    raise exception 'week_start must be Monday' using errcode = '22007';
  end if;
  if not public.schedule_is_admin(p_actor_id)
     and not exists (
       select 1 from public.employee_profiles ep
       where ep.telegram_id = p_actor_id and ep.activation_status = 'active'
     ) then
    raise exception 'Active employee profile required' using errcode = '42501';
  end if;

  v_deadline := case
    when p_week_start = date '2026-07-27'
      then (date '2026-07-19' + time '23:59') at time zone 'Europe/Moscow'
    else ((p_week_start - 5) + time '23:59') at time zone 'Europe/Moscow'
  end;

  insert into public.schedule_weeks (week_start, submission_deadline, created_by)
  values (p_week_start, v_deadline, p_actor_id)
  on conflict (week_start) do update
    set submission_deadline = excluded.submission_deadline,
        updated_at = now()
  returning id into v_week_id;
  return v_week_id;
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

commit;

-- Verification:
-- select week_start, submission_deadline at time zone 'Europe/Moscow', employee_input_override
-- from public.schedule_weeks where week_start in (date '2026-07-20', date '2026-07-27');
