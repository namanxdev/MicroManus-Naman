import type { MetadataRoute } from "next";

const publicPaths = [
  "",
  "/pricing",
  "/privacy",
  "/terms",
  "/refund-policy",
  "/shipping-policy",
  "/contact",
  "/sign-in",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = new URL(
    process.env.NEXT_PUBLIC_APP_URL?.trim()
    || "https://micro-manus-naman-web.vercel.app",
  ).origin;

  return publicPaths.map((path) => ({
    url: `${origin}${path}`,
    lastModified: new Date("2026-07-19T00:00:00.000Z"),
    changeFrequency: path === "" || path === "/pricing" ? "weekly" : "monthly",
    priority: path === "" ? 1 : path === "/pricing" ? 0.9 : 0.6,
  }));
}
