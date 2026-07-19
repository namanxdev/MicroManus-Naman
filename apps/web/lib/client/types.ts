export type ProviderId = "openai" | "anthropic" | "kimi";

export type AgentStepStatus = "queued" | "running" | "complete" | "error";

export interface AgentStep {
  id: string;
  label: string;
  detail: string;
  status: AgentStepStatus;
  tool?: string;
  duration?: string;
}

export interface Citation {
  id: string;
  title: string;
  url: string;
  domain?: string;
  excerpt?: string;
  publishedAt?: string;
}

export interface Artifact {
  id: string;
  name: string;
  type: "pdf" | "markdown" | "csv";
  url: string;
  size?: string | number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  cost: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  status?: "streaming" | "complete" | "error";
  steps?: AgentStep[];
  citations?: Citation[];
  artifacts?: Artifact[];
  usage?: TokenUsage;
  error?: string;
}

export interface ChatThread {
  id: string;
  title: string;
  model: string;
  messages: ChatMessage[];
  updatedAt: string;
  preview?: string;
}

export interface ChatListItem {
  id: string;
  title: string;
  model: string;
  updatedAt: string;
  preview?: string;
}

export interface ModelOption {
  id: string;
  name: string;
  provider: string;
  note: string;
}

export type StreamEvent =
  | { type: "thread"; threadId: string }
  | { type: "step"; step: AgentStep }
  | { type: "delta"; delta: string }
  | { type: "citation"; citation: Citation }
  | { type: "artifact"; artifact: Artifact }
  | { type: "usage"; usage: TokenUsage }
  | { type: "error"; error: string; code?: string }
  | { type: "done" };

export interface UsageSummary {
  creditsRemaining: number;
  totalCost: number;
  totalTokens: number;
  researchRuns: number;
  cachedSavings?: number;
}

export interface UsageChat {
  id: string;
  title: string;
  model: string;
  date: string;
  duration: string;
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  inputCost: number;
  outputCost: number;
  cacheCost: number;
  totalCost: number;
}

export interface UsageResponse {
  summary: UsageSummary;
  chats: UsageChat[];
  daily?: Array<{ label: string; cost: number }>;
}

export interface ProviderConfiguration {
  id: ProviderId;
  configured: boolean;
  baseUrl?: string;
  model?: string;
}
