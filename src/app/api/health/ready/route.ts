import { timingSafeEqual } from "crypto";
import { sql } from "drizzle-orm";
import { MARKETPLACE_SCHEMA_READINESS_SQL } from "@/lib/schema-readiness-contract";
import {
  buildHealthMetadata,
  createObservabilityHeaders,
  resolveRequestId,
} from "@/lib/server/request-observability";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

const READINESS_CACHE_TTL_MS = 15_000;
const baseHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Content-Type": "application/json",
};

type ReadinessPayload = {
  status: "ok" | "unhealthy";
  checks: {
    database: "ok" | "unavailable";
    schema: "ok" | "not_ready" | "unavailable";
  };
  details?: {
    missingArtifactCount?: number;
    missingArtifacts?: string[];
  };
  meta?: ReturnType<typeof buildHealthMetadata>;
};

let cachedReadiness:
  | {
      expiresAt: number;
      payload: ReadinessPayload;
      statusCode: number;
    }
  | null = null;
let readinessInFlight:
  | Promise<{
      payload: ReadinessPayload;
      statusCode: number;
    }>
  | null = null;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;

  const providedToken = authHeader.slice("Bearer ".length).trim();
  const expectedBuffer = Buffer.from(secret);
  const providedBuffer = Buffer.from(providedToken);
  if (expectedBuffer.length !== providedBuffer.length) return false;

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

async function loadReadiness() {
  const now = Date.now();
  if (cachedReadiness && cachedReadiness.expiresAt > now) {
    return cachedReadiness;
  }
  if (readinessInFlight) {
    return readinessInFlight;
  }

  readinessInFlight = db
    .execute<{
      schemaReady: boolean;
      missingArtifactCount: number;
      missingArtifacts: string[];
    }>(sql.raw(MARKETPLACE_SCHEMA_READINESS_SQL))
    .then((schemaCheck) => {
      const payload =
        schemaCheck[0]?.schemaReady === true
          ? ({
              status: "ok",
              checks: { database: "ok", schema: "ok" },
            } satisfies ReadinessPayload)
          : ({
              status: "unhealthy",
              checks: { database: "ok", schema: "not_ready" },
              details: {
                missingArtifactCount:
                  schemaCheck[0]?.missingArtifactCount ?? undefined,
                missingArtifacts: schemaCheck[0]?.missingArtifacts ?? [],
              },
            } satisfies ReadinessPayload);
      const statusCode = payload.status === "ok" ? 200 : 503;
      cachedReadiness = {
        expiresAt: Date.now() + READINESS_CACHE_TTL_MS,
        payload,
        statusCode,
      };
      return cachedReadiness;
    })
    .catch(() => {
      const payload = {
        status: "unhealthy",
        checks: { database: "unavailable", schema: "unavailable" },
      } satisfies ReadinessPayload;
      cachedReadiness = {
        expiresAt: Date.now() + 5_000,
        payload,
        statusCode: 503,
      };
      return cachedReadiness;
    })
    .finally(() => {
      readinessInFlight = null;
    });

  return readinessInFlight;
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  const requestId = resolveRequestId(request.headers);

  if (!isAuthorized(request)) {
    const responseTimeMs = Date.now() - startedAt;
    return Response.json(
      {
        status: "unauthorized",
        responseTimeMs,
      },
      {
        status: 401,
        headers: createObservabilityHeaders({
          requestId,
          durationMs: responseTimeMs,
          headers: baseHeaders,
        }),
      },
    );
  }

  const readiness = await loadReadiness();
  if (readiness.payload.status === "unhealthy") {
    console.error("[health:ready] readiness check failed", {
      requestId,
      checks: readiness.payload.checks,
      missingArtifactCount:
        readiness.payload.details?.missingArtifactCount ?? null,
    });
  }

  const responseTimeMs = Date.now() - startedAt;
  return Response.json(
    {
      ...readiness.payload,
      responseTimeMs,
      meta: buildHealthMetadata(requestId),
    },
    {
      status: readiness.statusCode,
      headers: createObservabilityHeaders({
        requestId,
        durationMs: responseTimeMs,
        headers: baseHeaders,
      }),
    },
  );
}

export function __resetReadinessCacheForTests() {
  cachedReadiness = null;
  readinessInFlight = null;
}
