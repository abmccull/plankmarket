import { inngest } from "../client";
import { db } from "@/server/db";
import { users, userPreferences, listings, savedSearches } from "@/server/db/schema";
import { eq, sql } from "drizzle-orm";
import { sendOnboardingNudgeEmail } from "@/lib/email/send";

interface UserRegisteredEvent {
  data: {
    userId: string;
    email: string;
    name: string;
    role: "buyer" | "seller";
  };
}

export const onboardingDrip = inngest.createFunction(
  { id: "onboarding-drip", name: "Onboarding Drip Sequence" },
  { event: "user/registered" },
  async ({ event, step }) => {
    const { userId, email, name, role } = event.data as UserRegisteredEvent["data"];

    // Day 1: "Complete your profile" nudge (24h after registration)
    await step.sleep("wait-day-1", "24h");

    const day1Needed = await step.run("check-day1", async () => {
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });
      if (!user || !user.active) return false;
      // Skip if profile is already complete
      return !(user.name && user.businessName && user.phone);
    });

    if (day1Needed) {
      await step.run("send-day1", async () => {
        await sendOnboardingNudgeEmail({ to: email, name, role, step: "day1" });
      });
    }

    // Day 3: Role-specific tips (48h after day 1)
    await step.sleep("wait-day-3", "48h");

    const day3Needed = await step.run("check-day3", async () => {
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });
      if (!user || !user.active) return false;

      if (role === "seller") {
        // Skip if they already have a listing or connected Stripe
        const [listingCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(listings)
          .where(eq(listings.sellerId, userId));
        return (listingCount?.count ?? 0) === 0 && !user.stripeOnboardingComplete;
      } else {
        // Skip if they've set preferences or saved a search
        const prefs = await db.query.userPreferences.findFirst({
          where: eq(userPreferences.userId, userId),
        });
        const [searchCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(savedSearches)
          .where(eq(savedSearches.userId, userId));
        return !prefs?.profileComplete && (searchCount?.count ?? 0) === 0;
      }
    });

    if (day3Needed) {
      await step.run("send-day3", async () => {
        await sendOnboardingNudgeEmail({ to: email, name, role, step: "day3" });
      });
    }

    // Day 7: "Need help?" (96h after day 3)
    await step.sleep("wait-day-7", "96h");

    const day7Needed = await step.run("check-day7", async () => {
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });
      if (!user || !user.active) return false;

      // Check if user is still largely un-onboarded
      const prefs = await db.query.userPreferences.findFirst({
        where: eq(userPreferences.userId, userId),
      });

      if (role === "seller") {
        const [listingCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(listings)
          .where(eq(listings.sellerId, userId));
        // Skip if they have listings AND Stripe connected
        return !((listingCount?.count ?? 0) > 0 && user.stripeOnboardingComplete);
      } else {
        const [searchCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(savedSearches)
          .where(eq(savedSearches.userId, userId));
        // Skip if they have prefs AND saved searches
        return !(prefs?.profileComplete && (searchCount?.count ?? 0) > 0);
      }
    });

    if (day7Needed) {
      await step.run("send-day7", async () => {
        await sendOnboardingNudgeEmail({ to: email, name, role, step: "day7" });
      });
    }

    return { completed: true, userId };
  }
);
