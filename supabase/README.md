# MicroManus Supabase setup

1. Create a Supabase project and enable the Google and GitHub providers under **Authentication → Providers**.
2. Add `https://<your-app>/api/auth/callback` to the Supabase redirect allow-list (and the localhost equivalent for development).
3. Apply `migrations/202607170001_micromanus_core.sql`, then `migrations/202607180001_razorpay_billing.sql`, with `supabase db push` or the SQL editor.
4. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only. Browser code should receive only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (the legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` name is also accepted).

The migration creates a private `reports` Storage bucket. Report objects use the path `<user-id>/<thread-id>/<filename>` and are exposed to the browser only through signed URLs.

Provider credentials are encrypted by the application with AES-256-GCM before they reach Postgres. Supabase Vault is also a reasonable deployment alternative, but per-user Vault access still needs a tightly scoped server RPC; never expose decrypted keys through RLS or browser clients.

Model pricing is operational data in `model_pricing`. The included rows are bootstrap values, not a promise that vendors will keep their rates. Verify and update a row (including `pricing_version`) whenever a provider changes pricing.

Claude Fable 5's seeded cache-write price is the five-minute cache rate ($12.50/MTok). Its one-hour cache-write rate is $20/MTok and should be represented by a separate pricing mode before enabling one-hour caching. Claude Sonnet 5's seeded promotional rate expires after 2026-08-31; update that row to the standard rate before then.
