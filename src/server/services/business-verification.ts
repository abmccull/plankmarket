import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { notifications, users } from "@/server/db/schema";
import { sendVerificationApprovedEmail } from "@/lib/email/send";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyBusiness } from "@/server/services/ai-verification";
import { appendAuditEvent } from "@/server/services/audit-ledger";
import {
  assessVerificationAutoApproval,
  getJevVerificationSignals,
  isVerificationAutoApprovalEnabled,
  VERIFICATION_AUTOMATION_POLICY,
  websiteDomain,
} from "@/server/services/verification-automation";
import { verificationStateUpdate } from "@/server/services/verification-state";

export type VerificationProcessingResult =
  | {
      state: "auto_approved" | "pending_review";
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

async function hasConfirmedAccountEmail(authId: string, email: string): Promise<boolean> {
  try {
    const supabase = await createServiceClient();
    const { data, error } = await supabase.auth.admin.getUserById(authId);
    return !error && Boolean(data.user?.email_confirmed_at) && data.user?.email?.toLowerCase() === email.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * Reviews one immutable submission. Only a narrow, opted-in evidence path can
 * approve; every missing, conflicting, or unavailable signal remains with admins.
 * Both branches commit against the pending status and exact submission ID.
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

  if (!user || !user.active || !["buyer", "seller"].includes(user.role) || !user.businessName || !user.einTaxId) {
    return { state: "stale_or_processed", userId, submissionId };
  }
  const submittedBusinessName = user.businessName;
  const submittedEinTaxId = user.einTaxId;

  const result = await verifyBusiness({
    userId,
    businessName: user.businessName,
    einTaxId: user.einTaxId,
    businessWebsite: user.businessWebsite,
    businessLicenseUrl: user.verificationDocUrl,
    role: user.role,
    name: user.name,
    email: user.email,
    businessAddress: user.businessAddress,
    businessState: user.businessState,
  });

  const domain = websiteDomain(user.businessWebsite);
  const jev =
    result.documentAttached && result.documentEvidence?.issuer && domain
      ? await getJevVerificationSignals({
          businessName: user.businessName,
          websiteDomain: domain,
          documentType: result.documentEvidence.documentType,
          issuer: result.documentEvidence.issuer,
        })
      : null;
  const emailConfirmed = isVerificationAutoApprovalEnabled()
    ? await hasConfirmedAccountEmail(user.authId, user.email)
    : false;
  const assessment = assessVerificationAutoApproval({
    role: user.role,
    businessName: user.businessName,
    einTaxId: user.einTaxId,
    businessState: user.businessState,
    businessWebsite: user.businessWebsite,
    email: user.email,
    emailConfirmed,
    documentReference: user.verificationDocUrl,
    result,
    jev,
  });

  // Do not persist transcribed fields or free-form model prose: either could
  // contain tax IDs or other details from the private document.
  const safeResult = {
    score: result.score,
    approved: result.approved,
    reasoning: "Review the policy reasons and private document before deciding.",
    documentAttached: result.documentAttached,
    checks: {
      einFormat: { pass: result.checks.einFormat.pass, note: "Format check" },
      websiteAnalysis: { pass: result.checks.websiteAnalysis.pass, note: "Website consistency check" },
      documentAnalysis: { pass: result.checks.documentAnalysis.pass, note: "Document visibility check" },
      crossReference: { pass: result.checks.crossReference.pass, note: "Cross-reference check" },
      redFlags: { found: result.checks.redFlags.found, note: "Potential concerns check" },
    },
  };
  const reviewNotes = JSON.stringify({
    ...safeResult,
    automation: {
      policy: VERIFICATION_AUTOMATION_POLICY,
      decision: assessment.decision,
      reasons: assessment.reasons,
      jev: jev && {
        model: jev.model,
        domainFit: jev.domainFit,
        issuerFit: jev.issuerFit,
        concern: jev.concern,
      },
    },
  });

  const outcome = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(users)
      .set({
        ...verificationStateUpdate(
          assessment.decision === "auto_approve" ? "verified" : "pending",
        ),
        verificationNotes:
          assessment.decision === "auto_approve"
            ? `Approved by ${VERIFICATION_AUTOMATION_POLICY}`
            : user.verificationNotes,
        aiVerificationScore: result.score,
        aiVerificationNotes: reviewNotes,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(users.id, userId),
          eq(users.verificationStatus, "pending"),
          eq(users.verificationSubmissionId, submissionId),
          eq(users.role, user.role),
          eq(users.active, true),
          eq(users.businessName, submittedBusinessName),
          eq(users.einTaxId, submittedEinTaxId),
          eq(users.email, user.email),
          user.businessWebsite
            ? eq(users.businessWebsite, user.businessWebsite)
            : isNull(users.businessWebsite),
          user.businessState
            ? eq(users.businessState, user.businessState)
            : isNull(users.businessState),
          user.verificationDocUrl
            ? eq(users.verificationDocUrl, user.verificationDocUrl)
            : isNull(users.verificationDocUrl),
          isNull(users.aiVerificationNotes),
        ),
      )
      .returning({ id: users.id });

    if (!updated) return "stale" as const;

    await appendAuditEvent(tx, {
      actorType: "system",
      action:
        assessment.decision === "auto_approve"
          ? "verification.auto_approved"
          : "verification.manual_review_flagged",
      entityType: "user_verification",
      entityId: submissionId,
      idempotencyKey: `verification-triage:${submissionId}`,
      summary:
        assessment.decision === "auto_approve"
          ? "Business verification approved under the document evidence policy"
          : "Business verification sent to an administrator for review",
      metadata: {
        userId,
        role: user.role,
        policy: VERIFICATION_AUTOMATION_POLICY,
        decision: assessment.decision,
        reasons: assessment.reasons,
        score: result.score,
        documentAttached: result.documentAttached,
        jevModel: jev?.model ?? null,
      },
    });

    if (assessment.decision === "auto_approve") {
      await tx.insert(notifications).values({
        userId,
        type: "system",
        title: "Account Verified",
        message: "Your business has been verified. You now have full access to PlankMarket. Review and publish any draft listings when they are ready.",
        read: false,
        data: { type: "verification_decision", submissionId, status: "verified" },
      });
    } else {
      const admins = await tx.query.users.findMany({
        where: and(eq(users.role, "admin"), eq(users.active, true)),
        columns: { id: true },
      });
      if (admins.length) {
        await tx.insert(notifications).values(
          admins.map((admin) => ({
            userId: admin.id,
            type: "system" as const,
            title: "Verification Ready for Review",
            message: `${user.name} (${user.businessName}) needs a human verification decision.`,
            data: { userId, submissionId, score: result.score, reasons: assessment.reasons },
          })),
        );
      }
    }
    return assessment.decision;
  });

  if (outcome === "stale") {
    return { state: "stale_or_processed", userId, submissionId };
  }
  if (outcome === "auto_approve") {
    await sendVerificationApprovedEmail({
      to: user.email,
      name: user.name,
      role: user.role as "buyer" | "seller",
      idempotencyKey: `verification-approved-${submissionId}`,
    }).catch((error) => {
      console.error("Failed to send automated verification approval email", {
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
    });
    return {
      state: "auto_approved",
      userId,
      submissionId,
      score: result.score,
      recommendation: "approve",
    };
  }

  return {
    state: "pending_review",
    userId,
    submissionId,
    score: result.score,
    recommendation: "manual_review",
  };
}
