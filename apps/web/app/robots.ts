import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const origin = new URL(
    process.env.NEXT_PUBLIC_APP_URL?.trim()
    || "https://micro-manus-naman-web.vercel.app",
  ).origin;

  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/pricing", "/privacy", "/terms", "/refund-policy", "/shipping-policy", "/contact", "/sign-in"],
      disallow: ["/api/", "/chat/", "/settings", "/usage", "/subscribe"],
    },
    sitemap: `${origin}/sitemap.xml`,
  };
}
