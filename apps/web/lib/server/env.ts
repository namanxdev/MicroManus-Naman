import "server-only";

export function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required server environment variable: ${name}`);
  }
  return value;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function appUrl(fallbackOrigin?: string): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim();
  const value = configured || fallbackOrigin;
  if (!value) throw new Error("APP_URL is required outside an HTTP request");

  const url = new URL(value);
  if (isProduction() && url.protocol !== "https:") {
    throw new Error("APP_URL must use HTTPS in production");
  }
  return url.origin;
}

export function isExplicitDevMockEnabled(name: string): boolean {
  return !isProduction() && process.env[name] === "true";
}
