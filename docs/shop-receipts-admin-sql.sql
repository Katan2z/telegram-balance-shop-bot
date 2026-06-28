-- Права для подтверждения чеков магазина в Mini App
-- Выполнить один раз в Supabase SQL Editor, если подтверждение чека не проходит.

alter table public.shop_purchases disable row level security;

grant usage on schema public to anon;
grant select, update on table public.shop_purchases to anon;

grant usage on schema public to authenticated;
grant select, update on table public.shop_purchases to authenticated;

-- Подтверждение выдачи работает так:
-- active -> redeemed
-- Активные чеки у сотрудника после этого пропадают.
