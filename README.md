# MicroManus

MicroManus is a full-stack, usage-billed deep-research agent. A user signs in with Google or GitHub, unlocks the product with a $5 Stripe payment or the assignment coupon, adds their own model-provider key, and runs source-grounded research in persistent conversation threads.

No LLM key is bundled with the application. Provider keys are supplied by each user, encrypted at rest, decrypted only for a request, and sent to the private research service over the server-to-server connection.

## What is included

- Social-only Supabase authentication with a mandatory paywall
- Idempotent `SID_DRDROID` redemption and Stripe Checkout ($5 → 5 credits)
- Encrypted BYOK settings for OpenAI, Anthropic, Kimi, and HTTPS OpenAI-compatible endpoints
- Persistent chats with same-thread LangGraph checkpoints
- A bounded think → tool → observe research loop with Brave Search and safe page/PDF fetching
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
  ├── Stripe Checkout + signed webhook: $5 payment → 5 credits
  └── authenticated server-to-server request
        ▼
      FastAPI / LangGraph research service
        ├── user-supplied OpenAI / Anthropic / Kimi credential
        ├── Brave Search + SSRF-hardened fetch
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
6. Create a Supabase project and apply [the core migration](supabase/migrations/202607170001_micromanus_core.sql).
7. Enable Google and/or GitHub in Supabase Auth. Add `http://localhost:3000/api/auth/callback` locally and the production equivalent to Supabase's redirect allow-list.
8. Add a Brave Search API key to the web service so deployed research runs have internet search.
9. Create a Stripe test-mode account and set `STRIPE_SECRET_KEY` plus `STRIPE_WEBHOOK_SECRET`.

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

For Stripe webhook testing:

```bash
stripe listen --forward-to localhost:3000/api/billing/webhook
```

Use Stripe's standard test card `4242 4242 4242 4242`, any future expiry, and any CVC. A successfully verified `checkout.session.completed` webhook grants exactly five credits once.

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

### 4. Stripe

Create a webhook endpoint at `https://YOUR_APP/api/billing/webhook` for:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`

Copy its signing secret to `STRIPE_WEBHOOK_SECRET`. The implementation verifies the signature, amount, currency, user metadata, event ID, and Checkout Session ID before moving credits.

### 5. Acceptance test

Use a fresh social account and verify this exact sequence:

1. Social sign-in lands on `/subscribe`.
2. `/chat`, `/settings`, and `/usage` redirect back to the paywall.
3. `SID_DRDROID` grants five credits once, or a $5 test payment grants five credits once.
4. Add one provider key in Settings.
5. Start a chat, ask a follow-up in the same thread, and confirm context is retained.
6. Ask for a cited report and download the PDF.
7. Confirm Usage shows the chat's input/output/cache tokens, costs, model, and remaining credits.

## Model and pricing policy

The curated catalog currently contains GPT-5.6 Sol/Terra/Luna; Claude Fable 5, Opus 4.8, Sonnet 5, and Haiku 4.5; and Kimi K3, K2.7 Code, and K2.6. The Python registry and Supabase pricing rows are versioned. Claude Sonnet 5's introductory rate automatically rolls to its published standard rate on September 1, 2026.

Pricing is an operational input, so verify provider pages before a production launch and update both registries together:

- `services/agent/app/registry/pricing.v1.json`
- `supabase/migrations/202607170001_micromanus_core.sql` (or a new production migration)

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
