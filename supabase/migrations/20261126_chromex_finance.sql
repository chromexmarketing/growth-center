-- Chromex Finance: private invoices and manually entered billing-period recaps.
-- Run once in Supabase SQL Editor before enabling the Finance page.
create table if not exists public.finance_settings (
  client_id uuid primary key references public.profiles(id) on delete cascade,
  billing_day integer not null default 17 check (billing_day between 1 and 28)
);
create table if not exists public.finance_recaps (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  store_revenue numeric(14,2) not null default 0 check (store_revenue >= 0),
  attributed_revenue numeric(14,2) not null default 0 check (attributed_revenue >= 0),
  created_at timestamptz not null default now(),
  unique(client_id,period_start),
  check (period_end > period_start)
);
create table if not exists public.finance_invoices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  filename text not null,
  storage_path text not null unique,
  amount numeric(14,2) not null check (amount >= 0),
  period_start date not null,
  period_end date not null,
  issued_on date not null,
  due_on date,
  status text not null default 'pending' check (status in ('pending','paid')),
  created_at timestamptz not null default now(),
  check (period_end > period_start)
);
create index if not exists finance_invoices_client_idx on public.finance_invoices(client_id,issued_on desc);
create index if not exists finance_recaps_client_idx on public.finance_recaps(client_id,period_end desc);

-- SECURITY DEFINER functions intentionally query only authenticated user identity and
-- bypass RLS on profiles/memberships, avoiding recursive policy dependencies.
create or replace function public.finance_is_owner()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='admin') $$;
create or replace function public.finance_can_view(target_client uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.finance_is_owner()
  or exists(select 1 from public.profiles where id=auth.uid() and id=target_client and role='client')
  or exists(select 1 from public.client_memberships where user_id=auth.uid() and client_id=target_client) $$;
revoke all on function public.finance_is_owner() from public;
revoke all on function public.finance_can_view(uuid) from public;
grant execute on function public.finance_is_owner() to authenticated;
grant execute on function public.finance_can_view(uuid) to authenticated;

alter table public.finance_settings enable row level security;
alter table public.finance_recaps enable row level security;
alter table public.finance_invoices enable row level security;
drop policy if exists finance_settings_read on public.finance_settings;
drop policy if exists finance_settings_owner_insert on public.finance_settings;
drop policy if exists finance_settings_owner_update on public.finance_settings;
drop policy if exists finance_recaps_read on public.finance_recaps;
drop policy if exists finance_recaps_owner_insert on public.finance_recaps;
drop policy if exists finance_recaps_owner_update on public.finance_recaps;
drop policy if exists finance_invoices_read on public.finance_invoices;
drop policy if exists finance_invoices_owner_insert on public.finance_invoices;
drop policy if exists finance_invoices_owner_update on public.finance_invoices;
create policy finance_settings_read on public.finance_settings for select to authenticated using (public.finance_can_view(client_id));
create policy finance_settings_owner_insert on public.finance_settings for insert to authenticated with check (public.finance_is_owner());
create policy finance_settings_owner_update on public.finance_settings for update to authenticated using (public.finance_is_owner()) with check (public.finance_is_owner());
create policy finance_recaps_read on public.finance_recaps for select to authenticated using (public.finance_can_view(client_id));
create policy finance_recaps_owner_insert on public.finance_recaps for insert to authenticated with check (public.finance_is_owner());
create policy finance_recaps_owner_update on public.finance_recaps for update to authenticated using (public.finance_is_owner()) with check (public.finance_is_owner());
create policy finance_invoices_read on public.finance_invoices for select to authenticated using (public.finance_can_view(client_id));
create policy finance_invoices_owner_insert on public.finance_invoices for insert to authenticated with check (public.finance_is_owner());
create policy finance_invoices_owner_update on public.finance_invoices for update to authenticated using (public.finance_is_owner()) with check (public.finance_is_owner());

-- PDFs remain private; signed URLs are issued only after Storage RLS checks.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('finance-invoices','finance-invoices',false,10485760,array['application/pdf'])
on conflict (id) do update set public=false;
drop policy if exists finance_pdf_read on storage.objects;
drop policy if exists finance_pdf_owner_upload on storage.objects;
drop policy if exists finance_pdf_owner_delete on storage.objects;
create policy finance_pdf_read on storage.objects for select to authenticated
using (bucket_id='finance-invoices' and public.finance_can_view((split_part(name,'/',1))::uuid));
create policy finance_pdf_owner_upload on storage.objects for insert to authenticated
with check (bucket_id='finance-invoices' and public.finance_is_owner());
create policy finance_pdf_owner_delete on storage.objects for delete to authenticated
using (bucket_id='finance-invoices' and public.finance_is_owner());
