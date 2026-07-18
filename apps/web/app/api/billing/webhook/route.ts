import { createHash } from "node:crypto";

import { apiJson, ApiError, handleApiError } from "@/lib/server/api-error";
import {
  isRazorpayOrderId,
  isRazorpayPaymentId,
  verifyRazorpayWebhookSignature,
} from "@/lib/server/razorpay";
import { createAdminClient } from "@/lib/server/supabase";

export const runtime = "nodejs";

interface RazorpayWebhookPayment {
  id?: unknown;
  order_id?: unknown;
  amount?: unknown;
  currency?: unknown;
  status?: unknown;
  captured?: unknown;
  notes?: unknown;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

async function readLimitedBody(request: Request, maximumBytes: number): Promise<Buffer> {
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Webhook payload is too large");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") || "0");
    if (Number.isFinite(contentLength) && contentLength > 512 * 1024) {
      return apiJson({ received: false, error: "Webhook payload is too large" }, 413);
    }

    const signature = request.headers.get("x-razorpay-signature");
    const eventId = request.headers.get("x-razorpay-event-id")?.trim();
    if (!signature || !eventId) {
      return apiJson({ received: false, error: "Missing Razorpay webhook headers" }, 400);
    }

    const rawBody = await readLimitedBody(request, 512 * 1024);
    if (!verifyRazorpayWebhookSignature(rawBody, signature)) {
      return apiJson({ received: false, error: "Invalid Razorpay signature" }, 400);
    }

    const rawText = rawBody.toString("utf8");
    let parsed: Record<string, unknown>;
    try {
      const value = JSON.parse(rawText) as unknown;
      const object = record(value);
      if (!object) throw new Error("not an object");
      parsed = object;
    } catch {
      return apiJson({ received: false, error: "Invalid Razorpay webhook JSON" }, 400);
    }

    const eventType = typeof parsed.event === "string" ? parsed.event : "";
    if (eventType !== "order.paid" && eventType !== "payment.captured") {
      return apiJson({ received: true, ignored: true });
    }

    const payload = record(parsed.payload);
    const paymentWrapper = record(payload?.payment);
    const payment = record(paymentWrapper?.entity) as RazorpayWebhookPayment | null;
    if (!payment) return apiJson({ received: false, error: "Missing payment entity" }, 400);

    const paymentId = typeof payment.id === "string" ? payment.id : "";
    const orderId = typeof payment.order_id === "string" ? payment.order_id : "";
    const amount = typeof payment.amount === "number" ? payment.amount : Number.NaN;
    const currency = typeof payment.currency === "string" ? payment.currency.toLowerCase() : "";
    if (
      !isRazorpayPaymentId(paymentId)
      || !isRazorpayOrderId(orderId)
      || !Number.isSafeInteger(amount)
      || payment.status !== "captured"
      || payment.captured !== true
    ) {
      return apiJson({ received: false, error: "Invalid captured payment entity" }, 400);
    }

    const orderWrapper = record(payload?.order);
    const providerOrder = record(orderWrapper?.entity);
    if (eventType === "order.paid" && !providerOrder) {
      return apiJson({ received: false, error: "Missing paid order entity" }, 400);
    }
    if (providerOrder) {
      const providerOrderId = typeof providerOrder.id === "string" ? providerOrder.id : "";
      const providerOrderStatus = typeof providerOrder.status === "string" ? providerOrder.status : "";
      const providerOrderAmount = typeof providerOrder.amount === "number"
        ? providerOrder.amount
        : Number.NaN;
      const providerAmountPaid = typeof providerOrder.amount_paid === "number"
        ? providerOrder.amount_paid
        : Number.NaN;
      const providerCurrency = typeof providerOrder.currency === "string"
        ? providerOrder.currency.toLowerCase()
        : "";
      if (
        providerOrderId !== orderId
        || (eventType === "order.paid" && (
          providerOrderStatus !== "paid"
          || providerOrderAmount !== amount
          || providerAmountPaid !== amount
          || providerCurrency !== currency
        ))
      ) {
        return apiJson({ received: false, error: "Razorpay order entity mismatch" }, 400);
      }
    }

    const admin = createAdminClient();
    const { data: storedOrder, error: orderError } = await admin
      .from("payment_orders")
      .select("amount_subunits,currency")
      .eq("provider", "razorpay")
      .eq("provider_order_id", orderId)
      .maybeSingle();
    if (orderError) throw new Error(`Unable to load webhook order: ${orderError.message}`);
    if (!storedOrder) {
      const orderNotes = record(providerOrder?.notes);
      const paymentNotes = record(payment.notes);
      const product = orderNotes?.product || paymentNotes?.product;
      if (product === "micromanus_credits") {
        throw new Error("MicroManus Razorpay order is missing its local mapping");
      }
      return apiJson({ received: true, ignored: true });
    }
    if (storedOrder.amount_subunits !== amount || storedOrder.currency !== currency) {
      return apiJson({ received: false, error: "Razorpay payment amount mismatch" }, 400);
    }

    const payloadSha256 = createHash("sha256").update(rawBody).digest("hex");
    const { error: grantError } = await admin.rpc("grant_razorpay_order_credits", {
      p_event_id: eventId,
      p_event_type: eventType,
      p_order_id: orderId,
      p_payment_id: paymentId,
      p_amount_subunits: amount,
      p_currency: currency,
      p_payload_sha256: payloadSha256,
    });
    if (grantError) throw new Error(`Unable to grant Razorpay credits: ${grantError.message}`);

    return apiJson({ received: true });
  } catch (error) {
    return handleApiError(error, request);
  }
}
