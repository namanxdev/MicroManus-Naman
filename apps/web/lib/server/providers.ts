import "server-only";

import { ApiError } from "./api-error";

export const PROVIDERS = ["openai", "anthropic", "kimi"] as const;
export type Provider = (typeof PROVIDERS)[number];

export function parseProvider(value: unknown): Provider {
  if (typeof value !== "string" || !PROVIDERS.includes(value as Provider)) {
    throw new ApiError(400, "UNSUPPORTED_PROVIDER", "Provider must be openai, anthropic, or kimi");
  }
  return value as Provider;
}

export function providerForModelName(model: string): Provider | undefined {
  const normalized = model.toLowerCase();
  if (normalized.startsWith("gpt-") || normalized.startsWith("o3") || normalized.startsWith("o4")) return "openai";
  if (normalized.startsWith("claude-")) return "anthropic";
  if (normalized.startsWith("kimi-") || normalized.startsWith("moonshot-")) return "kimi";
  return undefined;
}
