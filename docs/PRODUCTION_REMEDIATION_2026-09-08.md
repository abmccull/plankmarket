# Production remediation â€” 2026-09-08

## Implemented

- Transfer recovery now raises an explicit incomplete-history error for scan
  caps, malformed/repeating pagination and truncated grouped results. A partial
  match cannot establish uniqueness. Existing payout and refund callers stop
  before moving money; regression tests establish those boundaries.
- Pending-order expiration advances a persisted stable date/ID cursor after
  each batch, including skipped or failed provider checks. It wraps after the
  last page. Captured payments retain their reservations and produce operator
  reconciliation cases; provider failures also become visible cases.
- Buyer search matches individual words across existing indexed product text
  and manufacturer model numbers, rather than requiring one contiguous phrase.
- Pro promotion-credit claims follow the disabled promotion feature flag.
  Accrued credits and billing grants remain intact.
- Deployment validation no longer prints invalid secret values, handles tax
  configuration errors without crashing, and requires critical service settings.
  Email credentials are now required for production. AI remains optional with
  the existing manual-review fallback.
- A schema-only export and migration-ledger reader, immutable recovery baseline,
  and guarded local bootstrap script restore a fresh isolated database without
  inventing historical migrations. The original migration history is preserved.
- The explicit `test:e2e:release` command fails when buyer, seller or admin session
  prerequisites are absent. Optional ordinary browser runs no longer substitute
  for release acceptance. An admin reconciliation smoke case was added.

## Evidence and boundaries

Local artifacts: `tmp/production-remediation-20260908/`. Source discovery used two
read-only branches; a malformed extra result field was corrected once, retaining
the original rejection. One integrator performed the authorized local edits.

Current Vercel environment names were read, then production settings were pulled
to an ignored local file for validation. The current settings contain the six
previously missing local build values. **RESEND_API_KEY is absent in the actual
production configuration**, not merely the developer environment. No value was
printed or invented, and no provider configuration was changed.

The configured database schema was exported without table data and restored
into isolated native PostgreSQL. Both manual and scripted restores passed the
application's 0034 schema contract. Script re-entry refused to overwrite the
nonempty database. A hosted Supabase restore and security comparison remain
separate acceptance requirements.

## Remaining production gates

1. Supply the approved Resend credential, verify sender/domain/webhook setup and
   demonstrate accepted transactional email in the dedicated test environment.
2. Provide populated staging and dedicated buyer, seller and admin sessions;
   execute checkout, payment, shipping, payout, refund, dispute and retry flows.
3. Restore the baseline to hosted Supabase and compare ownership, grants and
   advisors before any remote migration-ledger adoption.
4. Verify the exact final deployment and provider state before launch. This local
   working tree has not been committed, deployed or promoted.

Product expansion proposals (multi-warehouse organizations, catalog entities,
document-backed specifications, commercial cohorts and AI catalog assistance)
remain roadmap work, not evidence that launch prerequisites passed. Genuine
supplier commitments and buyer demand cannot be manufactured by test fixtures.

## Final verification

- Full suite: 172 files / 1,177 tests passed with four workers. The earlier run
  had one blog metadata timeout while competing with a build; the test passed
  individually and the complete rerun passed. One subsequently added bootstrap
  safety test also passed.
- Transaction regression set: 50 tests passed. Expiry regression cases include
  25 retained payments, provider errors, reconciliation-write errors and exact
  PostgreSQL cursor timestamps. An actual PostgreSQL comparison showed the old
  truncated cursor returning all 26 rows and the exact cursor returning only
  the next row.
- Public desktop/mobile browser suite: 12/12 passed. Rendered Pro and pricing
  pages do not advertise the disabled credit benefit.
- Application and test typechecks, full lint and diff whitespace checks passed.
- Fresh exporter output restored without manual edits; schema 0034 contract
  passed. Bootstrap rejected both an existing database and remote targets;
  export rejected mismatched Auth/database targets before connection.
- Production build using freshly pulled Vercel settings compiled and completed
  TypeScript, then failed at page-data collection because RESEND_API_KEY is
  missing. No validation bypass or fabricated credential was used.
- Release prerequisite command correctly failed for missing dedicated buyer,
  seller and admin sessions. This is a visible blocker, not a passed E2E run.
- Independent source review found and prompted fixes for timestamp precision,
  reconciliation error handling and export provenance. Those corrections were
  verified against source, local tests and database behavior.
