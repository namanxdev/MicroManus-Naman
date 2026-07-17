import {
  ApiError,
  apiJson,
  asTrimmedString,
  handleApiError,
  readJsonObject,
} from "@/lib/server/api-error";
import { requireUser } from "@/lib/server/auth";
import { getModelPricing } from "@/lib/server/pricing";
import {
  deleteProviderCredential,
  getProviderCredential,
  listProviderCredentials,
  saveProviderCredential,
} from "@/lib/server/provider-credentials";
import { parseProvider, PROVIDERS } from "@/lib/server/providers";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const configured = await listProviderCredentials(user.id);
    const byProvider = new Map(configured.map((row) => [row.provider, row]));
    return apiJson({
      providers: PROVIDERS.map((id) => {
        const row = byProvider.get(id);
        return {
          id,
          configured: Boolean(row),
          keyHint: row?.key_hint,
          baseUrl: row?.base_url || undefined,
          model: row?.preferred_model || undefined,
          updatedAt: row?.updated_at,
        };
      }),
    });
  } catch (error) {
    return handleApiError(error, request);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await readJsonObject(request, 16 * 1024);
    const provider = parseProvider(body.provider);
    const submittedKey = asTrimmedString(body.apiKey, "apiKey", { min: 8, max: 2048, optional: true });
    const baseUrl = asTrimmedString(body.baseUrl, "baseUrl", { min: 8, max: 2048, optional: true });
    const model = asTrimmedString(body.model, "model", { min: 1, max: 160, optional: true });
    if (model) await getModelPricing(provider, model);

    const existing = submittedKey ? null : await getProviderCredential(user.id, provider);
    if (!submittedKey && !existing) {
      throw new ApiError(400, "API_KEY_REQUIRED", "Enter an API key before configuring this provider");
    }
    const apiKey = submittedKey || existing!.apiKey;
    await saveProviderCredential(user.id, {
      provider,
      apiKey,
      baseUrl,
      preferredModel: model,
    });
    return apiJson({
      ok: true,
      configured: true,
      provider,
      keyHint: `••••${apiKey.slice(-4)}`,
      baseUrl,
      model,
    });
  } catch (error) {
    return handleApiError(error, request);
  }
}

export const PUT = POST;

export async function DELETE(request: Request) {
  try {
    const user = await requireUser();
    const provider = parseProvider(new URL(request.url).searchParams.get("provider"));
    await deleteProviderCredential(user.id, provider);
    return apiJson({ ok: true, configured: false, provider });
  } catch (error) {
    return handleApiError(error, request);
  }
}
