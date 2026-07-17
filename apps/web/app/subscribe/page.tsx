import type { Metadata } from "next";
import { PaywallClient } from "../../components/paywall/paywall-client";

export const metadata: Metadata = { title: "Activate workspace" };

export default function SubscribePage() {
  return <PaywallClient />;
}
