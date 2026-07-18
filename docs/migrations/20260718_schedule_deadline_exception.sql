begin;

-- One-time launch exception: availability for 27 July – 2 August can be submitted
-- through Sunday, 19 July 2026, 23:59 Moscow time.
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

update public.schedule_weeks
set submission_deadline = (date '2026-07-19' + time '23:59') at time zone 'Europe/Moscow',
    status = 'collecting',
    updated_at = now()
where week_start = date '2026-07-27';

commit;

-- Verification:
-- select week_start, submission_deadline at time zone 'Europe/Moscow'
-- from public.schedule_weeks where week_start = date '2026-07-27';
