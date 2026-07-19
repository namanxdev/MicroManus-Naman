import { ApiError, apiJson, asTrimmedString, handleApiError, readJsonObject, safeRelativePath } from "@/lib/server/api-error";
import { getBillingStatus } from "@/lib/server/billing";
import { createSessionClient } from "@/lib/server/supabase";

export const runtime = "nodejs";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  try {
    const fetchSite = request.headers.get("sec-fetch-site");
    if (fetchSite && fetchSite !== "same-origin") {
      throw new ApiError(403, "CROSS_SITE_REQUEST", "Sign-in request must come from this website");
    }

    const body = await readJsonObject(request, 8 * 1024);
    const email = asTrimmedString(body.email, "email", { min: 3, max: 254 })?.toLowerCase();
    const password = asTrimmedString(body.password, "password", { min: 8, max: 256 });
    if (!email || !EMAIL_PATTERN.test(email)) {
      throw new ApiError(400, "VALIDATION_ERROR", "Enter a valid email address");
    }
    if (!password) throw new ApiError(400, "VALIDATION_ERROR", "Password is required");

    const supabase = await createSessionClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");
    }

    const requested = safeRelativePath(
      typeof body.next === "string" ? body.next : null,
      "/subscribe",
    );
    let destination = requested;
    try {
      const billing = await getBillingStatus(data.user.id);
      if (billing.active && requested === "/subscribe") destination = "/chat";
    } catch {
      destination = "/subscribe";
    }

    return apiJson({ ok: true, next: destination });
  } catch (error) {
    return handleApiError(error, request);
  }
}
