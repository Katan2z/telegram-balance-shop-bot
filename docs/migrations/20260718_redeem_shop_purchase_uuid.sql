begin;

create or replace function public.redeem_shop_purchase(
  p_purchase_id uuid,
  p_manager_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase public.shop_purchases%rowtype;
begin
  if p_manager_id <> 818748106
     and not exists (
       select 1
       from public.managers m
       where m.telegram_id = p_manager_id
     ) then
    raise exception 'Only a manager or the root admin can redeem a purchase'
      using errcode = '42501';
  end if;

  update public.shop_purchases
  set status = 'redeemed'
  where id = p_purchase_id
    and status = 'active'
    and expires_at > now()
  returning * into v_purchase;

  if not found then
    raise exception 'Purchase is missing, expired, or already redeemed'
      using errcode = 'P0002';
  end if;

  return to_jsonb(v_purchase);
end;
$$;

revoke all on function public.redeem_shop_purchase(uuid, bigint) from public;
grant execute on function public.redeem_shop_purchase(uuid, bigint) to anon, authenticated;

drop function if exists public.redeem_shop_purchase(bigint, bigint);

commit;

-- Verification after applying:
-- select to_regprocedure('public.redeem_shop_purchase(uuid,bigint)');
