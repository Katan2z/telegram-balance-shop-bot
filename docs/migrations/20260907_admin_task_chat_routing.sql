begin;

alter table public.admin_tasks
  add column if not exists notification_chat_id bigint,
  add column if not exists notification_thread_id bigint,
  add column if not exists priority text not null default 'normal';

alter table public.admin_tasks
  drop constraint if exists admin_tasks_priority_check;
alter table public.admin_tasks
  add constraint admin_tasks_priority_check
  check (priority in ('normal', 'important', 'urgent'));

create index if not exists admin_tasks_notification_chat_idx
  on public.admin_tasks (notification_chat_id, notified_at)
  where notified_at is null;

grant select, insert, update, delete on public.admin_tasks to authenticated;

commit;

-- Verification:
-- select column_name from information_schema.columns
-- where table_schema = 'public' and table_name = 'admin_tasks'
-- and column_name in ('notification_chat_id', 'notification_thread_id', 'priority');
