import { NextResponse } from "next/server";

import { asUuid, handleApiError } from "@/lib/server/api-error";
import { requireUser } from "@/lib/server/auth";
import { createAdminClient } from "@/lib/server/supabase";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const user = await requireUser();
    const artifactId = asUuid((await context.params).id, "id")!;
    const admin = createAdminClient();
    const { data: artifact, error } = await admin
      .from("artifacts")
      .select("storage_path")
      .eq("id", artifactId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw new Error(`Unable to load artifact: ${error.message}`);
    if (!artifact) return new NextResponse("Not found", { status: 404 });

    const { data, error: signError } = await admin.storage
      .from("reports")
      .createSignedUrl(artifact.storage_path, 60);
    if (signError || !data?.signedUrl) throw new Error("Unable to sign artifact download");
    return NextResponse.redirect(data.signedUrl, 303);
  } catch (error) {
    return handleApiError(error, request);
  }
}
