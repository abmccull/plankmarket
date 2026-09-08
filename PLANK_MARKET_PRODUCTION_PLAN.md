# Plank Market Production Plan

Updated 2026-09-08. Reviewed local base `7df15b46ba982625f9508df89da72efc80d8c245`; changes in this working tree are not deployed. This plan records verified implementation separately from launch requirements. Detailed evidence: [product review](docs/PRODUCT_ARCHITECTURE_REVIEW_2026-09-08.md) and [design audit](docs/design-audit-report.md).

## Remediation update

The follow-up implementation is documented in [production remediation](docs/PRODUCTION_REMEDIATION_2026-09-08.md). Transfer-history ambiguity now fails closed; expiry batches advance fairly with full timestamp precision and operator cases. Search includes model-number tokens, disabled promotion benefits are hidden, and deployment validation protects secrets and requires service configuration.

A schema-only export now restores an empty isolated PostgreSQL database through a guarded script and passes schema 0034 readiness. Historical migrations remain preserved; hosted Supabase baseline adoption is still gated. Current Vercel settings were read directly: the earlier six local settings are configured there, but **RESEND_API_KEY is missing in production**. Populated authenticated staging and provider journeys still require dedicated setup. No remote records, payment flows, provider configuration or deployment were mutated.

Latest local verification: 1,177 full-suite tests plus one separate bootstrap safety test; 12 public browser tests; typechecks and lint passed. Current-config production build remains blocked by missing Resend credentials.

## Current state at initial review

PlankMarket is a B2B seller-owned flooring-lot marketplace: Next.js/React, tRPC, Drizzle/PostgreSQL, Supabase Auth, Stripe Connect, Priority1, Inngest, Redis, UploadThing, Resend and PostHog. Manual listings, CSV drafts, quantity feeds, offers, single-listing checkout, inventory reservations, samples, messaging, reconciliation and admin operations exist. This is substantial working infrastructure, not a blank prototype.

The local configured database has 22 users, **zero listings and zero orders**. Public pages render; populated and authenticated journeys remain unverified. The current local schema-readiness contract passes. Migration tooling still reports seven documented historical gaps and blocks fresh-database bootstrap. A green existing-database check is not a clean-install or disaster-recovery proof.

The latest returned production-target deployment is `dpl_7HWemA28XKjMKJCY92RihjZ46tPt`, commit `0e75333abc51bc4b7d52ea42f313ee464670ab6e`, READY. It differs from this checkout; that listing does not prove the live domain alias or this working tree is deployed.

## Product vision

**Launch wedge (hypothesis to validate):** verified regional distributors/liquidators selling freight-ready, unused overstock and discontinued lots to flooring contractors and retailers. Pick a region based on actual committed supply and buyer projects, not a software default. Start with a small number of compatible flooring categories and whole pallets/lots.

A buyer should see material, specifications, usable quantity, package conversion, condition, seller verification, inventory confirmation date and origin at once; then obtain a delivered total and a dependable order record. A seller should import a stock sheet, resolve exceptions, publish, confirm availability and track proceeds without routine developer help.

Do not launch consumers, manufacturer catalogs, multi-seller carts, multi-warehouse fulfillment and autonomous pricing as one combined MVP. Existing seller/buyer-exclusive accounts are a limitation for businesses that do both; validate organization membership before changing permissions.

## Major problems

1. No populated candidate environment or complete buyer/seller/admin acceptance evidence.
2. Fresh-database bootstrap is explicitly blocked by missing historical migration baseline.
3. Conditional legacy-transfer recovery can mistake an incomplete scan for absence; no live incident established.
4. Pending-order expiry can starve later reservations when the oldest 25 remain skipped.
5. A listing combines product, offer, location and stock; batch/dye-lot and real warehouse identity are missing.
6. Production build configuration is incomplete locally: missing `RESEND_WEBHOOK_SECRET`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `ANTHROPIC_API_KEY`, `VERIFICATION_DOC_ALLOWED_HOSTS`, `PRIORITY1_DOCUMENT_ALLOWED_HOSTS`. Compilation and TypeScript passed; full build did not.
7. No trustworthy waterproof specification. Unsupported recommendations are now withheld with an explanation; collecting evidence remains necessary.
8. Search remains literal phrase matching, missing model-number indexing, normalized terminology and several buyer-facing specs.

## Implemented in this review

- Restored the existing route-protection entry beside `src/app`; signed-out buyer/seller/admin routes now redirect to login with the return destination.
- Fixed public cache reads for automatically decoded Redis JSON while preserving date metadata.
- ZIP edits recompute or clear listing coordinates; stale coordinates are not retained.
- Nearest sorting resolves a buyer ZIP without requiring a radius, puts unknown coordinates last, and honors nearest order ahead of promotion placement.
- Browse exposes job-ZIP entry and nearest sorting, with a warning for unrecognized ZIPs and a clear reset behavior.
- Thickness matching permits rounding (0.005 inch), not neighboring nominal sizes; the 9-inch-plus filter includes wider boards.
- Recommendations use the same direct-purchase price as browse and enforce saved radius; invalid origins are explained.
- Removed the wear-layer-as-waterproof inference. The buyer's requirement remains saved, with no unsupported matches.
- Product structured data no longer labels every closeout/discontinued lot as used.
- Regression coverage exercises geography, dimensions, recommendation constraints and buyer feedback.

These changes require no new dependency, database migration, or provider configuration. They do not repair historical coordinates automatically; any backfill needs a separately scoped dry-run and read-back.

## Architecture changes

Keep the modular monolith and existing transaction services. Evolve additively when committed supply needs it:

1. `warehouse`: seller/organization owner, validated origin address, shipping contact and capabilities. Add nullable `listing.warehouseId`; preserve immutable order/shipment origin snapshots. Current shipping intentionally rejects a listing ZIP different from the seller legal-address ZIP. Migrate that complete boundary before advertising multiple warehouses.
2. `product` / `variant`: manufacturer, normalized brand/model, canonical units and sourced specifications. Add nullable `listing.productVariantId`; keep existing descriptions and snapshots. Do not merge products merely on title similarity.
3. `inventory lot`: external stock identity, warehouse, batch/dye lot, condition, cartons, package area and quantity. Preserve existing reservation transactions and ingestion audit/reconciliation; do not infer carton counts from approximate square footage.
4. Separate construction (SPC/WPC etc.), physical condition, sale reason, installation method and declared performance. Waterproof state must distinguish unknown, seller-declared and document-backed, with source/provenance. Avoid arbitrary JSON fields as the only search contract.

Migration acceptance: dry-run mapping, unresolved-record queue, dual-read compatibility, per-seller reconciliation, no lost reservations or changed order economics, tested rollback and authoritative target read-back.

## UX improvements

Put product discovery and local supply ahead of feature marketing once genuine inventory exists. Make material, usable quantity, price and origin the primary card hierarchy. Keep photo/spec evidence prominent; do not use sample inventory as commercial proof. Simplify the long signup explanation and repeated logos. Reduce excess vertical space and repeated actions in mobile empty states. Maintain accessible filter drawer, large touch controls and persistent filter state.

## Marketplace improvements

Use assisted supplier onboarding and SKU binding to seed reliable supply. Capture buyer requirements when searches fail, route qualified requests to suppliers, and measure time to useful response. Treat availability confirmation and delivered economics as conversion infrastructure. Keep commissions as the primary model; postpone additional fees and advertised paid-promotion benefits until their UI and fulfillment are actually available.

## Technical debt

| Disposition | Scope | Action |
|---|---|---|
| KEEP | Reservation, webhook inbox, refund/reconciliation, stock ingestion, ownership and verification controls | Expand executed integration coverage; preserve audit/idempotency |
| COMPLETE | Warehouse origin, normalized SKU/spec data, authenticated E2E, bootstrap baseline | Gate regional launch/expansion on evidence |
| REFACTOR | Search/recommendation predicate duplication; very large listing/order/admin routers | Extract only alongside behavioral changes, with contract tests |
| REMOVE/REPLACE | False waterproof inference and used-condition metadata | Implemented; remaining unsupported specifications stay unknown |
| REVIEW BEFORE REMOVE | Disabled promotions, agent/CRM/AI tooling, old root reports and vendor research artifacts | Check route registration, imports, commercial commitments and ownership before deletion; disabled does not mean dead |

## Prioritized roadmap

| Priority | Deliverable / measurable completion criterion | Impact | Effort | Risk |
|---|---|---|---|---|
| P0 | Bound populated staging candidate; buyer purchase, seller fulfillment, admin dispute/reconciliation pass desktop/mobile with test providers and retry evidence | High | Medium | Medium |
| P0 | Verified migration baseline restores an empty isolated DB and passes schema/data/permission checks | High | High | High |
| P0 DONE locally | Legacy transfer lookup explicitly distinguishes incomplete/duplicate/missing; all payout/refund callers stop on unresolved history; test cap, orphan and retry cases | High | Medium | High |
| P1 DONE locally | Fix expiry batch starvation without cancelling captured payments; show skipped orders in reconciliation and prove later unpaid orders progress | High | Medium | High |
| P1 DONE locally | Route protection, public cache, geography, dimension filters, honest recommendations and condition metadata | High | Low | Low |
| P1 | Supplier-owned warehouse origin plus carton and batch identity; single warehouse pilot has zero ambiguous origin/quantity records | High | Medium | High |
| P1 | Search tokens, model number and canonical brand/material aliases; pass representative flooring queries against real supplier fixtures | High | Medium | Medium |
| P1 | Collect waterproof/installation/warranty evidence and expose supported filters; unknown never matches required performance | High | Medium | Medium |
| P1 | Match Pro benefit copy and billing entitlements to enabled features; promotion credit is currently advertised with purchase UI disabled | Medium | Low | Medium |
| P1 | Operator tax classification, inventory reconfirmation, verification and reconciliation queues proven end-to-end | High | Medium | Medium |
| P2 | Reusable product/variant catalog and organizations with buyer/seller memberships, based on supplier demand | High | High | High |
| P2 | Cohort funnels and regional liquidity dashboard; consent-safe impressionÃ¢â€ â€™clickÃ¢â€ â€™qualified requestÃ¢â€ â€™paid orderÃ¢â€ â€™repeat buyer | Medium | Medium | Low |
| P2 | Product-backed brand/location SEO, comparison and better mobile stock/photo editing | Medium | Medium | Low |
| P3 | Catalog matching, duplicate suggestions, assisted spec extraction; then natural-language search | Medium | Medium | Medium |
| P3 | Financing, sponsorships, consumer flows, advanced memberships | Unvalidated | High | High |

## Production readiness checklist

- [x] Current architecture and source flows mapped; obsolete assumptions separated from implementation.
- [x] Local baseline: 1,152 tests, typecheck, lint and provider-free shipping smoke pass. Post-change full suite: 170 files / 1,163 tests passed; subsequent cache change: 13 focused tests passed including 3 added cache cases.
- [x] Existing local target schema contract and data audit pass; no populated inventory/order evidence.
- [x] Public desktop/mobile baseline: five routes, no detected accessibility violations or horizontal overflow. Final public/redirect E2E: 12 tests pass, including buyer/seller/admin sign-in destinations. Final application/test typechecking and lint pass.
- [ ] Reproducible fresh-database bootstrap and restore.
- [x] Legacy-transfer uncertainty and expiry starvation resolved locally with authorized changes and regression coverage; deployment/provider acceptance remains gated.
- [ ] Dedicated buyer, seller and admin staging accounts, populated inventory and test-provider configuration.
- [ ] Signup/verification, upload, edit/reconfirm, offer, checkout, capture, shipping, payout, cancellation, refund and dispute executed in staging.
- [ ] Exact production deployment, applied migration ledger, Stripe/Inngest/Redis/UploadThing/Resend/Priority1 configuration and recovery read-backs.
- [ ] Operator rehearsal: recover one payment mismatch, stock discrepancy, shipment failure and verification appeal without SQL.
- [ ] Genuine supplier commitments and buyer projects validate the region, delivered economics and repeat demand.

Immediate next gate: resolve a dedicated populated staging setup and verify the transaction recovery changes before any launch claim. This review improves the foundation; it does not certify the full definition of done.
