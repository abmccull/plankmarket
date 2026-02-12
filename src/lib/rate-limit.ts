import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "@/env";

const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
});

/**
 * Rate limiters for critical endpoints.
 * Uses sliding window algorithm for smooth rate limiting.
 */

// Auth endpoints: 5 requests per minute per IP
export const authRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "1 m"),
  prefix: "ratelimit:auth",
});

// Payment endpoints: 10 requests per minute per user
export const paymentRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 m"),
  prefix: "ratelimit:payment",
});

// Messaging endpoints: 30 messages per minute per user
export const messageRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, "1 m"),
  prefix: "ratelimit:message",
});

// Offer creation: 10 per minute per user
export const offerRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 m"),
  prefix: "ratelimit:offer",
});

// General API: 100 requests per minute per IP (for public endpoints)
export const generalRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, "1 m"),
  prefix: "ratelimit:general",
});
