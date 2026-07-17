import { ApiError, handleApiError } from "@/lib/server/api-error";
import { requireUser } from "@/lib/server/auth";
import { isProduction, requiredEnv } from "@/lib/server/env";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

function artifactUrl(id: string): URL {
  if (!/^[0-9a-f]{32}$/.test(id)) {
    throw new ApiError(400, "INVALID_ARTIFACT", "Artifact identifier is invalid");
  }
  const base = new URL(requiredEnv("AGENT_SERVICE_URL"));
  if (isProduction() && base.protocol !== "https:") {
    throw new Error("AGENT_SERVICE_URL must use HTTPS in production");
  }
  return new URL(`/v1/artifacts/${id}`, `${base.origin}/`);
}

export async function GET(request: Request, context: Context) {
  try {
    const user = await requireUser();
    const id = (await context.params).id;
    const upstream = await fetch(artifactUrl(id), {
      headers: {
        Authorization: `Bearer ${requiredEnv("AGENT_SERVICE_TOKEN")}`,
        "X-User-Id": user.id,
      },
      cache: "no-store",
      signal: request.signal,
    });
    if (upstream.status === 404) throw new ApiError(404, "ARTIFACT_NOT_FOUND", "Artifact not found");
    if (!upstream.ok || !upstream.body) {
      throw new ApiError(502, "ARTIFACT_UNAVAILABLE", "Artifact service is unavailable");
    }
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="micromanus-${id}.pdf"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return handleApiError(error, request);
  }
}
