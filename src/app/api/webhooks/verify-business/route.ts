import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRedisClient } from "@/lib/redis/client";
import { processBusinessVerification } from "@/server/services/business-verification";
import {
  VERIFICATION_WEBHOOK_MAX_BODY_BYTES,
  VERIFICATION_WEBHOOK_REPLAY_TTL_SECONDS,
  verificationWebhookReplayKey,
  verifyVerificationWebhookSignature,
} from "@/server/security/verification-webhook";

const requestSchema = z.object({
  userId: z.string().uuid(),
  submissionId: z.string().uuid(),
});

const deliveryIdSchema = z.string().uuid();

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

/**
 * Compatibility endpoint for trusted internal callers. New submissions use
 * Inngest, but both paths share the same pending-status/submission-ID CAS and
 * can only generate evidence for human review. Callers sign
 * `${x-plankmarket-timestamp}.${rawBody}` with HMAC-SHA256 and provide a
 * unique UUID in x-plankmarket-delivery-id.
 */
export async function POST(request: NextRequest) {
  try {
    const expectedSecret = process.env.VERIFICATION_WEBHOOK_SECRET;

    if (!expectedSecret) {
      console.error("VERIFICATION_WEBHOOK_SECRET not configured");
      return NextResponse.json(
        { error: { code: "SERVER_ERROR", message: "Webhook not configured" } },
        { status: 500 },
      );
    }

    if (
      !request.headers
        .get("content-type")
        ?.toLowerCase()
        .startsWith("application/json")
    ) {
      return NextResponse.json(
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
      declaredLength > VERIFICATION_WEBHOOK_MAX_BODY_BYTES
    ) {
      return NextResponse.json(
        { error: { code: "PAYLOAD_TOO_LARGE", message: "Payload too large" } },
        { status: 413 },
      );
    }

    const rawBody = await readBoundedBody(
      request,
      VERIFICATION_WEBHOOK_MAX_BODY_BYTES,
    );
    if (!rawBody) {
      return NextResponse.json(
        { error: { code: "PAYLOAD_TOO_LARGE", message: "Payload too large" } },
        { status: 413 },
      );
    }

    const timestamp = request.headers.get("x-plankmarket-timestamp");
    const signature = request.headers.get("x-plankmarket-signature");
    const deliveryId = deliveryIdSchema.safeParse(
      request.headers.get("x-plankmarket-delivery-id"),
    );
    if (
      !deliveryId.success ||
      !verifyVerificationWebhookSignature({
        secret: expectedSecret,
        timestamp,
        signature,
        body: rawBody,
      })
    ) {
      return NextResponse.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Invalid webhook signature",
          },
        },
        { status: 401 },
      );
    }

    let payload: unknown;
    try {
      payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBody));
    } catch {
      return NextResponse.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "Request body must be valid UTF-8 JSON",
          },
        },
        { status: 400 },
      );
    }

    const parsed = requestSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "A valid userId and submissionId are required",
          },
        },
        { status: 400 },
      );
    }

    const redis = getRedisClient();
    const replayKey = verificationWebhookReplayKey(deliveryId.data);
    let reserved: unknown;
    try {
      reserved = await redis.set(replayKey, "processing", {
        nx: true,
        ex: VERIFICATION_WEBHOOK_REPLAY_TTL_SECONDS,
      });
    } catch (error) {
      console.error("Verification webhook replay store unavailable", {
        error: error instanceof Error ? error.name : "UnknownError",
      });
      return NextResponse.json(
        {
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Webhook verification is temporarily unavailable",
          },
        },
        { status: 503 },
      );
    }

    if (!reserved) {
      return NextResponse.json(
        { success: true, replayed: true },
        { status: 200 },
      );
    }

    try {
      const result = await processBusinessVerification(parsed.data);
      await redis.set(replayKey, "completed", {
        ex: VERIFICATION_WEBHOOK_REPLAY_TTL_SECONDS,
      });
      return NextResponse.json({ success: true, ...result }, { status: 200 });
    } catch (error) {
      // Processing did not complete, so release the reservation and allow the
      // trusted caller to retry with a newly timestamped signature.
      try {
        await redis.del(replayKey);
      } catch (cleanupError) {
        console.error("Failed to release verification webhook replay key", {
          error:
            cleanupError instanceof Error
              ? cleanupError.name
              : "UnknownError",
        });
      }
      throw error;
    }
  } catch (error) {
    console.error("Verification webhook error", {
      error: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred during verification",
        },
      },
      { status: 500 },
    );
  }
}
