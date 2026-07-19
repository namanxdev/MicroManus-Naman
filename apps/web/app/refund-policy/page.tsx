import type { Metadata } from "next";

import { PolicyLayout } from "@/components/legal/policy-layout";
import { siteDetails } from "@/lib/public/site";

export const metadata: Metadata = { title: "Cancellation and refund policy" };

export default function RefundPolicyPage() {
  return (
    <PolicyLayout
      code={`REFUNDS / UPDATED ${siteDetails.lastUpdated.toUpperCase()}`}
      title="Cancellation and refund policy"
      summary="MicroManus sells one-time digital research credits. There is no recurring plan to cancel."
      sections={[
        {
          title: "Cancellation",
          content: <p>Credit purchases are one-time payments and do not renew automatically. You can stop using MicroManus at any time; there is no subscription cancellation step or future recurring charge.</p>,
        },
        {
          title: "Unused-credit requests",
          content: <p>You may request a refund within 7 calendar days of purchase if none of the credits from that purchase have been used. Include the account email, Razorpay payment ID, purchase date, and reason for the request. Approved refunds are returned to the original payment method.</p>,
        },
        {
          title: "Used credits",
          content: <p>Once any credit from a purchase has been consumed to run research, that purchase is generally non-refundable because compute and third-party services have already been used. This does not limit remedies required by applicable consumer law.</p>,
        },
        {
          title: "Payment or delivery problems",
          content: <p>Duplicate charges, a verified unauthorised charge, or a successful payment that never delivers credits will be investigated and corrected or refunded. Please contact us promptly and do not share card, UPI PIN, OTP, or banking passwords.</p>,
        },
        {
          title: "Processing time",
          content: <p>We aim to review a complete request within 5 business days. After approval, Razorpay and your bank or payment provider control the time required for the refund to appear.</p>,
        },
        {
          title: "Request a refund",
          content: <p>Use the support method on the <a href="/contact">Contact page</a>. Refunds are linked to the original Razorpay payment and are never issued to an unrelated account.</p>,
        },
      ]}
    />
  );
}
