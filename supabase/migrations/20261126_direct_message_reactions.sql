-- Same emoji reactions in direct messages as in company chat.
-- RLS enforces participation; owners cannot see reactions in DMs they aren't in.
create table if not exists public.direct_message_reactions (
 message_id uuid not null references public.direct_messages(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 emoji text not null check (char_length(emoji) between 1 and 16),
 created_at timestamptz not null default now(),
 primary key (message_id,user_id,emoji)
);
alter table public.direct_message_reactions enable row level security;
drop policy if exists dm_reactions_read on public.direct_message_reactions;
drop policy if exists dm_reactions_add on public.direct_message_reactions;
drop policy if exists dm_reactions_remove on public.direct_message_reactions;
create policy dm_reactions_read on public.direct_message_reactions for select to authenticated
 using (exists(select 1 from public.direct_messages m where m.id=message_id and public.dm_is_participant(m.conversation_id)));
create policy dm_reactions_add on public.direct_message_reactions for insert to authenticated
 with check (user_id=auth.uid() and exists(select 1 from public.direct_messages m where m.id=message_id and m.deleted_at is null and public.dm_is_participant(m.conversation_id)));
create policy dm_reactions_remove on public.direct_message_reactions for delete to authenticated
 using (user_id=auth.uid() and exists(select 1 from public.direct_messages m where m.id=message_id and public.dm_is_participant(m.conversation_id)));
