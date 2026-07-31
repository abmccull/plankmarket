import { Ratelimit } from "@upstash/ratelimit";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRedisClient } from "@/lib/redis/client";
import {
  authenticateInventoryRequest,
} from "@/server/security/inventory-api-key";
import {
  hashInventoryIngestBody,
  INVENTORY_INGEST_MAX_BODY_BYTES,
  InventoryIngestError,
  inventoryIngestPayloadSchema,
  processInventoryIngest,
} from "@/server/services/inventory-ingestion";

const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);

let unauthenticatedLimiter: Ratelimit | undefined;
let sourceLimiter: Ratelimit | undefined;

function getUnauthenticatedLimiter() {
  unauthenticatedLimiter ??= new Ratelimit({
    redis: getRedisClient(),
    limiter: Ratelimit.slidingWindow(30, "60 s"),
    prefix: "rl:inventory-ingest-ip",
  });
  return unauthenticatedLimiter;
}

function getSourceLimiter() {
  sourceLimiter ??= new Ratelimit({
    redis: getRedisClient(),
    limiter: Ratelimit.slidingWindow(120, "60 s"),
    prefix: "rl:inventory-ingest-source",
  });
  return sourceLimiter;
}

function noStoreJson(
  body: Record<string, unknown>,
  init: { status: number; retryAfter?: number },
) {
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (init.retryAfter) {
    headers.set("Retry-After", String(Math.max(1, init.retryAfter)));
  }
  return NextResponse.json(body, { status: init.status, headers });
}

function clientIp(request: NextRequest): string {
  return (
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

async function readBoundedBody(
  request: NextRequest,
  maxBytes: number,
): Promise<Uint8Array | null> {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function POST(request: NextRequest) {
  let replayKey: string | undefined;
  try {
    if (
      !request.headers
        .get("content-type")
        ?.toLowerCase()
        .startsWith("application/json")
    ) {
      return noStoreJson(
        {
          error: {
            code: "UNSUPPORTED_MEDIA_TYPE",
            message: "Expected an application/json request",
          },
        },
        { status: 415 },
      );
    }

    const declaredLength = Number(request.headers.get("content-length"));
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > INVENTORY_INGEST_MAX_BODY_BYTES
    ) {
      return noStoreJson(
        {
          error: {
            code: "PAYLOAD_TOO_LARGE",
            message: "Inventory payload is too large",
          },
        },
        { status: 413 },
      );
    }

    let ipLimit;
    try {
      ipLimit = await getUnauthenticatedLimiter().limit(clientIp(request));
    } catch (error) {
      console.error("Inventory ingest rate-limit store unavailable", {
        error: error instanceof Error ? error.name : "UnknownError",
      });
      return noStoreJson(
        {
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Inventory ingestion is temporarily unavailable",
          },
        },
        { status: 503 },
      );
    }
    if (!ipLimit.success) {
      return noStoreJson(
        {
          error: {
            code: "RATE_LIMITED",
            message: "Too many inventory requests",
          },
        },
        {
          status: 429,
          retryAfter: Math.ceil((ipLimit.reset - Date.now()) / 1000),
        },
      );
    }

    const rawBody = await readBoundedBody(
      request,
      INVENTORY_INGEST_MAX_BODY_BYTES,
    );
    if (!rawBody) {
      return noStoreJson(
        {
          error: {
            code: "PAYLOAD_TOO_LARGE",
            message: "Inventory payload is too large",
          },
        },
        { status: 413 },
      );
    }

    const authentication = await authenticateInventoryRequest({
      headers: request.headers,
      rawBody,
    });
    if (!authentication.ok) {
      return noStoreJson(
        {
          error: {
            code: authentication.code,
            message: "Inventory credentials were not accepted",
          },
        },
        { status: authentication.status },
      );
    }

    let sourceLimit;
    try {
      sourceLimit = await getSourceLimiter().limit(authentication.source.id);
    } catch (error) {
      console.error("Inventory source rate-limit store unavailable", {
        error: error instanceof Error ? error.name : "UnknownError",
        sourceId: authentication.source.id,
      });
      return noStoreJson(
        {
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Inventory ingestion is temporarily unavailable",
          },
        },
        { status: 503 },
      );
    }
    if (!sourceLimit.success) {
      return noStoreJson(
        {
          error: {
            code: "RATE_LIMITED",
            message: "This inventory source is sending too many requests",
          },
        },
        {
          status: 429,
          retryAfter: Math.ceil((sourceLimit.reset - Date.now()) / 1000),
        },
      );
    }

    const idempotencyKey = idempotencyKeySchema.safeParse(
      request.headers.get("idempotency-key"),
    );
    if (!idempotencyKey.success) {
      return noStoreJson(
        {
          error: {
            code: "INVALID_IDEMPOTENCY_KEY",
            message:
              "A stable Idempotency-Key header between 8 and 128 characters is required",
          },
        },
        { status: 400 },
      );
    }

    if (authentication.deliveryId) {
      replayKey = `inventory:delivery:${authentication.source.id}:${authentication.deliveryId}`;
      let reserved: unknown;
      try {
        reserved = await getRedisClient().set(replayKey, "processing", {
          nx: true,
          ex: 600,
        });
      } catch (error) {
        console.error("Inventory replay store unavailable", {
          error: error instanceof Error ? error.name : "UnknownError",
          sourceId: authentication.source.id,
        });
        return noStoreJson(
          {
            error: {
              code: "SERVICE_UNAVAILABLE",
              message: "Inventory ingestion is temporarily unavailable",
            },
          },
          { status: 503 },
        );
      }
      if (!reserved) {
        return noStoreJson(
          {
            error: {
              code: "REPLAYED_REQUEST",
              message: "This delivery has already been received",
            },
          },
          { status: 409 },
        );
      }
    }

    let payload: unknown;
    try {
      payload = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(rawBody),
      );
    } catch {
      if (replayKey) await getRedisClient().del(replayKey);
      return noStoreJson(
        {
          error: {
            code: "INVALID_JSON",
            message: "Request body must be valid UTF-8 JSON",
          },
        },
        { status: 400 },
      );
    }
    const parsed = inventoryIngestPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      if (replayKey) await getRedisClient().del(replayKey);
      return noStoreJson(
        {
          error: {
            code: "INVALID_PAYLOAD",
            message:
              "Inventory items must include unique externalItemId values and non-negative availableSqFt quantities",
          },
        },
        { status: 400 },
      );
    }

    const outcome = await processInventoryIngest({
      sourceId: authentication.source.id,
      sellerId: authentication.source.sellerId,
      expectedKeyRotatedAt: authentication.source.keyRotatedAt,
      idempotencyKey: idempotencyKey.data,
      requestHash: hashInventoryIngestBody(rawBody),
      payload: parsed.data,
    });
    if (replayKey) {
      await getRedisClient().set(replayKey, "completed", { ex: 600 });
    }
    return noStoreJson(
      { success: true, replayed: outcome.replayed, ...outcome.result },
      { status: 200 },
    );
  } catch (error) {
    if (replayKey) {
      try {
        await getRedisClient().del(replayKey);
      } catch (cleanupError) {
        console.error("Inventory replay reservation cleanup failed", {
          error:
            cleanupError instanceof Error
              ? cleanupError.name
              : "UnknownError",
        });
      }
    }
    if (error instanceof InventoryIngestError) {
      const status =
        error.code === "SOURCE_DISABLED"
          ? 403
          : error.code === "IDEMPOTENCY_CONFLICT" ||
              error.code === "INGEST_IN_PROGRESS"
            ? 409
            : 500;
      return noStoreJson(
        {
          error: {
            code: error.code,
            message:
              status === 500
                ? "Inventory ingestion could not be completed"
                : error.message,
          },
        },
        { status },
      );
    }
    console.error("Inventory ingest failed", {
      error: error instanceof Error ? error.name : "UnknownError",
    });
    return noStoreJson(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Inventory ingestion could not be completed",
        },
      },
      { status: 500 },
    );
  }
}
