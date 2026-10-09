import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { PgDialect } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import {
  isListingTerritoryVisibleToViewer,
  publicActiveListingWhere,
  resolveTerritoryViewerScope,
  type ListingVisibilityViewer,
} from "@/server/security/listing-visibility";

const SELLER_ID = "11111111-1111-4111-8111-111111111111";
const BUYER_ID = "22222222-2222-4222-8222-222222222222";

function viewer(
  overrides: Partial<NonNullable<ListingVisibilityViewer>>,
): NonNullable<ListingVisibilityViewer> {
  return {
    id: BUYER_ID,
    role: "buyer",
    verificationStatus: "verified",
    businessState: "CO",
    ...overrides,
  };
}

const restrictedListing = {
  sellerId: SELLER_ID,
  territoryMode: "allowed_states" as const,
  allowedDestinationStates: ["CO", "WY"],
};

describe("listing territory visibility", () => {
  it("hides restricted inventory from anonymous viewers", () => {
    expect(isListingTerritoryVisibleToViewer(restrictedListing, null)).toBe(
      false,
    );
  });

  it.each([
    ["unverified state", "unverified", "CO"],
    ["pending verification", "pending", "CO"],
    ["invalid state", "verified", "NA"],
    ["missing state", "verified", null],
  ])(
    "hides restricted inventory when the buyer has %s",
    (_label, verificationStatus, businessState) => {
      expect(
        isListingTerritoryVisibleToViewer(
          restrictedListing,
          viewer({ verificationStatus, businessState }),
        ),
      ).toBe(false);
    },
  );

  it("shows restricted inventory to an allowed verified buyer", () => {
    expect(
      isListingTerritoryVisibleToViewer(
        restrictedListing,
        viewer({ businessState: "co" }),
      ),
    ).toBe(true);
  });

  it("hides restricted inventory from a blocked verified buyer", () => {
    expect(
      isListingTerritoryVisibleToViewer(
        restrictedListing,
        viewer({ businessState: "UT" }),
      ),
    ).toBe(false);
  });

  it("shows a seller their own restricted inventory but not another seller's", () => {
    expect(
      isListingTerritoryVisibleToViewer(
        restrictedListing,
        viewer({ id: SELLER_ID, role: "seller", businessState: null }),
      ),
    ).toBe(true);
    expect(
      isListingTerritoryVisibleToViewer(
        restrictedListing,
        viewer({ role: "seller", businessState: null }),
      ),
    ).toBe(false);
  });

  it("shows restricted inventory to admins", () => {
    expect(
      isListingTerritoryVisibleToViewer(
        restrictedListing,
        viewer({ role: "admin", businessState: null }),
      ),
    ).toBe(true);
  });

  it("preserves unrestricted listings for every viewer", () => {
    const unrestricted = {
      ...restrictedListing,
      territoryMode: "unrestricted" as const,
      allowedDestinationStates: [],
    };

    expect(isListingTerritoryVisibleToViewer(unrestricted, null)).toBe(true);
    expect(
      isListingTerritoryVisibleToViewer(
        unrestricted,
        viewer({
          verificationStatus: "unverified",
          businessState: null,
        }),
      ),
    ).toBe(true);
  });

  it("fails closed for empty or invalid restricted policies", () => {
    expect(
      isListingTerritoryVisibleToViewer(
        { ...restrictedListing, allowedDestinationStates: [] },
        viewer({ businessState: "CO" }),
      ),
    ).toBe(false);
    expect(
      isListingTerritoryVisibleToViewer(
        {
          ...restrictedListing,
          allowedDestinationStates: ["CO", "ZZ"],
        },
        viewer({ businessState: "CO" }),
      ),
    ).toBe(false);
  });

  it("uses verified profile state as the buyer SQL visibility scope", () => {
    expect(
      resolveTerritoryViewerScope(
        viewer({ verificationStatus: "verified", businessState: "co" }),
      ),
    ).toEqual({ kind: "buyer_state", destinationState: "CO" });
    expect(
      resolveTerritoryViewerScope(
        viewer({ verificationStatus: "unverified", businessState: "CO" }),
      ),
    ).toEqual({ kind: "unrestricted_only" });
  });

  it("puts territory filtering inside the public SQL predicate", () => {
    const dialect = new PgDialect();
    const buyerQuery = dialect.sqlToQuery(
      publicActiveListingWhere(
        new Date("2030-01-01T00:00:00.000Z"),
        viewer({ businessState: "CO" }),
      )!,
    );
    const anonymousQuery = dialect.sqlToQuery(
      publicActiveListingWhere(new Date("2030-01-01T00:00:00.000Z"), null)!,
    );

    expect(buyerQuery.sql).toContain("territory_mode");
    expect(buyerQuery.sql).toContain("jsonb_array_elements_text");
    expect(buyerQuery.params).toContain(JSON.stringify(["CO"]));
    expect(anonymousQuery.sql).toContain("territory_mode");
    expect(anonymousQuery.params).toContain("unrestricted");
    expect(anonymousQuery.sql).not.toContain("jsonb_array_elements_text");
  });
});


describe("seller sourcing territory", () => {
  it("shows another seller's eligible territory to a verified seller", () => {
    expect(isListingTerritoryVisibleToViewer(restrictedListing, viewer({role:"seller"}))).toBe(true);
    const query=new PgDialect().sqlToQuery(publicActiveListingWhere(new Date("2030-01-01"),viewer({role:"seller"}))!);
    expect(query.sql).toContain("seller_id");
    expect(query.sql).toContain("jsonb_array_elements_text");
    expect(query.params).toContain(BUYER_ID);
    expect(query.params).toContain('["CO"]');
  });
  it.each([{businessState:"UT"},{businessState:null},{verificationStatus:"pending"},{verificationStatus:"unverified"},{verificationStatus:"rejected"}])("retains verified-state restrictions: %j", (overrides) => {
    expect(isListingTerritoryVisibleToViewer(restrictedListing,viewer({role:"seller",...overrides}))).toBe(false);
  });
  it("rejects malformed policies for a purchasing seller",()=>{
    expect(isListingTerritoryVisibleToViewer({...restrictedListing,allowedDestinationStates:["CO","ZZ"]},viewer({role:"seller"}))).toBe(false);
  });
});

// Explicit loopback-only integration opt-in; ignores application credentials.
// Uses connection-local tables, never application inventory.
describe.skipIf(process.env.DUAL_CAPABILITY_DB_PROOF !== "1")("seller sourcing SQL on disposable PostgreSQL", () => {
  let connection: ReturnType<typeof postgres>;
  beforeAll(async () => {
    connection = postgres("postgresql://postgres@127.0.0.1:55439/plankmarket_bootstrap_design_20260929", { max: 1, connect_timeout: 3 });
    const [identity] = await connection`select current_database() as name, host(inet_server_addr()) as address`;
    expect(identity.name).toBe("plankmarket_bootstrap_design_20260929");
    expect(identity.address).toBe("127.0.0.1");
    // Match the application's Drizzle JSON serializers; raw postgres.js would
    // otherwise encode the already-serialized JSON predicate parameters twice.
    drizzle(connection);
    await connection`create temporary table listings (id text primary key, seller_id uuid not null, status text not null, last_confirmed_at timestamptz, confirmation_due_at timestamptz, territory_mode text, allowed_destination_states jsonb)`;
    await connection`insert into pg_temp.listings values
      ('unrestricted', ${SELLER_ID}, 'active', '2029-01-01', '2031-01-01', 'unrestricted', '[]'),
      ('allowed', ${SELLER_ID}, 'active', '2029-01-01', '2031-01-01', 'allowed_states', '["CO"]'),
      ('blocked', ${SELLER_ID}, 'active', '2029-01-01', '2031-01-01', 'allowed_states', '["UT"]'),
      ('invalid', ${SELLER_ID}, 'active', '2029-01-01', '2031-01-01', 'allowed_states', '["CO", "ZZ"]'),
      ('null-item', ${SELLER_ID}, 'active', '2029-01-01', '2031-01-01', 'allowed_states', '["CO", null]'),
      ('object', ${SELLER_ID}, 'active', '2029-01-01', '2031-01-01', 'allowed_states', '{"CO": true}'),
      ('empty', ${SELLER_ID}, 'active', '2029-01-01', '2031-01-01', 'allowed_states', '[]'),
      ('own', ${BUYER_ID}, 'active', '2029-01-01', '2031-01-01', 'allowed_states', '["UT"]'),
      ('own-stale', ${BUYER_ID}, 'active', '2029-01-01', '2029-12-31', 'unrestricted', '[]'),
      ('own-draft', ${BUYER_ID}, 'draft', '2029-01-01', '2031-01-01', 'unrestricted', '[]'),
      ('unconfirmed', ${SELLER_ID}, 'active', null, '2031-01-01', 'unrestricted', '[]')`;
  });
  afterAll(async () => { if (connection) await connection.end({ timeout: 2 }); });

  it.each([
    { verificationStatus: "verified", businessState: "CO", expected: ["allowed", "own", "unrestricted"] },
    { verificationStatus: "pending", businessState: "CO", expected: ["own", "unrestricted"] },
    { verificationStatus: "unverified", businessState: "CO", expected: ["own", "unrestricted"] },
    { verificationStatus: "rejected", businessState: "CO", expected: ["own", "unrestricted"] },
    { verificationStatus: "verified", businessState: null, expected: ["own", "unrestricted"] },
    { verificationStatus: "verified", businessState: "ZZ", expected: ["own", "unrestricted"] },
    { verificationStatus: "verified", businessState: "UT", expected: ["blocked", "own", "unrestricted"] },
  ])("filters inventory for $verificationStatus / $businessState", async ({ verificationStatus, businessState, expected }) => {
    const query = new PgDialect().sqlToQuery(publicActiveListingWhere(new Date("2030-01-01"), viewer({ role: "seller", verificationStatus, businessState }))!);
    const rows = await connection.unsafe(`select id from pg_temp.listings as listings where ${query.sql} order by id`, query.params as string[]);
    expect(rows.map(row => row.id)).toEqual(expected);
  });
});
