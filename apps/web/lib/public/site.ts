export const siteDetails = {
  name: process.env.NEXT_PUBLIC_BUSINESS_NAME?.trim() || "MicroManus",
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "",
  supportUrl:
    process.env.NEXT_PUBLIC_SUPPORT_URL?.trim()
    || "https://github.com/namanxdev/MicroManus-Naman/issues",
  operatingCountry: process.env.NEXT_PUBLIC_OPERATING_COUNTRY?.trim() || "India",
  lastUpdated: "19 July 2026",
} as const;
