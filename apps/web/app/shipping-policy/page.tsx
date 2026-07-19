import type { Metadata } from "next";

import { PolicyLayout } from "@/components/legal/policy-layout";
import { siteDetails } from "@/lib/public/site";

export const metadata: Metadata = { title: "Shipping and delivery policy" };

export default function ShippingPolicyPage() {
  return (
    <PolicyLayout
      code={`DELIVERY / UPDATED ${siteDetails.lastUpdated.toUpperCase()}`}
      title="Shipping and delivery policy"
      summary="MicroManus is a digital service. No physical product is shipped."
      sections={[
        {
          title: "Digital delivery",
          content: <p>After Razorpay confirms a successful payment, five research credits are added electronically to the signed-in MicroManus account used for checkout. Delivery normally occurs immediately on the confirmation screen.</p>,
        },
        {
          title: "No physical shipping",
          content: <p>There are no shipping charges, courier services, tracking numbers, or physical delivery locations because the product consists solely of account-based digital credits and generated digital reports.</p>,
        },
        {
          title: "Delayed delivery",
          content: <p>If payment succeeds but credits are not visible, refresh the billing page once and then contact support with your account email and Razorpay payment ID. Do not submit a second payment while the first transaction is being checked.</p>,
        },
        {
          title: "Generated reports",
          content: <p>Reports created by completed research runs are delivered inside the authenticated workspace as downloadable digital files. Availability can depend on the retention and storage limits described in the product.</p>,
        },
      ]}
    />
  );
}
