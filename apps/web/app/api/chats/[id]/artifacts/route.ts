import { apiJson, asUuid, handleApiError } from "@/lib/server/api-error";
import { requireUser } from "@/lib/server/auth";
import { requireChatThread } from "@/lib/server/chats";
import { createAdminClient } from "@/lib/server/supabase";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const user = await requireUser();
    const threadId = asUuid((await context.params).id, "id")!;
    await requireChatThread(user.id, threadId);
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("artifacts")
      .select("id,name,kind,storage_path,content_type,size_bytes,metadata,created_at")
      .eq("user_id", user.id)
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`Unable to load artifacts: ${error.message}`);

    const artifacts = await Promise.all((data || []).map(async (artifact) => {
      const { data: signed } = await admin.storage.from("reports").createSignedUrl(artifact.storage_path, 3600);
      return {
        id: artifact.id,
        name: artifact.name,
        type: artifact.kind,
        contentType: artifact.content_type,
        size: artifact.size_bytes == null ? undefined : Number(artifact.size_bytes),
        url: signed?.signedUrl,
        createdAt: artifact.created_at,
      };
    }));
    return apiJson({ artifacts });
  } catch (error) {
    return handleApiError(error, request);
  }
}
