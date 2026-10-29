-- Chromex chat consolidated migration, 2026-10-29
-- Designed for the schema in supabase/schema.sql. Run once in SQL Editor.
begin;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists last_name text default '';
alter table public.profiles add column if not exists job_title text default '';
alter table public.profiles add column if not exists contact_email text;
alter table public.messages add column if not exists parent_id uuid references public.messages(id) on delete cascade;
alter table public.messages add column if not exists edited_at timestamptz;
alter table public.messages add column if not exists deleted_at timestamptz;
create index if not exists messages_parent_idx on public.messages(parent_id);

-- Shared company memberships. Admins are staff; each client representative
-- belongs to one company, identified by the original client profile id.
create table if not exists public.chat_members (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  member_role text not null default 'client' check (member_role in ('client','staff')),
  created_at timestamptz not null default now()
);
create index if not exists chat_members_client_idx on public.chat_members(client_id);
alter table public.chat_members enable row level security;

create or replace function public.chat_company_for_user(uid uuid)
returns uuid language sql stable security definer set search_path=public as $$
 select coalesce((select client_id from public.chat_members where user_id=uid),
 (select id from public.profiles where id=uid and role='client'));
$$;
create or replace function public.can_access_company_chat(company uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and
 (public.is_admin() or public.chat_company_for_user(auth.uid())=company);
$$;
drop policy if exists "chat members read" on public.chat_members;
create policy "chat members read" on public.chat_members for select to authenticated
using(public.can_access_company_chat(client_id));
-- No direct member writes: account creation/assignment must use a trusted admin backend.

-- Only allow profile lookup for senders in a chat the user can access.
-- NOTE: public.profiles has no secrets in the checked-in base schema;
-- client_integrations is a separate locked table.
create or replace function public.can_view_chat_profile(target_user uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select auth.uid()=target_user or public.is_admin() or exists (
  select 1 from public.messages m where m.sender_id=target_user
  and public.can_access_company_chat(m.client_id)
 );
$$;
drop policy if exists "chat sender profile lookup" on public.profiles;
create policy "chat sender profile lookup" on public.profiles for select to authenticated
using(public.can_view_chat_profile(id));
drop policy if exists "self edit profile" on public.profiles;
create policy "self edit profile" on public.profiles for update to authenticated
using(id=auth.uid()) with check(id=auth.uid());
-- Existing admin update policy remains. Do not grant changes to role or company.
grant update(first_name,last_name,job_title,contact_email,avatar_url) on public.profiles to authenticated;

-- Permit members of the same company to read/write messages.
drop policy if exists "company chat read" on public.messages;
create policy "company chat read" on public.messages for select to authenticated
using(public.can_access_company_chat(client_id));
drop policy if exists "company chat insert" on public.messages;
create policy "company chat insert" on public.messages for insert to authenticated
with check(public.can_access_company_chat(client_id)
 and sender_id=auth.uid()
 and sender_role=case when public.is_admin() then 'admin' else 'client' end
 and (parent_id is null or exists(select 1 from public.messages parent where parent.id=parent_id and parent.client_id=messages.client_id)));
drop policy if exists "edit own messages" on public.messages;
create policy "edit own messages" on public.messages for update to authenticated
using(sender_id=auth.uid() and public.can_access_company_chat(client_id))
with check(sender_id=auth.uid() and public.can_access_company_chat(client_id));
create or replace function public.guard_message_update()
returns trigger language plpgsql as $$
begin
 if new.client_id is distinct from old.client_id or
 new.sender_id is distinct from old.sender_id or
 new.sender_role is distinct from old.sender_role or
 new.parent_id is distinct from old.parent_id or
 new.created_at is distinct from old.created_at then
 raise exception 'Cannot change message ownership, thread or creation time';
 end if;
 return new;
end $$;
drop trigger if exists guard_message_update on public.messages;
create trigger guard_message_update before update on public.messages
for each row execute function public.guard_message_update();

create table if not exists public.message_reactions (
 message_id uuid not null references public.messages(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 emoji text not null check(emoji in ('👍','❤️','😂','🎉','👀','🔥')),
 primary key(message_id,user_id,emoji)
);
alter table public.message_reactions enable row level security;
drop policy if exists "read reactions in accessible chats" on public.message_reactions;
create policy "read reactions in accessible chats" on public.message_reactions for select to authenticated
using(exists(select 1 from public.messages m where m.id=message_id and public.can_access_company_chat(m.client_id)));
drop policy if exists "react in accessible chats" on public.message_reactions;
create policy "react in accessible chats" on public.message_reactions for insert to authenticated
with check(user_id=auth.uid() and exists(select 1 from public.messages m where m.id=message_id and public.can_access_company_chat(m.client_id)));
drop policy if exists "remove own reaction" on public.message_reactions;
create policy "remove own reaction" on public.message_reactions for delete to authenticated
using(user_id=auth.uid() and exists(select 1 from public.messages m where m.id=message_id and public.can_access_company_chat(m.client_id)));

create table if not exists public.chat_read_state(
 user_id uuid not null references public.profiles(id) on delete cascade,
 client_id uuid not null references public.profiles(id) on delete cascade,
 last_read_at timestamptz not null default now(),
 primary key(user_id,client_id)
);
alter table public.chat_read_state enable row level security;
drop policy if exists "own read state" on public.chat_read_state;
create policy "own read state" on public.chat_read_state for all to authenticated
using(user_id=auth.uid() and public.can_access_company_chat(client_id))
with check(user_id=auth.uid() and public.can_access_company_chat(client_id));

commit;

-- Storage buckets (public avatars, private attachments).
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('chat-avatars','chat-avatars',true,3145728,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=3145728,allowed_mime_types=excluded.allowed_mime_types;
insert into storage.buckets(id,name,public,file_size_limit)
values('chat-attachments','chat-attachments',false,10485760)
on conflict(id) do update set public=false,file_size_limit=10485760;

drop policy if exists "avatar public read" on storage.objects;
create policy "avatar public read" on storage.objects for select using(bucket_id='chat-avatars');
drop policy if exists "avatar own upload" on storage.objects;
create policy "avatar own upload" on storage.objects for insert to authenticated
with check(bucket_id='chat-avatars' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "avatar own update" on storage.objects;
create policy "avatar own update" on storage.objects for update to authenticated
using(bucket_id='chat-avatars' and (storage.foldername(name))[1]=auth.uid()::text)
with check(bucket_id='chat-avatars' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "avatar own delete" on storage.objects;
create policy "avatar own delete" on storage.objects for delete to authenticated
using(bucket_id='chat-avatars' and (storage.foldername(name))[1]=auth.uid()::text);

-- Attachment paths: <company-id>/<user-id>/<file>
drop policy if exists "chat attachment read" on storage.objects;
create policy "chat attachment read" on storage.objects for select to authenticated
using(bucket_id='chat-attachments' and public.can_access_company_chat(((storage.foldername(name))[1])::uuid));
drop policy if exists "chat attachment upload" on storage.objects;
create policy "chat attachment upload" on storage.objects for insert to authenticated
with check(bucket_id='chat-attachments' and (storage.foldername(name))[2]=auth.uid()::text
and public.can_access_company_chat(((storage.foldername(name))[1])::uuid));
drop policy if exists "chat attachment own delete" on storage.objects;
create policy "chat attachment own delete" on storage.objects for delete to authenticated
using(bucket_id='chat-attachments' and (storage.foldername(name))[2]=auth.uid()::text
and public.can_access_company_chat(((storage.foldername(name))[1])::uuid));

notify pgrst, 'reload schema';
