import {
  apiJson,
  asTrimmedString,
  asUuid,
  handleApiError,
  readJsonObject,
} from "@/lib/server/api-error";
import { requireUser } from "@/lib/server/auth";
import { insertChatMessage, requireChatThread, serializeMessage } from "@/lib/server/chats";
import { createAdminClient } from "@/lib/server/supabase";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const user = await requireUser();
    const threadId = asUuid((await context.params).id, "id")!;
    await requireChatThread(user.id, threadId);
    const url = new URL(request.url);
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") || 100)));
    let query = createAdminClient()
      .from("chat_messages")
      .select("id,role,content,status,metadata,sequence,created_at")
      .eq("thread_id", threadId)
      .eq("user_id", user.id)
      .order("sequence", { ascending: true })
      .limit(limit);
    const after = Number(url.searchParams.get("after") || 0);
    if (Number.isSafeInteger(after) && after > 0) query = query.gt("sequence", after);
    const { data, error } = await query;
    if (error) throw new Error(`Unable to load messages: ${error.message}`);
    return apiJson({ messages: (data || []).map(serializeMessage) });
  } catch (error) {
    return handleApiError(error, request);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const user = await requireUser();
    const threadId = asUuid((await context.params).id, "id")!;
    await requireChatThread(user.id, threadId);
    const body = await readJsonObject(request);
    const content = asTrimmedString(body.content, "content", { min: 1, max: 50_000 })!;
    const message = await insertChatMessage({ userId: user.id, threadId, role: "user", content });
    return apiJson({ message: serializeMessage(message) }, 201);
  } catch (error) {
    return handleApiError(error, request);
  }
}
