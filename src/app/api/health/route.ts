import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { MARKETPLACE_SCHEMA_READINESS_SQL } from "@/lib/schema-readiness-contract";

export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "no-store, max-age=0",
  "Content-Type": "application/json",
};

export async function GET() {
  const startedAt = Date.now();

  try {
    const schemaCheck = await db.execute<{
      schemaReady: boolean;
      missingArtifactCount: number;
      missingArtifacts: string[];
    }>(sql.raw(MARKETPLACE_SCHEMA_READINESS_SQL));

    if (schemaCheck[0]?.schemaReady !== true) {
      console.error("[health] required schema contract is not ready", {
        missingArtifactCount: schemaCheck[0]?.missingArtifactCount ?? null,
      });
      return Response.json(
        {
          status: "unhealthy",
          checks: { database: "ok", schema: "not_ready" },
          responseTimeMs: Date.now() - startedAt,
        },
        { status: 503, headers },
      );
    }

    return Response.json(
      {
        status: "ok",
        checks: { database: "ok", schema: "ok" },
        responseTimeMs: Date.now() - startedAt,
      },
      { headers },
    );
  } catch (error) {
    console.error("[health] database readiness check failed", {
      error: error instanceof Error ? error.name : "UnknownError",
    });

    return Response.json(
      {
        status: "unhealthy",
        checks: { database: "unavailable", schema: "unavailable" },
        responseTimeMs: Date.now() - startedAt,
      },
      { status: 503, headers },
    );
  }
}
