import { NextResponse } from "next/server";

import { safeRelativePath } from "@/lib/server/api-error";
import { appUrl } from "@/lib/server/env";
import { createSessionClient } from "@/lib/server/supabase";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    const provider = url.searchParams.get("provider");
    if (provider !== "google" && provider !== "github") {
      return NextResponse.redirect(new URL("/?auth_error=unsupported_provider", appUrl(url.origin)));
    }

    const next = safeRelativePath(url.searchParams.get("next"), "/subscribe");
    const callback = new URL("/api/auth/callback", appUrl(url.origin));
    callback.searchParams.set("next", next);

    const supabase = await createSessionClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: callback.toString(),
        ...(provider === "google" ? { queryParams: { prompt: "select_account" } } : {}),
      },
    });
    if (error || !data.url) throw new Error(error?.message || "OAuth provider returned no redirect URL");
    return NextResponse.redirect(data.url, 303);
  } catch {
    let origin = url.origin;
    try {
      origin = appUrl(url.origin);
    } catch {
      // Fall back to the request origin so a bad APP_URL still reaches the error UI.
    }
    const destination = new URL("/", origin);
    destination.searchParams.set("auth_error", "oauth_start");
    return NextResponse.redirect(destination, 303);
  }
}
