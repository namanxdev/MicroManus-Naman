import { NextResponse } from "next/server";

import { handleApiError, safeRelativePath } from "@/lib/server/api-error";
import { appUrl } from "@/lib/server/env";
import { createSessionClient } from "@/lib/server/supabase";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
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
  } catch (error) {
    return handleApiError(error, request);
  }
}
