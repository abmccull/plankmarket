import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { notifications, users } from "@/server/db/schema";
import { verifyBusiness } from "@/server/services/ai-verification";
import { verificationStateUpdate } from "@/server/services/verification-state";

export type VerificationProcessingResult =
  | {
      state: "pending_review";
      userId: string;
      submissionId: string;
      score: number;
      recommendation: "approve" | "manual_review";
    }
  | {
      state: "stale_or_processed";
      userId: string;
      submissionId: string;
    };

/**
 * Produces advisory evidence for the admin queue. AI output can never grant
 * authorization: the user remains pending until updateVerification performs a
 * human decision with the same submission ID.
 */
export async function processBusinessVerification(params: {
  userId: string;
  submissionId: string;
}): Promise<VerificationProcessingResult> {
  const { userId, submissionId } = params;

  const user = await db.query.users.findFirst({
    where: and(
      eq(users.id, userId),
      eq(users.verificationStatus, "pending"),
      eq(users.verificationSubmissionId, submissionId),
      isNull(users.aiVerificationNotes),
    ),
  });

  if (!user || !user.businessName || !user.einTaxId) {
    return { state: "stale_or_processed", userId, submissionId };
  }

  const result = await verifyBusiness({
    businessName: user.businessName,
    einTaxId: user.einTaxId,
    businessWebsite: user.businessWebsite,
    businessLicenseUrl: user.verificationDocUrl,
    role: user.role,
    name: user.name,
    email: user.email,
    businessAddress: user.businessAddress,
  });

  const [updated] = await db
    .update(users)
    .set({
      ...verificationStateUpdate("pending"),
      aiVerificationScore: result.score,
      aiVerificationNotes: JSON.stringify(result),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(users.id, userId),
        eq(users.verificationStatus, "pending"),
        eq(users.verificationSubmissionId, submissionId),
        isNull(users.aiVerificationNotes),
      ),
    )
    .returning({ id: users.id });

  if (!updated) {
    return { state: "stale_or_processed", userId, submissionId };
  }

  const admins = await db.query.users.findMany({
    where: and(eq(users.role, "admin"), eq(users.active, true)),
    columns: { id: true },
  });
  if (admins.length > 0) {
    await db.insert(notifications).values(
      admins.map((admin) => ({
        userId: admin.id,
        type: "system" as const,
        title: "Verification Ready for Review",
        message: `${user.name} (${user.businessName}) has an automated evidence score of ${result.score}/100 and requires a human decision.`,
        data: { userId, submissionId, score: result.score },
      })),
    );
  }

  return {
    state: "pending_review",
    userId,
    submissionId,
    score: result.score,
    recommendation: result.approved ? "approve" : "manual_review",
  };
}
