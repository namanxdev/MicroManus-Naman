import { apiJson, handleApiError } from "@/lib/server/api-error";
import { optionalUser } from "@/lib/server/auth";
import { getBillingStatus } from "@/lib/server/billing";

export async function GET(request: Request) {
  try {
    const user = await optionalUser();
    if (!user) return apiJson({ authenticated: false, user: null });
    const billing = await getBillingStatus(user.id);
    return apiJson({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.full_name || user.user_metadata?.name || null,
        avatarUrl: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
      },
      billing,
    });
  } catch (error) {
    return handleApiError(error, request);
  }
}
