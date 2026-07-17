import {
  apiJson,
  asTrimmedString,
  asUuid,
  handleApiError,
  readJsonObject,
} from "@/lib/server/api-error";
import { requireUser } from "@/lib/server/auth";
import { requireChatThread, serializeChat, serializeMessage } from "@/lib/server/chats";
import { getModelPricing } from "@/lib/server/pricing";
import { parseProvider, providerForModelName } from "@/lib/server/providers";
import { createAdminClient } from "@/lib/server/supabase";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const user = await requireUser();
    const threadId = asUuid((await context.params).id, "id")!;
    const chat = await requireChatThread(user.id, threadId);
    const { data: messages, error } = await createAdminClient()
      .from("chat_messages")
      .select("id,role,content,status,metadata,sequence,created_at")
      .eq("thread_id", threadId)
      .eq("user_id", user.id)
      .order("sequence", { ascending: true })
      .limit(500);
    if (error) throw new Error(`Unable to load messages: ${error.message}`);
    return apiJson({ chat: { ...serializeChat(chat), messages: (messages || []).map(serializeMessage) } });
  } catch (error) {
    return handleApiError(error, request);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const user = await requireUser();
    const threadId = asUuid((await context.params).id, "id")!;
    const current = await requireChatThread(user.id, threadId);
    const body = await readJsonObject(request);
    const updates: Record<string, unknown> = {};
    if (body.title !== undefined) updates.title = asTrimmedString(body.title, "title", { min: 1, max: 160 });
    if (body.archived !== undefined) {
      if (typeof body.archived !== "boolean") throw new Error("archived must be a boolean");
      updates.archived = body.archived;
    }
    if (body.model !== undefined || body.provider !== undefined) {
      const model = asTrimmedString(body.model ?? current.model, "model", { min: 1, max: 160 })!;
      const provider = body.provider
        ? parseProvider(body.provider)
        : providerForModelName(model) || (current.provider as ReturnType<typeof parseProvider>);
      await getModelPricing(provider, model);
      updates.model = model;
      updates.provider = provider;
    }
    if (!Object.keys(updates).length) return apiJson({ chat: serializeChat(current) });
    updates.updated_at = new Date().toISOString();

    const { data, error } = await createAdminClient()
      .from("chat_threads")
      .update(updates)
      .eq("id", threadId)
      .eq("user_id", user.id)
      .select("id,title,provider,model,last_message_preview,archived,created_at,updated_at")
      .single();
    if (error) throw new Error(`Unable to update chat: ${error.message}`);
    return apiJson({ chat: { ...serializeChat(data), preview: data.last_message_preview || undefined } });
  } catch (error) {
    return handleApiError(error, request);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const user = await requireUser();
    const threadId = asUuid((await context.params).id, "id")!;
    await requireChatThread(user.id, threadId);
    const { error } = await createAdminClient()
      .from("chat_threads")
      .delete()
      .eq("id", threadId)
      .eq("user_id", user.id);
    if (error) throw new Error(`Unable to delete chat: ${error.message}`);
    return apiJson({ ok: true });
  } catch (error) {
    return handleApiError(error, request);
  }
}
