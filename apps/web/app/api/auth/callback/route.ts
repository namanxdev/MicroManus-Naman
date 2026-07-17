import { NextResponse } from "next/server";

import { safeRelativePath } from "@/lib/server/api-error";
import { getBillingStatus } from "@/lib/server/billing";
import { appUrl } from "@/lib/server/env";
import { createSessionClient } from "@/lib/server/supabase";

export const runtime = "nodejs";

function noStoreRedirect(url: URL, status = 307): NextResponse {
  const response = NextResponse.redirect(url, status);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Expires", "0");
  response.headers.set("Pragma", "no-cache");
  return response;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = appUrl(requestUrl.origin);
  const code = requestUrl.searchParams.get("code");
  if (!code) return noStoreRedirect(new URL("/?auth_error=missing_code", origin));

  const supabase = await createSessionClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return noStoreRedirect(new URL("/?auth_error=oauth_callback", origin));
  }

  try {
    const billing = await getBillingStatus(data.user.id);
    const requested = safeRelativePath(requestUrl.searchParams.get("next"), "/subscribe");
    const destination = billing.active && requested === "/subscribe" ? "/chat" : requested;
    return noStoreRedirect(new URL(destination, origin), 303);
  } catch {
    return noStoreRedirect(new URL("/subscribe", origin), 303);
  }
}
