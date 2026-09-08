# Marketplace production remediation implementation

Accepted scope: fourteen review items, multiple seller warehouses, separate buyer and seller accounts. Resend verification remains deferred. Local code, migrations and verification are authorized; no live payments, bookings, provider settings or production deployment are part of this execution.

## Checkpoint

Starting HEAD: `7df15b46ba982625f9508df89da72efc80d8c245`, including the existing uncommitted remediation. Recoverable source archive: `tmp/plan-implementation-20260908/before.zip`; file inventory and fingerprint: `baseline.json` beside it. Ignored environment secrets are excluded. Proposal evidence and verification logs are retained in that directory.

## Ordered acceptance checklist

| Step | Change | Required evidence | Status |
| --- | --- | --- | --- |
| 1 | Recoverable source checkpoint | Archive and inventory | Complete |
| 2 | Truthful durable checkout receipt | Pending, processing, failed, succeeded, review, reload tests | Implemented; local checks passed |
| 3 | Idempotent checkout and payment recovery | Same-key replay, conflicting fingerprint, lost response, stale-quote reset and concurrent reservation tests | Implemented; local checks passed |
| 4 | Production tax preflight | Disabled/incomplete/unsupported policy rejected; approved provider policy still required | Implemented; local checks passed |
| 5 | Private verification uploads | Unverified owner success, other-owner denial, bytes validation, reviewer authorization, retention race tests | Implemented; local checks passed |
| 6 | Transactional listing photo edits | Restore/reorder/save/cancel/ownership tests | Implemented; local checks passed |
| 7 | Seller-scoped listing drafts | Autosave/reload, storage failure, account isolation | Implemented; local checks passed |
| 8 | Reliable CSV imports | Optional blanks, unknown headers, specifications, request replay/conflicts | Implemented; local checks passed |
| 9 | Multiple pickup warehouses | Ownership, defaults, reservation locks, stale quotes, consistent freight/tax/booking origin | Implemented; local checks passed |
| 10 | Product specification evidence | Manual/edit/CSV roundtrip, evidence invalidation, strict waterproof matching | Implemented; local checks passed |
| 11 | Shipping and transaction recovery | Buyer/seller/admin states, eligible actions, no duplicate booking | Implemented; local checks passed |
| 12 | Trustworthy dashboard metrics | Exact money, payment/refund cohorts, matching periods, full open-request aggregate | Implemented; local checks passed |
| 13 | Admin usability and refund eligibility | Mobile nav parity, partial failures/retry, service-consistent refund controls | Implemented; local checks passed |
| 14 | Public signup/browse/pricing polish | Desktop/mobile renders, keyboard/forms, empty-state navigation | Implemented; local checks passed |

These statuses cover source implementation and local verification. They do not certify hosted migrations, production configuration, provider acceptance or deployment. Step 4 implements the tax gate; choosing and configuring the approved tax policy remains external. Step 5 implements private storage handling; the hosted bucket remains to be configured.

## Integration and migration rules

One coordinator applies source changes sequentially. Preserve historical SQL and the immutable recovery baseline. Add numbered additive migrations; exercise them on a new loopback-only disposable database restored from that baseline. Record schema and constraint read-back. Do not repair the hosted migration ledger by guessing missing history.

Review shared listing, order, schema export and navigation files for proposal overlap. Run targeted tests before the complete typecheck, lint, unit, shipping and release browser gates. Use a single final application candidate for screenshots and acceptance evidence.

## Release journeys

Run in an isolated, populated environment with buyer, seller and admin sessions:

- Buyer: register, resume verification, discover a compatible listing, get delivered total, submit direct and accepted-offer purchase, recover timeout/refresh, observe payment failure/processing/success, follow shipment and refund.
- Seller: register, private document upload, Connect onboarding, warehouse setup, manual draft recovery, upload/reorder/cancel/save photos, CSV replay, publish, accept offer, fulfill, review pending and transferred funds.
- Admin: mobile access to every operational destination; document review with short-lived access; partial query failures; permitted refund/reconciliation actions; shipment exception resolution without duplicate booking.
- Security and money: cross-account access denial, repeated/out-of-order provider events, inventory concurrency, refund/transfer reconciliation and stale origin rejection.

## External launch gates

Production readiness also requires applied migration read-back, private storage configuration, approved supported tax policy, current provider secrets, configured webhooks/jobs, realistic role sessions and provider test journeys. Resend verification is excluded from this work but remains visible as a deferred requirement. No local test result substitutes for these external checks.

## Implemented behavior and final evidence

The integrated candidate includes all fourteen changes. Five additive migrations (`0035` through `0039`) introduce checkout request identity and abandonment, private verification documents/drafts, CSV import identity, seller warehouses and specification evidence. Migration readiness now targets `0039`. Existing migration history and the recovery baseline were preserved.

A new local PostgreSQL database was restored from the immutable baseline and all five migrations were applied. Read-back verifies the readiness contract, owner constraints, private-document attachment guards, warehouse defaults and seller-scoped import identities. Three concurrent checkout requests produced one order and one inventory reservation. Conflicting request payloads and abandoned requests were rejected. A financial discrepancy discovered during this proof was repaired: recorded transfers use original payout minus recorded reversals, independently of expected seller proceeds.

The final UI repairs address shared dashboard/admin minimum widths, active navigation, accessible select/menu labels, progress names and actual progress values, distinguishable remaining progress, and onboarding contrast. The seller warehouse destination is available on desktop and mobile. Browser interaction checks exercised password visibility, seller draft reload, select keyboard dismissal and buyer/seller/admin navigation.

Evidence is in `tmp/plan-implementation-20260908/`:

- `integrated-tests-final.log`: 192 files / 1,285 tests passed before the final shared UI repairs. The final two-worker rerun also passed all 192 files / 1,285 tests in `final-tests-bounded.log`.
- `final-typecheck.log`, `final-test-types.log`, `final-lint.log`: final application, test-source and lint checks.
- `shipping-tests.log`: 62 shipping tests and the dry-run rates, dispatch, tracking and documents workflow passed.
- `database-proof.json`, `financial-readback.json`, `schema-readback.log`, `migrations-applied.log`: local database evidence, including the original financial discrepancy and subsequent correction.
- `captures-final/results.json`: 30 desktop/mobile route captures, no page exceptions, no page overflow, and no Axe findings in the selected WCAG rules. `captures-progress-verified/` supersedes the buyer/seller dashboard captures after the final progress-track adjustment.
- `browser-interactions.json`: five browser interaction checks passed.
- `final-public-e2e.log`: all 12 desktop/mobile public and signed-out redirect checks passed.

The unrestricted final test run was stopped after local resource contention; its incomplete log is preserved in `final-tests.log`. The retry limits workers to two. React test-harness warnings are retained in the logs and are not browser page exceptions.

## Explicit deployment limits

Authenticated browser runs used synthetic sessions against the local database, with temporary local auth/cache doubles. They did not exercise real Supabase login, signed storage uploads, Stripe onboarding or payments, or carrier acceptance. CSP bypass was enabled only in those local authenticated browser contexts to reach the fixture auth host; production CSP behavior is not certified. No customer data, live money, bookings or external messages were changed.

Before launch, apply migrations through the documented deployment path and read back the hosted `0039` readiness contract; configure the private verification bucket using `docs/private-verification-storage.md`; establish the approved tax treatment and make preflight pass; verify provider secrets, webhook/job delivery and replay; run the full buyer/seller/admin journeys with real provider test credentials and dedicated accounts; then deploy and verify the exact release revision. Current tax configuration remains disabled/incomplete and cannot be silently converted into a legal or financial policy decision. Resend verification remains deferred at the user's request; required environment validation was not weakened.

No commit, push or deployment was performed. The checkpoint preserves the original dirty tree, and the changes remain available for review locally.


Final production build: source compilation succeeded (35.6 seconds), and build TypeScript succeeded. Page-data collection then failed closed because six required settings are absent: `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `VERIFICATION_DOC_ALLOWED_HOSTS`, and `PRIORITY1_DOCUMENT_ALLOWED_HOSTS`. See `final-build.log`. The first two remain deferred under the Resend exclusion; the other four require configuration before a release build can pass. This failure is separate from the outstanding tax-policy preflight.

The first progress-only recapture included loading states and is retained in `captures-progress-final/`; it is not used as proof of settled dashboard progress. The corrected capture waits for a visible progress control in `captures-progress-verified/`.
