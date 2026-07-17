import { apiJson, handleApiError } from "@/lib/server/api-error";
import { requireUser } from "@/lib/server/auth";
import { getBillingStatus } from "@/lib/server/billing";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    return apiJson(await getBillingStatus(user.id));
  } catch (error) {
    return handleApiError(error, request);
  }
}
