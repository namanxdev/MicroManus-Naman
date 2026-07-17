import "server-only";

import Stripe from "stripe";

import { requiredEnv } from "./env";

let stripeClient: Stripe | undefined;

export function getStripe(): Stripe {
  if (!stripeClient) stripeClient = new Stripe(requiredEnv("STRIPE_SECRET_KEY"));
  return stripeClient;
}

export function stripeWebhookSecret(): string {
  return requiredEnv("STRIPE_WEBHOOK_SECRET");
}
