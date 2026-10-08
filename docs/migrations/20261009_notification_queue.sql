begin;

alter table public.admin_notifications
  add column if not exists lease_token uuid,
  add column if not exists lease_until timestamptz,
  add column if not exists delivery_attempts integer not null default 0,
  add column if not exists last_error text;

create or replace function public.claim_admin_notifications(p_limit integer default 1)
returns setof public.admin_notifications
language sql security definer set search_path = public
as $$
  with candidates as (
    select id from public.admin_notifications
    where is_active and next_send_at <= now()
      and (lease_until is null or lease_until < now())
    order by next_send_at
    for update skip locked
    limit greatest(1, least(p_limit, 10))
  )
  update public.admin_notifications n
  set lease_token = gen_random_uuid(), lease_until = now() + interval '10 minutes',
      delivery_attempts = delivery_attempts + 1
  from candidates c where n.id = c.id
  returning n.*;
$$;

create or replace function public.finish_admin_notification(p_id bigint, p_token uuid, p_error text default null)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  update public.admin_notifications
  set last_sent_at = case when p_error is null then now() else last_sent_at end,
      next_send_at = case
        when p_error is not null then now() + make_interval(secs => least(3600, 30 * power(2, least(delivery_attempts, 7)))::double precision)
        when repeat_hours is not null then now() + make_interval(hours => repeat_hours)
        else next_send_at end,
      is_active = case when p_error is null and repeat_hours is null then false else is_active end,
      last_error = left(p_error, 1000),
      delivery_attempts = case when p_error is null then 0 else delivery_attempts end,
      lease_token = null, lease_until = null
  where id = p_id and lease_token = p_token;
  return found;
end;
$$;

revoke all on function public.claim_admin_notifications(integer) from public, anon, authenticated;
revoke all on function public.finish_admin_notification(bigint,uuid,text) from public, anon, authenticated;
grant execute on function public.claim_admin_notifications(integer) to service_role;
grant execute on function public.finish_admin_notification(bigint,uuid,text) to service_role;

commit;
