import { db } from "@/server/db";
import { contentViolations } from "@/server/db/schema";
import type { Detection } from "@/lib/content-filter/patterns";
import { redis } from "@/lib/redis/client";
import { sql, eq, and, desc } from "drizzle-orm";

/**
 * Log a content violation to the database.
 */
export async function logContentViolation(params: {
  userId: string;
  contentType: "message" | "listing" | "offer" | "review";
  contentBody: string;
  detections: Detection[];
}): Promise<void> {
  // Insert violation record
  await db.insert(contentViolations).values({
    userId: params.userId,
    contentType: params.contentType,
    contentBody: params.contentBody,
    detections: params.detections,
  });

  // Increment Redis counter for rate limiting (30-day TTL)
  const counterKey = `violation-count:${params.userId}`;
  await redis.incr(counterKey);
  // Set TTL only if it's a new key (avoid resetting TTL on subsequent violations)
  const ttl = await redis.ttl(counterKey);
  if (ttl < 0) {
    await redis.expire(counterKey, 30 * 24 * 60 * 60); // 30 days
  }
}

/**
 * Get the current violation count for a user (from Redis for performance).
 */
export async function getViolationCount(userId: string): Promise<number> {
  const count = await redis.get(`violation-count:${userId}`);
  return typeof count === "number" ? count : parseInt(count as string) || 0;
}

/**
 * Check if a user should be rate-limited or suspended based on violation count.
 * Returns the enforcement action to take.
 */
export async function checkViolationStatus(userId: string): Promise<{
  allowed: boolean;
  action: "none" | "warning" | "rate_limit" | "suspend";
  violationCount: number;
}> {
  const count = await getViolationCount(userId);

  if (count >= 5) {
    return { allowed: false, action: "suspend", violationCount: count };
  }
  if (count >= 3) {
    return { allowed: true, action: "rate_limit", violationCount: count };
  }
  if (count >= 1) {
    return { allowed: true, action: "warning", violationCount: count };
  }
  return { allowed: true, action: "none", violationCount: count };
}
