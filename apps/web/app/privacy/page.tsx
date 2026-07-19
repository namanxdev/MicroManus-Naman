import type { Metadata } from "next";

import { PolicyLayout } from "@/components/legal/policy-layout";
import { siteDetails } from "@/lib/public/site";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <PolicyLayout
      code={`PRIVACY / UPDATED ${siteDetails.lastUpdated.toUpperCase()}`}
      title="Privacy policy"
      summary="This policy explains what MicroManus processes, why it is needed, and the choices available to you."
      sections={[
        {
          title: "Information we process",
          content: <p>We process account identifiers such as your email and profile name, research prompts and generated content, usage and credit records, encrypted model-provider credentials you choose to save, and payment references supplied by Razorpay. MicroManus does not receive or store your full card, UPI, or wallet credentials.</p>,
        },
        {
          title: "How information is used",
          content: <p>Information is used to authenticate you, provide research and report features, meter credits, secure provider keys, verify payments, prevent abuse, diagnose failures, and respond to support requests. We do not sell personal information or use saved provider keys for any purpose other than requests you initiate.</p>,
        },
        {
          title: "Service providers",
          content: <p>MicroManus relies on Supabase for authentication and application data, Vercel for the website, Google Cloud for the research service, Razorpay for payment processing, and the model or search providers used for a research request. Each provider processes only the information needed for its role and operates under its own privacy terms.</p>,
        },
        {
          title: "Security and retention",
          content: <p>Provider credentials are encrypted server-side and are not returned to the browser after saving. Access is restricted by authenticated user identity. Records are retained while your account is active and as reasonably required for security, payment reconciliation, legal compliance, and dispute handling.</p>,
        },
        {
          title: "Your choices",
          content: <p>You may stop using the service, remove saved provider credentials from Settings, or request access, correction, or deletion of account information through the Contact page. Some payment and security records may be retained where required by law or legitimate record-keeping obligations.</p>,
        },
        {
          title: "Contact",
          content: <p>Privacy questions and data requests can be submitted through the public support channel on the <a href="/contact">Contact page</a>. MicroManus operates from {siteDetails.operatingCountry}.</p>,
        },
      ]}
    />
  );
}
