-- Owner-controlled multi-user accounts and client assignments.
-- Review and run in Supabase SQL Editor. Never run schema.sql again.
begin;
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check(role in ('client','admin','staff'));
create table if not exists public.client_memberships (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 client_id uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz default now()
);
create table if not exists public.staff_assignments (
 staff_id uuid not null references public.profiles(id) on delete cascade,
 client_id uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz default now(),
 primary key(staff_id,client_id)
);
alter table public.client_memberships enable row level security;
alter table public.staff_assignments enable row level security;
-- Only owner can assign users. No direct client writes.
create or replace function public.company_for_user(uid uuid)
returns uuid language sql stable security definer set search_path=public as $$
 select coalesce(
   (select cm.client_id from public.client_memberships cm where cm.user_id=uid),
   (select p.id from public.profiles p where p.id=uid and p.role='client')
 );
$$;
create or replace function public.can_access_client(cid uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and (
   public.is_admin()
   or public.company_for_user(auth.uid())=cid
   or exists(select 1 from public.staff_assignments sa where sa.staff_id=auth.uid() and sa.client_id=cid)
 );
$$;
create or replace function public.can_manage_client(cid uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and (
 public.is_admin() or exists(select 1 from public.staff_assignments sa where sa.staff_id=auth.uid() and sa.client_id=cid)
 );
$$;
create or replace function public.can_access_company_chat(company uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select public.can_access_client(company);
$$;
drop policy if exists "client membership read" on public.client_memberships;
create policy "client membership read" on public.client_memberships for select to authenticated
using(public.is_admin() or user_id=auth.uid());
drop policy if exists "staff assignment read" on public.staff_assignments;
create policy "staff assignment read" on public.staff_assignments for select to authenticated
using(public.is_admin() or staff_id=auth.uid());
-- Profiles: allow assigned staff to see client records; existing owner policies remain.
drop policy if exists "assigned client profile read" on public.profiles;
create policy "assigned client profile read" on public.profiles for select to authenticated
using(public.can_access_client(id) or public.company_for_user(id)=public.company_for_user(auth.uid())
 or exists(select 1 from public.staff_assignments sa where sa.staff_id=id and public.can_access_client(sa.client_id)));
-- Replace legacy policies that grant admin access; owner remains admin.
drop policy if exists "clients read own campaigns, admin reads all" on public.campaigns;
create policy "clients read own campaigns, admin reads all" on public.campaigns for select to authenticated using(public.can_access_client(client_id));
drop policy if exists "clients read own automations, admin reads all" on public.automations;
create policy "clients read own automations, admin reads all" on public.automations for select to authenticated using(public.can_access_client(client_id));
drop policy if exists "clients read own notes, admin reads all" on public.optimization_notes;
create policy "clients read own notes, admin reads all" on public.optimization_notes for select to authenticated using(public.can_access_client(client_id));
drop policy if exists "read own thread or admin reads all" on public.messages;
create policy "read own thread or admin reads all" on public.messages for select to authenticated using(public.can_access_client(client_id));
drop policy if exists "company chat insert" on public.messages;
create policy "company chat insert" on public.messages for insert to authenticated
with check(public.can_access_client(client_id) and sender_id=auth.uid()
 and sender_role=case when public.is_admin() or exists(select 1 from public.staff_assignments sa where sa.staff_id=auth.uid() and sa.client_id=messages.client_id) then 'admin' else 'client' end
 and (parent_id is null or exists(select 1 from public.messages parent where parent.id=parent_id and parent.client_id=messages.client_id)));
-- Client reps may not change company membership or role themselves.
create or replace function public.guard_profile_self_update()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() = old.id and not public.is_admin() then
   if new.id is distinct from old.id or new.role is distinct from old.role
      or new.brand_name is distinct from old.brand_name or new.brand_logo_url is distinct from old.brand_logo_url
      or new.platform is distinct from old.platform or new.created_at is distinct from old.created_at then
      raise exception 'Account permissions and company cannot be changed from My Profile';
   end if;
 end if;
 return new;
end $$;
-- Staff must be able to manage assigned clients' content, but never assign themselves.
drop policy if exists "assigned staff manage campaigns" on public.campaigns;
create policy "assigned staff manage campaigns" on public.campaigns for all to authenticated using(public.can_manage_client(client_id)) with check(public.can_manage_client(client_id));
drop policy if exists "assigned staff manage automations" on public.automations;
create policy "assigned staff manage automations" on public.automations for all to authenticated using(public.can_manage_client(client_id)) with check(public.can_manage_client(client_id));
drop policy if exists "assigned staff manage optimizations" on public.optimization_notes;
create policy "assigned staff manage optimizations" on public.optimization_notes for all to authenticated using(public.can_manage_client(client_id)) with check(public.can_manage_client(client_id));
drop policy if exists "assigned staff campaign image upload" on storage.objects;
create policy "assigned staff campaign image upload" on storage.objects for insert to authenticated
with check(bucket_id='campaign-images' and public.can_manage_client((storage.foldername(name))[1]::uuid));
-- Existing attachment access automatically uses the replaced can_access_company_chat.
notify pgrst, 'reload schema';
commit;
