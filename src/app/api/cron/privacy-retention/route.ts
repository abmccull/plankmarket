import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { env } from "@/env";
import { runPrivacyRetentionSweep } from "@/server/services/privacy-retention";

function safeCompareBearerToken(
  authHeader: string | null,
  expectedSecret: string,
): boolean {
  if (!authHeader?.startsWith("Bearer ")) return false;
  const providedToken = authHeader.slice("Bearer ".length);
  const expectedBuffer = Buffer.from(expectedSecret);
  const providedBuffer = Buffer.from(providedToken);

  if (expectedBuffer.length !== providedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, providedBuffer);
}

export async function GET(req: NextRequest) {
  if (!env.CRON_SECRET) {
    console.error("CRON_SECRET is missing; rejecting cron request");
    return NextResponse.json(
      { error: "Cron endpoint misconfigured" },
      { status: 500 },
    );
  }

  const authHeader = req.headers.get("authorization");
  if (!safeCompareBearerToken(authHeader, env.CRON_SECRET)) {
    console.warn("Unauthorized cron access attempt", {
      path: req.nextUrl.pathname,
      hasAuthHeader: Boolean(authHeader),
      userAgent: req.headers.get("user-agent"),
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runPrivacyRetentionSweep();
    const retentionBlocked =
      [result.listingPhotoResidue, result.listingPhotoAbandoned].some(queue => queue && (queue.failed > 0 || queue.stale > 0 || queue.budgetExhausted || queue.hasMore)) ||
      result.verificationDraftProviderDeletionFailed > 0 ||
      result.verificationDraftProviderRetentionBlocked > 0 ||
      result.verificationProviderDeletionFailed > 0 ||
      result.verificationProviderRetentionBlocked > 0 ||
      result.sellerActivationProviderDeletionFailed > 0 ||
      result.sellerActivationProviderRetentionBlocked > 0 ||
      (result.verificationResidue !== undefined && (
        result.verificationResidue.failed > 0 || result.verificationResidue.stale > 0 ||
        result.verificationResidue.budgetExhausted || result.verificationResidue.hasMore
      ));

    if (retentionBlocked) {
      console.error("Privacy retention sweep left provider-backed records due", {
        result,
      });
      return NextResponse.json(
        {
          error: "Privacy retention sweep incomplete",
          result,
        },
        { status: 409 },
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Privacy retention sweep failed", {
      error: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      { error: "Privacy retention sweep failed" },
      { status: 500 },
    );
  }
}
