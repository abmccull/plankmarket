import { randomUUID } from "crypto";
import packageJson from "../../../package.json";
import { CURRENT_COMMERCIAL_POLICY } from "@/lib/commercial-policy";
import { MARKETPLACE_SCHEMA_VERSION } from "@/lib/schema-readiness-contract";

export const REQUEST_ID_HEADER = "x-request-id";
const CORRELATION_HEADER_CANDIDATES = [
  REQUEST_ID_HEADER,
  "x-correlation-id",
] as const;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
const BUILD_SHA_ENV_KEYS = [
  "PLANKMARKET_BUILD_SHA",
  "VERCEL_GIT_COMMIT_SHA",
  "GITHUB_SHA",
] as const;
const BUILD_SHA_PATTERN = /^[0-9a-f]{7,64}$/i;

export interface RequestLogContext {
  requestId: string;
  method: string;
  pathname: string;
  durationMs?: number;
}

export interface ReleaseMetadata {
  buildSha: string | null;
  commercialPolicyVersion: number;
  fingerprint: string;
  packageVersion: string;
  schemaVersion: string;
}

function resolveBuildSha(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  for (const key of BUILD_SHA_ENV_KEYS) {
    const value = env[key]?.trim();
    if (value && BUILD_SHA_PATTERN.test(value)) {
      return value.toLowerCase();
    }
  }

  return null;
}

export function resolveRequestId(headers: Headers): string {
  for (const header of CORRELATION_HEADER_CANDIDATES) {
    const value = headers.get(header)?.trim();
    if (value && REQUEST_ID_PATTERN.test(value)) {
      return value;
    }
  }

  return randomUUID();
}

export function attachRequestId(request: Request, requestId: string): Request {
  const headers = new Headers(request.headers);
  headers.set(REQUEST_ID_HEADER, requestId);
  return new Request(request, { headers });
}

export function createObservabilityHeaders(params: {
  requestId: string;
  durationMs: number;
  headers?: HeadersInit;
}): Headers {
  const headers = new Headers(params.headers);
  headers.set(REQUEST_ID_HEADER, params.requestId);
  headers.set("Server-Timing", `app;dur=${Math.max(0, Math.round(params.durationMs))}`);
  return headers;
}

export function withObservabilityHeaders(
  response: Response,
  params: { requestId: string; durationMs: number },
): Response {
  const nextResponse = new Response(response.body, response);
  const headers = createObservabilityHeaders({
    requestId: params.requestId,
    durationMs: params.durationMs,
    headers: nextResponse.headers,
  });
  headers.forEach((value, key) => nextResponse.headers.set(key, value));
  return nextResponse;
}

export function getRequestLogContext(
  request: Request,
  params: { requestId: string; durationMs?: number },
): RequestLogContext {
  const url = new URL(request.url);
  return {
    requestId: params.requestId,
    method: request.method,
    pathname: url.pathname,
    durationMs: params.durationMs,
  };
}

export function buildReleaseMetadata(
  env: NodeJS.ProcessEnv = process.env,
): ReleaseMetadata {
  const buildSha = resolveBuildSha(env);

  return {
    buildSha,
    commercialPolicyVersion: CURRENT_COMMERCIAL_POLICY.version,
    fingerprint: [
      `pkg:${packageJson.version}`,
      `schema:${MARKETPLACE_SCHEMA_VERSION}`,
      `policy:${CURRENT_COMMERCIAL_POLICY.version}`,
      `sha:${buildSha ?? "unavailable"}`,
    ].join("|"),
    packageVersion: packageJson.version,
    schemaVersion: MARKETPLACE_SCHEMA_VERSION,
  };
}

export function buildHealthMetadata(requestId: string) {
  return {
    requestId,
    release: buildReleaseMetadata(),
    service: "plankmarket",
  };
}
