-- Chromex Employee Workspace v1
-- Apply in Supabase SQL Editor before enabling the employee task board.
-- Existing staff default to Account Manager, preserving their client access.
alter table public.profiles
  add column if not exists employee_role text;

update public.profiles
set employee_role = 'account_manager'
where role = 'staff' and employee_role is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_employee_role_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_employee_role_check
      check (employee_role is null or employee_role in ('account_manager', 'designer', 'strategist'));
  end if;
end $$;

-- Personal profile edits (name/avatar/title) are still allowed, but employees
-- must never be able to promote themselves or change their employee role.
create or replace function public.profiles_guard_employee_access()
returns trigger
language plpgsql
security definer
set search_path = public
as $
begin
  if auth.uid() is not null and not public.is_admin() and
     (new.role is distinct from old.role
      or new.employee_role is distinct from old.employee_role) then
    raise exception 'Only the owner can change user access roles';
  end if;
  return new;
end;
$;

drop trigger if exists profiles_guard_employee_access_trigger on public.profiles;
create trigger profiles_guard_employee_access_trigger
before update on public.profiles
for each row execute function public.profiles_guard_employee_access();

create table if not exists public.employee_tasks (
  id uuid primary key default gen_random_uuid(),
  assignee_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  client_id uuid references public.profiles(id) on delete set null,
  client_label text not null default '' check (char_length(client_label) <= 140),
  title text not null check (char_length(btrim(title)) between 1 and 240),
  description text not null default '' check (char_length(description) <= 4000),
  due_date date,
  status text not null default 'todo' check (status in ('todo', 'done')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists employee_tasks_assignee_due_idx
  on public.employee_tasks (assignee_id, status, due_date);
create index if not exists employee_tasks_created_idx
  on public.employee_tasks (created_at desc);

alter table public.employee_tasks enable row level security;
revoke all on public.employee_tasks from anon;
grant select, insert, update, delete on public.employee_tasks to authenticated;

drop policy if exists "Employees read assigned tasks, owner reads all" on public.employee_tasks;
create policy "Employees read assigned tasks, owner reads all"
  on public.employee_tasks for select to authenticated
  using (assignee_id = auth.uid() or public.is_admin());

drop policy if exists "Owner assigns tasks" on public.employee_tasks;
create policy "Owner assigns tasks"
  on public.employee_tasks for insert to authenticated
  with check (public.is_admin());

drop policy if exists "Employees check off tasks, owner manages tasks" on public.employee_tasks;
create policy "Employees check off tasks, owner manages tasks"
  on public.employee_tasks for update to authenticated
  using (assignee_id = auth.uid() or public.is_admin())
  with check (assignee_id = auth.uid() or public.is_admin());

drop policy if exists "Only owner deletes tasks" on public.employee_tasks;
create policy "Only owner deletes tasks"
  on public.employee_tasks for delete to authenticated
  using (public.is_admin());

-- RLS controls which rows employees can update; this trigger also enforces
-- column-level integrity so they can change ONLY completion status.
create or replace function public.employee_tasks_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = new.assignee_id and role = 'staff'
  ) then
    raise exception 'Tasks may only be assigned to Chromex team members';
  end if;

  if tg_op = 'UPDATE' then
    if auth.uid() is not null and not public.is_admin() then
      if old.assignee_id is distinct from auth.uid()
         or (new.assignee_id, new.created_by, new.client_id, new.client_label,
             new.title, new.description, new.due_date, new.created_at)
         is distinct from
            (old.assignee_id, old.created_by, old.client_id, old.client_label,
             old.title, old.description, old.due_date, old.created_at)
      then
        raise exception 'Employees can only update the completion status of their tasks';
      end if;
    end if;

    if new.status is distinct from old.status then
      new.completed_at := case when new.status = 'done' then now() else null end;
    else
      new.completed_at := old.completed_at;
    end if;
  else
    new.completed_at := case when new.status = 'done' then now() else null end;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists employee_tasks_guard_trigger on public.employee_tasks;
create trigger employee_tasks_guard_trigger
before insert or update on public.employee_tasks
for each row execute function public.employee_tasks_guard();

comment on table public.employee_tasks is
  'Employee work queue. Later workflow handoffs can react to status changes.';
