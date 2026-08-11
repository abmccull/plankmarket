import { describe, expect, it } from "vitest";
import {
  KNOWN_MARKETPLACE_FIXTURE_EMAILS,
  KNOWN_MARKETPLACE_FIXTURE_SIGNATURE_SQL,
  KNOWN_MARKETPLACE_FIXTURE_USER_THRESHOLD,
  PLACEHOLDER_VERIFICATION_DOC_PREFIX,
  SEED_PAYMENT_INTENT_PREFIX,
  SEED_PROMOTION_PAYMENT_INTENT_PREFIX,
} from "../../scripts/audit-marketplace-data.mjs";

describe("marketplace data audit fixture detector", () => {
  it("pins the current explicit seed signatures", () => {
    expect(KNOWN_MARKETPLACE_FIXTURE_EMAILS).toEqual([
      "admin@plankmarket.com",
      "sarah@mitchellflooring.com",
      "james@chenfloors.com",
      "maria@garciahardwoods.com",
      "robert@thompsonlumber.com",
      "emily@davisflooring.com",
      "michael@browncontracting.com",
      "lisa@wilsonrenovations.com",
    ]);
    expect(KNOWN_MARKETPLACE_FIXTURE_USER_THRESHOLD).toBe(3);
    expect(SEED_PAYMENT_INTENT_PREFIX).toBe("pi_seed_");
    expect(SEED_PROMOTION_PAYMENT_INTENT_PREFIX).toBe("pi_seed_promo_");
    expect(PLACEHOLDER_VERIFICATION_DOC_PREFIX).toBe(
      "https://placehold.co/800x600/EEE/999?text=",
    );
  });

  it("targets only explicit fixture markers in SQL", () => {
    expect(KNOWN_MARKETPLACE_FIXTURE_SIGNATURE_SQL).toContain(
      "stripe_payment_intent_id like 'pi_seed_%'",
    );
    expect(KNOWN_MARKETPLACE_FIXTURE_SIGNATURE_SQL).toContain(
      "stripe_payment_intent_id like 'pi_seed_promo_%'",
    );
    expect(KNOWN_MARKETPLACE_FIXTURE_SIGNATURE_SQL).toContain(
      "verification_doc_url like 'https://placehold.co/800x600/EEE/999?text=%'",
    );
    expect(KNOWN_MARKETPLACE_FIXTURE_SIGNATURE_SQL).toContain(
      "'sarah@mitchellflooring.com'",
    );
    expect(KNOWN_MARKETPLACE_FIXTURE_SIGNATURE_SQL).toContain(
      "'lisa@wilsonrenovations.com'",
    );
  });
});
