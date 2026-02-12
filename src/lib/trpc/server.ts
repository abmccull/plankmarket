import "server-only";
import { createTRPCContext, createCallerFactory } from "@/server/trpc";
import { appRouter } from "@/server/routers/_app";
import { headers } from "next/headers";

const createCaller = createCallerFactory(appRouter);

export async function createServerCaller() {
  const heads = new Headers(await headers());
  heads.set("x-trpc-source", "rsc");

  return createCaller(
    await createTRPCContext({
      req: new Request("http://localhost", { headers: heads }),
      resHeaders: new Headers(),
      info: {} as never,
    })
  );
}
