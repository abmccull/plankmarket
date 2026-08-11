# PlankMarket Launch Readiness Review - August 3, 2026

**Candidate branch:** `codex/plankmarket-launch-candidate`  
**Base HEAD:** `95d5f7d56f893ba2fe30dd1c8d34ec68902620fa`  
**Upstream divergence:** `0 ahead / 0 behind` before candidate changes are committed  
**Reviewed state:** dirty working tree, 188 modified and 102 untracked paths  
**Local reviewed build:** `http://127.0.0.1:3200`  
**Decision:** **Not ready for a broad production transactional launch**  
**Next authorized environment:** **Protected preview/staging after an exact SHA is frozen**

## Executive launch call

The repository candidate is materially stronger than the live product. All 18
reviewed repository-controlled security findings are remediated in source, the
public marketplace UX is 8.9/10, the production build completes, and 1,101 tests
pass.

That does not make production ready. The remaining blockers sit at the release,
commercial, database, provider, inventory, and operational boundaries. Those are
the places where a marketplace can lose money or trust even when local code is
green.

## What is currently proven

| Evidence class | Result | Scope boundary |
| --- | --- | --- |
| Lint | Passed | Current working tree |
| Application typecheck | Passed | Current working tree |
| Test typecheck | Passed | Current working tree |
| Unit/integration regression | Passed: 165 files, 1,101 tests | Current working tree |
| Shipping suite | Passed: 53 tests plus Priority1 dry-run smoke | Dry-run fixtures, not live carrier proof |
| Database source check | Passed: 26 SQL files; 7 historical baseline gaps documented | Source/migration consistency, not target DB state |
| Production dependency audit | Passed: 0 vulnerabilities | Installed/locked graph |
| Full root dependency audit | Passed: 0 vulnerabilities | Installed/locked graph |
| SBOM generation | Passed for root and pinned deployment CLI graphs | Local artifacts, not deployed-attestation proof |
| Production build | Passed: 148 routes/pages generated | Harness environment, not production secrets/providers |
| Public browser regression | Passed: 6/6 serially | Home, browse, seller guide; desktop/mobile |
| Broad rendered audit | Passed: 20 checks, zero Axe/console/page errors | Ten public/auth-handoff routes in isolated harness |
| Exact final rendered delta | Passed: 9 checks, zero Axe/console/page errors/overflow | Four public routes plus opened mobile filters |
| Local liveness | `/api/health` returned 200 | Local build only |
| Local readiness protection | `/api/health/ready` returned 401 without secret | Confirms it is not public locally |

One six-worker local Playwright run timed out during navigation under concurrent
workstation load; the exact six checks passed with one worker and direct health
checks remained fast. Hosted-runner parallel behavior is therefore unverified,
not reported as a product pass.

## Gate assessment

| Gate | Status | Launch consequence |
| --- | --- | --- |
| Repository security remediation | Green in source | No known source-open issue from the 18-item review. |
| Public UX candidate | Green for protected staging | Familiar browse/detail/filter/auth-handoff model; 8.9/10 audited score. |
| Immutable release artifact | **Red** | The reviewed state is not committed, pushed, deployed, or tied to one exact candidate SHA. |
| Commercial and legal truth | **Red** | Live pages advertise 3% buyer / 2% seller while candidate authority is 5% / 5%; payout/verification wording also differs. |
| Production code parity | **Red** | Live health/readiness routes are absent and live copy reflects the older implementation. |
| Production database | **Red** | Real Supabase project, grants/RLS, migration history, lineage audit, retention state, and `0033` validation are not certified. |
| Stripe money movement | **Red** | Payment, refund, dispute, Connect transfer, webhook replay, and reconciliation require provider-backed proof. |
| Priority1 shipping | **Red** | Quote, booking, pickup evidence, document hosts, tracking, cancellation, and retry behavior require provider-backed proof. |
| Other providers | **Red** | Inngest, Redis, UploadThing, Resend, PostHog, and Vercel configuration/read-back remain unverified. |
| Real inventory and liquidity | **Red** | The harness has three sample lots; live supply authenticity, media, geographic coverage, and seller responsiveness are unproven. |
| Accessibility and performance | Amber | Automated public checks pass; manual AT/touch/zoom/reduced-motion and production Core Web Vitals remain. |
| Operations and recovery | **Red** | Backup/restore, rollback, incident ownership, alerts, reconciliation ownership, and support drills are incomplete. |

## Live production delta

The current production site is not the reviewed candidate:

- the [live home page](https://www.plankmarket.com/) still states a 3% buyer fee,
  2% seller fee, blanket professional verification, and pickup-timed payout copy
- the [live pricing page](https://www.plankmarket.com/pricing) repeats 3% / 2%
  and the older transfer/dispute language
- candidate source centralizes 5% buyer / 5% seller policy and describes a Stripe
  payment hold followed by a separate seller Connect transfer after the configured
  shipment event/delay
- live `/api/health` and `/api/health/ready` returned 404 in direct HTTP checks,
  while both routes exist in the candidate

This mismatch alone blocks launch. Fee, payment, transfer, legal, support, and
marketing language must describe the same behavior before any release.

## Database and migration evidence

Migration `0033_security_privacy_and_tenancy.sql` applied in an isolated local
Postgres harness. The target readiness check still could not pass because that
harness intentionally lacks operational objects from migrations `0024` through
`0032`. This proves the new migration can execute in isolation; it does not prove
a clean bootstrap or the real production lineage.

The production gate is:

1. identify and link the actual PlankMarket Supabase project
2. back up the target and inventory current migrations, grants, RLS, functions,
   triggers, and extensions
3. run the mismatch audit read-only
4. remediate legacy cross-owner or null-lineage rows explicitly
5. apply `0033`
6. validate every `NOT VALID` constraint
7. rerun readiness and retain the output with the release SHA

## Recommended release sequence

1. **Freeze one candidate.** Review the 290-path dirty worktree, separate
   unrelated changes if necessary, and commit the intended full release state.
2. **Resolve commercial authority.** Decide the actual 5%/5% policy (or change
   source), then align pricing, legal, checkout, invoices, refunds, support, and
   seller-transfer copy.
3. **Deploy protected preview.** Require exact matching `buildSha`,
   `packageVersion`, `schemaVersion`, `commercialPolicyVersion`, and full
   fingerprint from readiness.
4. **Certify the database.** Complete the target audit/apply/validate/read-back
   sequence above.
5. **Certify providers.** Run Stripe and Priority1 happy, retry, duplicate,
   failure, refund/dispute, cancellation, and recovery journeys with provider
   read-back. Verify remaining integrations and secret scopes.
6. **Load real curated supply.** Use authentic lot media and verify seller,
   location, quantity, condition, MOQ, freshness, freight setup, and response
   ownership before the inventory is public.
7. **Run human release QA.** Buyer and seller journeys, manual accessibility,
   cross-browser/touch, production performance, support, rollback, and restore.
8. **Invite-only beta.** Start with a small set of verified counterparties and
   monitored orders; reconcile every order manually before broadening access.
9. **Promote deliberately.** Only promote the same certified SHA and repeat
   post-promotion readiness/provider smoke checks.

## Launch modes

### Broad public transactional launch

**No-go.** The release, live commercial, database, provider, supply, and
operational gates are not satisfied.

### Invite-only or concierge beta

**Conditional go** only after steps 1 through 7 above. Keep order volume small,
require manual reconciliation, and publish no protection promise beyond the
implemented contract.

### Protected preview/staging

**Go after an exact SHA is frozen.** This is the correct next environment for the
current source candidate.

## Bottom line

The code candidate is no longer the main risk. Launching an uncertified dirty
worktree into a commercially inconsistent live environment is.
