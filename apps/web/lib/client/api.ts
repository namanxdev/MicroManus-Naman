import type { StreamEvent } from "./types";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function readError(response: Response) {
  try {
    const body = (await response.json()) as { error?: string; message?: string };
    return body.error || body.message || `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

export async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");
  const response = await fetch(path, {
    ...init,
    headers,
    cache: "no-store",
  });
  if (!response.ok) throw new ApiError(await readError(response), response.status);
  return (await response.json()) as T;
}

export async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new ApiError(await readError(response), response.status);
  return (await response.json()) as T;
}

interface StreamOptions {
  threadId?: string;
  message: string;
  model: string;
  webSearchEnabled: boolean;
  signal?: AbortSignal;
  onEvent: (event: StreamEvent) => void;
}

function normalizeEvent(raw: Record<string, unknown>): StreamEvent | null {
  const type = String(raw.type || raw.event || "");
  if (type === "token" || type === "content_delta") {
    return { type: "delta", delta: String(raw.delta || raw.content || "") };
  }
  if (type === "message" && typeof raw.content === "string") {
    return { type: "delta", delta: raw.content };
  }
  return raw as unknown as StreamEvent;
}

async function consumeStream(response: Response, onEvent: (event: StreamEvent) => void) {
  if (!response.body) throw new ApiError("The research stream returned no body.", 502);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";

    for (const line of lines) {
      const cleaned = line.replace(/^data:\s*/, "").trim();
      if (!cleaned || cleaned === "[DONE]" || cleaned.startsWith(":")) continue;
      try {
        const event = normalizeEvent(JSON.parse(cleaned) as Record<string, unknown>);
        if (event) onEvent(event);
      } catch {
        // Some compatible endpoints stream plain text tokens.
        onEvent({ type: "delta", delta: cleaned });
      }
    }
    if (done) break;
  }

  if (buffer.trim()) {
    const cleaned = buffer.replace(/^data:\s*/, "").trim();
    if (cleaned && cleaned !== "[DONE]") {
      try {
        const event = normalizeEvent(JSON.parse(cleaned) as Record<string, unknown>);
        if (event) onEvent(event);
      } catch {
        onEvent({ type: "delta", delta: cleaned });
      }
    }
  }
}

const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

async function demoResearch(options: StreamOptions) {
  const events: StreamEvent[] = [
    {
      type: "step",
      step: {
        id: "plan",
        label: "Framed the research question",
        detail: "Built a source plan and identified claims that need verification.",
        status: "complete",
        tool: "Reasoning",
        duration: "4s",
      },
    },
    {
      type: "step",
      step: {
        id: "search",
        label: "Searching the open web",
        detail: "Looking for recent primary sources, filings, and expert analysis.",
        status: "running",
        tool: "Web search",
      },
    },
    {
      type: "step",
      step: {
        id: "search",
        label: "Searched the open web",
        detail: "Compared recent primary sources and independent reporting.",
        status: "complete",
        tool: "Web search",
        duration: "16s",
      },
    },
    {
      type: "step",
      step: {
        id: "synthesis",
        label: "Synthesizing evidence",
        detail: "Resolving contradictions and weighting evidence quality.",
        status: "running",
        tool: "Research loop",
      },
    },
  ];

  for (const event of events) {
    if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    await pause(320);
    options.onEvent(event);
  }

  const answer =
    "I’ve mapped the question into its main drivers, recent evidence, and practical implications. This preview is using the local research simulator because the agent endpoint is not configured yet.\n\nAdd a provider key in Settings and connect the server-side search tool to turn this same interface into a live, source-grounded investigation. Once connected, MicroManus will iterate through search, reading, verification, and synthesis before producing a cited answer or PDF report.";
  const pieces = answer.match(/.{1,18}(?:\s|$)/g) || [answer];
  for (const piece of pieces) {
    if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    await pause(24);
    options.onEvent({ type: "delta", delta: piece });
  }
  options.onEvent({
    type: "step",
    step: {
      id: "synthesis",
      label: "Synthesized the findings",
      detail: "Produced a concise, evidence-weighted answer.",
      status: "complete",
      tool: "Research loop",
      duration: "12s",
    },
  });
  options.onEvent({
    type: "citation",
    citation: {
      id: "demo-source",
      title: "Connect live search to retrieve source material",
      url: "/settings",
      domain: "MicroManus setup",
      excerpt: "This placeholder is replaced with verified web citations in a live run.",
    },
  });
  options.onEvent({
    type: "usage",
    usage: { inputTokens: 1280, outputTokens: 486, cacheTokens: 0, cost: 0.0064 },
  });
  options.onEvent({ type: "done" });
}

export async function runResearchStream(options: StreamOptions) {
  const payload = {
    threadId: options.threadId,
    message: options.message,
    model: options.model,
    webSearchEnabled: options.webSearchEnabled,
  };

  const request = async (url: string) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(payload),
      signal: options.signal,
    });
    if (!response.ok) throw new ApiError(await readError(response), response.status);
    await consumeStream(response, options.onEvent);
  };

  try {
    await request("/api/chat/stream");
  } catch (error) {
    const isMissing = error instanceof ApiError && error.status === 404;
    const isNetwork = error instanceof TypeError;
    if ((isMissing || isNetwork) && process.env.NEXT_PUBLIC_ENABLE_DEMO === "true") {
      await demoResearch(options);
      return;
    }
    throw error;
  }
}
