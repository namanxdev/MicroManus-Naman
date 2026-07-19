---
title: MicroManus Agent
emoji: "🔬"
colorFrom: indigo
colorTo: blue
sdk: docker
pinned: false
suggested_hardware: cpu-basic
short_description: FastAPI & LangGraph research service for MicroManus
---

# MicroManus research-agent service

This directory is the Python/LangGraph half of MicroManus. It exposes an internal FastAPI API for a
checkpointed **think → tool → observe → think again** research loop, real PDF artifacts, normalized token
usage, and deterministic cost estimates. The browser must never call it directly: the authenticated web
server validates the signed-in user, checks credits, and then forwards a trusted user id plus ephemeral
BYOK credentials.

## Install and run

No dependencies are vendored and no provider key is bundled. When dependencies are ready to be installed:

```bash
cd services/agent
python -m venv .venv
# PowerShell: .venv\Scripts\Activate.ps1
# bash/zsh: source .venv/bin/activate
python -m pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
```

For a deployment build:

```bash
docker build -t micromanus-agent .
docker run --rm -p 8000:8000 \
  -e MICROMANUS_AGENT_ENVIRONMENT=production \
  -e MICROMANUS_AGENT_SERVICE_TOKEN='a-long-random-server-secret' \
  -v micromanus-agent-data:/data \
  micromanus-agent
```

Mount `/data` (or configure equivalent durable paths) so chat checkpoints and PDF artifacts survive a
container restart. SQLite is appropriate for one service replica. A horizontally scaled deployment should
replace it with a shared LangGraph checkpointer before adding replicas.

## Deploy to a free Hugging Face custom-Python Space

Hugging Face documents custom Python servers on port 7860 as an unofficial Gradio-SDK workflow. The Space
deployment uses `hf_app.py` to run the existing FastAPI application as the top-level ASGI app, preserving
its startup lifespan and authenticated `/v1/*` routes. Hugging Face installs this package from
`requirements.txt`; no provider API key is included in the Space.

Create a public Gradio Space, then set these runtime variables in **Settings -> Variables**:

```text
MICROMANUS_AGENT_ENVIRONMENT=production
MICROMANUS_AGENT_CHECKPOINT_BACKEND=sqlite
MICROMANUS_AGENT_CHECKPOINT_DB_PATH=/tmp/micromanus/checkpoints.sqlite
MICROMANUS_AGENT_ARTIFACT_DIR=/tmp/micromanus/artifacts
```

Set this separately in **Settings -> Secrets**:

```text
MICROMANUS_AGENT_SERVICE_TOKEN=<the same random 32+ character token used by Vercel>
```

To publish this service directory to a newly created, otherwise empty Space:

```bash
git remote add huggingface https://huggingface.co/spaces/YOUR_USER/micromanus-agent
git subtree split --prefix=services/agent -b huggingface-space
git push --force huggingface huggingface-space:main
git branch -D huggingface-space
```

The first push is forced only because Hugging Face creates the empty Space with its own starter commit.
Do not force-push over a Space that contains work you need to preserve. When Git asks for a password, use
a Hugging Face write token, never the account password.

After the Space reports **Running**, verify `https://YOUR_USER-micromanus-agent.hf.space/health` and set
that origin as Vercel's `AGENT_SERVICE_URL`. Free Space storage is ephemeral: SQLite checkpoints and PDF
artifacts can be lost when the Space restarts or sleeps.

## Security boundary and credentials

Protected routes require both headers:

```http
Authorization: Bearer <MICROMANUS_AGENT_SERVICE_TOKEN>
X-User-Id: <id asserted by the authenticated web server>
```

`X-User-Id` is hashed into the checkpoint namespace, so identical client thread ids cannot cross users.
Production startup fails if the internal service token is absent. `ALLOW_INSECURE_DEV_AUTH` is false by
default and cannot be enabled in production.

OpenAI, Anthropic, Kimi, Tavily, and Brave keys are accepted only inside one chat request as Pydantic
`SecretStr` values. They are used to construct short-lived clients and are not added to graph state,
checkpoints, artifacts, events, settings, or logs. The validation-error handler also removes invalid input
values, which prevents a malformed key from being echoed in a 422 response. There are intentionally no
provider-key environment variables.

Custom OpenAI-compatible endpoints must use public HTTPS on port 443, without URL credentials, query, or
fragment. This prevents a caller from turning the agent into an internal-network/metadata proxy. The fetch
tool also rejects local, private, link-local, reserved, multicast, and mixed public/private DNS answers;
revalidates each redirect; forbids non-web ports and HTTPS downgrade; limits redirects, response bytes,
PDF pages, and extracted text; and disables environment proxies. Production should additionally enforce an
egress firewall because application DNS checks cannot entirely remove the rebinding interval between DNS
resolution and socket connection.

## Configuration

All variables use the `MICROMANUS_AGENT_` prefix.

| Variable | Default | Purpose |
|---|---:|---|
| `ENVIRONMENT` | `development` | `development`, `test`, or `production` |
| `SERVICE_TOKEN` | none | Internal bearer token; mandatory in production |
| `ALLOW_INSECURE_DEV_AUTH` | `false` | Local-only escape hatch; still requires `X-User-Id` |
| `CHECKPOINT_BACKEND` | `sqlite` | `sqlite` for durable threads or `memory` for tests |
| `CHECKPOINT_DB_PATH` | `data/checkpoints.sqlite` | SQLite checkpoint file |
| `ARTIFACT_DIR` | `data/artifacts` | User-scoped PDF storage |
| `PRICING_REGISTRY_PATH` | bundled registry | Optional compatible JSON registry override |
| `DEFAULT_MAX_ITERATIONS` / `MAX_ITERATIONS_CAP` | `6` / `10` | Tool-loop bound |
| `RUN_TIMEOUT_SECONDS` | `180` | Whole-turn deadline, including model and tools |
| `PROVIDER_TIMEOUT_SECONDS` | `75` | Individual provider timeout |
| `TOOL_TIMEOUT_SECONDS` | `20` | Search/fetch deadline |
| `SSE_HEARTBEAT_SECONDS` | `10` | Keep-alive comment cadence |
| `MAX_OUTPUT_TOKENS` | `8192` | Per model call output ceiling |
| `MAX_FETCH_BYTES` / `MAX_FETCH_CHARACTERS` | `2000000` / `24000` | Fetch caps |
| `MAX_PDF_PAGES_TO_FETCH` | `30` | Source-PDF extraction cap |
| `MAX_REPORT_CHARACTERS` | `100000` | Generated PDF input cap |
| `MAX_SOURCES_PER_RUN` | `40` | Deduplicated run evidence cap |

See [`.env.example`](.env.example) for a copyable file.

## HTTP API

### `GET /health`

Public liveness response after checkpoint and registry initialization:

```json
{
  "status": "ok",
  "version": "0.1.0",
  "checkpoint_backend": "sqlite",
  "pricing_version": "2026-07-17.1"
}
```

### `GET /v1/models`

Returns the curated model catalog, active rate period, context window, provider, and pricing registry
version. Stable UI ids use `provider/api-model`, for example `openai/gpt-5.6-terra`.

The bundled 2026-07-18 catalog contains:

- OpenAI: `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.4-mini`,
  `gpt-5.4-nano`, `gpt-5-mini`, `gpt-5-nano`
- Anthropic: `claude-fable-5`, `claude-opus-4-8`, `claude-sonnet-5`,
  `claude-haiku-4-5`
- Kimi: `kimi-k3`, `kimi-k2.7-code`, `kimi-k2.6`

The versioned source of truth is [`app/registry/pricing.v1.json`](app/registry/pricing.v1.json). Each model
contains effective dates and official source URLs. Claude Sonnet 5 automatically selects its introductory
rate through 2026-08-31 and its standard rate from 2026-09-01. A pricing override must preserve the same
schema and is loaded at startup, not supplied by an end user.

Anthropic entries use the 5-minute prompt cache-write rate because the agent sends an ephemeral cache
breakpoint. For Claude Fable 5 that is `$12.50/MTok`; its documented one-hour cache-write rate is
`$20/MTok` and is not used by this service.

### `POST /v1/chat/stream`

Content type is JSON; response content type is `text/event-stream`.

```json
{
  "thread_id": "018f-research-thread",
  "message": "Explain the recent California forest fires and create a cited PDF report.",
  "model": "openai/gpt-5.6-terra",
  "credentials": {
    "api_key": "<user BYOK key>",
    "base_url": "https://api.openai.com/v1",
    "tavily_api_key": "<server Tavily key forwarded for this run>"
  },
  "web_search_enabled": true,
  "max_iterations": 6
}
```

`base_url` is optional. It defaults to the selected provider's official endpoint. A Kimi key uses its
OpenAI-compatible Chat Completions endpoint. `tavily_api_key` and `brave_api_key` are optional; Tavily is
preferred when both are present. Without either key, `web_search` returns a safe
`search_not_configured` observation, while direct public URLs can still be fetched.
`web_search_enabled` defaults to true. When false, both search and URL-fetch tools are omitted for the
entire run; report generation remains available.

OpenAI and Kimi reuse stable prompt prefixes and receive automatic provider-side prompt caching. Anthropic
receives an explicit ephemeral cache breakpoint on the stable research system prompt. No cross-user local
LLM-response cache is used, avoiding conversation leakage. Provider cache counters are normalized into the
usage events below.

#### SSE event contract

Each frame uses the event name plus one JSON data object:

```text
id: <run_id>:<sequence>
event: status
data: {"run_id":"...","thread_id":"...","model":"...","provider":"...","phase":"thinking","message":"..."}
```

Idle frames are SSE comments (`: keep-alive`) and can be ignored. A successful turn normally emits:

1. `run.started` — ids, selected model/provider, iteration limit, timestamp.
2. `status` — `thinking` or `using_tools`; it never contains private chain-of-thought.
3. `tool.started` — safe public input only (`query`, `url`, or report title/character count).
4. `tool.completed` — tool id/name, success, safe summary/code, and duration. Raw fetched page text is not
   copied into the event stream.
5. `source` — one deduplicated `{id,title,url,snippet}` object as evidence arrives.
6. `artifact` — a generated `{id,type,title,mime_type,size_bytes,download_url,created_at}` PDF.
7. `usage` — the complete four-bucket metering record and registry-derived cost.
8. `final` — final Markdown `content`, complete `sources`, `artifacts`, and the same `usage` object.
9. `done` — `status: completed`.

Failures after streaming begins emit `error` with a stable `code`, safe user message, and `retryable`, then
`done` with `status: failed`. If earlier provider calls in that run already consumed tokens, a `usage` event
with `partial: true` is emitted before the error so those disjoint buckets can still be settled. Provider
exception bodies are deliberately not streamed because they can occasionally contain request details.
Body/model/endpoint/auth failures that are known before streaming use normal HTTP 4xx responses.

The `usage` object is designed for transactional billing:

```json
{
  "run_id": "...",
  "thread_id": "...",
  "model": "openai/gpt-5.6-terra",
  "provider": "openai",
  "input_tokens": 1250,
  "total_input_tokens": 2250,
  "output_tokens": 400,
  "cache_read_tokens": 800,
  "cache_write_tokens": 200,
  "total_tokens": 2650,
  "cost": {
    "input_usd": 0.003125,
    "output_usd": 0.006,
    "cache_read_usd": 0.0002,
    "cache_write_usd": 0.000625,
    "total_usd": 0.00995,
    "currency": "USD",
    "pricing_version": "2026-07-17.1",
    "pricing_effective_date": "2026-07-17"
  }
}
```

The four billable buckets are disjoint: `input_tokens` means **uncached input only**. Therefore
`total_input_tokens = input_tokens + cache_read_tokens + cache_write_tokens`, and `total_tokens` adds
`output_tokens`. This avoids double-charging OpenAI-compatible responses, where cached tokens are commonly
reported as a subset of prompt tokens, while also handling Anthropic's disjoint raw counters. The web
billing transaction may recompute money from its own synchronized pricing table; the nested cost is an
auditable service estimate tied to `pricing_version`.

### `POST /v1/reports`

Protected explicit renderer used when the web UI already has report Markdown:

```json
{
  "title": "California Wildfire Research",
  "markdown": "# Executive summary\n\n...",
  "sources": [{"id":"...","title":"...","url":"https://...","snippet":"..."}],
  "thread_id": "optional-thread-reference"
}
```

Returns HTTP 201 and `{ "artifact": ... }`. ReportLab writes an actual PDF atomically, with headings,
paragraphs, lists, code blocks, quotations, page numbers, and a linked sources section. The agent also owns
a `create_pdf_report` tool and can create the same artifact within its research loop.

### `GET /v1/artifacts/{artifact_id}`

Protected PDF download. The same trusted `X-User-Id` that created the artifact is required. A valid id owned
by another user deliberately returns 404. Responses are attachments with private/no-store caching.

## Conversation and execution semantics

- A new UI chat creates a new external `thread_id`; subsequent messages reuse it.
- LangGraph's checkpointer retains human, assistant, and tool observations for that user/thread namespace.
- Concurrent turns for the same checkpoint are serialized in-process so updates cannot interleave.
- Each turn resets its own tool-iteration counter. A finalizer synthesizes an answer if the tool-call budget
  is exhausted.
- Whole-run, provider, and tool timeouts plus LangGraph recursion limits bound resource use.
- Long threads are trimmed approximately to leave output/tool headroom while retaining the system prompt and
  newest complete messages. The durable checkpoint still holds the full history.
- Web evidence is explicitly labeled untrusted in tool output. The system prompt tells every provider to
  ignore instructions embedded in sources and cite only evidence actually observed.

## Verification

```bash
python -m pytest
```

The focused suite covers the tool loop and SSE-ready events, checkpoint-compatible graph execution, token
normalization, effective-date pricing, SSRF checks, secret-safe validation, internal auth, PDF validity, and
cross-user artifact isolation.

## Integration assumptions

- The Next.js server has already authenticated the user and enforced the paywall/credit reservation before
  invoking this service. This service authenticates that server; it does not verify Supabase sessions or
  mutate balances itself.
- The web server persists the terminal `usage` event idempotently and reconciles/refunds any credit
  reservation if the stream fails before billable usage is committed.
- Artifact download is proxied by the web server (or it forwards both protected headers); the relative
  `download_url` is intentionally not a public bearer URL.
- Tavily/Brave Search quota and model-provider charges belong to the keys forwarded for that run.
  Search-call fees are not included in token cost because they are not model-token charges.
- Model pricing changes over time. Update the versioned registry and the web billing table together; never
  silently edit an already-used version.
