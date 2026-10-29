-- Monthly roadmap periods, non-destructive migration
alter table public.roadmap_items add column if not exists roadmap_month date;
create index if not exists roadmap_items_client_month_idx on public.roadmap_items(client_id,roadmap_month);
-- NULL roadmap_month represents the evergreen onboarding roadmap.
-- Existing records are preserved and remain in the onboarding/legacy view.
