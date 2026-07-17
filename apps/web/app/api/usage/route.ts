import {
  apiJson,
  ApiError,
  asTrimmedString,
  asUuid,
  assertInternalRequest,
  handleApiError,
  readJsonObject,
} from "@/lib/server/api-error";
import { requireUser } from "@/lib/server/auth";
import { getBillingStatus, recordUsageAndDebit } from "@/lib/server/billing";
import { parseProvider } from "@/lib/server/providers";
import { createAdminClient } from "@/lib/server/supabase";

function sinceForRange(range: string | null): string | null {
  if (!range || range === "30d") return new Date(Date.now() - 30 * 86_400_000).toISOString();
  if (range === "7d") return new Date(Date.now() - 7 * 86_400_000).toISOString();
  if (range === "90d") return new Date(Date.now() - 90 * 86_400_000).toISOString();
  if (range === "all") return null;
  throw new ApiError(400, "INVALID_RANGE", "Usage range must be 7d, 30d, 90d, or all");
}

function nonNegativeInteger(value: unknown, field: string): number {
  const result = Number(value ?? 0);
  if (!Number.isSafeInteger(result) || result < 0 || result > 10_000_000_000) {
    throw new Error(`${field} must be a non-negative integer`);
  }
  return result;
}

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const since = sinceForRange(url.searchParams.get("range"));
    const requestedLimit = Number(url.searchParams.get("limit") || 100);
    const limit = Number.isSafeInteger(requestedLimit)
      ? Math.min(500, Math.max(1, requestedLimit))
      : 100;
    const [{ data, error }, billing] = await Promise.all([
      createAdminClient().rpc("get_usage_summary", {
        p_user_id: user.id,
        p_since: since,
        p_limit: limit,
      }),
      getBillingStatus(user.id),
    ]);
    if (error) throw new Error(`Unable to load usage analytics: ${error.message}`);

    const totals = data?.totals || {};
    const totalTokens = Number(totals.input_tokens || 0)
      + Number(totals.output_tokens || 0)
      + Number(totals.cache_read_tokens || 0)
      + Number(totals.cache_write_tokens || 0);
    const chats = (data?.by_chat || []).map((chat: Record<string, unknown>) => ({
      id: chat.thread_id,
      title: chat.title,
      model: chat.model,
      totalTokens: Number(chat.total_tokens || 0),
      inputTokens: Number(chat.input_tokens || 0),
      outputTokens: Number(chat.output_tokens || 0),
      cacheTokens: Number(chat.cache_tokens || 0),
      inputCost: Number(chat.input_cost_usd || 0),
      outputCost: Number(chat.output_cost_usd || 0),
      cacheCost: Number(chat.cache_cost_usd || 0),
      totalCost: Number(chat.total_cost_usd || 0),
      researchRuns: Number(chat.runs || 0),
      duration: `${Math.max(0, Math.round(Number(chat.duration_ms || 0) / 1000))}s`,
      date: chat.updated_at ? new Date(String(chat.updated_at)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "",
      updatedAt: chat.updated_at,
    }));

    return apiJson({
      summary: {
        creditsRemaining: billing.credits,
        totalCost: Number(totals.total_cost_usd || 0),
        totalTokens,
        researchRuns: Number(totals.research_runs || 0),
        inputTokens: Number(totals.input_tokens || 0),
        outputTokens: Number(totals.output_tokens || 0),
        cacheReadTokens: Number(totals.cache_read_tokens || 0),
        cacheWriteTokens: Number(totals.cache_write_tokens || 0),
        inputCost: Number(totals.input_cost_usd || 0),
        outputCost: Number(totals.output_cost_usd || 0),
        cacheCost: Number(totals.cache_cost_usd || 0),
      },
      chats,
      models: data?.by_model || [],
      recent: data?.recent || [],
      daily: (data?.daily || []).map((day: Record<string, unknown>) => ({
        label: new Date(`${String(day.day)}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
        cost: Number(day.cost || 0),
      })),
    });
  } catch (error) {
    return handleApiError(error, request);
  }
}

// Internal service endpoint for non-streaming/background runs. Browser callers
// cannot forge usage because this path requires AGENT_SERVICE_TOKEN.
export async function POST(request: Request) {
  try {
    assertInternalRequest(request);
    const body = await readJsonObject(request, 32 * 1024);
    const result = await recordUsageAndDebit({
      userId: asUuid(body.userId ?? body.user_id, "userId")!,
      requestId: asTrimmedString(body.requestId ?? body.request_id, "requestId", { min: 1, max: 200 })!,
      threadId: asUuid(body.threadId ?? body.thread_id, "threadId", true),
      messageId: asUuid(body.messageId ?? body.message_id, "messageId", true),
      provider: parseProvider(body.provider),
      model: asTrimmedString(body.model, "model", { min: 1, max: 160 })!,
      inputTokens: nonNegativeInteger(body.inputTokens ?? body.input_tokens, "inputTokens"),
      outputTokens: nonNegativeInteger(body.outputTokens ?? body.output_tokens, "outputTokens"),
      cacheReadTokens: nonNegativeInteger(body.cacheReadTokens ?? body.cache_read_tokens, "cacheReadTokens"),
      cacheWriteTokens: nonNegativeInteger(body.cacheWriteTokens ?? body.cache_write_tokens, "cacheWriteTokens"),
      latencyMs: body.latencyMs === undefined && body.latency_ms === undefined
        ? undefined
        : nonNegativeInteger(body.latencyMs ?? body.latency_ms, "latencyMs"),
    });
    return apiJson({ ok: true, ...result });
  } catch (error) {
    return handleApiError(error, request);
  }
}
