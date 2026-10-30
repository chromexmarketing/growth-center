-- Client-only web push subscriptions. Apply using Supabase SQL migrations.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
create policy "Clients manage their own push subscriptions"
  on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid() and exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role in ('client','client_member')
  ))
  with check (user_id = auth.uid() and exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role in ('client','client_member')
  ));
-- Configure a Supabase Database Webhook on public.messages INSERT to
-- POST to /functions/v1/send-chat-push with Authorization: Bearer <WEBHOOK_SECRET>.
-- Never expose the service-role key or VAPID private key in frontend env vars.
