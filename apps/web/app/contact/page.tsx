import type { Metadata } from "next";

import { PolicyLayout } from "@/components/legal/policy-layout";
import { siteDetails } from "@/lib/public/site";

export const metadata: Metadata = { title: "Contact us" };

export default function ContactPage() {
  const email = siteDetails.supportEmail;
  return (
    <PolicyLayout
      code="SUPPORT / CONTACT"
      title="Contact us"
      summary="Questions about access, payments, refunds, privacy, or a research run can be sent through the channels below."
      sections={[
        {
          title: "Customer support",
          content: (
            <>
              {email ? <p>Email us at <a href={`mailto:${email}`}>{email}</a>.</p> : null}
              <p>Open a support request at <a href={siteDetails.supportUrl} rel="noreferrer" target="_blank">{siteDetails.supportUrl}</a>. Do not include passwords, API keys, card numbers, UPI PINs, or OTPs in a request.</p>
            </>
          ),
        },
        {
          title: "What to include",
          content: <p>For account help, include the email used to sign in. For a payment or refund question, also include the Razorpay payment ID and purchase date. For technical issues, include the page, approximate time, and the error message without any secret credentials.</p>,
        },
        {
          title: "Response time",
          content: <p>We aim to acknowledge complete support requests within 2 business days. Refund reviews follow the timing stated in the Cancellation and Refund Policy.</p>,
        },
        {
          title: "Operator",
          content: <p>{siteDetails.name} is operated from {siteDetails.operatingCountry}. The legal merchant name for a payment is displayed by Razorpay during checkout and on the payment receipt.</p>,
        },
      ]}
    />
  );
}
