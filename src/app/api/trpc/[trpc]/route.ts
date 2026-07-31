import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/server/routers/_app";
import { createTRPCContext } from "@/server/trpc";
import { getPostHogServer } from "@/lib/analytics/posthog-server";
import { isSameOriginWrite } from "@/lib/security/request-origin";

const handler = (req: Request) => {
  if (!isSameOriginWrite(req)) {
    return Response.json(
      { error: { message: "Request origin is not allowed" } },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: createTRPCContext,
    onError: ({ path, error }) => {
      const route = path ?? "<no-path>";

      if (process.env.NODE_ENV === "development") {
        console.error(`tRPC failed on ${route}: ${error.message}`);
        return;
      }

      console.error("[trpc] request failed", {
        path: route,
        code: error.code,
      });

      if (error.code === "INTERNAL_SERVER_ERROR") {
        getPostHogServer()?.captureException(error.cause ?? error, "server", {
          path: route,
          trpcCode: error.code,
        });
      }
    },
  });
};

export { handler as GET, handler as POST };
