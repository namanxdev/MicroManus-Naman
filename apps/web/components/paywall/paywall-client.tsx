"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { getJson, postJson } from "../../lib/client/api";
import { Brand } from "../ui/brand";
import {
  ArrowUpRightIcon,
  CheckIcon,
  CreditIcon,
  KeyIcon,
  ShieldIcon,
  SparkIcon,
} from "../ui/icons";

type Status = "idle" | "checking" | "submitting" | "success";

interface BillingStatus {
  active: boolean;
  credits: number;
  method?: "coupon" | "stripe" | "razorpay";
}

interface CheckoutOrder {
  keyId: string;
  orderId: string;
  amount: number;
  currency: string;
  displayAmount: string;
  description: string;
  prefill?: { email?: string; name?: string };
}

interface RazorpaySuccess {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface RazorpayFailure {
  error?: { description?: string };
}

interface RazorpayCheckout {
  open(): void;
  on(event: "payment.failed", handler: (response: RazorpayFailure) => void): void;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayCheckout;
  }
}

let checkoutScriptPromise: Promise<void> | null = null;

function loadRazorpayCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (checkoutScriptPromise) return checkoutScriptPromise;

  const pending = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-micromanus-razorpay]");
    const script = existing || document.createElement("script");
    const handleLoad = () => {
      if (window.Razorpay) {
        resolve();
      } else {
        script.remove();
        reject(new Error("Razorpay Checkout did not initialize."));
      }
    };
    const handleError = () => {
      script.remove();
      reject(new Error("Could not load Razorpay Checkout."));
    };
    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });
    if (!existing) {
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.dataset.micromanusRazorpay = "true";
      document.head.appendChild(script);
    }
  });
  const tracked = pending.catch((caught) => {
    checkoutScriptPromise = null;
    throw caught;
  });
  checkoutScriptPromise = tracked;
  return tracked;
}

export function PaywallClient({
  paymentCurrency,
  paymentDisplayAmount,
}: {
  paymentCurrency: string;
  paymentDisplayAmount: string;
}) {
  const router = useRouter();
  const [coupon, setCoupon] = useState("");
  const [couponStatus, setCouponStatus] = useState<Status>("idle");
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const checkoutRequestId = useRef<string | null>(null);

  function getCheckoutRequestId() {
    if (checkoutRequestId.current) return checkoutRequestId.current;
    const stored = window.sessionStorage.getItem("micromanus:checkout-request");
    const value = stored && /^[a-zA-Z0-9:_-]{8,128}$/.test(stored)
      ? stored
      : crypto.randomUUID();
    checkoutRequestId.current = value;
    window.sessionStorage.setItem("micromanus:checkout-request", value);
    return value;
  }

  function clearCheckoutRequestId() {
    checkoutRequestId.current = null;
    window.sessionStorage.removeItem("micromanus:checkout-request");
  }

  useEffect(() => {
    let active = true;

    async function checkAccess() {
      try {
        const status = await getJson<BillingStatus>("/api/billing/status");
        if (status.active && status.credits > 0) {
          setCouponStatus("success");
        }
      } catch {
        // The paywall remains usable if a status check is temporarily unavailable.
      }
    }

    checkAccess().finally(() => active && setReady(true));
    return () => {
      active = false;
    };
  }, []);

  function continueToWorkspace() {
    router.push("/chat");
  }

  async function redeemCoupon(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!coupon.trim()) {
      setError("Enter a coupon code to continue.");
      return;
    }
    setCouponStatus("submitting");

    try {
      const response = await postJson<{
        ok: boolean;
        granted?: boolean;
        alreadyRedeemed?: boolean;
        credits?: number;
        error?: string;
      }>(
        "/api/billing/redeem",
        { code: coupon.trim() },
      );
      if (!response.ok) throw new Error(response.error || "That coupon could not be applied.");
      if (!response.granted && Number(response.credits || 0) <= 0) {
        throw new Error(response.alreadyRedeemed
          ? "This coupon was already redeemed. Use card payment to add more credit."
          : "That coupon did not add credit.");
      }
      setCouponStatus("success");
    } catch (caught) {
      setCouponStatus("idle");
      setError(caught instanceof Error ? caught.message : "That coupon could not be applied.");
    }
  }

  async function beginCheckout() {
    setError("");
    setCheckoutLoading(true);
    try {
      const idempotencyKey = getCheckoutRequestId();
      const [order] = await Promise.all([
        postJson<CheckoutOrder>("/api/billing/checkout", { idempotencyKey }),
        loadRazorpayCheckout(),
      ]);
      const Razorpay = window.Razorpay;
      if (!Razorpay) throw new Error("Razorpay Checkout is unavailable.");

      const checkout = new Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amount,
        currency: order.currency,
        name: "MicroManus",
        description: order.description,
        prefill: order.prefill,
        theme: { color: "#e85d31", backdrop_color: "#161512" },
        modal: {
          confirm_close: true,
          ondismiss: () => setCheckoutLoading(false),
        },
        handler: async (payment: RazorpaySuccess) => {
          try {
            await postJson("/api/billing/verify", payment);
            clearCheckoutRequestId();
            setCouponStatus("success");
          } catch (caught) {
            for (let attempt = 0; attempt < 6; attempt += 1) {
              try {
                const status = await getJson<BillingStatus>("/api/billing/status");
                if (status.active && status.credits > 0) {
                  setCouponStatus("success");
                  return;
                }
              } catch {
                // Retry while the signed webhook finishes processing.
              }
              await new Promise<void>((resolve) => window.setTimeout(resolve, 1100));
            }
            setError(caught instanceof Error
              ? caught.message
              : "Payment completed, but credit verification is still pending.");
          } finally {
            setCheckoutLoading(false);
          }
        },
      });
      checkout.on("payment.failed", (response) => {
        setError(response.error?.description || "Payment failed. No credits were added.");
        setCheckoutLoading(false);
      });
      checkout.open();
    } catch (caught) {
      clearCheckoutRequestId();
      setError(caught instanceof Error ? caught.message : "Could not open secure checkout.");
      setCheckoutLoading(false);
    }
  }

  if (!ready) {
    return (
      <main className="paywall-page">
        <div aria-hidden="true" className="paper-noise" />
        <nav className="paywall-nav"><Brand /></nav>
        <div className="paywall-loading" aria-label="Checking access">
          <span />
          <span />
          <span />
        </div>
      </main>
    );
  }

  if (couponStatus === "success") {
    return (
      <main className="paywall-page paywall-page--success">
        <div aria-hidden="true" className="paper-noise" />
        <nav className="paywall-nav"><Brand /></nav>
        <section className="access-success" aria-live="polite">
          <div className="access-success__mark"><CheckIcon size={34} /></div>
          <span className="section-code">ACCESS / APPROVED</span>
          <h1>Your workspace is funded.</h1>
          <p>Your available credits are ready for searches, model calls, and report generation.</p>
          <button className="primary-button" onClick={continueToWorkspace} type="button">
            Open MicroManus <ArrowUpRightIcon size={18} />
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="paywall-page">
      <div aria-hidden="true" className="paper-noise" />
      <nav className="paywall-nav">
        <Brand />
        <span>Workspace activation</span>
      </nav>

      <section className="paywall-layout">
        <div className="paywall-story">
          <span className="section-code">ONE-TIME ENTRY</span>
          <h1>Fund the first five investigations.</h1>
          <p className="paywall-lede">
            MicroManus meters only what your research uses. Start with five research credits,
            then inspect every model call down to cached tokens.
          </p>

          <div className="credit-ticket">
            <div className="credit-ticket__cut credit-ticket__cut--left" />
            <div className="credit-ticket__cut credit-ticket__cut--right" />
            <div className="credit-ticket__head">
              <span>RESEARCH CREDIT</span>
              <SparkIcon size={20} />
            </div>
            <strong>{paymentDisplayAmount}</strong>
            <div className="credit-ticket__meta">
              <span>5 credits</span>
              <span>No subscription</span>
              <span>Usage metered</span>
            </div>
            <div className="credit-ticket__barcode" aria-hidden="true" />
          </div>

          <ul className="paywall-benefits">
            <li><span><CreditIcon size={18} /></span><div><strong>Costs stay legible</strong><p>Input, output, and cache costs are separated by chat.</p></div></li>
            <li><span><KeyIcon size={18} /></span><div><strong>Your provider key</strong><p>Keys are encrypted server-side and never bundled into the client.</p></div></li>
            <li><span><ShieldIcon size={18} /></span><div><strong>No recurring charge</strong><p>Add credit only when you choose to continue researching.</p></div></li>
          </ul>
        </div>

        <div className="activation-panel">
          <div className="activation-panel__heading">
            <span>ACTIVATION / 01</span>
            <h2>Choose a way in</h2>
            <p>Both options add the same five credits.</p>
          </div>

          {error && <div className="form-error" role="alert">{error}</div>}

          <div className="checkout-option">
            <div className="checkout-option__title">
              <span className="option-index">A</span>
              <div>
                <strong>Pay {paymentDisplayAmount} securely</strong>
                <small>
                  {paymentCurrency === "INR"
                    ? "Card, UPI, or wallet via Razorpay"
                    : "Available payment methods via Razorpay"}
                </small>
              </div>
              <span className="recommended-label">STANDARD</span>
            </div>
            <div className="mini-card" aria-hidden="true">
              <span className="mini-card__chip" />
              <span>•••• •••• •••• 2048</span>
              <small>SECURE CHECKOUT</small>
            </div>
            <button
              className="primary-button primary-button--wide"
              disabled={checkoutLoading}
              onClick={beginCheckout}
              type="button"
            >
              {checkoutLoading ? "Opening checkout…" : "Continue to card payment"}
              {!checkoutLoading && <ArrowUpRightIcon size={17} />}
            </button>
            <p className="secure-note"><ShieldIcon size={14} /> Payment details are entered on Razorpay, never on MicroManus.</p>
            <p className="checkout-legal">
              By paying, you agree to the <Link href="/terms">Terms</Link> and <Link href="/refund-policy">Refund Policy</Link>.
            </p>
          </div>

          <div className="option-divider"><span>OR USE A CODE</span></div>

          <form className="coupon-option" onSubmit={redeemCoupon}>
            <label htmlFor="coupon-code">Coupon code</label>
            <div className="coupon-input-row">
              <input
                autoCapitalize="characters"
                autoComplete="off"
                id="coupon-code"
                onChange={(event) => setCoupon(event.target.value.toUpperCase())}
                placeholder="ENTER CODE"
                spellCheck={false}
                value={coupon}
              />
              <button disabled={couponStatus === "submitting"} type="submit">
                {couponStatus === "submitting" ? "Checking…" : "Apply"}
              </button>
            </div>
            <small>Codes are case-insensitive and can be redeemed once per account.</small>
          </form>
        </div>
      </section>
    </main>
  );
}
