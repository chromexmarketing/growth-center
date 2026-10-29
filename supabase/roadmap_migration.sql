-- Run after reviewing live schema and policies. No destructive changes.
create table if not exists public.roadmap_items (
 id uuid primary key default gen_random_uuid(),
 client_id uuid not null references public.profiles(id) on delete cascade,
 phase_name text not null,
 phase_order integer not null default 0,
 item_order integer not null default 0,
 title text not null,
 description text not null default '',
 client_instruction text not null default '',
 internal_note text not null default '',
 status text not null default 'not_started' check (status in ('not_started','in_progress','awaiting_client','completed')),
 target_date date,
 completed_at timestamptz,
 created_at timestamptz not null default now()
);
alter table public.roadmap_items enable row level security;
create policy "roadmap_client_read" on public.roadmap_items for select to authenticated
 using (client_id=auth.uid() or public.is_admin());
create policy "roadmap_admin_insert" on public.roadmap_items for insert to authenticated
 with check (public.is_admin());
create policy "roadmap_admin_update" on public.roadmap_items for update to authenticated
 using (public.is_admin()) with check (public.is_admin());
create policy "roadmap_admin_delete" on public.roadmap_items for delete to authenticated
 using (public.is_admin());
-- Internal notes must never be exposed through client queries. Create a separate
-- admin-only table instead of exposing internal_note on roadmap_items.
alter table public.roadmap_items drop column if exists internal_note;
create table if not exists public.roadmap_internal_notes (
 roadmap_item_id uuid primary key references public.roadmap_items(id) on delete cascade,
 body text not null default ''
);
alter table public.roadmap_internal_notes enable row level security;
create policy "roadmap_notes_admin" on public.roadmap_internal_notes for all to authenticated
 using (public.is_admin()) with check (public.is_admin());
