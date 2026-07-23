# Chromex Client Portal — Setup Guide

Dark, orange, on-brand client portal with: revenue dashboard (Klaviyo + Omnisend), campaign calendar with email previews, automations list, optimization log, realtime chat, admin dashboard, and the mascot.

Follow these steps in order. Total time: ~30–40 minutes.

---

## ⚠️ Step 0 — Rotate your API keys (do this first)

The Klaviyo and Omnisend keys you shared in chat should be treated as exposed.

- **Klaviyo:** Account → Settings → API Keys → delete the old private key, create a new one (needs read access to Metrics).
- **Omnisend:** Store settings → API keys → regenerate.

Keep the new keys handy for Step 3. They will only ever live inside Supabase — never in the frontend.

---

## Step 1 — Database schema (5 min)

1. Open your Supabase project → **SQL Editor** → **New query**
2. Paste the entire contents of `supabase/schema.sql` → **Run**

This creates all tables, security rules (clients can only ever see their own data), the chat realtime feed, and the image storage bucket.

---

## Step 2 — Create the 3 logins (5 min)

Supabase → **Authentication** → **Users** → **Add user** (use "Create new user", set a password, check "Auto Confirm User"):

1. **You** (admin) — your email + a strong password
2. **Jake** — e.g. `jake@cinchgaming.com` + a password you'll send him
3. **Cami** — e.g. `cami@riderevolt.com` + a password you'll send her

---

## Step 3 — Seed the client data (5 min)

1. Open `supabase/seed.sql`
2. Replace the placeholder **emails** with the ones you just created
3. Replace the placeholder **API keys** with your NEW rotated keys
4. Paste into SQL Editor → **Run**

This makes you admin, sets Jake = Cinch Gaming (Omnisend) and Cami = Ride Revolt (Klaviyo), and stores their API keys in the locked integrations table.

---

## Step 4 — Deploy the revenue edge function (10 min)

You need the Supabase CLI once. In a terminal:

```bash
npm install -g supabase
supabase login
supabase link --project-ref ymkbjaeiphgayivjyfuj
supabase functions deploy get-revenue
```

(Run these from the project folder. The function reads each client's key server-side and calls Klaviyo/Omnisend — keys never reach the browser.)

---

## Step 5 — Run it locally (5 min)

```bash
npm install
cp .env.example .env
# open .env and paste your anon key after VITE_SUPABASE_ANON_KEY=
npm run dev
```

Open http://localhost:5173 — log in with your admin account. Add a test campaign, automation, and optimization note. Then log in as Jake or Cami in a private window to see the client side.

---

## Step 6 — Deploy to Vercel (5 min)

1. Push this folder to a GitHub repo
2. Go to vercel.com → **New Project** → import the repo
3. Add two environment variables:
   - `VITE_SUPABASE_URL` = `https://ymkbjaeiphgayivjyfuj.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = your anon key
4. Deploy. Done — share the URL with clients.

Optional: add a custom domain like `portal.chromexmarketing.com` in Vercel settings.

---

## Adding more clients later

1. Supabase → Authentication → Add user (their email + password)
2. SQL Editor — run (edit the values):

```sql
update public.profiles
set first_name = 'Name', brand_name = 'Brand', platform = 'klaviyo'  -- or 'omnisend'
where id = (select id from auth.users where email = 'their@email.com');

insert into public.client_integrations (client_id, platform, api_key)
select id, 'klaviyo', 'their-api-key'
from auth.users where email = 'their@email.com';
```

That's it — they appear in your admin picker automatically.

---

## Good to know

- **Omnisend email-attributed revenue:** Omnisend's public API exposes orders (total store revenue) but not clean per-order email attribution, so Omnisend clients see total revenue + order counts, and the email-revenue card points them to the in-platform report. Klaviyo clients get the full total vs. email split.
- **Klaviyo key permissions:** the private key needs at least read access to Metrics for the revenue pull to work.
- **Chat is realtime** — messages appear instantly on both sides, no refresh needed.
- **Campaign images** live in Supabase Storage (public bucket, unguessable URLs), uploaded via drag & drop in your admin panel.
- **The mascot** greets clients by first name, bobs in the corner, and gives a new line each time it's clicked.

## Costs

Free tier covers all of this at 15 clients. The $25/mo Pro plan is optional headroom (more storage/bandwidth) — you likely won't need it for a while.
