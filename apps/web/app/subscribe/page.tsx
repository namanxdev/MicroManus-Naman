import type { Metadata } from "next";
import { PaywallClient } from "../../components/paywall/paywall-client";
import { razorpayPrice } from "../../lib/server/razorpay";

export const metadata: Metadata = { title: "Activate workspace" };

export default function SubscribePage() {
  let paymentDisplayAmount = "$5.00";
  let paymentCurrency = "USD";
  try {
    const price = razorpayPrice();
    paymentDisplayAmount = price.displayAmount;
    paymentCurrency = price.currency;
  } catch {
    // Coupon redemption stays available before payment credentials are configured.
  }
  return (
    <PaywallClient
      paymentCurrency={paymentCurrency}
      paymentDisplayAmount={paymentDisplayAmount}
    />
  );
}
