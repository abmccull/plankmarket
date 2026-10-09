import "server-only";

import { createHash } from "crypto";
import superjson from "superjson";
import { redis } from "@/lib/redis/client";

const PUBLIC_READ_CACHE_VERSION = "v4";

export function buildPublicReadCacheKey(
  namespace: string,
  input: unknown,
): string {
  const digest = createHash("sha256")
    .update(superjson.stringify(input))
    .digest("hex")
    .slice(0, 32);
  return `public-read:${PUBLIC_READ_CACHE_VERSION}:${namespace}:${digest}`;
}

export async function readPublicReadCache<T>(
  key: string | null,
): Promise<T | null> {
  if (!key) return null;
  try {
    const cached = await redis.get<
      string | ReturnType<typeof superjson.serialize>
    >(key);
    if (!cached) return null;
    // Upstash automatically decodes JSON strings by default. Preserve
    // SuperJSON's Date metadata whether the client returned text or an object.
    return typeof cached === "string"
      ? superjson.parse<T>(cached)
      : superjson.deserialize<T>(cached);
  } catch (error) {
    console.error("[public-read-cache] read failed", {
      key,
      error: error instanceof Error ? error.name : "UnknownError",
    });
    return null;
  }
}

export async function writePublicReadCache(
  key: string | null,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  if (!key) return;
  try {
    await redis.set(key, superjson.stringify(value), { ex: ttlSeconds });
  } catch (error) {
    console.error("[public-read-cache] write failed", {
      key,
      error: error instanceof Error ? error.name : "UnknownError",
    });
  }
}
