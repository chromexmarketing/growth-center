-- ============================================================
-- CHROMEX CLIENT PORTAL — DATABASE SCHEMA
-- Run this entire file in Supabase: SQL Editor > New query > Run
-- ============================================================

-- ---------- PROFILES ----------
-- One row per user (client or admin). Auto-created on signup via trigger.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text default '',
  brand_name text default '',
  platform text default 'klaviyo' check (platform in ('klaviyo', 'omnisend')),
  role text default 'client' check (role in ('client', 'admin')),
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

-- Helper: is the current user an admin?
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create policy "read own profile or admin reads all"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin());

create policy "admin updates profiles"
  on public.profiles for update
  using (public.is_admin());

-- Auto-create a profile row when a new auth user is created
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, first_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'first_name', ''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- CLIENT INTEGRATIONS (API KEYS) ----------
-- NO RLS policies granted to anon/authenticated = completely
-- invisible from the frontend. Only the service role (edge
-- functions) can read this table.
create table if not exists public.client_integrations (
  client_id uuid primary key references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('klaviyo', 'omnisend')),
  api_key text not null,
  created_at timestamptz default now()
);
alter table public.client_integrations enable row level security;
-- (deliberately no policies — locked to service role only)

-- ---------- CAMPAIGNS ----------
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  send_date date not null,
  description text default '',
  image_url text default '',
  status text default 'scheduled' check (status in ('scheduled', 'sent', 'draft')),
  created_at timestamptz default now()
);
alter table public.campaigns enable row level security;

create policy "clients read own campaigns, admin reads all"
  on public.campaigns for select
  using (auth.uid() = client_id or public.is_admin());

create policy "admin manages campaigns"
  on public.campaigns for all
  using (public.is_admin());

-- ---------- AUTOMATIONS ----------
create table if not exists public.automations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text default '',
  status text default 'live' check (status in ('live', 'paused', 'building')),
  created_at timestamptz default now()
);
alter table public.automations enable row level security;

create policy "clients read own automations, admin reads all"
  on public.automations for select
  using (auth.uid() = client_id or public.is_admin());

create policy "admin manages automations"
  on public.automations for all
  using (public.is_admin());

-- ---------- OPTIMIZATION NOTES ----------
create table if not exists public.optimization_notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text default '',
  created_at timestamptz default now()
);
alter table public.optimization_notes enable row level security;

create policy "clients read own notes, admin reads all"
  on public.optimization_notes for select
  using (auth.uid() = client_id or public.is_admin());

create policy "admin manages notes"
  on public.optimization_notes for all
  using (public.is_admin());

-- ---------- CHAT MESSAGES ----------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  sender_role text not null check (sender_role in ('client', 'admin')),
  body text not null,
  created_at timestamptz default now()
);
alter table public.messages enable row level security;

create policy "read own thread or admin reads all"
  on public.messages for select
  using (auth.uid() = client_id or public.is_admin());

create policy "client writes to own thread"
  on public.messages for insert
  with check (
    (auth.uid() = client_id and auth.uid() = sender_id and sender_role = 'client')
    or (public.is_admin() and auth.uid() = sender_id and sender_role = 'admin')
  );

-- Enable realtime for chat
alter publication supabase_realtime add table public.messages;

-- ---------- STORAGE (campaign images) ----------
insert into storage.buckets (id, name, public)
values ('campaign-images', 'campaign-images', true)
on conflict (id) do nothing;

create policy "public read campaign images"
  on storage.objects for select
  using (bucket_id = 'campaign-images');

create policy "admin uploads campaign images"
  on storage.objects for insert
  with check (bucket_id = 'campaign-images' and public.is_admin());

create policy "admin deletes campaign images"
  on storage.objects for delete
  using (bucket_id = 'campaign-images' and public.is_admin());
