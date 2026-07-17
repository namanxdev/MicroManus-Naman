import "server-only";

import { ApiError } from "./api-error";
import { calculateModelCost, getModelPricing, type UsageTokenCounts } from "./pricing";
import type { Provider } from "./providers";
import { createAdminClient } from "./supabase";

export interface BillingStatus {
  active: boolean;
  credits: number;
  method?: "coupon" | "stripe";
  lifetimeGranted: number;
  lifetimeSpent: number;
}

export async function getBillingStatus(userId: string): Promise<BillingStatus> {
  const admin = createAdminClient();
  const [walletResult, entitlementResult] = await Promise.all([
    admin.from("wallets").select("balance,lifetime_granted,lifetime_spent").eq("user_id", userId).maybeSingle(),
    admin.from("entitlements").select("source").eq("user_id", userId).maybeSingle(),
  ]);
  if (walletResult.error) throw new Error(`Unable to load wallet: ${walletResult.error.message}`);
  if (entitlementResult.error) throw new Error(`Unable to load entitlement: ${entitlementResult.error.message}`);

  const source = entitlementResult.data?.source;
  return {
    active: Boolean(source),
    credits: Number(walletResult.data?.balance || 0),
    method: source === "coupon" || source === "stripe" ? source : undefined,
    lifetimeGranted: Number(walletResult.data?.lifetime_granted || 0),
    lifetimeSpent: Number(walletResult.data?.lifetime_spent || 0),
  };
}

export async function requireResearchAccess(userId: string): Promise<BillingStatus> {
  const status = await getBillingStatus(userId);
  if (!status.active) {
    throw new ApiError(402, "PAYWALL_REQUIRED", "Unlock MicroManus to start researching");
  }
  if (status.credits <= 0) {
    throw new ApiError(402, "INSUFFICIENT_CREDITS", "Add credits to continue researching");
  }
  return status;
}

export async function redeemCoupon(userId: string, code: string) {
  const { data, error } = await createAdminClient().rpc("redeem_micromanus_coupon", {
    p_user_id: userId,
    p_coupon_code: code.trim().toUpperCase(),
  });
  if (error) {
    if (error.message.includes("invalid_coupon")) {
      throw new ApiError(400, "INVALID_COUPON", "Coupon code is invalid");
    }
    throw new Error(`Unable to redeem coupon: ${error.message}`);
  }
  return data as { granted: boolean; already_redeemed: boolean; credits: number };
}

export interface RecordUsageInput extends UsageTokenCounts {
  userId: string;
  requestId: string;
  threadId?: string;
  messageId?: string;
  provider: Provider;
  model: string;
  latencyMs?: number;
}

export async function recordUsageAndDebit(input: RecordUsageInput) {
  const pricing = await getModelPricing(input.provider, input.model);
  const cost = calculateModelCost(pricing, input);
  const { data, error } = await createAdminClient().rpc("record_usage_and_debit", {
    p_user_id: input.userId,
    p_request_id: input.requestId,
    p_thread_id: input.threadId || null,
    p_message_id: input.messageId || null,
    p_provider: input.provider,
    p_model: input.model,
    p_input_tokens: input.inputTokens,
    p_output_tokens: input.outputTokens,
    p_cache_read_tokens: input.cacheReadTokens,
    p_cache_write_tokens: input.cacheWriteTokens,
    p_input_cost_usd: cost.inputUsd,
    p_output_cost_usd: cost.outputUsd,
    p_cache_cost_usd: cost.cacheUsd,
    p_total_cost_usd: cost.totalUsd,
    p_pricing_version: cost.pricingVersion,
    p_latency_ms: input.latencyMs ?? null,
  });
  if (error) {
    if (error.message.includes("insufficient_credits")) {
      throw new ApiError(402, "INSUFFICIENT_CREDITS", "This run exceeded the available credits");
    }
    if (error.message.includes("paywall_required")) {
      throw new ApiError(402, "PAYWALL_REQUIRED", "Unlock MicroManus to record usage");
    }
    throw new Error(`Unable to record usage: ${error.message}`);
  }
  return { ledger: data, cost };
}
