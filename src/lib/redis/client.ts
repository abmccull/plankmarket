import { Redis } from "@upstash/redis";
import { env } from "@/env";

/**
 * Upstash Redis client for caching and rate limiting
 */
let redisClient: Redis | undefined;

export function getRedisClient(): Redis {
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    throw new Error(
      "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required for Redis operations",
    );
  }

  redisClient ??= new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });

  return redisClient;
}

// Avoid constructing the provider client while Next.js is collecting route
// metadata in secret-free CI builds. Runtime access still fails closed with a
// clear configuration error.
export const redis = new Proxy({} as Redis, {
  get(_target, property) {
    const client = getRedisClient();
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
