import { describe, expect, it } from "vitest";
import type { Notification } from "@/server/db/schema/notifications";
import { getNotificationHref } from "../notification-href";

const NOTICE = "11111111-1111-4111-8111-111111111111";
const TARGET = "22222222-2222-4222-8222-222222222222";
const SECOND = "33333333-3333-4333-8333-333333333333";
const roles = ["buyer", "seller", "admin", null, undefined] as const;
function notice(data: Record<string, unknown> | null, type: Notification["type"] = "system") {
  return { id: NOTICE, type, data } satisfies Pick<Notification, "id" | "type" | "data">;
}
const transactions: Array<[string, ReturnType<typeof notice>]> = [
  ["purchase order", notice({ orderId: TARGET }, "order_confirmed")],
  ["sale order", notice({ orderId: TARGET, recipientSide: "seller" }, "payment_received")],
  ["new sample", notice({ type: "sample_request_created", sampleRequestId: TARGET })],
  ["approved sample", notice({ type: "sample_request_updated", sampleRequestId: TARGET, action: "approve" })],
  ["cancelled sample", notice({ type: "sample_request_updated", sampleRequestId: TARGET, action: "cancel" })],
  ["new offer", notice({ offerId: TARGET }, "new_offer")],
  ["system offer", notice({ offerId: TARGET, type: "offer_countered" })],
  ["conversation", notice({ conversationId: TARGET })],
];

describe("notification links enter the owned server destination resolver", () => {
  it.each(transactions)("%s is canonical for every account and workspace hint", (_name, item) => {
    for (const role of roles) {
      expect(getNotificationHref(item, role)).toBe(`/notifications/${NOTICE}`);
      expect(getNotificationHref({ ...item, data: { ...item.data, recipientSide: role, workspace: role, href: "https://example.invalid/forged" } }, role)).toBe(`/notifications/${NOTICE}`);
    }
  });

  it.each([undefined, null, "", "bad-id", "../buyer/orders", {}, 42])("rejects missing/malformed notification id %j", (id) => {
    for (const [, item] of transactions) {
      expect(getNotificationHref({ ...item, id } as unknown as Parameters<typeof getNotificationHref>[0], "seller")).toBeNull();
    }
  });

  it("preserves a safe canonical link for legacy malformed transaction references; the server decides access", () => {
    expect(getNotificationHref(notice({ orderId: "not-a-uuid", recipientSide: "buyer" }), "seller")).toBe(`/notifications/${NOTICE}`);
  });
});

describe("saved-search notifications behave consistently for every account", () => {
  it("uses a saved search query first", () => {
    for (const role of roles) expect(getNotificationHref(notice({ savedSearchId: TARGET, searchQuery: "material=engineered&minSqFt=400", matchingListingIds: [SECOND] }, "listing_match"), role)).toBe("/listings?material=engineered&minSqFt=400");
  });

  it("uses the first valid matching UUID rather than the first raw entry", () => {
    for (const role of roles) expect(getNotificationHref(notice({ savedSearchId: TARGET, matchingListingIds: [null, "../private", "not-a-uuid", SECOND, TARGET] }, "listing_match"), role)).toBe(`/listings/${SECOND}`);
  });

  it.each([undefined, [], [null, "not-a-uuid", {}, "https://example.invalid"]])("falls back to saved-search settings with no valid matches: %j", (matchingListingIds) => {
    for (const role of roles) expect(getNotificationHref(notice({ savedSearchId: TARGET, matchingListingIds }, "listing_match"), role)).toBe("/settings/saved-searches");
  });
});

describe("ordinary notification links retain existing destinations", () => {
  it.each([
    [notice({ listingSlug: "engineered-oak-lot" }, "listing_match"), "/listings/engineered-oak-lot"],
    [notice({ listingId: TARGET }, "listing_match"), `/listings/${TARGET}`],
    [notice(null, "listing_expiring"), "/seller/listings"],
    [notice({ batchId: TARGET }), "/seller/listings"],
    [notice({ type: "response_accepted" }), "/seller/request-board"],
    [notice({ type: "request_response" }), "/buyer/requests"],
    [notice(null), null],
  ] as const)("retains the nontransaction route %s", (item, href) => {
    expect(getNotificationHref(item, "seller")).toBe(href);
  });
});
