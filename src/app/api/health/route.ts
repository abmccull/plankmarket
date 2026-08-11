import {
  createObservabilityHeaders,
  resolveRequestId,
} from "@/lib/server/request-observability";

export const dynamic = "force-dynamic";

const baseHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "Content-Type": "application/json",
};

export async function GET(request: Request) {
  const startedAt = Date.now();
  const requestId = resolveRequestId(request.headers);
  const responseTimeMs = Date.now() - startedAt;

  return Response.json(
    {
      status: "ok",
      checks: { app: "ok" },
      responseTimeMs,
    },
    {
      headers: createObservabilityHeaders({
        requestId,
        durationMs: responseTimeMs,
        headers: baseHeaders,
      }),
    },
  );
}
