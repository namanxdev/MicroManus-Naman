import {
  apiJson,
  ApiError,
  asTrimmedString,
  handleApiError,
  readJsonObject,
} from "@/lib/server/api-error";
import { requireUser } from "@/lib/server/auth";
import {
  captureRazorpayPayment,
  fetchRazorpayPayment,
  verifyRazorpayPaymentSignature,
} from "@/lib/server/razorpay";
import { createAdminClient } from "@/lib/server/supabase";

export const runtime = "nodejs";

interface StoredOrder {
  provider_order_id: string;
  amount_subunits: number;
  currency: string;
  status: "created" | "superseded" | "paid" | "failed";
  provider_payment_id: string | null;
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await readJsonObject(request, 16 * 1024);
    const orderId = asTrimmedString(body.razorpay_order_id, "razorpay_order_id", {
      min: 14,
      max: 80,
    });
    const paymentId = asTrimmedString(body.razorpay_payment_id, "razorpay_payment_id", {
      min: 12,
      max: 80,
    });
    const signature = asTrimmedString(body.razorpay_signature, "razorpay_signature", {
      min: 64,
      max: 64,
    });
    if (!orderId || !paymentId || !signature) {
      throw new ApiError(400, "INVALID_PAYMENT_RESPONSE", "Payment response is incomplete");
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("payment_orders")
      .select("provider_order_id,amount_subunits,currency,status,provider_payment_id")
      .eq("user_id", user.id)
      .eq("provider", "razorpay")
      .eq("provider_order_id", orderId)
      .maybeSingle();
    if (error) throw new Error(`Unable to load checkout order: ${error.message}`);
    if (!data) throw new ApiError(404, "PAYMENT_ORDER_NOT_FOUND", "Payment order was not found");
    const order = data as StoredOrder;

    if (!verifyRazorpayPaymentSignature({ orderId: order.provider_order_id, paymentId, signature })) {
      throw new ApiError(400, "INVALID_PAYMENT_SIGNATURE", "Payment verification failed");
    }
    if (order.status === "paid") {
      if (order.provider_payment_id !== paymentId) {
        throw new ApiError(409, "PAYMENT_ORDER_ALREADY_USED", "This order was already paid");
      }
      return apiJson({ ok: true, paid: true, granted: false, duplicate: true });
    }

    let payment = await fetchRazorpayPayment(paymentId);
    if (payment.order_id !== order.provider_order_id) {
      throw new ApiError(400, "PAYMENT_ORDER_MISMATCH", "Payment does not belong to this order");
    }
    if (
      payment.amount !== order.amount_subunits
      || payment.currency.toLowerCase() !== order.currency
    ) {
      throw new ApiError(400, "PAYMENT_AMOUNT_MISMATCH", "Payment amount or currency is incorrect");
    }

    if (payment.status === "authorized" && !payment.captured) {
      try {
        payment = await captureRazorpayPayment(
          payment.id,
          order.amount_subunits,
          order.currency.toUpperCase(),
        );
      } catch (captureError) {
        const refreshed = await fetchRazorpayPayment(payment.id);
        if (refreshed.status !== "captured" || !refreshed.captured) throw captureError;
        payment = refreshed;
      }
    }
    if (payment.status !== "captured" || !payment.captured) {
      throw new ApiError(
        409,
        "PAYMENT_NOT_CAPTURED",
        "Payment is not captured yet. No credits were added.",
      );
    }

    const { data: grant, error: grantError } = await admin.rpc("grant_razorpay_order_credits", {
      p_event_id: `verify:${payment.id}`,
      p_event_type: "checkout.verify",
      p_order_id: order.provider_order_id,
      p_payment_id: payment.id,
      p_amount_subunits: payment.amount,
      p_currency: payment.currency.toLowerCase(),
      p_payload_sha256: null,
    });
    if (grantError) throw new Error(`Unable to grant Razorpay credits: ${grantError.message}`);

    const result = grant as { granted?: boolean; duplicate?: boolean; credits?: number } | null;
    return apiJson({
      ok: true,
      paid: true,
      granted: Boolean(result?.granted),
      duplicate: Boolean(result?.duplicate),
      credits: Number(result?.credits || 0),
    });
  } catch (error) {
    return handleApiError(error, request);
  }
}
