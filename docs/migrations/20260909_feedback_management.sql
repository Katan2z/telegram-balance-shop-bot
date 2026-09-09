begin;

create or replace function public.feedback_delete(p_actor_id bigint, p_feedback_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted bigint;
begin
  if not public.schedule_is_admin(p_actor_id) then
    raise exception 'Only managers can delete feedback' using errcode = '42501';
  end if;

  delete from public.bot_feedback where id = p_feedback_id returning id into v_deleted;
  return v_deleted is not null;
end;
$$;

revoke all on function public.feedback_delete(bigint,bigint) from public;
grant execute on function public.feedback_delete(bigint,bigint) to anon, authenticated;

commit;

-- Verification:
-- select to_regprocedure('public.feedback_delete(bigint,bigint)');
