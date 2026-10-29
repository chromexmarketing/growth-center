-- Chat enhancements: review before running on your Supabase project.
alter table public.profiles add column if not exists job_title text default '';
alter table public.profiles add column if not exists contact_email text;
alter table public.messages add column if not exists parent_id uuid references public.messages(id) on delete cascade;
alter table public.messages add column if not exists edited_at timestamptz;
alter table public.messages add column if not exists deleted_at timestamptz;
create index if not exists messages_parent_idx on public.messages(parent_id);
create table if not exists public.message_reactions (
 message_id uuid not null references public.messages(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 emoji text not null check (emoji in ('👍','❤️','😂','🎉','👀','🔥')),
 primary key(message_id,user_id,emoji)
);
alter table public.message_reactions enable row level security;
drop policy if exists "read reactions in accessible chats" on public.message_reactions;
create policy "read reactions in accessible chats" on public.message_reactions for select to authenticated
using (exists(select 1 from public.messages m where m.id=message_id and (m.client_id=auth.uid() or public.is_admin())));
drop policy if exists "react in accessible chats" on public.message_reactions;
create policy "react in accessible chats" on public.message_reactions for insert to authenticated
with check (user_id=auth.uid() and exists(select 1 from public.messages m where m.id=message_id and (m.client_id=auth.uid() or public.is_admin())));
drop policy if exists "remove own reaction" on public.message_reactions;
create policy "remove own reaction" on public.message_reactions for delete to authenticated using(user_id=auth.uid());
drop policy if exists "edit own messages" on public.messages;
create policy "edit own messages" on public.messages for update to authenticated
using(sender_id=auth.uid()) with check(sender_id=auth.uid());
-- Do not allow sender to change ownership or chat identity while editing.
create or replace function public.guard_message_update() returns trigger language plpgsql as $$
begin
 if new.client_id is distinct from old.client_id or new.sender_id is distinct from old.sender_id or new.sender_role is distinct from old.sender_role or new.parent_id is distinct from old.parent_id then
   raise exception 'Cannot change message ownership or thread';
 end if;
 return new;
end $$;
drop trigger if exists guard_message_update on public.messages;
create trigger guard_message_update before update on public.messages for each row execute function public.guard_message_update();
drop policy if exists "self edit profile" on public.profiles;
create policy "self edit profile" on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
-- Restrict self-service changes to display fields; admin editing may need separate service-role function.
grant update(first_name,job_title,avatar_url,contact_email) on public.profiles to authenticated;
