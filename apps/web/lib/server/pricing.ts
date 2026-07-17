import "server-only";

import { ApiError } from "./api-error";
import type { Provider } from "./providers";
import { createAdminClient } from "./supabase";

export interface UsageTokenCounts {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface CostBreakdown {
  inputUsd: number;
  outputUsd: number;
  cacheReadUsd: number;
  cacheWriteUsd: number;
  cacheUsd: number;
  totalUsd: number;
  pricingVersion: string;
}

export interface ModelPricing {
  provider: Provider;
  model: string;
  displayName: string;
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
  cacheReadPerMillionUsd: number;
  cacheWritePerMillionUsd: number;
  pricingVersion: string;
  effectiveFrom: string;
  effectiveTo?: string;
}

function money(value: number): number {
  return Number(value.toFixed(8));
}

export async function listActiveModels(): Promise<ModelPricing[]> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await createAdminClient()
    .from("model_pricing")
    .select("provider,model,display_name,input_per_million_usd,output_per_million_usd,cache_read_per_million_usd,cache_write_per_million_usd,pricing_version,effective_from,effective_to")
    .eq("active", true)
    .lte("effective_from", today)
    .or(`effective_to.is.null,effective_to.gte.${today}`)
    .order("provider")
    .order("display_name");
  if (error) throw new Error(`Unable to load model pricing: ${error.message}`);
  return (data || []).map((row) => ({
    provider: row.provider as Provider,
    model: row.model,
    displayName: row.display_name,
    inputPerMillionUsd: Number(row.input_per_million_usd),
    outputPerMillionUsd: Number(row.output_per_million_usd),
    cacheReadPerMillionUsd: Number(row.cache_read_per_million_usd),
    cacheWritePerMillionUsd: Number(row.cache_write_per_million_usd),
    pricingVersion: row.pricing_version,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to || undefined,
  }));
}

export async function getModelPricing(provider: Provider, model: string): Promise<ModelPricing> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await createAdminClient()
    .from("model_pricing")
    .select("provider,model,display_name,input_per_million_usd,output_per_million_usd,cache_read_per_million_usd,cache_write_per_million_usd,pricing_version,effective_from,effective_to")
    .eq("provider", provider)
    .eq("model", model)
    .eq("active", true)
    .lte("effective_from", today)
    .or(`effective_to.is.null,effective_to.gte.${today}`)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Unable to load model pricing: ${error.message}`);
  if (!data) {
    throw new ApiError(422, "MODEL_NOT_PRICED", "This model is not enabled for usage billing");
  }
  return {
    provider: data.provider as Provider,
    model: data.model,
    displayName: data.display_name,
    inputPerMillionUsd: Number(data.input_per_million_usd),
    outputPerMillionUsd: Number(data.output_per_million_usd),
    cacheReadPerMillionUsd: Number(data.cache_read_per_million_usd),
    cacheWritePerMillionUsd: Number(data.cache_write_per_million_usd),
    pricingVersion: data.pricing_version,
    effectiveFrom: data.effective_from,
    effectiveTo: data.effective_to || undefined,
  };
}

export function calculateModelCost(pricing: ModelPricing, usage: UsageTokenCounts): CostBreakdown {
  const inputUsd = money((usage.inputTokens / 1_000_000) * pricing.inputPerMillionUsd);
  const outputUsd = money((usage.outputTokens / 1_000_000) * pricing.outputPerMillionUsd);
  const cacheReadUsd = money((usage.cacheReadTokens / 1_000_000) * pricing.cacheReadPerMillionUsd);
  const cacheWriteUsd = money((usage.cacheWriteTokens / 1_000_000) * pricing.cacheWritePerMillionUsd);
  const cacheUsd = money(cacheReadUsd + cacheWriteUsd);
  return {
    inputUsd,
    outputUsd,
    cacheReadUsd,
    cacheWriteUsd,
    cacheUsd,
    totalUsd: money(inputUsd + outputUsd + cacheUsd),
    pricingVersion: pricing.pricingVersion,
  };
}
