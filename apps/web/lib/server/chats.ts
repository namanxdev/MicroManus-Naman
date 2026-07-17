import "server-only";

import { ApiError } from "./api-error";
import type { Provider } from "./providers";
import { createAdminClient } from "./supabase";

export function titleFromMessage(message: string): string {
  const oneLine = message.replace(/\s+/g, " ").trim();
  return oneLine.length <= 72 ? oneLine : `${oneLine.slice(0, 69)}…`;
}

export async function createChatThread(input: {
  userId: string;
  title: string;
  provider: Provider;
  model: string;
}) {
  const { data, error } = await createAdminClient()
    .from("chat_threads")
    .insert({
      user_id: input.userId,
      title: input.title,
      provider: input.provider,
      model: input.model,
    })
    .select("id,user_id,title,provider,model,archived,created_at,updated_at")
    .single();
  if (error) throw new Error(`Unable to create chat: ${error.message}`);
  return data;
}

export async function requireChatThread(userId: string, threadId: string) {
  const { data, error } = await createAdminClient()
    .from("chat_threads")
    .select("id,user_id,title,provider,model,archived,created_at,updated_at")
    .eq("id", threadId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`Unable to load chat: ${error.message}`);
  if (!data) throw new ApiError(404, "CHAT_NOT_FOUND", "Chat not found");
  return data;
}

export async function insertChatMessage(input: {
  userId: string;
  threadId: string;
  role: "user" | "assistant" | "system" | "tool";
  content?: string;
  status?: "pending" | "streaming" | "complete" | "error";
  metadata?: Record<string, unknown>;
}) {
  const { data, error } = await createAdminClient()
    .from("chat_messages")
    .insert({
      user_id: input.userId,
      thread_id: input.threadId,
      role: input.role,
      content: input.content || "",
      status: input.status || "complete",
      metadata: input.metadata || {},
    })
    .select("id,thread_id,role,content,status,metadata,sequence,created_at")
    .single();
  if (error) throw new Error(`Unable to save message: ${error.message}`);
  return data;
}

export async function updateChatMessage(input: {
  userId: string;
  messageId: string;
  content: string;
  status: "complete" | "error";
  metadata?: Record<string, unknown>;
}) {
  const { data, error } = await createAdminClient()
    .from("chat_messages")
    .update({
      content: input.content,
      status: input.status,
      metadata: input.metadata || {},
    })
    .eq("id", input.messageId)
    .eq("user_id", input.userId)
    .select("id,thread_id,role,content,status,metadata,sequence,created_at")
    .single();
  if (error) throw new Error(`Unable to update message: ${error.message}`);
  return data;
}

export function serializeMessage(row: Record<string, any>) {
  const metadata = row.metadata || {};
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    status: row.status,
    metadata,
    steps: metadata.steps || [],
    citations: metadata.sources || metadata.citations || [],
    artifacts: metadata.artifacts || [],
    usage: metadata.usage || undefined,
    sequence: Number(row.sequence),
    createdAt: row.created_at,
  };
}

export function serializeChat(row: Record<string, any>) {
  return {
    id: row.id,
    title: row.title,
    provider: row.provider,
    model: row.model,
    archived: row.archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
