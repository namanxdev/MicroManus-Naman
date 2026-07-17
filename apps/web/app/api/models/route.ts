import { apiJson, handleApiError } from "@/lib/server/api-error";
import { listActiveModels } from "@/lib/server/pricing";

export async function GET(request: Request) {
  try {
    const models = await listActiveModels();
    return apiJson({
      models: models.map((model) => ({
        id: model.model,
        provider: model.provider,
        name: model.displayName,
        pricing: {
          inputPerMillion: model.inputPerMillionUsd,
          outputPerMillion: model.outputPerMillionUsd,
          cacheReadPerMillion: model.cacheReadPerMillionUsd,
          cacheWritePerMillion: model.cacheWritePerMillionUsd,
          currency: "USD",
          version: model.pricingVersion,
          effectiveFrom: model.effectiveFrom,
          effectiveTo: model.effectiveTo,
        },
      })),
    });
  } catch (error) {
    return handleApiError(error, request);
  }
}
