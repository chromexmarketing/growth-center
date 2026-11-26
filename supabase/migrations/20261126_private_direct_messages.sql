-- Private one-to-one conversations: no owner override, no staff snooping.
create table if not exists public.direct_conversations (
 id uuid primary key default gen_random_uuid(),
 client_id uuid not null references public.profiles(id) on delete cascade,
 person_a uuid not null references auth.users(id) on delete cascade,
 person_b uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check (person_a < person_b),
 unique(client_id,person_a,person_b)
);
create table if not exists public.direct_messages (
 id uuid primary key default gen_random_uuid(),
 conversation_id uuid not null references public.direct_conversations(id) on delete cascade,
 sender_id uuid not null references auth.users(id) on delete cascade,
 body text not null check (length(body) between 1 and 30000),
 attachment_path text,
 attachment_name text,
 attachment_type text,
 parent_id uuid references public.direct_messages(id),
 edited_at timestamptz,
 deleted_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists dm_messages_by_conversation on public.direct_messages(conversation_id,created_at);
create index if not exists dm_conversations_by_client on public.direct_conversations(client_id,updated_at desc);

-- Membership lookup is evaluated by a definer function to avoid recursive RLS.
create or replace function public.dm_is_client_member(workspace uuid, person uuid)
returns boolean language sql stable security definer set search_path=public
as $$
 select exists(select 1 from public.profiles where id=person and id=workspace and role='client')
 or exists(select 1 from public.client_memberships where client_id=workspace and user_id=person)
$$;
create or replace function public.dm_is_staff_member(workspace uuid, person uuid)
returns boolean language sql stable security definer set search_path=public
as $$
 select exists(select 1 from public.profiles where id=person and role='admin')
 or exists(select 1 from public.staff_assignments where client_id=workspace and staff_id=person)
$$;
create or replace function public.dm_valid_pair(workspace uuid, a uuid, b uuid)
returns boolean language sql stable security definer set search_path=public
as $$
 select a<>b and (
  (public.dm_is_client_member(workspace,a) and public.dm_is_staff_member(workspace,b))
  or (public.dm_is_client_member(workspace,b) and public.dm_is_staff_member(workspace,a))
 )
$$;
create or replace function public.dm_is_participant(conversation uuid)
returns boolean language sql stable security definer set search_path=public
as $$
 select exists(select 1 from public.direct_conversations c
 where c.id=conversation and auth.uid() in (c.person_a,c.person_b)
 and public.dm_valid_pair(c.client_id,c.person_a,c.person_b))
$$;
revoke all on function public.dm_is_client_member(uuid,uuid) from public;
revoke all on function public.dm_is_staff_member(uuid,uuid) from public;
revoke all on function public.dm_valid_pair(uuid,uuid,uuid) from public;
revoke all on function public.dm_is_participant(uuid) from public;
grant execute on function public.dm_is_client_member(uuid,uuid) to authenticated;
grant execute on function public.dm_is_staff_member(uuid,uuid) to authenticated;
grant execute on function public.dm_valid_pair(uuid,uuid,uuid) to authenticated;
grant execute on function public.dm_is_participant(uuid) to authenticated;

alter table public.direct_conversations enable row level security;
alter table public.direct_messages enable row level security;
drop policy if exists dm_conversations_read on public.direct_conversations;
drop policy if exists dm_conversations_create on public.direct_conversations;
drop policy if exists dm_messages_read on public.direct_messages;
drop policy if exists dm_messages_send on public.direct_messages;
drop policy if exists dm_messages_edit on public.direct_messages;
create policy dm_conversations_read on public.direct_conversations for select to authenticated
 using (auth.uid() in (person_a,person_b) and public.dm_valid_pair(client_id,person_a,person_b));
create policy dm_conversations_create on public.direct_conversations for insert to authenticated
 with check (auth.uid() in (person_a,person_b) and public.dm_valid_pair(client_id,person_a,person_b));
create policy dm_messages_read on public.direct_messages for select to authenticated
 using (public.dm_is_participant(conversation_id));
create policy dm_messages_send on public.direct_messages for insert to authenticated
 with check (sender_id=auth.uid() and public.dm_is_participant(conversation_id)
 and (parent_id is null or exists(select 1 from public.direct_messages p where p.id=parent_id and p.conversation_id=conversation_id)));
create policy dm_messages_edit on public.direct_messages for update to authenticated
 using (sender_id=auth.uid() and public.dm_is_participant(conversation_id))
 with check (sender_id=auth.uid() and public.dm_is_participant(conversation_id));

-- No user can move an existing message to a different conversation, or
-- change sender / attachment path through the update API.
create or replace function public.dm_guard_update()
returns trigger language plpgsql as $$
begin
 if new.conversation_id is distinct from old.conversation_id
 or new.sender_id is distinct from old.sender_id
 or new.attachment_path is distinct from old.attachment_path
 or new.parent_id is distinct from old.parent_id
 then raise exception 'Cannot change message ownership'; end if;
 return new;
end $$;
drop trigger if exists dm_guard_message_update on public.direct_messages;
create trigger dm_guard_message_update before update on public.direct_messages
for each row execute function public.dm_guard_update();

-- Private DM attachments, scoped by conversation UUID.
insert into storage.buckets(id,name,public,file_size_limit)
values ('direct-attachments','direct-attachments',false,10485760)
on conflict(id) do update set public=false;
drop policy if exists dm_attachments_read on storage.objects;
drop policy if exists dm_attachments_upload on storage.objects;
create policy dm_attachments_read on storage.objects for select to authenticated
 using (bucket_id='direct-attachments' and public.dm_is_participant((split_part(name,'/',1))::uuid));
create policy dm_attachments_upload on storage.objects for insert to authenticated
 with check (bucket_id='direct-attachments' and public.dm_is_participant((split_part(name,'/',1))::uuid));
