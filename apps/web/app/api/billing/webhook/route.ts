import type Stripe from "stripe";

import { apiJson, handleApiError } from "@/lib/server/api-error";
import { getStripe, stripeWebhookSecret } from "@/lib/server/stripe";
import { createAdminClient } from "@/lib/server/supabase";

export const runtime = "nodejs";

function objectId(value: string | { id: string } | null): string | null {
  return typeof value === "string" ? value : value?.id || null;
}

async function creditCompletedCheckout(event: Stripe.Event, session: Stripe.Checkout.Session) {
  if (session.metadata?.product !== "micromanus_credits") return;
  if (session.mode !== "payment" || session.payment_status !== "paid") return;

  const userId = session.client_reference_id;
  if (!userId || session.metadata.user_id !== userId || session.metadata.credits !== "5") {
    throw new Error("Stripe Checkout metadata failed integrity validation");
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    throw new Error("Stripe Checkout contains an invalid user ID");
  }
  if (session.amount_total !== 500 || session.currency?.toLowerCase() !== "usd") {
    throw new Error("Stripe Checkout contains an invalid amount");
  }

  const { error } = await createAdminClient().rpc("grant_stripe_checkout_credits", {
    p_user_id: userId,
    p_event_id: event.id,
    p_event_type: event.type,
    p_checkout_session_id: session.id,
    p_payment_intent_id: objectId(session.payment_intent as string | { id: string } | null),
    p_customer_id: objectId(session.customer as string | { id: string } | null),
    p_amount_cents: session.amount_total,
    p_currency: session.currency.toLowerCase(),
  });
  if (error) throw new Error(`Unable to grant Stripe credits: ${error.message}`);
}

export async function POST(request: Request) {
  try {
    const signature = request.headers.get("stripe-signature");
    if (!signature) return apiJson({ received: false, error: "Missing Stripe signature" }, 400);

    const rawBody = await request.text();
    let event: Stripe.Event;
    try {
      event = getStripe().webhooks.constructEvent(rawBody, signature, stripeWebhookSecret());
    } catch {
      return apiJson({ received: false, error: "Invalid Stripe signature" }, 400);
    }

    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      await creditCompletedCheckout(event, event.data.object as Stripe.Checkout.Session);
    }
    return apiJson({ received: true });
  } catch (error) {
    return handleApiError(error, request);
  }
}
