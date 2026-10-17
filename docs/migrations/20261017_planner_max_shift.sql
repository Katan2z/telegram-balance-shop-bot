begin;
-- Publication-only guard: preserve historical drafts and do not rewrite shifts.
create or replace function public.planner_limit_published_shift()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare shift jsonb;
begin
  if new.published_at is not null then
    for shift in select value from jsonb_array_elements(new.document->'shifts') loop
      if jsonb_typeof(shift->'start') is distinct from 'number'
         or jsonb_typeof(shift->'end') is distinct from 'number' then
        raise exception 'У смены не указаны начало и конец';
      end if;
      if (shift->>'end')::numeric-(shift->>'start')::numeric>720 then
        raise exception 'Смена длиннее 12 часов. Сократите её перед публикацией';
      end if;
    end loop;
  end if;
  return new;
end $$;
revoke all on function public.planner_limit_published_shift() from public,anon,authenticated;
drop trigger if exists planner_published_shift_limit on public.planner_weeks;
create trigger planner_published_shift_limit before insert or update of published_at
  on public.planner_weeks for each row execute function public.planner_limit_published_shift();
commit;
