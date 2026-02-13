import { Redis } from "@upstash/redis";
import { env } from "@/env";

/**
 * Upstash Redis client for caching and rate limiting
 */
export const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
});
