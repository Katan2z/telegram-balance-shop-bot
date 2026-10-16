begin;
-- Additive: no updates to existing weeks until explicit publication.
create table if not exists public.planner_weeks (
  week_start date primary key check(extract(isodow from week_start)=1),
  version integer not null default 1,
  document jsonb not null,
  source_hash text not null,
  updated_by uuid not null,
  updated_at timestamptz not null default now(),
  published_at timestamptz
);
create table if not exists public.planner_versions (
  week_start date not null references public.planner_weeks(week_start),
  version integer not null, document jsonb not null, source_hash text not null,
  created_by uuid not null, created_at timestamptz not null default now(),
  primary key(week_start,version)
);
alter table public.planner_weeks enable row level security;
alter table public.planner_versions enable row level security;
revoke all on public.planner_weeks, public.planner_versions from public,anon,authenticated;

create or replace function public.planner_require_admin() returns uuid
language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null or not coalesce((
    auth.jwt()->'app_metadata'->>'admin_role'='super_admin' or
    (auth.jwt()->'app_metadata'->>'admin_role'='restaurant_admin' and auth.jwt()->'app_metadata'->>'restaurant_key'='bk8')
  ),false) then raise exception 'Требуется сессия администратора BK8' using errcode='42501'; end if;
  return auth.uid();
end $$;

create or replace function public.planner_source(p_week date) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
  perform public.planner_require_admin();
  select coalesce(jsonb_agg(jsonb_build_object(
    'employee_profile_id',ep.id,'employee_name',ep.full_name,
    'employee_telegram_id',ep.telegram_id,'availability',coalesce(se.availability,'{}'::jsonb),
    'work_type',coalesce(sp.work_type,'FT'),'regular_days_off',coalesce(sp.regular_days_off,'{}'::jsonb),
    'comment',coalesce(se.comment,'')
  ) order by ep.id),'[]'::jsonb) into result
  from public.employee_profiles ep
  left join public.schedule_weeks sw on sw.week_start=p_week
  left join public.schedule_entries se on se.week_id=sw.id and se.employee_profile_id=ep.id
  left join public.schedule_preferences sp on sp.employee_profile_id=ep.id
  where ep.activation_status='active' and ep.telegram_id is not null
    and ep.telegram_id<>818748106
    and not exists(select 1 from public.managers m where m.telegram_id=ep.telegram_id)
    and not(lower(coalesce(ep.position,'')) ~ '(менеджер|заместител|управляющ)');
  return result;
end $$;

create or replace function public.planner_get_week(p_week date) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare src jsonb; row public.planner_weeks%rowtype;
begin
  perform public.planner_require_admin();
  if extract(isodow from p_week)<>1 then raise exception 'Выберите понедельник';end if;
  src:=public.planner_source(p_week);
  select * into row from public.planner_weeks where week_start=p_week;
  return jsonb_build_object('employees',src,'sourceHash',md5(src::text),'document',row.document,'defaults',
    (select document->'config' from public.planner_weeks where week_start<p_week order by week_start desc limit 1),
    'version',coalesce(row.version,0),'savedSourceHash',row.source_hash,'publishedAt',row.published_at);
end $$;

create or replace function public.planner_save_week(p_week date,p_version integer,p_source_hash text,p_document jsonb) returns integer
language plpgsql security definer set search_path=public as $$
declare actor uuid; current_version integer; new_version integer;
begin
  actor:=public.planner_require_admin();
  if extract(isodow from p_week)<>1 or p_document is null or jsonb_typeof(p_document)<>'object'
    or jsonb_typeof(p_document->'config') is distinct from 'object'
    or jsonb_typeof(p_document->'shifts') is distinct from 'array'
    or length(p_document::text)>2000000 then raise exception 'Некорректный документ планировщика';end if;
  perform pg_advisory_xact_lock(hashtext('planner:'||p_week::text));
  select version into current_version from public.planner_weeks where week_start=p_week for update;
  if coalesce(current_version,0)<>p_version then raise exception 'Версия устарела. Перечитайте неделю.' using errcode='40001';end if;
  if md5(public.planner_source(p_week)::text) is distinct from p_source_hash then raise exception 'Возможности изменились. Обновите исходные данные.' using errcode='40001';end if;
  new_version:=coalesce(current_version,0)+1;
  insert into public.planner_weeks(week_start,version,document,source_hash,updated_by)
    values(p_week,new_version,p_document,p_source_hash,actor)
  on conflict(week_start) do update set version=excluded.version,document=excluded.document,source_hash=excluded.source_hash,updated_by=actor,updated_at=now();
  insert into public.planner_versions(week_start,version,document,source_hash,created_by) values(p_week,new_version,p_document,p_source_hash,actor);
  return new_version;
end $$;

create or replace function public.planner_minutes(p_text text) returns integer
language plpgsql immutable set search_path=public as $$
declare pieces text[];h integer;m integer;
begin
  if p_text is null or trim(p_text)!~'^\d{1,2}(:[0-5]\d)?$' then return null;end if;
  pieces:=string_to_array(trim(p_text),':');h:=pieces[1]::integer;m:=coalesce(pieces[2],'0')::integer;
  if h>48 or (h=48 and m<>0) then return null;end if;
  return h*60+m;
end $$;

create or replace function public.planner_publish_week(p_week date,p_version integer,p_acknowledge boolean default false) returns jsonb
language plpgsql security definer set search_path=public as $$
declare actor uuid;row public.planner_weeks%rowtype;src jsonb;e jsonb;s jsonb;other jsonb;
  day text;raw text;parts text[];a integer;b integer;st integer;en integer;t integer;position text;
  p jsonb;skill jsonb;week_id bigint;values_by_employee jsonb:='{}';employee_key text;day_index integer;type text;bounds jsonb;
begin
  actor:=public.planner_require_admin();
  perform pg_advisory_xact_lock(hashtext('planner:'||p_week::text));
  select * into row from public.planner_weeks where week_start=p_week for update;
  if row.version is distinct from p_version then raise exception 'Версия устарела' using errcode='40001';end if;
  perform 1 from public.schedule_weeks where week_start=p_week for update;
  perform 1 from public.schedule_entries se_lock where se_lock.week_id in(select id from public.schedule_weeks where week_start=p_week) for update;
  perform 1 from public.schedule_preferences for share;
  src:=public.planner_source(p_week);
  if row.source_hash is distinct from md5(src::text) then raise exception 'Возможности изменились' using errcode='40001';end if;
  if not p_acknowledge then raise exception 'Подтвердите проверку покрытия и SPMH';end if;
  if coalesce((row.document->'config'->>'spmh')::numeric,0)<=0 then raise exception 'Укажите целевой SPMH';end if;
  for s in select value from jsonb_array_elements(row.document->'shifts') loop
    day:=s->>'day';employee_key:=s->>'employeeId';
    if day not in('mon','tue','wed','thu','fri','sat','sun') then raise exception 'Некорректный день';end if;
    if values_by_employee->employee_key ? day then raise exception 'Несколько смен за день';end if;
    select value into e from jsonb_array_elements(src) where value->>'employee_profile_id'=employee_key;
    if e is null then raise exception 'Сотрудник недоступен';end if;
    raw:=trim(coalesce(e->'availability'->>day,''));
    if coalesce((e->'regular_days_off'->>day)::boolean,false) then raise exception 'Постоянный выходной';end if;
    p:=row.document->'config'->'periods'->day;
    if p is null or p->>'open' is null or p->>'close' is null or p->>'prep' is null or p->>'cleanup' is null
      or (p->>'open')::integer<0 or (p->>'close')::integer<=(p->>'open')::integer
      or (p->>'prep')::integer<0 or (p->>'cleanup')::integer<0 then raise exception 'Некорректный режим работы';end if;
    if lower(raw) in('фт','ft','full time') then
      a:=(p->>'open')::integer-(p->>'prep')::integer;b:=(p->>'close')::integer+(p->>'cleanup')::integer;
    else
      parts:=regexp_split_to_array(translate(raw,'–—−','---'),'\s*-\s*');
      if array_length(parts,1)<>2 then raise exception 'Не распознаны возможности';end if;
      a:=public.planner_minutes(parts[1]);b:=public.planner_minutes(parts[2]);
      if a is null or b is null then raise exception 'Не распознаны часы';end if;
      if b<=a then b:=b+1440;end if;
      a:=greatest(a,(p->>'open')::integer-(p->>'prep')::integer);b:=least(b,(p->>'close')::integer+(p->>'cleanup')::integer);
    end if;
    type:=upper(coalesce(e->>'work_type','FT'));
    if type in('PT1','PT2') then bounds:=row.document->'config'->lower(type);if bounds->>0 is null or bounds->>1 is null then raise exception 'Не заданы границы ПТ';end if;a:=greatest(a,(bounds->>0)::integer);b:=least(b,(bounds->>1)::integer);end if;
    st:=(s->>'start')::integer;en:=(s->>'end')::integer;
    if st is null or en is null or st<a or en>b or en<=st or st%30<>0 or en%30<>0 or st<0 or en>2880 then raise exception 'Смена вне доступности';end if;
    skill:=row.document->'config'->'skills'->employee_key;
    for t in select generate_series(st,en-30,30) loop
      position:=s->'positions'->>t::text;
      if position is null or not coalesce(skill->'roles' ? position,false) or not coalesce((row.document->'config'->'roles'->position->>'enabled')::boolean,false) then raise exception 'Недопустимая позиция';end if;
    end loop;
    day_index:=array_position(array['mon','tue','wed','thu','fri','sat','sun'],day)-1;
    for other in select value from jsonb_array_elements(row.document->'shifts') where value->>'employeeId'=employee_key and value->>'day'<>day loop
      if day_index*1440+st<(array_position(array['mon','tue','wed','thu','fri','sat','sun'],other->>'day')-1)*1440+(other->>'end')::integer
       and (array_position(array['mon','tue','wed','thu','fri','sat','sun'],other->>'day')-1)*1440+(other->>'start')::integer<day_index*1440+en then raise exception 'Пересечение смен';end if;
    end loop;
    if not values_by_employee ? employee_key then values_by_employee:=values_by_employee||jsonb_build_object(employee_key,'{}'::jsonb);end if;
    values_by_employee:=jsonb_set(values_by_employee,array[employee_key,day],to_jsonb(lpad((st/60)::text,2,'0')||':'||lpad((st%60)::text,2,'0')||'–'||lpad((en/60)::text,2,'0')||':'||lpad((en%60)::text,2,'0')));
  end loop;
  insert into public.schedule_weeks(week_start,submission_deadline,status,published_at)
    values(p_week,((p_week-5)+time '23:59') at time zone 'Europe/Minsk','published',now())
    on conflict(week_start) do update set status='published',published_at=now(),updated_at=now() returning id into week_id;
  for e in select value from jsonb_array_elements(src) loop
    employee_key:=e->>'employee_profile_id';
    p:='{"mon":"Выходной","tue":"Выходной","wed":"Выходной","thu":"Выходной","fri":"Выходной","sat":"Выходной","sun":"Выходной"}'::jsonb||coalesce(values_by_employee->employee_key,'{}'::jsonb);
    insert into public.schedule_entries(week_id,employee_profile_id,employee_telegram_id,employee_name,final_schedule)
      values(week_id,employee_key::bigint,(e->>'employee_telegram_id')::bigint,e->>'employee_name',p)
    on conflict on constraint schedule_entries_week_id_employee_profile_id_key do update set final_schedule=excluded.final_schedule,updated_at=now();
  end loop;
  update public.planner_weeks set published_at=now() where week_start=p_week;
  return jsonb_build_object('published',true,'version',p_version);
end $$;

revoke all on function public.planner_require_admin(),public.planner_source(date),public.planner_get_week(date),public.planner_save_week(date,integer,text,jsonb),public.planner_minutes(text),public.planner_publish_week(date,integer,boolean) from public,anon,authenticated;
grant execute on function public.planner_get_week(date),public.planner_save_week(date,integer,text,jsonb),public.planner_publish_week(date,integer,boolean) to authenticated;
commit;
