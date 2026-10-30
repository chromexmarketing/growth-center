# Client chat Web Push rollout

This feature is intentionally gated by `VITE_VAPID_PUBLIC_KEY`. The popup is hidden until backend configuration is complete.

1. Generate a VAPID keypair with `npx web-push generate-vapid-keys`. Keep the private key secret.
2. Apply `supabase/migrations/20261031_client_chat_push.sql` to the correct Supabase project.
3. Deploy `supabase/functions/send-chat-push` with `--no-verify-jwt` (the function validates a separate strong WEBHOOK_SECRET in its Authorization header).
4. Set function secrets `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (mailto: address), `WEBHOOK_SECRET`. The Supabase URL and service role key must be server-side only.
5. Create a Supabase Database Webhook on `public.messages` INSERT targeting `https://<project-ref>.supabase.co/functions/v1/send-chat-push` with `Authorization: Bearer <WEBHOOK_SECRET>`. Use a randomly generated secret. Configure retries/monitoring as needed.
6. Set Vercel `VITE_VAPID_PUBLIC_KEY` to the same public key and redeploy.
7. Test with an existing installed iPhone app (iOS 16.4+), an Android PWA, and two distinct accounts. Verify a staff-sent chat message triggers exactly one notification, client-sent messages do not, and tapping opens Chat.

Never set `VITE_VAPID_PRIVATE_KEY` or a service-role key in Vercel. The public key is intentionally public.

Notes: This implementation handles text and attachments, and sends only for messages with sender_role='admin'. Verify all staff sender roles in production before enabling. A database webhook can be retried; production deduplication is advisable if delivery becomes critical. Existing users must open Chat and grant permission once. iOS requires a Home Screen installation.
