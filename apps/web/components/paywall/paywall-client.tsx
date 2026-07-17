"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ApiError, getJson, postJson } from "../../lib/client/api";
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
  method?: "coupon" | "stripe";
}

export function PaywallClient() {
  const router = useRouter();
  const [coupon, setCoupon] = useState("");
  const [couponStatus, setCouponStatus] = useState<Status>("idle");
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    const checkoutState = new URLSearchParams(window.location.search).get("checkout");
    if (checkoutState === "cancelled") {
      setError("Checkout was cancelled. No charge was made.");
    }

    async function checkAccess() {
      const attempts = checkoutState === "success" ? 6 : 1;
      for (let attempt = 0; attempt < attempts && active; attempt += 1) {
        try {
          const status = await getJson<BillingStatus>("/api/billing/status");
          if (status.active && status.credits > 0) {
            setCouponStatus("success");
            return;
          }
        } catch {
          break;
        }
        if (attempt < attempts - 1) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, 1100));
        }
      }
      if (active && checkoutState === "success") {
        setError("Payment is confirmed by Stripe and credits are still syncing. Refresh in a moment.");
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
      const response = await postJson<{ url?: string; error?: string }>(
        "/api/billing/checkout",
        {},
      );
      if (!response.url) throw new Error(response.error || "Checkout is not available yet.");
      window.location.assign(response.url);
    } catch (caught) {
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
            MicroManus meters only what your research uses. Start with five dollars in credit,
            then inspect every model call down to cached tokens.
          </p>

          <div className="credit-ticket">
            <div className="credit-ticket__cut credit-ticket__cut--left" />
            <div className="credit-ticket__cut credit-ticket__cut--right" />
            <div className="credit-ticket__head">
              <span>RESEARCH CREDIT</span>
              <SparkIcon size={20} />
            </div>
            <strong><sup>$</sup>5.00</strong>
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
              <div><strong>Pay $5 securely</strong><small>Card, wallet, or Link via Stripe</small></div>
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
            <p className="secure-note"><ShieldIcon size={14} /> Card details are entered on Stripe, never on MicroManus.</p>
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
