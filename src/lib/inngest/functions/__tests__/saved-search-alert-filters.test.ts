import { describe, expect, it, vi } from "vitest";
import { and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { listings } from "@/server/db/schema";
import * as schema from "@/server/db/schema";
import type { SearchFilters } from "@/types";

vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    createFunction: vi.fn(() => ({ id: "saved-search" })),
  },
}));

vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/lib/email/delivery", () => ({ sendEmailOrThrow: vi.fn() }));
vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_APP_URL: "https://plankmarket.example",
    EMAIL_FROM: "PlankMarket <noreply@plankmarket.example>",
  },
}));

const { buildDigestListingConditions } = await import("../saved-search-alerts");

const mockDb = drizzle.mock({ schema });

function buildSearch(filters: SearchFilters) {
  return {
    id: "d5f1d0d8-9c01-42b8-b069-5138f6b2f0a1",
    userId: "1caef77e-39e6-41fe-82fd-8f56612eb0f0",
    name: "Confidence filters",
    filters,
    lastAlertAt: null,
    alertFrequency: "daily" as const,
    alertChannels: ["email"] as Array<"email" | "in_app">,
    userEmail: "buyer@example.com",
    userName: "Buyer",
    userRole: "buyer" as const,
    userVerificationStatus: "verified" as const,
    userBusinessState: "CO",
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
  };
}

describe("saved-search digest filter SQL", () => {
  it("keeps boolean filter semantics aligned with public browse SQL", () => {
    const now = new Date("2026-08-03T12:00:00.000Z");
    const query = mockDb
      .select({ id: listings.id })
      .from(listings)
      .where(
        and(
          ...buildDigestListingConditions(
            buildSearch({
              sellerVerified: true,
              freightReady: true,
              fullLotOnly: false,
            }),
            new Date("2026-08-02T12:00:00.000Z"),
            now,
          ),
        ),
      )
      .toSQL();

    expect(query.sql).toContain('"users"."verification_status" = \'verified\'');
    expect(query.sql).toContain('"users"."business_address"');
    expect(query.sql).toContain('"users"."phone"');
    expect(query.sql).toContain('"listings"."full_lot_only" = $');
    expect(query.params).toContain(false);
    expect(query.params).not.toContain(true);
  });
});
