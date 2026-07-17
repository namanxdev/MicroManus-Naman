import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "MicroManus — Deep research, visibly done",
    template: "%s · MicroManus",
  },
  description:
    "A source-grounded deep research agent that plans, searches, verifies, and produces cited reports.",
  applicationName: "MicroManus",
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#f1ede3",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
