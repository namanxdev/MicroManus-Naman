import { ApiError, handleApiError } from "@/lib/server/api-error";
import { requireUser } from "@/lib/server/auth";
import { createAdminClient } from "@/lib/server/supabase";

function sinceForRange(range: string | null): string | null {
  if (!range || range === "30d") return new Date(Date.now() - 30 * 86_400_000).toISOString();
  if (range === "7d") return new Date(Date.now() - 7 * 86_400_000).toISOString();
  if (range === "90d") return new Date(Date.now() - 90 * 86_400_000).toISOString();
  if (range === "all") return null;
  throw new ApiError(400, "INVALID_RANGE", "Usage range must be 7d, 30d, 90d, or all");
}

function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  // Prevent spreadsheet formula execution from user-controlled thread titles.
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const { data, error } = await createAdminClient().rpc("get_usage_summary", {
      p_user_id: user.id,
      p_since: sinceForRange(url.searchParams.get("range")),
      p_limit: 500,
    });
    if (error) throw new Error(`Unable to export usage: ${error.message}`);

    const headers = [
      "thread_id", "title", "model", "updated_at", "runs", "duration_ms",
      "input_tokens", "output_tokens", "cache_tokens", "input_cost_usd",
      "output_cost_usd", "cache_cost_usd", "total_cost_usd",
    ];
    const rows = (data?.by_chat || []).map((chat: Record<string, unknown>) => [
      chat.thread_id, chat.title, chat.model, chat.updated_at, chat.runs, chat.duration_ms,
      chat.input_tokens, chat.output_tokens, chat.cache_tokens, chat.input_cost_usd,
      chat.output_cost_usd, chat.cache_cost_usd, chat.total_cost_usd,
    ]);
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(`\uFEFF${csv}\r\n`, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="micromanus-usage-${stamp}.csv"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return handleApiError(error, request);
  }
}
