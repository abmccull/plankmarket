import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/server/routers/_app";
import { createTRPCContext } from "@/server/trpc";
import { isSameOriginWrite } from "@/lib/security/request-origin";
import {
  attachRequestId,
  getRequestLogContext,
  resolveRequestId,
  withObservabilityHeaders,
} from "@/lib/server/request-observability";

const TRPC_SLOW_REQUEST_THRESHOLD_MS = 1_000;

const handler = async (req: Request) => {
  const startedAt = Date.now();
  const requestId = resolveRequestId(req.headers);
  const logContext = getRequestLogContext(req, { requestId });

  if (!isSameOriginWrite(req)) {
    console.warn("[trpc] origin rejected", logContext);
    return withObservabilityHeaders(
      Response.json(
      { error: { message: "Request origin is not allowed" } },
      { status: 403, headers: { "Cache-Control": "no-store" } },
      ),
      { requestId, durationMs: Date.now() - startedAt },
    );
  }

  const instrumentedRequest = attachRequestId(req, requestId);
  const procedurePaths = new Set<string>();
  const errorCodes = new Set<string>();

  const response = await fetchRequestHandler({
    endpoint: "/api/trpc",
    req: instrumentedRequest,
    router: appRouter,
    createContext: createTRPCContext,
    onError: ({ path, error }) => {
      const route = path ?? "<no-path>";
      procedurePaths.add(route);
      errorCodes.add(error.code);

      if (process.env.NODE_ENV === "development") {
        console.error(`tRPC failed on ${route}: ${error.message}`);
        return;
      }

      console.error("[trpc] request failed", {
        path: route,
        code: error.code,
      });
    },
  });

  const durationMs = Date.now() - startedAt;
  if (errorCodes.size > 0) {
    console.error("[trpc] request failed", {
      ...logContext,
      durationMs,
      status: response.status,
      procedurePaths: [...procedurePaths],
      errorCodes: [...errorCodes],
    });
  } else if (durationMs >= TRPC_SLOW_REQUEST_THRESHOLD_MS) {
    console.warn("[trpc] request slow", {
      ...logContext,
      durationMs,
      status: response.status,
    });
  }

  return withObservabilityHeaders(response, { requestId, durationMs });
};

export { handler as GET, handler as POST };
