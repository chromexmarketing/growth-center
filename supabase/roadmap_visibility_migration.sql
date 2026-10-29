-- Roadmap visibility and naming; safe for existing clients (default hidden).
create table if not exists public.roadmap_settings (
  client_id uuid primary key references public.profiles(id) on delete cascade,
  enabled boolean not null default false,
  title text not null default 'Roadmap',
  template_type text not null default 'growth'
    check (template_type in ('onboarding','growth')),
  updated_at timestamptz not null default now()
);
alter table public.roadmap_settings enable row level security;
drop policy if exists "roadmap_settings_select" on public.roadmap_settings;
create policy "roadmap_settings_select" on public.roadmap_settings
  for select to authenticated using (auth.uid() = client_id or public.is_admin());
drop policy if exists "roadmap_settings_admin_insert" on public.roadmap_settings;
create policy "roadmap_settings_admin_insert" on public.roadmap_settings
  for insert to authenticated with check (public.is_admin());
drop policy if exists "roadmap_settings_admin_update" on public.roadmap_settings;
create policy "roadmap_settings_admin_update" on public.roadmap_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
-- Existing roadmaps stay hidden until an admin explicitly enables them.
-- Replace the earlier select policy to enforce visibility at the DB level.
drop policy if exists "roadmap_client_read" on public.roadmap_items;
create policy "roadmap_client_read" on public.roadmap_items
  for select to authenticated
  using (
    public.is_admin()
    or (
      client_id = auth.uid()
      and exists (
        select 1 from public.roadmap_settings s
        where s.client_id = roadmap_items.client_id and s.enabled = true
      )
    )
  );
