import {
  apiJson,
  asTrimmedString,
  handleApiError,
  readJsonObject,
} from "@/lib/server/api-error";
import { requireUser } from "@/lib/server/auth";
import { createChatThread, serializeChat } from "@/lib/server/chats";
import { getModelPricing } from "@/lib/server/pricing";
import { parseProvider, providerForModelName } from "@/lib/server/providers";
import { createAdminClient } from "@/lib/server/supabase";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 50)));
    let query = createAdminClient()
      .from("chat_threads")
      .select("id,title,provider,model,last_message_preview,archived,created_at,updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (url.searchParams.get("archived") !== "true") query = query.eq("archived", false);
    const { data, error } = await query;
    if (error) throw new Error(`Unable to list chats: ${error.message}`);
    return apiJson({
      chats: (data || []).map((row) => ({
        ...serializeChat(row),
        preview: row.last_message_preview || undefined,
      })),
    });
  } catch (error) {
    return handleApiError(error, request);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await readJsonObject(request);
    const model = asTrimmedString(body.model ?? "gpt-5.6-terra", "model", { min: 1, max: 160 })!;
    const inferredProvider = providerForModelName(model);
    const provider = body.provider ? parseProvider(body.provider) : inferredProvider;
    if (!provider) throw new Error("Unable to infer provider for model");
    await getModelPricing(provider, model);
    const title = asTrimmedString(body.title ?? "New research", "title", { min: 1, max: 160 })!;
    const chat = await createChatThread({ userId: user.id, provider, model, title });
    return apiJson({ chat: serializeChat(chat) }, 201);
  } catch (error) {
    return handleApiError(error, request);
  }
}
