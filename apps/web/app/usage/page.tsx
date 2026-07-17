import type { Metadata } from "next";
import { UsageDashboard } from "../../components/usage/usage-dashboard";

export const metadata: Metadata = { title: "Usage & cost" };

export default function UsagePage() {
  return <UsageDashboard />;
}
