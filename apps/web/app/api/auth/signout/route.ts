import { handleApiError, apiJson } from "@/lib/server/api-error";
import { createSessionClient } from "@/lib/server/supabase";

export async function POST(request: Request) {
  try {
    const supabase = await createSessionClient();
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
    return apiJson({ ok: true });
  } catch (error) {
    return handleApiError(error, request);
  }
}
