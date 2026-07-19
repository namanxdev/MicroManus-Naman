import type { Metadata } from "next";
import { Suspense } from "react";

import { SignInClient } from "@/components/auth/sign-in-client";
import { Brand } from "@/components/ui/brand";
import { CheckIcon } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <main className="sign-in-page">
      <div aria-hidden="true" className="paper-noise" />
      <nav className="paywall-nav"><Brand /><span>Secure account access</span></nav>
      <section className="sign-in-layout">
        <div className="sign-in-note">
          <span>MICRO / ACCESS PASS</span>
          <h2>One account.<br />A visible trail of work.</h2>
          <p>Sign in to purchase credits, add your own model key, and keep research threads connected.</p>
          <ul>
            <li><CheckIcon size={15} /> Provider keys encrypted server-side</li>
            <li><CheckIcon size={15} /> Payment details handled by Razorpay</li>
            <li><CheckIcon size={15} /> No automatic subscription renewal</li>
          </ul>
        </div>
        <Suspense fallback={<div className="sign-in-panel sign-in-panel--loading" aria-label="Loading sign in" />}>
          <SignInClient />
        </Suspense>
      </section>
    </main>
  );
}
