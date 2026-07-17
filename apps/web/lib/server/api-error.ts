import "server-only";

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function apiJson(body: unknown, init: number | ResponseInit = 200): NextResponse {
  const responseInit = typeof init === "number" ? { status: init } : init;
  const response = NextResponse.json(body, responseInit);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

export async function readJsonObject(
  request: Request,
  maximumBytes = 128 * 1024,
): Promise<Record<string, unknown>> {
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Request body is too large");
  }

  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON");
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "INVALID_BODY", "Request body must be a JSON object");
  }
  return value as Record<string, unknown>;
}

export function asTrimmedString(
  value: unknown,
  field: string,
  options: { min?: number; max?: number; optional?: boolean } = {},
): string | undefined {
  if (value === undefined || value === null) {
    if (options.optional) return undefined;
    throw new ApiError(400, "VALIDATION_ERROR", `${field} is required`);
  }
  if (typeof value !== "string") {
    throw new ApiError(400, "VALIDATION_ERROR", `${field} must be a string`);
  }
  const result = value.trim();
  const min = options.min ?? 1;
  const max = options.max ?? 10_000;
  if (result.length < min || result.length > max) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      `${field} must be between ${min} and ${max} characters`,
    );
  }
  return result;
}

export function asUuid(value: unknown, field: string, optional = false): string | undefined {
  if ((value === undefined || value === null || value === "") && optional) return undefined;
  const stringValue = asTrimmedString(value, field, { min: 36, max: 36 });
  if (!stringValue || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stringValue)) {
    throw new ApiError(400, "VALIDATION_ERROR", `${field} must be a UUID`);
  }
  return stringValue;
}

export function safeRelativePath(value: string | null, fallback: string): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback;
  }
  return value;
}

export function handleApiError(error: unknown, request?: Request): NextResponse {
  const requestId = request?.headers.get("x-request-id") || crypto.randomUUID();
  if (error instanceof ApiError) {
    const response = apiJson(
      { ok: false, error: error.message, code: error.code, details: error.details, requestId },
      error.status,
    );
    response.headers.set("X-Request-Id", requestId);
    return response;
  }

  console.error("MicroManus API error", {
    requestId,
    method: request?.method,
    path: request ? new URL(request.url).pathname : undefined,
    error: error instanceof Error ? error.message : "Unknown error",
  });
  const response = apiJson(
    { ok: false, error: "Internal server error", code: "INTERNAL_ERROR", requestId },
    500,
  );
  response.headers.set("X-Request-Id", requestId);
  return response;
}

export function assertInternalRequest(request: Request): void {
  const expected = process.env.AGENT_SERVICE_TOKEN?.trim();
  if (!expected) throw new ApiError(503, "SERVICE_NOT_CONFIGURED", "Internal service is not configured");

  const authorization = request.headers.get("authorization") || "";
  const supplied = Buffer.from(authorization, "utf8");
  const wanted = Buffer.from(`Bearer ${expected}`, "utf8");
  if (supplied.length !== wanted.length || !timingSafeEqual(supplied, wanted)) {
    throw new ApiError(401, "UNAUTHORIZED", "Invalid internal service credential");
  }
}
