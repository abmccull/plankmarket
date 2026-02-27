import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { db } from "@/server/db";
import { users, notifications, listings } from "@/server/db/schema";
import { eq, and } from "drizzle-orm";
import { verifyBusiness } from "@/server/services/ai-verification";
import { sendVerificationApprovedEmail } from "@/lib/email/send";

/**
 * Performs constant-time string comparison to prevent timing attacks
 */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Internal webhook for AI-powered business verification
 * Triggers Claude AI analysis of a user's verification submission
 *
 * Security: Requires x-webhook-secret header to match VERIFICATION_WEBHOOK_SECRET
 */
export async function POST(request: NextRequest) {
  try {
    // Validate webhook secret
    const webhookSecret = request.headers.get("x-webhook-secret");
    const expectedSecret = process.env.VERIFICATION_WEBHOOK_SECRET;

    if (!expectedSecret) {
      console.error("VERIFICATION_WEBHOOK_SECRET not configured");
      return NextResponse.json(
        { error: { code: "SERVER_ERROR", message: "Webhook not configured" } },
        { status: 500 },
      );
    }

    if (!webhookSecret || !safeCompare(webhookSecret, expectedSecret)) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Invalid webhook secret" } },
        { status: 401 },
      );
    }

    // Parse request body
    const body = await request.json();
    const { userId } = body;

    if (!userId || typeof userId !== "string") {
      return NextResponse.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "userId is required and must be a string",
          },
        },
        { status: 400 },
      );
    }

    // Fetch user from database
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: `User with id ${userId} not found`,
          },
        },
        { status: 404 },
      );
    }

    // Validate required fields for verification
    if (!user.businessName || !user.einTaxId) {
      return NextResponse.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "User missing required verification fields",
          },
        },
        { status: 400 },
      );
    }

    // Call AI verification service
    const verificationResult = await verifyBusiness({
      businessName: user.businessName,
      einTaxId: user.einTaxId,
      businessWebsite: user.businessWebsite,
      businessLicenseUrl: user.verificationDocUrl,
      role: user.role,
      name: user.name,
      email: user.email,
      businessAddress: user.businessAddress,
    });

    // Prepare update data
    const updateData: {
      aiVerificationScore: number;
      aiVerificationNotes: string;
      verificationStatus: "verified" | "pending";
      verified: boolean;
    } = {
      aiVerificationScore: verificationResult.score,
      aiVerificationNotes: JSON.stringify(verificationResult),
      verificationStatus: "pending",
      verified: false,
    };

    // Auto-approve only when model marks approved
    if (verificationResult.approved) {
      updateData.verificationStatus = "verified";
      updateData.verified = true;
    }

    // Update user record
    await db.update(users).set(updateData).where(eq(users.id, userId));

    // Send notification if approved
    if (verificationResult.approved) {
      // Auto-promote draft listings to active
      await db
        .update(listings)
        .set({ status: "active" })
        .where(and(eq(listings.sellerId, userId), eq(listings.status, "draft")));

      await db.insert(notifications).values({
        userId,
        type: "system",
        title: "Business Verified",
        message:
          "Your business has been automatically verified. You now have full access to the marketplace.",
      });

      // Send verification approved email (fire-and-forget)
      sendVerificationApprovedEmail({
        to: user.email,
        name: user.name,
        role: user.role as "buyer" | "seller",
      }).catch((err) => {
        console.error("Failed to send verification email:", err);
      });
    } else {
      // Score < 90: notify admins that manual review is needed
      const admins = await db.query.users.findMany({
        where: eq(users.role, "admin"),
      });

      if (admins.length > 0) {
        await db.insert(notifications).values(
          admins.map((admin) => ({
            userId: admin.id,
            type: "system" as const,
            title: "Verification Needs Review",
            message: `${user.name} (${user.businessName}) scored ${verificationResult.score}/100 and needs manual review.`,
            data: { userId, score: verificationResult.score },
          })),
        );
      }
    }

    return NextResponse.json(
      {
        success: true,
        userId,
        score: verificationResult.score,
        approved: verificationResult.approved,
        status: updateData.verificationStatus,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Webhook error:", error);

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "An unexpected error occurred",
        },
      },
      { status: 500 },
    );
  }
}
