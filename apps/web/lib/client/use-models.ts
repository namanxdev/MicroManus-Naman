"use client";

import { useEffect, useState } from "react";
import { getJson } from "./api";
import { MODEL_OPTIONS } from "./mock-data";
import type { ModelOption } from "./types";

interface ModelCatalogItem {
  id: string;
  provider: string;
  name: string;
  pricing?: {
    inputPerMillion?: number;
    outputPerMillion?: number;
    cacheReadPerMillion?: number;
  };
}

function providerLabel(value: string) {
  const normalized = value.toLowerCase();
  if (normalized === "openai") return "OpenAI";
  if (normalized === "anthropic") return "Anthropic";
  if (normalized === "kimi" || normalized === "moonshot") return "Moonshot";
  return value;
}

function pricingNote(model: ModelCatalogItem) {
  if (!model.pricing?.inputPerMillion || !model.pricing?.outputPerMillion) return "Usage priced";
  return `$${model.pricing.inputPerMillion}/$${model.pricing.outputPerMillion} per 1m`;
}

export function useModelCatalog() {
  const [models, setModels] = useState<ModelOption[]>(MODEL_OPTIONS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    getJson<{ models?: ModelCatalogItem[] }>("/api/models")
      .then((response) => {
        if (!mounted || !response.models?.length) return;
        setModels(response.models.map((model) => ({
          id: model.id,
          name: model.name,
          provider: providerLabel(model.provider),
          note: pricingNote(model),
        })));
      })
      .catch(() => undefined)
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  return { models, loading };
}
