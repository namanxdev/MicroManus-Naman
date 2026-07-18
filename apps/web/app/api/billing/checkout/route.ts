import { createHash } from "node:crypto";

import {
  apiJson,
  ApiError,
  asTrimmedString,
  handleApiError,
  readJsonObject,
} from "@/lib/server/api-error";
import { requireUser } from "@/lib/server/auth";
import {
  createRazorpayOrder,
  isRazorpayOrderId,
  razorpayKeyId,
  razorpayPrice,
  type RazorpayPrice,
} from "@/lib/server/razorpay";
import { createAdminClient } from "@/lib/server/supabase";

export const runtime = "nodejs";

interface StoredOrder {
  id: string;
  provider_order_id: string | null;
  receipt: string;
  idempotency_key: string;
  amount_subunits: number;
  currency: string;
  status: "creating" | "created" | "superseded" | "paid" | "failed";
  created_at: string;
}

const ORDER_COLUMNS = [
  "id",
  "provider_order_id",
  "receipt",
  "idempotency_key",
  "amount_subunits",
  "currency",
  "status",
  "created_at",
].join(",");

const INTENT_LEASE_MS = 2 * 60 * 1000;

function creatingIntentExpired(order: StoredOrder): boolean {
  return order.status === "creating"
    && Date.parse(order.created_at) <= Date.now() - INTENT_LEASE_MS;
}

function orderMatchesPrice(order: StoredOrder, price: RazorpayPrice): boolean {
  return order.amount_subunits === price.amount
    && order.currency === price.currency.toLowerCase();
}

async function expireCreatingIntent(order: StoredOrder): Promise<void> {
  if (!creatingIntentExpired(order)) return;
  const cutoff = new Date(Date.now() - INTENT_LEASE_MS).toISOString();
  const { error } = await createAdminClient()
    .from("payment_orders")
    .update({ status: "failed", updated_at: new Date().toISOString() })
    .eq("id", order.id)
    .eq("status", "creating")
    .lte("created_at", cutoff);
  if (error) throw new Error(`Unable to release expired checkout intent: ${error.message}`);
}

async function supersedeCreatedOrder(order: StoredOrder): Promise<void> {
  const { error } = await createAdminClient()
    .from("payment_orders")
    .update({ status: "superseded", updated_at: new Date().toISOString() })
    .eq("id", order.id)
    .eq("status", "created");
  if (error) throw new Error(`Unable to supersede stale checkout order: ${error.message}`);
}

function checkoutResponse(
  order: StoredOrder,
  price: RazorpayPrice,
  user: Awaited<ReturnType<typeof requireUser>>,
) {
  if (
    order.status !== "created"
    || !order.provider_order_id
    || !isRazorpayOrderId(order.provider_order_id)
  ) {
    throw new ApiError(409, "CHECKOUT_NOT_READY", "Checkout is still being prepared. Try again.");
  }
  if (!orderMatchesPrice(order, price)) {
    throw new ApiError(
      409,
      "STALE_CHECKOUT",
      "The configured checkout price changed. Resolve the existing order before starting again.",
    );
  }
  const metadata = user.user_metadata || {};
  const name = metadata.full_name || metadata.name || metadata.user_name;
  return {
    keyId: razorpayKeyId(),
    orderId: order.provider_order_id,
    amount: order.amount_subunits,
    currency: price.currency,
    displayAmount: price.displayAmount,
    description: "5 MicroManus research credits",
    prefill: {
      email: user.email || undefined,
      name: typeof name === "string" ? name : undefined,
    },
  };
}

async function findOrderByIdempotencyKey(userId: string, idempotencyKey: string) {
  const { data, error } = await createAdminClient()
    .from("payment_orders")
    .select(ORDER_COLUMNS)
    .eq("user_id", userId)
    .eq("provider", "razorpay")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (error) throw new Error(`Unable to load checkout order: ${error.message}`);
  return data as StoredOrder | null;
}

async function findOpenOrder(userId: string) {
  const { data, error } = await createAdminClient()
    .from("payment_orders")
    .select(ORDER_COLUMNS)
    .eq("user_id", userId)
    .eq("provider", "razorpay")
    .in("status", ["creating", "created"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Unable to load open checkout order: ${error.message}`);
  return data as StoredOrder | null;
}

async function waitForClaimedOrder(userId: string, idempotencyKey: string) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const order = await findOrderByIdempotencyKey(userId, idempotencyKey)
      || await findOpenOrder(userId);
    if (order && creatingIntentExpired(order)) {
      await expireCreatingIntent(order);
      throw new ApiError(409, "CHECKOUT_EXPIRED", "Start a new checkout request");
    }
    if (order?.status === "created" && order.provider_order_id) return order;
    if (order?.status === "failed" || order?.status === "paid") return order;
    await new Promise<void>((resolve) => setTimeout(resolve, 250));
  }
  throw new ApiError(
    409,
    "CHECKOUT_INITIALIZING",
    "Another checkout request is being prepared. Try again in a moment.",
  );
}

async function attachProviderOrder(intentId: string, providerOrderId: string) {
  let lastError = "unknown database error";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await createAdminClient()
      .from("payment_orders")
      .update({
        provider_order_id: providerOrderId,
        status: "created",
        updated_at: new Date().toISOString(),
      })
      .eq("id", intentId)
      .in("status", ["creating", "created"])
      .select(ORDER_COLUMNS)
      .maybeSingle();
    if (!error && data) return data as unknown as StoredOrder;
    lastError = error?.message || "order intent was not found";
    if (attempt < 2) await new Promise<void>((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Unable to attach Razorpay order: ${lastError}`);
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await readJsonObject(request, 8 * 1024);
    const idempotencyKey = asTrimmedString(body.idempotencyKey, "idempotencyKey", {
      min: 8,
      max: 128,
    });
    if (!idempotencyKey || !/^[a-zA-Z0-9:_-]+$/.test(idempotencyKey)) {
      throw new ApiError(400, "INVALID_IDEMPOTENCY_KEY", "Checkout request ID is invalid");
    }

    const price = razorpayPrice();
    const existing = await findOrderByIdempotencyKey(user.id, idempotencyKey);
    if (existing?.status === "paid") {
      throw new ApiError(409, "CHECKOUT_ALREADY_PAID", "This checkout was already completed");
    }
    if (existing?.status === "failed" || existing?.status === "superseded") {
      throw new ApiError(409, "CHECKOUT_FAILED", "Start a new checkout request");
    }
    if (existing?.status === "creating") {
      if (creatingIntentExpired(existing)) {
        await expireCreatingIntent(existing);
        throw new ApiError(409, "CHECKOUT_EXPIRED", "Start a new checkout request");
      }
      return apiJson(checkoutResponse(
        await waitForClaimedOrder(user.id, idempotencyKey),
        price,
        user,
      ));
    }
    if (existing && !orderMatchesPrice(existing, price)) {
      await supersedeCreatedOrder(existing);
      throw new ApiError(409, "STALE_CHECKOUT", "The price changed. Start a new checkout request");
    }
    if (existing) return apiJson(checkoutResponse(existing, price, user));

    const openOrder = await findOpenOrder(user.id);
    if (openOrder?.status === "creating") {
      if (creatingIntentExpired(openOrder)) {
        await expireCreatingIntent(openOrder);
      } else {
        return apiJson(checkoutResponse(
          await waitForClaimedOrder(user.id, openOrder.idempotency_key),
          price,
          user,
        ));
      }
    } else if (openOrder) {
      if (orderMatchesPrice(openOrder, price)) {
        return apiJson(checkoutResponse(openOrder, price, user));
      }
      await supersedeCreatedOrder(openOrder);
    }

    const receipt = `mm_${createHash("sha256")
      .update(`${user.id}:${idempotencyKey}`, "utf8")
      .digest("hex")
      .slice(0, 32)}`;
    const intentId = crypto.randomUUID();
    const admin = createAdminClient();
    const { data: intentData, error: intentError } = await admin
      .from("payment_orders")
      .insert({
        id: intentId,
        user_id: user.id,
        provider: "razorpay",
        provider_order_id: null,
        receipt,
        idempotency_key: idempotencyKey,
        amount_subunits: price.amount,
        currency: price.currency.toLowerCase(),
        credits_granted: 5,
        status: "creating",
      })
      .select(ORDER_COLUMNS)
      .single();
    if (intentError || !intentData) {
      if (intentError?.code === "23505") {
        const claimed = await waitForClaimedOrder(user.id, idempotencyKey);
        return apiJson(checkoutResponse(claimed, price, user));
      }
      throw new Error(`Unable to reserve checkout order: ${intentError?.message || "unknown error"}`);
    }
    const intent = intentData as unknown as StoredOrder;

    let order;
    try {
      order = await createRazorpayOrder({ userId: user.id, receipt, price });
    } catch (providerError) {
      await admin
        .from("payment_orders")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", intent.id);
      throw providerError;
    }
    if (
      order.amount !== price.amount
      || order.currency.toUpperCase() !== price.currency
      || order.receipt !== receipt
      || order.status !== "created"
    ) {
      await admin
        .from("payment_orders")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", intent.id);
      throw new ApiError(
        502,
        "INVALID_PAYMENT_PROVIDER_RESPONSE",
        "Razorpay created an order with unexpected details",
      );
    }

    const stored = await attachProviderOrder(intent.id, order.id);
    return apiJson(checkoutResponse(stored, price, user), 201);
  } catch (error) {
    return handleApiError(error, request);
  }
}
