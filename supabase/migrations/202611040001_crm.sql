-- Изменения выполняются только через функции ниже с проверкой прав
-- Роль берём из защищённого профиля, а не из метаданных пользователя
begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create type public.app_role as enum ('manager', 'executor');
create type public.task_status as enum ('new', 'in_progress', 'review', 'accepted', 'rework');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  display_name text not null check (length(btrim(display_name)) between 1 and 120),
  role public.app_role not null
);
create table public.objects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 200),
  address text not null check (length(btrim(address)) between 1 and 500),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  version integer not null default 1,
  deleted_at timestamptz
);
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 200),
  description text not null default '' check (length(description) <= 10000),
  object_id uuid not null references public.objects(id),
  assignee_id uuid not null references public.profiles(id),
  status public.task_status not null default 'new',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  deleted_at timestamptz
);
create table public.task_history (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete restrict,
  actor_id uuid not null references public.profiles(id),
  from_status public.task_status,
  to_status public.task_status not null,
  comment text check (length(comment) <= 4000),
  created_at timestamptz not null default clock_timestamp(),
  check (to_status <> 'rework' or (comment is not null and comment ~ '[^[:space:]]'))
);
create index tasks_assignee_idx on public.tasks(assignee_id, object_id) where deleted_at is null;
create index tasks_object_idx on public.tasks(object_id) where deleted_at is null;
create index history_task_idx on public.task_history(task_id, created_at);

create function private.current_role() returns public.app_role
language sql stable security definer set search_path = ''
as $$ select role from public.profiles where id = (select auth.uid()) $$;
revoke all on function private.current_role() from public, anon, authenticated;
grant execute on function private.current_role() to authenticated;

alter table public.profiles enable row level security;
alter table public.objects enable row level security;
alter table public.tasks enable row level security;
alter table public.task_history enable row level security;

-- Общий справочник содержит только имена и роли, без email и данных входа
create policy profiles_read on public.profiles for select to authenticated
using ((select private.current_role()) is not null);
create policy tasks_read on public.tasks for select to authenticated using (
  (select private.current_role()) = 'manager'
  or (deleted_at is null and assignee_id = (select auth.uid()) and (select private.current_role()) = 'executor')
);
create policy objects_read on public.objects for select to authenticated using (
  (select private.current_role()) = 'manager'
  or (deleted_at is null and exists (
    select 1 from public.tasks t where t.object_id = objects.id
      and t.assignee_id = (select auth.uid()) and t.deleted_at is null
  ))
);
create policy history_read on public.task_history for select to authenticated using (
  (select private.current_role()) = 'manager'
  or exists (select 1 from public.tasks t where t.id = task_history.task_id
    and t.assignee_id = (select auth.uid()) and t.deleted_at is null)
);

-- Убираем широкие права Supabase по умолчанию перед выдачей нужных разрешений
revoke all on public.profiles, public.objects, public.tasks, public.task_history from public, anon, authenticated;
grant select on public.profiles, public.objects, public.tasks, public.task_history to authenticated;
grant select, insert, update, delete on public.profiles to service_role;
grant select on public.objects, public.tasks, public.task_history to service_role;

create function private.require_manager() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or private.current_role() is distinct from 'manager'::public.app_role then
    raise exception 'Действие доступно только постановщику' using errcode = '42501';
  end if;
end $$;

create function private.validate_assignment(p_object_id uuid, p_assignee_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  -- Блокировки защищают от одновременного удаления объекта и изменения исполнителя
  perform 1 from public.objects where id = p_object_id and deleted_at is null for share;
  if not found then raise exception 'Объект не найден' using errcode = '22023'; end if;
  perform 1 from public.profiles where id = p_assignee_id and role = 'executor' for share;
  if not found then raise exception 'Выберите действующего исполнителя' using errcode = '22023'; end if;
end $$;

create function public.create_object(p_name text, p_address text) returns public.objects
language plpgsql security definer set search_path = '' as $$
declare result public.objects;
begin
  perform private.require_manager();
  insert into public.objects(name, address, created_by)
    values (btrim(p_name), btrim(p_address), auth.uid()) returning * into result;
  return result;
end $$;
create function public.update_object(p_id uuid, p_name text, p_address text, p_expected_version integer) returns public.objects
language plpgsql security definer set search_path = '' as $$
declare result public.objects;
begin
  perform private.require_manager();
  update public.objects set name = btrim(p_name), address = btrim(p_address), version = version + 1
    where id = p_id and deleted_at is null and version = p_expected_version returning * into result;
  if not found then raise exception 'Объект изменён или удалён. Обновите страницу.' using errcode = '40001'; end if;
  return result;
end $$;
create function public.delete_object(p_id uuid, p_expected_version integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_manager();
  update public.objects set deleted_at = now(), version = version + 1
    where id = p_id and deleted_at is null and version = p_expected_version;
  if not found then raise exception 'Объект изменён или удалён. Обновите страницу.' using errcode = '40001'; end if;
  update public.tasks set deleted_at = now(), updated_at = now(), version = version + 1
    where object_id = p_id and deleted_at is null;
end $$;

create function public.create_task(p_title text, p_description text, p_object_id uuid, p_assignee_id uuid) returns public.tasks
language plpgsql security definer set search_path = '' as $$
declare result public.tasks;
begin
  perform private.require_manager();
  perform private.validate_assignment(p_object_id, p_assignee_id);
  insert into public.tasks(title, description, object_id, assignee_id, created_by)
    values (btrim(p_title), coalesce(p_description, ''), p_object_id, p_assignee_id, auth.uid()) returning * into result;
  insert into public.task_history(task_id, actor_id, from_status, to_status)
    values (result.id, auth.uid(), null, 'new');
  return result;
end $$;
create function public.update_task(p_id uuid, p_title text, p_description text, p_object_id uuid, p_assignee_id uuid, p_expected_version integer) returns public.tasks
language plpgsql security definer set search_path = '' as $$
declare result public.tasks;
begin
  perform private.require_manager();
  perform private.validate_assignment(p_object_id, p_assignee_id);
  update public.tasks set title = btrim(p_title), description = coalesce(p_description, ''),
    object_id = p_object_id, assignee_id = p_assignee_id, updated_at = now(), version = version + 1
    where id = p_id and deleted_at is null and version = p_expected_version returning * into result;
  if not found then raise exception 'Задача изменена или удалена. Обновите страницу.' using errcode = '40001'; end if;
  return result;
end $$;
create function public.delete_task(p_id uuid, p_expected_version integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_manager();
  update public.tasks set deleted_at = now(), updated_at = now(), version = version + 1
    where id = p_id and deleted_at is null and version = p_expected_version;
  if not found then raise exception 'Задача изменена или удалена. Обновите страницу.' using errcode = '40001'; end if;
end $$;

create function public.change_task_status(p_id uuid, p_to_status public.task_status, p_expected_version integer, p_comment text default null) returns public.tasks
language plpgsql security definer set search_path = '' as $$
declare current_task public.tasks; result public.tasks; actor_role public.app_role; clean_comment text;
begin
  actor_role := private.current_role();
  if auth.uid() is null or actor_role is null then raise exception 'Требуется вход' using errcode = '42501'; end if;
  -- Блокировка строки не даёт двум переходам одновременно изменить задачу
  select * into current_task from public.tasks where id = p_id and deleted_at is null for update;
  if not found or (actor_role <> 'manager' and current_task.assignee_id <> auth.uid()) then
    raise exception 'Задача недоступна' using errcode = '42501';
  end if;
  -- Отклоняем действие из устаревшей карточки, чтобы не затереть решение коллеги
  if p_expected_version is null or current_task.version <> p_expected_version then
    raise exception 'Задача уже изменена. Обновите страницу.' using errcode = '40001';
  end if;
  if p_to_status is null or not (
    (actor_role = 'executor' and current_task.assignee_id = auth.uid() and (
      (current_task.status in ('new', 'rework') and p_to_status = 'in_progress')
      or (current_task.status = 'in_progress' and p_to_status = 'review')
    )) or (actor_role = 'manager' and current_task.status = 'review' and p_to_status in ('accepted', 'rework'))
  ) then raise exception 'Этот переход статуса запрещён' using errcode = '42501'; end if;
  clean_comment := nullif(regexp_replace(p_comment, '^[[:space:]]+|[[:space:]]+$', '', 'g'), '');
  if p_to_status = 'rework' and clean_comment is null then
    raise exception 'Укажите причину возврата на доработку' using errcode = '22023';
  end if;
  if length(clean_comment) > 4000 then raise exception 'Комментарий слишком длинный' using errcode = '22023'; end if;
  update public.tasks set status = p_to_status, updated_at = now(), version = version + 1
    where id = p_id returning * into result;
  insert into public.task_history(task_id, actor_id, from_status, to_status, comment)
    values (p_id, auth.uid(), current_task.status, p_to_status, clean_comment);
  return result;
end $$;

revoke all on function private.require_manager(), private.validate_assignment(uuid, uuid) from public, anon, authenticated;
revoke all on function public.create_object(text, text), public.update_object(uuid, text, text, integer),
  public.delete_object(uuid, integer), public.create_task(text, text, uuid, uuid),
  public.update_task(uuid, text, text, uuid, uuid, integer), public.delete_task(uuid, integer),
  public.change_task_status(uuid, public.task_status, integer, text) from public, anon, authenticated;
grant execute on function public.create_object(text, text), public.update_object(uuid, text, text, integer),
  public.delete_object(uuid, integer), public.create_task(text, text, uuid, uuid),
  public.update_task(uuid, text, text, uuid, uuid, integer), public.delete_task(uuid, integer),
  public.change_task_status(uuid, public.task_status, integer, text) to authenticated;
commit;
