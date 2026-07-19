import type { Metadata } from "next";

import { PolicyLayout } from "@/components/legal/policy-layout";
import { siteDetails } from "@/lib/public/site";

export const metadata: Metadata = { title: "Terms and conditions" };

export default function TermsPage() {
  return (
    <PolicyLayout
      code={`TERMS / UPDATED ${siteDetails.lastUpdated.toUpperCase()}`}
      title="Terms and conditions"
      summary="These terms govern access to MicroManus, its research tools, and purchases of research credits."
      sections={[
        {
          title: "The service",
          content: <p>MicroManus is a software research assistant that plans searches, reads sources, generates responses, and may create downloadable reports. It is provided by the merchant identified in your Razorpay checkout and payment receipt. The service is not a substitute for professional legal, medical, financial, or other regulated advice.</p>,
        },
        {
          title: "Accounts and acceptable use",
          content: <p>You must provide accurate account information, keep your credentials secure, and use only provider keys you are authorised to use. You may not misuse the service, attempt unauthorised access, evade usage limits, interfere with other users, or use it for unlawful or harmful activity.</p>,
        },
        {
          title: "Credits and provider costs",
          content: <p>A purchase adds the number of research credits shown on the Pricing and checkout pages. It is a one-time purchase, not a recurring subscription. You separately supply any model-provider key, and fees charged directly by that provider are outside the MicroManus credit purchase.</p>,
        },
        {
          title: "Research output",
          content: <p>Automated output can be incomplete or incorrect. You are responsible for reviewing cited sources and verifying consequential claims before acting. You retain responsibility for the prompts, materials, and provider credentials you submit and must have the right to use them.</p>,
        },
        {
          title: "Availability and changes",
          content: <p>We may maintain, secure, change, or discontinue parts of the service. Third-party model, search, hosting, and payment services may affect availability. We will not materially change an already-completed purchase without providing the credits or an appropriate remedy.</p>,
        },
        {
          title: "Refunds and governing terms",
          content: <p>Cancellation and refund eligibility is described in the <a href="/refund-policy">Cancellation and Refund Policy</a>. These terms are governed by the laws applicable to the operator in {siteDetails.operatingCountry}, while preserving any mandatory consumer rights that apply to you.</p>,
        },
      ]}
    />
  );
}
