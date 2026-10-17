begin;

-- Authentication is derived from the signed Supabase session, not p_actor_id.
create table if not exists public.admin_balance_adjustments (
  request_id uuid primary key,
  actor uuid not null,
  user_id bigint not null,
  kind text not null check (kind in ('balance','coins')),
  delta integer not null,
  reason text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.admin_balance_adjustments enable row level security;
revoke all on public.admin_balance_adjustments from anon, authenticated;

create or replace function public.admin_adjust_balance(
  p_request_id uuid, p_user_id bigint, p_kind text, p_delta integer, p_reason text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_user public.users%rowtype;
  v_old public.admin_balance_adjustments%rowtype;
  v_result jsonb;
  v_expected integer;
begin
  if v_actor is null or coalesce(auth.jwt()->'app_metadata'->>'admin_role','') not in ('super_admin','restaurant_admin') then
    raise exception 'Доступ разрешён только администраторам' using errcode='42501';
  end if;
  if p_request_id is null or p_kind not in ('balance','coins') or p_kind is null
     or p_delta is null or p_delta=0 or abs(p_delta::bigint)>100000
     or p_reason is null or length(trim(p_reason)) not between 1 and 200 then
    raise exception 'Проверьте вид операции, количество и причину';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  select * into v_old from public.admin_balance_adjustments where request_id=p_request_id;
  if found then
    if v_old.actor<>v_actor or v_old.user_id<>p_user_id or v_old.kind<>p_kind or v_old.delta<>p_delta or v_old.reason<>trim(p_reason) then
      raise exception 'Ключ операции уже использован для другого изменения';
    end if;
    return v_old.result;
  end if;
  select * into v_user from public.users where telegram_id=p_user_id for update;
  if not found or not exists(select 1 from public.employee_profiles where telegram_id=p_user_id and activation_status='active') then
    raise exception 'Сотрудник не активирован или находится в архиве';
  end if;
  v_expected := (case when p_kind='balance' then v_user.balance else v_user.coins end)+p_delta;
  if v_expected<0 then raise exception 'Недостаточно средств'; end if;
  if p_kind='balance' then
    -- The existing ledger trigger applies the balance delta.
    insert into public.transactions(user_id,amount,type,comment)
      values(p_user_id,p_delta,'balance_change','АП: '||trim(p_reason));
    select * into v_user from public.users where telegram_id=p_user_id;
    if v_user.balance<>v_expected then raise exception 'Начисление не подтверждено: проверьте триггер transactions'; end if;
  else
    update public.users set coins=v_expected,updated_at=now() where telegram_id=p_user_id returning * into v_user;
  end if;
  v_result:=jsonb_build_object('balance',v_user.balance,'coins',v_user.coins,'request_id',p_request_id);
  insert into public.admin_balance_adjustments(request_id,actor,user_id,kind,delta,reason,result)
    values(p_request_id,v_actor,p_user_id,p_kind,p_delta,trim(p_reason),v_result);
  return v_result;
end $$;
revoke all on function public.admin_adjust_balance(uuid,bigint,text,integer,text) from public,anon;
grant execute on function public.admin_adjust_balance(uuid,bigint,text,integer,text) to authenticated;
commit;
