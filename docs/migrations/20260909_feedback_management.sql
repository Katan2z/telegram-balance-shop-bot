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

create or replace function public.admin_save_shop_item(
  p_actor_id bigint,
  p_item_id bigint,
  p_title text,
  p_description text,
  p_price_coins bigint,
  p_image_url text,
  p_emoji text,
  p_is_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.shop_items%rowtype;
begin
  if not public.schedule_is_admin(p_actor_id) then
    raise exception 'Only managers can edit shop items' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_title, ''))) = 0 or p_price_coins < 1 then
    raise exception 'Название и цена обязательны' using errcode = '22023';
  end if;

  if p_item_id is null then
    insert into public.shop_items (title, description, price_coins, image_url, emoji, is_active, sort_order)
    values (trim(p_title), nullif(trim(p_description), ''), p_price_coins, nullif(trim(p_image_url), ''), coalesce(nullif(trim(p_emoji), ''), '🎁'), p_is_active,
      coalesce((select max(sort_order) + 1 from public.shop_items), 1))
    returning * into v_item;
  else
    update public.shop_items set
      title = trim(p_title), description = nullif(trim(p_description), ''), price_coins = p_price_coins,
      image_url = nullif(trim(p_image_url), ''), emoji = coalesce(nullif(trim(p_emoji), ''), '🎁'), is_active = p_is_active
    where id = p_item_id returning * into v_item;
    if not found then raise exception 'Товар не найден' using errcode = 'P0002'; end if;
  end if;
  return to_jsonb(v_item);
end;
$$;

revoke all on function public.admin_save_shop_item(bigint,bigint,text,text,bigint,text,text,boolean) from public;
grant execute on function public.admin_save_shop_item(bigint,bigint,text,text,bigint,text,text,boolean) to anon, authenticated;

commit;

-- Verification:
-- select to_regprocedure('public.feedback_delete(bigint,bigint)');
-- select to_regprocedure('public.admin_save_shop_item(bigint,bigint,text,text,bigint,text,text,boolean)');
