import { apiJson, handleApiError } from "@/lib/server/api-error";
import { requireUser } from "@/lib/server/auth";
import { appUrl } from "@/lib/server/env";
import { getStripe } from "@/lib/server/stripe";
import { createAdminClient } from "@/lib/server/supabase";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (!user.email) throw new Error("Authenticated account does not have an email address");

    const { data: profile, error: profileError } = await createAdminClient()
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) throw new Error(`Unable to load billing profile: ${profileError.message}`);

    const origin = appUrl(new URL(request.url).origin);
    const customer = profile?.stripe_customer_id
      ? { customer: profile.stripe_customer_id }
      : { customer_email: user.email, customer_creation: "always" as const };
    const suppliedIdempotencyKey = request.headers.get("idempotency-key");
    const safeKey = suppliedIdempotencyKey && /^[a-zA-Z0-9:_-]{8,128}$/.test(suppliedIdempotencyKey)
      ? `${user.id}:${suppliedIdempotencyKey}`
      : `${user.id}:${crypto.randomUUID()}`;

    const session = await getStripe().checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: ["card"],
        success_url: `${origin}/subscribe?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/subscribe?checkout=cancelled`,
        client_reference_id: user.id,
        ...customer,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: 500,
              product_data: {
                name: "MicroManus research credits",
                description: "5 usage credits (1 credit = $1 of model usage)",
              },
            },
          },
        ],
        metadata: { product: "micromanus_credits", user_id: user.id, credits: "5" },
        payment_intent_data: {
          metadata: { product: "micromanus_credits", user_id: user.id, credits: "5" },
        },
      },
      { idempotencyKey: safeKey },
    );
    if (!session.url) throw new Error("Stripe Checkout did not return a URL");
    return apiJson({ url: session.url, sessionId: session.id }, 201);
  } catch (error) {
    return handleApiError(error, request);
  }
}
