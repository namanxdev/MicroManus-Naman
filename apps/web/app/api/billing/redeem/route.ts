import { apiJson, asTrimmedString, handleApiError, readJsonObject } from "@/lib/server/api-error";
import { requireUser } from "@/lib/server/auth";
import { redeemCoupon } from "@/lib/server/billing";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await readJsonObject(request, 8 * 1024);
    const code = asTrimmedString(body.code, "code", { min: 1, max: 64 })!;
    const result = await redeemCoupon(user.id, code);
    return apiJson({
      ok: true,
      granted: result.granted,
      alreadyRedeemed: result.already_redeemed,
      credits: Number(result.credits),
    });
  } catch (error) {
    return handleApiError(error, request);
  }
}
