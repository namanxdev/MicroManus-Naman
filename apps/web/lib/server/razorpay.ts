import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import RazorpayClient from "razorpay";

import { ApiError } from "./api-error";
import { requiredEnv } from "./env";

const ORDER_ID_PATTERN = /^order_[A-Za-z0-9]{8,64}$/;
const PAYMENT_ID_PATTERN = /^pay_[A-Za-z0-9]{8,64}$/;
const SIGNATURE_PATTERN = /^[a-f0-9]{64}$/i;

export interface RazorpayPrice {
  amount: number;
  currency: string;
  displayAmount: string;
  credits: 5;
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  amount_paid: number;
  currency: string;
  receipt: string;
  status: "created" | "attempted" | "paid";
}

export interface RazorpayPayment {
  id: string;
  amount: number;
  currency: string;
  order_id: string | null;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
  captured: boolean;
}

function credentials() {
  return {
    keyId: requiredEnv("RAZORPAY_KEY_ID"),
    keySecret: requiredEnv("RAZORPAY_KEY_SECRET"),
  };
}

export function razorpayKeyId(): string {
  return credentials().keyId;
}

export function razorpayPrice(): RazorpayPrice {
  const rawAmount = requiredEnv("RAZORPAY_AMOUNT_SUBUNITS");
  const amount = Number(rawAmount);
  if (!Number.isSafeInteger(amount) || amount < 100 || amount > 100_000_000) {
    throw new Error("RAZORPAY_AMOUNT_SUBUNITS must be an integer of at least 100");
  }

  const currency = requiredEnv("RAZORPAY_CURRENCY").toUpperCase();
  if (currency !== "USD" && currency !== "INR") {
    throw new Error("RAZORPAY_CURRENCY must be USD or INR");
  }

  let displayAmount: string;
  try {
    displayAmount = new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount / 100);
  } catch {
    displayAmount = `${currency} ${(amount / 100).toFixed(2)}`;
  }

  return { amount, currency, displayAmount, credits: 5 };
}

function providerError(error: unknown): string {
  if (!error || typeof error !== "object") return "Razorpay rejected the request";
  const details = (error as { error?: unknown }).error;
  if (!details || typeof details !== "object") return "Razorpay rejected the request";
  const description = (details as { description?: unknown }).description;
  return typeof description === "string" && description.trim()
    ? description.trim()
    : "Razorpay rejected the request";
}

function razorpayClient(): RazorpayClient {
  const { keyId, keySecret } = credentials();
  return new RazorpayClient({ key_id: keyId, key_secret: keySecret });
}

async function razorpayOperation<T>(operation: (client: RazorpayClient) => Promise<T>): Promise<T> {
  try {
    return await operation(razorpayClient());
  } catch (error) {
    throw new ApiError(500, "PAYMENT_PROVIDER_ERROR", providerError(error));
  }
}

function assertOrder(value: unknown): RazorpayOrder {
  const order = value as RazorpayOrder;
  if (
    !order
    || !ORDER_ID_PATTERN.test(order.id)
    || !Number.isSafeInteger(order.amount)
    || typeof order.currency !== "string"
    || typeof order.receipt !== "string"
  ) {
    throw new ApiError(502, "INVALID_PAYMENT_PROVIDER_RESPONSE", "Razorpay returned an invalid order");
  }
  return order;
}

function assertPayment(value: unknown): RazorpayPayment {
  const payment = value as RazorpayPayment;
  if (
    !payment
    || !PAYMENT_ID_PATTERN.test(payment.id)
    || !Number.isSafeInteger(payment.amount)
    || typeof payment.currency !== "string"
    || (payment.order_id !== null && !ORDER_ID_PATTERN.test(payment.order_id))
  ) {
    throw new ApiError(502, "INVALID_PAYMENT_PROVIDER_RESPONSE", "Razorpay returned an invalid payment");
  }
  return payment;
}

export async function createRazorpayOrder(input: {
  userId: string;
  receipt: string;
  price: RazorpayPrice;
}): Promise<RazorpayOrder> {
  const order = await razorpayOperation((client) => client.orders.create({
    amount: input.price.amount,
    currency: input.price.currency,
    receipt: input.receipt,
    partial_payment: false,
    notes: {
      product: "micromanus_credits",
      user_id: input.userId,
      credits: String(input.price.credits),
    },
  }));
  return assertOrder(order);
}

export async function fetchRazorpayPayment(paymentId: string): Promise<RazorpayPayment> {
  if (!PAYMENT_ID_PATTERN.test(paymentId)) {
    throw new ApiError(400, "INVALID_PAYMENT_ID", "Razorpay payment ID is invalid");
  }
  return assertPayment(await razorpayOperation((client) => client.payments.fetch(paymentId)));
}

export async function captureRazorpayPayment(
  paymentId: string,
  amount: number,
  currency: string,
): Promise<RazorpayPayment> {
  if (!PAYMENT_ID_PATTERN.test(paymentId)) {
    throw new ApiError(400, "INVALID_PAYMENT_ID", "Razorpay payment ID is invalid");
  }
  return assertPayment(await razorpayOperation(
    (client) => client.payments.capture(paymentId, amount, currency),
  ));
}

function matchesHmac(payload: string | Uint8Array, signature: string, secret: string): boolean {
  if (!SIGNATURE_PATTERN.test(signature)) return false;
  const hmac = createHmac("sha256", secret);
  const expected = (typeof payload === "string"
    ? hmac.update(payload, "utf8")
    : hmac.update(payload)).digest("hex");
  const expectedBytes = Buffer.from(expected, "hex");
  const suppliedBytes = Buffer.from(signature, "hex");
  return expectedBytes.length === suppliedBytes.length
    && timingSafeEqual(expectedBytes, suppliedBytes);
}

export function verifyRazorpayPaymentSignature(input: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  if (!ORDER_ID_PATTERN.test(input.orderId) || !PAYMENT_ID_PATTERN.test(input.paymentId)) {
    return false;
  }
  return matchesHmac(
    `${input.orderId}|${input.paymentId}`,
    input.signature,
    requiredEnv("RAZORPAY_KEY_SECRET"),
  );
}

export function verifyRazorpayWebhookSignature(
  rawBody: string | Uint8Array,
  signature: string,
): boolean {
  return matchesHmac(rawBody, signature, requiredEnv("RAZORPAY_WEBHOOK_SECRET"));
}

export function isRazorpayOrderId(value: string): boolean {
  return ORDER_ID_PATTERN.test(value);
}

export function isRazorpayPaymentId(value: string): boolean {
  return PAYMENT_ID_PATTERN.test(value);
}
