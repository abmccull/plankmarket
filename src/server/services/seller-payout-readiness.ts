import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { stripe } from "@/lib/stripe";
import type { Database } from "@/server/db";
import { users } from "@/server/db/schema";
import { isStripeConnectAccountReady } from "@/server/services/stripe-connect-policy";

type DbExecutor =
  | Database
  | Parameters<Parameters<Database["transaction"]>[0]>[0];

const SELLER_PAYOUT_READINESS_TIMEOUT_MS = 4_000;

function isLikelyDeauthorizedStripeAccount(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const stripeError = error as {
    type?: string;
    code?: string;
    statusCode?: number;
  };

  return (
    stripeError.type === "StripePermissionError" ||
    (stripeError.type === "StripeInvalidRequestError" &&
      (stripeError.code === "resource_missing" || stripeError.statusCode === 404))
  );
}

export async function assertSellerPayoutReadyForOrderReservation(
  db: DbExecutor,
  sellerId: string,
): Promise<{ stripeAccountId: string }> {
  const [seller] = await db
    .select({
      id: users.id,
      stripeAccountId: users.stripeAccountId,
      stripeOnboardingComplete: users.stripeOnboardingComplete,
    })
    .from(users)
    .where(eq(users.id, sellerId))
    .for("update");

  if (!seller?.stripeAccountId) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Seller cannot currently accept payments for this listing.",
    });
  }

  let ready = seller.stripeOnboardingComplete;
  try {
    const account = await stripe.accounts.retrieve(seller.stripeAccountId, {
      timeout: SELLER_PAYOUT_READINESS_TIMEOUT_MS,
      maxNetworkRetries: 0,
    });
    ready = isStripeConnectAccountReady(account);
  } catch (error) {
    if (isLikelyDeauthorizedStripeAccount(error)) {
      await db
        .update(users)
        .set({
          stripeOnboardingComplete: false,
          updatedAt: new Date(),
        })
        .where(eq(users.id, seller.id));

      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Seller cannot currently accept payments for this listing.",
      });
    }

    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message:
        "Seller payout readiness could not be confirmed. Please try again.",
    });
  }

  if (ready !== seller.stripeOnboardingComplete) {
    await db
      .update(users)
      .set({
        stripeOnboardingComplete: ready,
        updatedAt: new Date(),
      })
      .where(eq(users.id, seller.id));
  }

  if (!ready) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Seller cannot currently accept payments for this listing.",
    });
  }

  return { stripeAccountId: seller.stripeAccountId };
}
