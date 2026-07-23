-- ============================================================
-- SEED — Run AFTER you create the 3 users in the Supabase
-- dashboard (Authentication > Users > Add user):
--   1. Your admin account (your email)
--   2. Jake's login (e.g. jake@cinchgaming.com)
--   3. Cami's login (e.g. cami@riderevolt.com)
--
-- Then replace the emails below and run this in SQL Editor.
-- ============================================================

-- 1) Make yourself admin  <<< EDIT EMAIL
update public.profiles set role = 'admin', first_name = 'Admin', brand_name = 'Chromex'
where id = (select id from auth.users where email = 'YOUR_ADMIN_EMAIL_HERE');

-- 2) Cinch Gaming — Jake (Omnisend)  <<< EDIT EMAIL
update public.profiles
set first_name = 'Jake', brand_name = 'Cinch Gaming', platform = 'omnisend'
where id = (select id from auth.users where email = 'JAKE_EMAIL_HERE');

insert into public.client_integrations (client_id, platform, api_key)
select id, 'omnisend', 'PASTE_NEW_OMNISEND_API_KEY_HERE'
from auth.users where email = 'JAKE_EMAIL_HERE'
on conflict (client_id) do update set api_key = excluded.api_key, platform = excluded.platform;

-- 3) Ride Revolt — Cami (Klaviyo)  <<< EDIT EMAIL
update public.profiles
set first_name = 'Cami', brand_name = 'Ride Revolt', platform = 'klaviyo'
where id = (select id from auth.users where email = 'CAMI_EMAIL_HERE');

insert into public.client_integrations (client_id, platform, api_key)
select id, 'klaviyo', 'PASTE_NEW_KLAVIYO_PRIVATE_KEY_HERE'
from auth.users where email = 'CAMI_EMAIL_HERE'
on conflict (client_id) do update set api_key = excluded.api_key, platform = excluded.platform;

-- IMPORTANT: Rotate (regenerate) both API keys in Klaviyo and
-- Omnisend before pasting them here — the old ones were shared
-- in plain text and should be considered exposed.
