# MicroManus

MicroManus is a full-stack, usage-billed deep-research agent. A user signs in with Google or GitHub, unlocks the product with a $5 Razorpay payment or the assignment coupon, adds their own model-provider key, and runs source-grounded research in persistent conversation threads.

No LLM key is bundled with the application. Provider keys are supplied by each user, encrypted at rest, decrypted only for a request, and sent to the private research service over the server-to-server connection.

## What is included

- Supabase OAuth plus email/password authentication with a mandatory paywall
- Idempotent `SID_DRDROID` redemption and Razorpay Standard Checkout ($5 → 5 credits)
- Encrypted BYOK settings for OpenAI, Anthropic, Kimi, and HTTPS OpenAI-compatible endpoints
- Persistent chats with same-thread LangGraph checkpoints
- A bounded think → tool → observe research loop with user-controlled Web Search and safe page/PDF fetching
- Authenticated PDF report artifacts
- Cache-aware usage billing split across input, output, cache-read, and cache-write tokens
- Per-chat cost analytics and CSV export
- Current, effective-dated model pricing rather than a hard-coded single blended rate
- Vercel + Render deployment configuration

## Architecture

```text
Browser
  │  Supabase session cookies + SSE
  ▼
Next.js / TypeScript web service
  ├── Supabase Postgres: users, chats, encrypted keys, credits, usage, RLS
  ├── Razorpay Checkout + signed verification/webhook: $5 payment → 5 credits
  └── authenticated server-to-server request
        ▼
      FastAPI / LangGraph research service
        ├── user-supplied OpenAI / Anthropic / Kimi credential
        ├── Tavily/Brave Search + SSRF-hardened fetch
        ├── per-user/thread checkpoints
        └── protected ReportLab PDF artifacts
```

The web service is the trust boundary. Browsers never call the Python service with provider credentials, never choose a user ID for billing, and never write usage rows directly.

## Repository layout

```text
apps/web/          Next.js App Router UI, API routes, auth, billing, analytics
services/agent/    FastAPI + LangGraph research runtime and tests
supabase/          PostgreSQL schema, RLS, wallet functions, pricing, usage RPCs
render.yaml        Private Python service deployment blueprint
docker-compose.yml Local Python-service container
```

## Install later

No install has been run while building this repository. When you are ready, from the repository root:

```bash
uv sync --all-packages --all-extras
npm install
```

Your existing `.venv` remains the uv environment. The npm command creates the root workspace lockfile and installs the Next.js application.

## Configure

1. Copy `services/agent/.env.example` to `services/agent/.env`.
2. Copy `apps/web/.env.example` to `apps/web/.env.local`.
3. Generate two unrelated secrets: a long service token and a 32-byte base64 encryption key.
4. Set the same service token as `MICROMANUS_AGENT_SERVICE_TOKEN` in the agent and `AGENT_SERVICE_TOKEN` in the web app.
5. Put the encryption key in `KEY_ENCRYPTION_SECRET`. Do not put provider LLM keys in either env file.
6. Create a Supabase project and apply [the core migration](supabase/migrations/202607170001_micromanus_core.sql), followed by [the Razorpay migration](supabase/migrations/202607180001_razorpay_billing.sql) and [the expanded OpenAI catalog migration](supabase/migrations/202607180002_expand_openai_model_catalog.sql).
7. Enable Email plus Google and/or GitHub in Supabase Auth. Add `http://localhost:3000/api/auth/callback` locally and the production equivalent to Supabase's redirect allow-list.
8. Add `TAVILY_SEARCH_API_KEY` to the web service for internet research. Brave remains available as an
   optional fallback through `BRAVE_SEARCH_API_KEY`; Tavily is preferred when both are configured.
9. Create a Razorpay test-mode account. Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and a separate `RAZORPAY_WEBHOOK_SECRET`.
10. Keep `RAZORPAY_AMOUNT_SUBUNITS=500` and `RAZORPAY_CURRENCY=USD` for the assignment's exact $5 price. An Indian Razorpay account must have International Payments enabled before the same USD order can go live.

For OpenAI directly, save the user key in **Settings → OpenAI / compatible** with
`https://api.openai.com/v1`. For OpenRouter, use the same encrypted settings slot with
`https://openrouter.ai/api/v1`; MicroManus translates catalog models to OpenRouter's required
provider-qualified slugs before each request. Never place either LLM key in an env file.

Generate safe values without installing another package:

```bash
python -c "import base64,secrets; print('service token:', secrets.token_urlsafe(48)); print('encryption key:', base64.b64encode(secrets.token_bytes(32)).decode())"
```

## Run after installing

Terminal 1 — agent:

```bash
uv run python main.py
```

Terminal 2 — web:

```bash
npm run dev
```

In Razorpay Test Mode, create API keys under **Account & Settings → API Keys**. Checkout uses Razorpay's mock bank page, so no real funds move. Configure automatic capture, make a successful test payment, and confirm exactly five credits are granted once.

Razorpay cannot deliver a webhook directly to localhost. The authenticated checkout verification route still completes the local test immediately. Test the webhook against a deployed HTTPS preview or a supported public tunnel.

### Google OAuth

The Google button and PKCE callback are already implemented. In Google Auth Platform, configure Branding/support email, select an **External** audience, and create a **Web application** OAuth client. Then configure:

- Authorized JavaScript origin: `http://localhost:3000` (plus the final HTTPS origin later).
- Authorized redirect URI: `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`.
- Supabase → Authentication → Providers → Google: paste the Google Client ID and Client Secret and enable the provider.
- Supabase → Authentication → URL Configuration: allow `http://localhost:3000/api/auth/callback` and the final production callback.

Google credentials stay in the Supabase dashboard; do not put `GOOGLE_CLIENT_SECRET` in `.env.local`. Use only the identity scopes `openid`, `https://www.googleapis.com/auth/userinfo.email`, and `https://www.googleapis.com/auth/userinfo.profile`.

## Production deployment

### 1. Supabase

- Apply the SQL migration before the first sign-in.
- Enable Google/GitHub providers.
- Set the production site URL and allow `https://YOUR_APP/api/auth/callback`.
- Keep the service-role key server-only.

### 2. Python agent on Render

Create a Render Blueprint from [render.yaml](render.yaml). It provisions a persistent disk for checkpoints and PDF artifacts. Copy the generated `MICROMANUS_AGENT_SERVICE_TOKEN`; the web deployment must use the identical value as `AGENT_SERVICE_TOKEN`.

### 3. Web app on Vercel

Import the repository and choose `apps/web` as the project root. Add every variable from `apps/web/.env.example`, replacing localhost URLs with HTTPS production URLs. Set `AGENT_SERVICE_URL` to the Render service URL and `NEXT_PUBLIC_APP_URL` to the final Vercel/custom domain.

### 4. Razorpay

Create a Test Mode webhook and later a separate Live Mode webhook at `https://YOUR_APP/api/billing/webhook`. Subscribe to:

- `order.paid`
- `payment.captured` (optional redundancy; database idempotency prevents a double grant)

Copy the webhook secret you chose to `RAZORPAY_WEBHOOK_SECRET`. It must be different from the API key secret. The implementation verifies the untouched request body, webhook signature, event ID, captured status, stored user/order mapping, amount, currency, order ID, and payment ID before moving credits.

For Live Mode, finish Razorpay activation/KYC, generate Live Mode API keys, enable automatic capture, and enable International Payments if you are charging the assignment's literal USD $5. If International Payments is not enabled, configure an INR amount instead; the paywall renders the configured price so the advertised and charged amounts stay aligned.

Before website review, set the public merchant/support variables from `.env.example`, create a dedicated ordinary email/password user in Supabase Auth, and give Razorpay only that test user's credentials. Do not share Google, GitHub, Supabase Dashboard, or Razorpay Dashboard credentials. The reviewer can sign in at `/sign-in`; public pricing, terms, privacy, refund, shipping, and contact pages are linked from the site footer.

### 5. Acceptance test

Use a fresh social account and verify this exact sequence:

1. Social sign-in lands on `/subscribe`.
2. `/chat`, `/settings`, and `/usage` redirect back to the paywall.
3. `SID_DRDROID` grants five credits once, or a captured $5 Razorpay test payment grants five credits once.
4. Add one provider key in Settings.
5. Start a chat, ask a follow-up in the same thread, and confirm context is retained.
6. Ask for a cited report and download the PDF.
7. Confirm Usage shows the chat's input/output/cache tokens, costs, model, and remaining credits.

## Model and pricing policy

The curated catalog currently contains GPT-5.6 Sol/Terra/Luna plus the lower-cost GPT-5.4 mini, GPT-5.4 nano, GPT-5 mini, and GPT-5 nano; Claude Fable 5, Opus 4.8, Sonnet 5, and Haiku 4.5; and Kimi K3, K2.7 Code, and K2.6. The Python registry and Supabase pricing rows are versioned. Claude Sonnet 5's introductory rate automatically rolls to its published standard rate on September 1, 2026.

Pricing is an operational input, so verify provider pages before a production launch and update both registries together:

- `services/agent/app/registry/pricing.v1.json`
- `supabase/migrations/202607170001_micromanus_core.sql` plus additive production migrations

## Verification

The research service currently passes 24 focused tests plus Ruff lint checks. The frontend source has passed a TypeScript syntax transpilation pass. Run the dependency-backed checks after the deferred install:

```bash
uv run --project services/agent pytest
uv run --project services/agent ruff check app tests
npm run typecheck
npm run lint
npm run build
```

The detailed SSE contract, security limits, and agent environment reference live in [services/agent/README.md](services/agent/README.md).
