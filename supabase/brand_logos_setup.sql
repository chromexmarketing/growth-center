-- Run once in Supabase SQL Editor before testing brand logos.
-- Brand logos are owned by the client company, not individual user avatars.
alter table public.profiles add column if not exists brand_logo_url text;
notify pgrst, 'reload schema';
