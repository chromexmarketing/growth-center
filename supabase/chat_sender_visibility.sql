-- Include in the consolidated chat migration (not yet applied).
-- Allow a client to read only the public profile of staff who have
-- actually sent messages in that client's conversation.
-- The SECURITY DEFINER helper avoids recursive RLS evaluation.
create or replace function public.is_chat_sender_visible(target_user uuid)
returns boolean
language sql stable security definer set search_path=public
as $$
  select auth.uid() = target_user
    or public.is_admin()
    or exists (
      select 1 from public.messages m
      where m.sender_id = target_user
        and m.client_id = auth.uid()
    )
    or exists (
      select 1 from public.chat_members cm
      join public.messages m on m.client_id=cm.client_id
      where cm.user_id=auth.uid() and m.sender_id=target_user
    );
$$;
drop policy if exists "view sender profiles in own chat" on public.profiles;
create policy "view sender profiles in own chat"
on public.profiles for select to authenticated
using (public.is_chat_sender_visible(id));
-- IMPORTANT: profiles contains company settings. For the final release,
-- serve only display-safe fields via a restricted RPC/view rather than
-- granting unrestricted access to all columns on profiles.
