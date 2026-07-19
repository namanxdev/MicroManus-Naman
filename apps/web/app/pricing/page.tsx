import type { Metadata } from "next";
import Link from "next/link";

import { Brand } from "@/components/ui/brand";
import { ArrowUpRightIcon, CheckIcon, ShieldIcon } from "@/components/ui/icons";
import { razorpayPrice } from "@/lib/server/razorpay";

export const metadata: Metadata = { title: "Pricing" };

export default function PricingPage() {
  let displayAmount = "$5.00";
  let currency = "USD";
  try {
    const price = razorpayPrice();
    displayAmount = price.displayAmount;
    currency = price.currency;
  } catch {
    // Keep the public assignment price visible before payment credentials are configured.
  }

  return (
    <main className="pricing-page">
      <div aria-hidden="true" className="paper-noise" />
      <nav className="policy-nav">
        <Brand />
        <Link href="/sign-in?next=/subscribe">Sign in</Link>
      </nav>

      <section className="pricing-hero">
        <div>
          <span className="section-code">PRICING / ONE-TIME CREDIT PACK</span>
          <h1>Pay for the work,<br />not another subscription.</h1>
          <p>One payment funds five research runs. MicroManus does not automatically renew or make a recurring charge.</p>
        </div>

        <article className="public-price-card">
          <div className="public-price-card__head">
            <span>RESEARCH / 05</span>
            <ShieldIcon size={18} />
          </div>
          <strong>{displayAmount}</strong>
          <small>{currency} · one-time payment</small>
          <ul>
            <li><CheckIcon size={15} /> Five MicroManus research credits</li>
            <li><CheckIcon size={15} /> No subscription or automatic renewal</li>
            <li><CheckIcon size={15} /> Cited answers and PDF report artifacts</li>
            <li><CheckIcon size={15} /> Per-run token and model-cost visibility</li>
          </ul>
          <Link className="primary-button primary-button--wide" href="/sign-in?next=/subscribe">
            Sign in to purchase <ArrowUpRightIcon size={17} />
          </Link>
          <p>Secure checkout is handled by Razorpay. Available payment methods depend on your location and the configured currency.</p>
        </article>
      </section>

      <section className="pricing-details">
        <article>
          <span>01</span>
          <h2>Bring your own model key</h2>
          <p>The credit purchase covers MicroManus research orchestration. Any charges made by OpenAI, Anthropic, Kimi, or another selected model provider are billed separately by that provider.</p>
        </article>
        <article>
          <span>02</span>
          <h2>Digital delivery</h2>
          <p>Credits are added to your signed-in account after successful payment verification. Nothing physical is shipped.</p>
        </article>
        <article>
          <span>03</span>
          <h2>Refund conditions</h2>
          <p>Unused packs may be eligible for a refund within seven days. Read the complete policy before purchasing.</p>
          <Link href="/refund-policy">Read refund policy →</Link>
        </article>
      </section>

      <footer className="policy-footer">
        <span>Clear price. Visible usage.</span>
        <div>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/refund-policy">Refunds</Link>
          <Link href="/shipping-policy">Shipping</Link>
          <Link href="/contact">Contact</Link>
        </div>
      </footer>
    </main>
  );
}
