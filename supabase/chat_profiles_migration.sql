-- Chat profile pictures and workspace member directory.
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists last_name text default '';
create table if not exists public.chat_members (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 client_id uuid not null references public.profiles(id) on delete cascade,
 member_role text not null default 'client' check (member_role in ('client','staff'))
);
create index if not exists chat_members_client_idx on public.chat_members(client_id);
alter table public.chat_members enable row level security;
create or replace function public.can_view_chat_member(target_client uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select public.is_admin() or auth.uid()=target_client
 or exists(select 1 from public.chat_members where user_id=auth.uid() and client_id=target_client);
$$;
drop policy if exists "chat member directory" on public.chat_members;
create policy "chat member directory" on public.chat_members for select to authenticated
using(public.can_view_chat_member(client_id));
drop policy if exists "chat member profiles" on public.profiles;
create policy "chat member profiles" on public.profiles for select to authenticated
using(exists(select 1 from public.chat_members m where m.user_id=profiles.id and public.can_view_chat_member(m.client_id)));
-- Allow authenticated users to change only their display name and avatar.
grant update(first_name,last_name,avatar_url) on public.profiles to authenticated;
drop policy if exists "self edit profile" on public.profiles;
create policy "self edit profile" on public.profiles for update to authenticated
using(id=auth.uid()) with check(id=auth.uid());
insert into storage.buckets(id,name,public) values('chat-avatars','chat-avatars',true) on conflict(id) do nothing;
drop policy if exists "avatar own upload" on storage.objects;
create policy "avatar own upload" on storage.objects for insert to authenticated
with check(bucket_id='chat-avatars' and split_part(name,'/',1)=auth.uid()::text);
drop policy if exists "avatar own update" on storage.objects;
create policy "avatar own update" on storage.objects for update to authenticated
using(bucket_id='chat-avatars' and split_part(name,'/',1)=auth.uid()::text);
drop policy if exists "avatar public read" on storage.objects;
create policy "avatar public read" on storage.objects for select using(bucket_id='chat-avatars');
-- Membership creation and the three-representative limit will be handled by a separate admin-only function.
