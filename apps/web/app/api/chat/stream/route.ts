import {
  ApiError,
  asTrimmedString,
  asUuid,
  handleApiError,
  readJsonObject,
} from "@/lib/server/api-error";
import { requireUser } from "@/lib/server/auth";
import { recordUsageAndDebit, requireResearchAccess } from "@/lib/server/billing";
import {
  createChatThread,
  insertChatMessage,
  requireChatThread,
  titleFromMessage,
  updateChatMessage,
} from "@/lib/server/chats";
import { isExplicitDevMockEnabled, isProduction, requiredEnv } from "@/lib/server/env";
import { getModelPricing } from "@/lib/server/pricing";
import { getProviderCredential } from "@/lib/server/provider-credentials";
import { parseProvider, providerForModelName, type Provider } from "@/lib/server/providers";
import { createAdminClient } from "@/lib/server/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

interface NormalizedUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  runId?: string;
  latencyMs?: number;
}

interface StreamState {
  content: string;
  runId?: string;
  usage?: NormalizedUsage;
  sources: Array<Record<string, unknown>>;
  artifacts: Array<Record<string, unknown>>;
  failed: boolean;
  statusIndex: number;
  emittedCitationIds: Set<string>;
  emittedArtifactIds: Set<string>;
  steps: Array<Record<string, unknown>>;
}

const encoder = new TextEncoder();

function uiEvent(value: Record<string, unknown>): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(value)}\n\n`);
}

function objectValue(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function tokenCount(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function textValue(...values: unknown[]): string | undefined {
  return values.find((value) => typeof value === "string" && value.length > 0) as string | undefined;
}

function normalizeUsage(payload: Record<string, any>, state: StreamState): NormalizedUsage {
  const usage = objectValue(payload.usage || payload);
  return {
    inputTokens: tokenCount(usage.input_tokens ?? usage.inputTokens),
    outputTokens: tokenCount(usage.output_tokens ?? usage.outputTokens),
    cacheReadTokens: tokenCount(usage.cache_read_tokens ?? usage.cacheReadTokens),
    cacheWriteTokens: tokenCount(usage.cache_write_tokens ?? usage.cacheWriteTokens),
    runId: textValue(usage.run_id, usage.runId, payload.run_id, payload.runId, state.runId),
    latencyMs: tokenCount(usage.latency_ms ?? usage.latencyMs) || undefined,
  };
}

function citationFrom(payload: Record<string, any>, fallbackId: string) {
  const source = objectValue(payload.source || payload.citation || payload);
  const url = textValue(source.url, source.link) || "";
  let domain: string | undefined;
  try {
    domain = url ? new URL(url).hostname.replace(/^www\./, "") : undefined;
  } catch {
    domain = undefined;
  }
  return {
    id: textValue(source.id, source.source_id) || fallbackId,
    title: textValue(source.title, source.name) || domain || "Research source",
    url,
    domain: textValue(source.domain) || domain,
    excerpt: textValue(source.excerpt, source.snippet, source.description),
  };
}

function artifactFrom(payload: Record<string, any>, fallbackId: string) {
  const artifact = objectValue(payload.artifact || payload);
  const id = textValue(artifact.id, artifact.artifact_id) || fallbackId;
  const upstreamUrl = textValue(artifact.url, artifact.download_url, artifact.signed_url) || "";
  const url = /^\/v1\/artifacts\/[0-9a-f]{32}$/.test(upstreamUrl)
    ? `/api/agent/artifacts/${encodeURIComponent(String(id))}`
    : upstreamUrl;
  return {
    id,
    name: textValue(artifact.name, artifact.filename, artifact.title) || "Research report.pdf",
    type: "pdf",
    url,
    size: tokenCount(artifact.size ?? artifact.size_bytes) || undefined,
    storagePath: textValue(artifact.storage_path, artifact.storagePath),
  };
}

function mapUpstreamEvent(
  eventName: string,
  payload: Record<string, any>,
  state: StreamState,
): Array<Record<string, unknown>> {
  const output: Array<Record<string, unknown>> = [];
  const name = eventName || textValue(payload.type) || "message";

  if (name === "run.started") {
    state.runId = textValue(payload.run_id, payload.runId, payload.id) || state.runId;
    output.push({
      type: "step",
      step: {
        id: state.runId || `run-${state.statusIndex++}`,
        label: "Planning the research",
        detail: textValue(payload.message, payload.detail),
        status: "running",
      },
    });
  } else if (name === "status") {
    const status = textValue(payload.status) === "complete" ? "complete" : "running";
    output.push({
      type: "step",
      step: {
        id: textValue(payload.id, payload.step_id) || `status-${state.statusIndex++}`,
        label: textValue(payload.label, payload.message, payload.status) || "Researching",
        detail: textValue(payload.detail, payload.description),
        status,
      },
    });
  } else if (name === "tool.started" || name === "tool.completed") {
    const tool = textValue(payload.tool, payload.tool_name, payload.name) || "research tool";
    output.push({
      type: "step",
      step: {
        id: textValue(payload.tool_call_id, payload.call_id, payload.id) || `tool-${state.statusIndex++}`,
        label: name === "tool.started" ? `Using ${tool}` : `Finished ${tool}`,
        detail: textValue(payload.detail, payload.query, payload.summary),
        status: name === "tool.started" ? "running" : "complete",
        tool,
      },
    });
  } else if (name === "source") {
    const citation = citationFrom(payload, `source-${state.sources.length + 1}`);
    const citationId = String(citation.id);
    if (!state.emittedCitationIds.has(citationId)) {
      state.emittedCitationIds.add(citationId);
      state.sources.push(citation);
      output.push({ type: "citation", citation });
    }
  } else if (name === "usage") {
    state.usage = normalizeUsage(payload, state);
  } else if (name === "final") {
    state.runId = textValue(payload.run_id, payload.runId, state.runId);
    if (payload.usage) state.usage = normalizeUsage(payload, state);
    const content = textValue(payload.content, payload.answer, payload.text) || "";
    if (content) {
      state.content = content;
      output.push({ type: "delta", delta: content });
    }
    const sources = Array.isArray(payload.sources) ? payload.sources : [];
    for (const item of sources) {
      const citation = citationFrom(objectValue(item), `source-${state.sources.length + 1}`);
      const citationId = String(citation.id);
      if (!state.emittedCitationIds.has(citationId)) {
        state.emittedCitationIds.add(citationId);
        state.sources.push(citation);
        output.push({ type: "citation", citation });
      }
    }
    const artifacts = Array.isArray(payload.artifacts) ? payload.artifacts : [];
    for (const item of artifacts) {
      const artifact = artifactFrom(objectValue(item), `artifact-${state.artifacts.length + 1}`);
      const artifactId = String(artifact.id);
      if (state.emittedArtifactIds.has(artifactId)) continue;
      state.emittedArtifactIds.add(artifactId);
      state.artifacts.push(artifact);
      output.push({ type: "artifact", artifact });
    }
  } else if (name === "delta" || name === "token" || name === "message.delta") {
    const delta = textValue(payload.delta, payload.content, payload.text) || "";
    if (delta) {
      state.content += delta;
      output.push({ type: "delta", delta });
    }
  } else if (name === "artifact") {
    const artifact = artifactFrom(payload, `artifact-${state.artifacts.length + 1}`);
    const artifactId = String(artifact.id);
    if (!state.emittedArtifactIds.has(artifactId)) {
      state.emittedArtifactIds.add(artifactId);
      state.artifacts.push(artifact);
      output.push({ type: "artifact", artifact });
    }
  } else if (name === "error") {
    state.failed = true;
    const message = textValue(payload.message, payload.detail)
      || "The research service could not finish this run.";
    output.push({
      type: "step",
      step: {
        id: textValue(payload.id) || `error-${state.statusIndex++}`,
        label: "Research interrupted",
        detail: message,
        status: "error",
      },
    });
    output.push({ type: "error", error: message });
  }
  for (const event of output) {
    if (event.type !== "step") continue;
    const step = objectValue(event.step);
    const index = state.steps.findIndex((item) => item.id === step.id);
    if (index >= 0) state.steps[index] = { ...state.steps[index], ...step };
    else state.steps.push(step);
  }
  return output;
}

function parseSseBlock(block: string): { eventName: string; payload: Record<string, any> } | null {
  let eventName = "message";
  const data: string[] = [];
  for (const rawLine of block.split(/\r?\n/)) {
    if (rawLine.startsWith("event:")) eventName = rawLine.slice(6).trim();
    if (rawLine.startsWith("data:")) data.push(rawLine.slice(5).trimStart());
  }
  if (!data.length) return null;
  try {
    return { eventName, payload: objectValue(JSON.parse(data.join("\n"))) };
  } catch {
    return { eventName, payload: { message: data.join("\n") } };
  }
}

function safeAgentUrl(): URL {
  const base = new URL(requiredEnv("AGENT_SERVICE_URL"));
  if (isProduction() && base.protocol !== "https:") {
    throw new Error("AGENT_SERVICE_URL must use HTTPS in production");
  }
  if (base.protocol !== "https:" && base.protocol !== "http:") {
    throw new Error("AGENT_SERVICE_URL must use HTTP or HTTPS");
  }
  return new URL("/v1/chat/stream", `${base.origin}/`);
}

function responseHeaders(): HeadersInit {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-store, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
    "X-Content-Type-Options": "nosniff",
  };
}

async function persistArtifacts(
  userId: string,
  threadId: string,
  messageId: string,
  artifacts: Array<Record<string, unknown>>,
): Promise<void> {
  const valid = artifacts.flatMap((artifact) => {
    const storagePath = textValue(artifact.storagePath, artifact.storage_path);
    if (!storagePath || !storagePath.startsWith(`${userId}/${threadId}/`)) return [];
    return [{
      user_id: userId,
      thread_id: threadId,
      message_id: messageId,
      name: textValue(artifact.name) || "Research report.pdf",
      kind: "pdf",
      storage_path: storagePath,
      content_type: "application/pdf",
      size_bytes: tokenCount(artifact.size) || null,
      metadata: artifact,
    }];
  });
  if (!valid.length) return;
  const { error } = await createAdminClient().from("artifacts").insert(valid);
  if (error) console.error("Unable to persist report artifacts", { threadId, error: error.message });
}

async function finalizeRun(input: {
  userId: string;
  threadId: string;
  assistantMessageId: string;
  provider: Provider;
  model: string;
  startedAt: number;
  state: StreamState;
}) {
  const { state } = input;
  await persistArtifacts(input.userId, input.threadId, input.assistantMessageId, state.artifacts);

  const billing = state.usage ? await recordUsageAndDebit({
      userId: input.userId,
      requestId: state.usage.runId || state.runId || crypto.randomUUID(),
      threadId: input.threadId,
      messageId: input.assistantMessageId,
      provider: input.provider,
      model: input.model,
      inputTokens: state.usage.inputTokens,
      outputTokens: state.usage.outputTokens,
      cacheReadTokens: state.usage.cacheReadTokens,
      cacheWriteTokens: state.usage.cacheWriteTokens,
      latencyMs: state.usage.latencyMs || Date.now() - input.startedAt,
    }) : null;
  const usage = billing && state.usage ? {
    inputTokens: state.usage.inputTokens,
    outputTokens: state.usage.outputTokens,
    cacheTokens: state.usage.cacheReadTokens + state.usage.cacheWriteTokens,
    cost: billing.cost.totalUsd,
  } : undefined;
  await updateChatMessage({
    userId: input.userId,
    messageId: input.assistantMessageId,
    content: state.content,
    status: state.failed ? "error" : "complete",
    metadata: {
      runId: state.runId,
      steps: state.steps,
      sources: state.sources,
      artifacts: state.artifacts,
      usage,
    },
  });
  return billing;
}

function createUpstreamStream(input: {
  upstream: Response;
  userId: string;
  threadId: string;
  assistantMessageId: string;
  provider: Provider;
  model: string;
  startedAt: number;
}): ReadableStream<Uint8Array> {
  const state: StreamState = {
    content: "",
    sources: [],
    artifacts: [],
    failed: false,
    statusIndex: 0,
    emittedCitationIds: new Set(),
    emittedArtifactIds: new Set(),
    steps: [],
  };

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(uiEvent({ type: "thread", threadId: input.threadId }));
      const reader = input.upstream.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const processBlock = (block: string) => {
        const parsed = parseSseBlock(block);
        if (!parsed) return;
        for (const event of mapUpstreamEvent(parsed.eventName, parsed.payload, state)) {
          controller.enqueue(uiEvent(event));
        }
      };

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let boundary = buffer.search(/\r?\n\r?\n/);
          while (boundary >= 0) {
            const separator = buffer.slice(boundary).match(/^\r?\n\r?\n/)?.[0] || "\n\n";
            processBlock(buffer.slice(0, boundary));
            buffer = buffer.slice(boundary + separator.length);
            boundary = buffer.search(/\r?\n\r?\n/);
          }
        }
        buffer += decoder.decode();
        if (buffer.trim()) processBlock(buffer);

        const billing = await finalizeRun({ ...input, state });
        if (billing && state.usage) {
          controller.enqueue(uiEvent({
            type: "usage",
            usage: {
              inputTokens: state.usage.inputTokens,
              outputTokens: state.usage.outputTokens,
              cacheTokens: state.usage.cacheReadTokens + state.usage.cacheWriteTokens,
              cacheReadTokens: state.usage.cacheReadTokens,
              cacheWriteTokens: state.usage.cacheWriteTokens,
              cost: billing.cost.totalUsd,
              inputCost: billing.cost.inputUsd,
              outputCost: billing.cost.outputUsd,
              cacheCost: billing.cost.cacheUsd,
              creditsRemaining: Number((billing.ledger as Record<string, unknown>)?.credits ?? 0),
              pricingVersion: billing.cost.pricingVersion,
            },
          }));
        }
        controller.enqueue(uiEvent({ type: "done" }));
      } catch (error) {
        state.failed = true;
        try {
          await updateChatMessage({
            userId: input.userId,
            messageId: input.assistantMessageId,
            content: state.content,
            status: "error",
            metadata: { runId: state.runId, sources: state.sources, artifacts: state.artifacts },
          });
        } catch {
          // The browser still receives a terminal event even if persistence is unavailable.
        }
        console.error("Research stream failed", {
          threadId: input.threadId,
          error: error instanceof Error ? error.message : "Unknown stream error",
        });
        controller.enqueue(uiEvent({
          type: "error",
          error: "The research run could not be completed",
          code: error instanceof ApiError ? error.code : "RESEARCH_STREAM_ERROR",
        }));
        controller.enqueue(uiEvent({ type: "done" }));
      } finally {
        controller.close();
        reader.releaseLock();
      }
    },
    async cancel() {
      try {
        await updateChatMessage({
          userId: input.userId,
          messageId: input.assistantMessageId,
          content: state.content,
          status: "error",
          metadata: { cancelled: true, runId: state.runId, sources: state.sources },
        });
      } catch {
        // Cancellation is best-effort.
      }
    },
  });
}

function createDevMockStream(input: {
  userId: string;
  threadId: string;
  assistantMessageId: string;
  message: string;
}): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const content = `Development mock response for: ${input.message}`;
      controller.enqueue(uiEvent({ type: "thread", threadId: input.threadId }));
      controller.enqueue(uiEvent({
        type: "step",
        step: { id: "dev-mock", label: "Development mock", status: "complete" },
      }));
      controller.enqueue(uiEvent({ type: "delta", delta: content }));
      await updateChatMessage({
        userId: input.userId,
        messageId: input.assistantMessageId,
        content,
        status: "complete",
        metadata: { developmentMock: true },
      });
      controller.enqueue(uiEvent({ type: "done" }));
      controller.close();
    },
  });
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    await requireResearchAccess(user.id);
    const body = await readJsonObject(request, 128 * 1024);
    const message = asTrimmedString(body.message, "message", { min: 1, max: 30_000 })!;
    const rawThreadId = body.threadId ?? body.thread_id;
    const requestedThreadId = typeof rawThreadId === "string" && rawThreadId.startsWith("research-")
      ? undefined
      : asUuid(rawThreadId, "threadId", true);

    let model = asTrimmedString(body.model, "model", { min: 1, max: 160, optional: true });
    let provider: Provider | undefined = body.provider ? parseProvider(body.provider) : undefined;
    let thread;
    if (requestedThreadId) {
      thread = await requireChatThread(user.id, requestedThreadId);
      model = model || thread.model;
      if (!model) throw new ApiError(400, "UNSUPPORTED_MODEL", "A supported model is required");
      provider = provider || providerForModelName(model) || parseProvider(thread.provider);
    } else {
      model ||= "gpt-5.6-terra";
      provider ||= providerForModelName(model);
      if (!provider) throw new ApiError(400, "UNSUPPORTED_MODEL", "Unable to determine the model provider");
      thread = await createChatThread({
        userId: user.id,
        title: titleFromMessage(message),
        provider,
        model,
      });
    }
    if (!model || !provider) throw new ApiError(400, "UNSUPPORTED_MODEL", "A supported model is required");
    await getModelPricing(provider, model);

    if (thread.model !== model || thread.provider !== provider) {
      const { error } = await createAdminClient()
        .from("chat_threads")
        .update({ model, provider, updated_at: new Date().toISOString() })
        .eq("id", thread.id)
        .eq("user_id", user.id);
      if (error) throw new Error(`Unable to update the chat model: ${error.message}`);
    }

    const credential = await getProviderCredential(user.id, provider);
    if (!credential) {
      throw new ApiError(400, "PROVIDER_KEY_REQUIRED", `Add your ${provider} API key in Settings first`);
    }

    await insertChatMessage({ userId: user.id, threadId: thread.id, role: "user", content: message });
    const assistantMessage = await insertChatMessage({
      userId: user.id,
      threadId: thread.id,
      role: "assistant",
      content: "",
      status: "streaming",
    });

    if (isExplicitDevMockEnabled("ENABLE_DEV_MOCKS") && !process.env.AGENT_SERVICE_URL) {
      return new Response(createDevMockStream({
        userId: user.id,
        threadId: thread.id,
        assistantMessageId: assistantMessage.id,
        message,
      }), { status: 200, headers: responseHeaders() });
    }

    const maxIterations = Math.min(20, Math.max(1, tokenCount(body.maxIterations ?? body.max_iterations) || 10));
    const startedAt = Date.now();
    let upstream: Response;
    try {
      upstream = await fetch(safeAgentUrl(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          Authorization: `Bearer ${requiredEnv("AGENT_SERVICE_TOKEN")}`,
          "X-User-Id": user.id,
        },
        body: JSON.stringify({
          thread_id: thread.id,
          message,
          model: `${provider}/${model}`,
          credentials: {
            api_key: credential.apiKey,
            ...(credential.baseUrl ? { base_url: credential.baseUrl } : {}),
            ...(process.env.TAVILY_SEARCH_API_KEY
              ? { tavily_api_key: process.env.TAVILY_SEARCH_API_KEY }
              : {}),
            ...(process.env.BRAVE_SEARCH_API_KEY ? { brave_api_key: process.env.BRAVE_SEARCH_API_KEY } : {}),
          },
          max_iterations: maxIterations,
        }),
        cache: "no-store",
        signal: request.signal,
      });
    } catch {
      await updateChatMessage({
        userId: user.id,
        messageId: assistantMessage.id,
        content: "",
        status: "error",
        metadata: { upstreamUnavailable: true },
      });
      throw new ApiError(502, "AGENT_UNAVAILABLE", "The research service is unavailable");
    }

    if (!upstream.ok || !upstream.body) {
      await updateChatMessage({
        userId: user.id,
        messageId: assistantMessage.id,
        content: "",
        status: "error",
        metadata: { upstreamStatus: upstream.status },
      });
      throw new ApiError(502, "AGENT_UNAVAILABLE", "The research service is unavailable");
    }
    if (!upstream.headers.get("content-type")?.includes("text/event-stream")) {
      await updateChatMessage({
        userId: user.id,
        messageId: assistantMessage.id,
        content: "",
        status: "error",
        metadata: { upstreamStatus: upstream.status, invalidContentType: true },
      });
      throw new ApiError(502, "INVALID_AGENT_RESPONSE", "The research service returned an invalid response");
    }

    return new Response(createUpstreamStream({
      upstream,
      userId: user.id,
      threadId: thread.id,
      assistantMessageId: assistantMessage.id,
      provider,
      model,
      startedAt,
    }), { status: 200, headers: responseHeaders() });
  } catch (error) {
    return handleApiError(error, request);
  }
}
