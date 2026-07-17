import "server-only";

import { isIP } from "node:net";

import { ApiError } from "./api-error";
import { decryptSecret, encryptSecret, secretHint } from "./encryption";
import { isProduction } from "./env";
import type { Provider } from "./providers";
import { createAdminClient } from "./supabase";

export interface ProviderCredentialInput {
  provider: Provider;
  apiKey: string;
  baseUrl?: string;
  preferredModel?: string;
}

export interface DecryptedProviderCredential {
  provider: Provider;
  apiKey: string;
  baseUrl?: string;
  preferredModel?: string;
}

function isPrivateHostname(hostname: string): boolean {
  const value = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (value === "localhost" || value.endsWith(".localhost") || value.endsWith(".local")) return true;
  if (value === "::1" || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe80:")) return true;
  if (isIP(value) === 4) {
    const [a, b] = value.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  return false;
}

export function validateBaseUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ApiError(400, "INVALID_BASE_URL", "Base URL must be an absolute URL");
  }

  if (url.username || url.password || url.hash || url.search) {
    throw new ApiError(400, "INVALID_BASE_URL", "Base URL cannot include credentials, a query, or a fragment");
  }
  const devPrivateAllowed = !isProduction() && process.env.ALLOW_PRIVATE_MODEL_ENDPOINTS === "true";
  if (url.protocol !== "https:" && !(devPrivateAllowed && url.protocol === "http:")) {
    throw new ApiError(400, "INVALID_BASE_URL", "Base URL must use HTTPS");
  }
  if (isPrivateHostname(url.hostname) && !devPrivateAllowed) {
    throw new ApiError(400, "INVALID_BASE_URL", "Private and local model endpoints are disabled");
  }
  return url.toString().replace(/\/$/, "");
}

export async function saveProviderCredential(userId: string, input: ProviderCredentialInput) {
  const encrypted = encryptSecret(input.apiKey, userId, input.provider);
  const admin = createAdminClient();
  const { error } = await admin.from("provider_credentials").upsert(
    {
      user_id: userId,
      provider: input.provider,
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      auth_tag: encrypted.authTag,
      key_version: encrypted.keyVersion,
      key_hint: secretHint(input.apiKey),
      base_url: validateBaseUrl(input.baseUrl),
      preferred_model: input.preferredModel || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" },
  );
  if (error) throw new Error(`Unable to save provider credential: ${error.message}`);
}

export async function listProviderCredentials(userId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("provider_credentials")
    .select("provider,key_hint,base_url,preferred_model,updated_at")
    .eq("user_id", userId)
    .order("provider");
  if (error) throw new Error(`Unable to list provider credentials: ${error.message}`);
  return data || [];
}

export async function getProviderCredential(
  userId: string,
  provider: Provider,
): Promise<DecryptedProviderCredential | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("provider_credentials")
    .select("provider,ciphertext,iv,auth_tag,key_version,base_url,preferred_model")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  if (error) throw new Error(`Unable to load provider credential: ${error.message}`);
  if (!data) return null;

  return {
    provider,
    apiKey: decryptSecret(
      {
        ciphertext: data.ciphertext,
        iv: data.iv,
        authTag: data.auth_tag,
        keyVersion: data.key_version,
      },
      userId,
      provider,
    ),
    baseUrl: data.base_url || undefined,
    preferredModel: data.preferred_model || undefined,
  };
}

export async function deleteProviderCredential(userId: string, provider: Provider): Promise<void> {
  const { error } = await createAdminClient()
    .from("provider_credentials")
    .delete()
    .eq("user_id", userId)
    .eq("provider", provider);
  if (error) throw new Error(`Unable to delete provider credential: ${error.message}`);
}
