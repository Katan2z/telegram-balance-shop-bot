begin;

create or replace function public.admin_cleanup_orphan_users(p_actor_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidates integer;
  v_deleted integer;
begin
  if not public.schedule_is_admin(p_actor_id) then
    raise exception 'Only managers can clean up users' using errcode = '42501';
  end if;

  select count(*) into v_candidates
  from public.users u
  where not exists (select 1 from public.employee_profiles ep where ep.telegram_id = u.telegram_id);

  delete from public.users u
  where not exists (select 1 from public.employee_profiles ep where ep.telegram_id = u.telegram_id)
    and not exists (select 1 from public.managers m where m.telegram_id = u.telegram_id)
    and not exists (select 1 from public.transactions t where t.user_id = u.telegram_id)
    and not exists (select 1 from public.shop_purchases sp where sp.user_id = u.telegram_id)
    and not exists (
      select 1 from public.klokr_assessments ka
      where ka.employee_id = u.telegram_id or ka.instructor_id = u.telegram_id
    );
  get diagnostics v_deleted = row_count;

  return jsonb_build_object(
    'candidates', v_candidates,
    'deleted', v_deleted,
    'preserved', v_candidates - v_deleted
  );
end;
$$;

revoke all on function public.admin_cleanup_orphan_users(bigint) from public;
grant execute on function public.admin_cleanup_orphan_users(bigint) to anon, authenticated;

commit;

-- Verification:
-- select to_regprocedure('public.admin_cleanup_orphan_users(bigint)');
