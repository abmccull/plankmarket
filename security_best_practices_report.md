# PlankMarket Security Review and Remediation Report

**Review completed:** August 3, 2026 (America/Denver)  
**Baseline findings:** July 31, 2026  
**Reviewed checkout:** `codex/plankmarket-launch-candidate`  
**Base commit:** `95d5f7d56f893ba2fe30dd1c8d34ec68902620fa`  
**Reviewed state:** dirty working tree; unrelated pre-existing changes preserved  
**Host shell:** Node `22.14.0`, npm `9.7.1`

## Outcome

All **18 repository-controlled findings** from the July 31 review are remediated
in source. An independent final delta review found no remaining source-open issue
in that reviewed set.

This is not a production-security certification. No live Stripe, Supabase,
Postgres, Priority1, UploadThing, Vercel, GitHub, Inngest, Redis, Resend, PostHog,
or Anthropic configuration was changed or certified. Source completion and live
control effectiveness are deliberately reported separately.

## Scope and method

The review traced the high-risk marketplace boundaries end to end:

- authentication, MFA/AAL2, session and protected-route enforcement
- listing, offer, order, buyer, seller, and provider tenant lineage
- Stripe payment, refund, dispute, webhook, Connect transfer, and reconciliation
- Priority1 quote, booking, pickup evidence, document URLs, tracking, and retry
- upload signatures, evidence delivery, blog/JSON-LD output, and CSP
- analytics consent, verification AI egress, PII retention, and purge behavior
- database grants/RLS posture, constraints, triggers, migrations, and audits
- dependency graph, lockfile, workflow permissions, action pinning, SBOMs, and
  release/readiness fingerprinting
- liveness/readiness disclosure and deployment secret scope

Evidence combined source tracing, targeted regression tests, the full regression
suite, dependency audits, SQL contract checks, a Priority1 dry-run, production
build, and a read-only public render harness. Live-provider claims were not
inferred from local success.

## Final local validation snapshot

| Check | Result |
| --- | --- |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm run typecheck:tests` | Passed |
| `npm run test` | Passed: 165 files, 1,101 tests |
| `npm run test:shipping` | Passed: 53 tests plus Priority1 dry-run smoke |
| `npm run audit:prod` | Passed: 0 vulnerabilities |
| `npm audit --audit-level=high` | Passed: 0 vulnerabilities |
| Root and pinned deploy-CLI SBOMs | Generated successfully |
| `npm run db:check` | Passed: 26 SQL files; 7 documented historical bootstrap gaps remain |
| `npm run build` | Passed: 148 routes/pages generated |
| Public Playwright regression | Passed: 6/6 serially on the exact final build |
| Broad public render audit | 20 checks, 0 Axe violations, 0 console/page errors |
| Exact rendered delta | 9 checks including opened mobile filters, 0 Axe violations or runtime errors |

A six-worker local browser run timed out under concurrent workstation load; the
same checks passed with one worker and direct health responses remained fast.
Hosted parallel-runner certification remains external evidence.

## Finding disposition

| Finding | Original severity | Category | Remediation status | Live qualifier |
| --- | --- | --- | --- | --- |
| SEC-001 | High | Payments / refund finality | Resolved in source. Refunds persist pending/reconciliation states; terminal local effects wait for Stripe success; `refund.updated` and `refund.failed` reconcile drift. | Live Stripe refund lifecycle, subscription, retry, and read-back still required. |
| SEC-002 | High | Auth assurance / MFA | Resolved in source. Admin and seller-financial actions require server-enforced AAL2 and recent strong auth; high-assurance redirects are in place. | Real Supabase MFA/AAL2, enrollment, recovery, leaked-password, CAPTCHA, redirect, and session policies remain unverified. |
| SEC-003 | Medium | Disputes / refund eligibility | Resolved in source. Open/lost disputes block manual refunds; claim closure waits for confirmed refund success; drift opens reconciliation. | Live Stripe dispute/refund certification required. |
| SEC-004 | Medium | Tenant isolation / notification abuse | Resolved in source. Seller onboarding nudges derive the seller from the listing and require verified buyer context plus real interest. | Normal deployed regression coverage remains. |
| SEC-005 | Medium | Freight document authorization | Resolved in source. Freight document visibility is centralized and dispute access reuses the shipping authorization policy. | Real shipment-document access must be verified provider to browser. |
| SEC-006 | Medium | Shipping evidence / payout integrity | Resolved in source. Status-only polls no longer synthesize pickup; payout-triggering state requires persisted authoritative pickup evidence. | Live Priority1 booking, tracking, pickup, duplicate, and delayed-event proof required. |
| SEC-007 | Medium | Reservation / payout readiness | Resolved in source. Reservation asserts seller payout readiness before inventory hold; seller deauthorization and canceled-payment release fail closed. | Live Stripe connected-account state and reservation cleanup required. |
| SEC-008 | Medium | Webhook ingress | Resolved in source. Stripe ingress enforces content type and bounded body size before signature verification. | Edge/runtime and real Stripe replay behavior still require deployed proof. |
| SEC-009 | Medium | Provider URL trust | Resolved in source. Priority1 document URLs require allowlisted HTTPS hosts with no credentials or custom ports. | Production host allowlist must be confirmed with Priority1. |
| SEC-010 | Medium | Privacy retention / PII lifecycle | Resolved in source. Retention windows, purge fields/triggers, provider-first deletion, cron entrypoint, and evidence purge bookkeeping are implemented. | Target migration, real-data audit, provider deletion adapters, retention schedules, and DPA proof remain. |
| SEC-011 | Medium | Analytics / AI minimization | Resolved in source. Analytics are opt-in, sanitized, and account-scoped when signed in; verification AI egress is minimized and explicit. | PostHog, Vercel, Anthropic, masking, residency, DPA, and retention settings remain unverified. |
| SEC-012 | Medium | Database tenancy / lineage | Resolved in source. `0033` adds composite lineage constraints, media parent/owner checks, inventory ownership guards, and shipping-address lockdown. | Apply to the real DB, remediate mismatches, then `VALIDATE CONSTRAINT`; `NOT VALID` is not final certification. |
| SEC-013 | Medium | Supply chain / CI / deployment | Resolved in source. Actions are SHA-pinned, permissions narrowed, audits/SBOMs added, CLI isolated, secret scope narrowed, and readiness compares the full release contract. | GitHub/Vercel environments, runner behavior, approvals, protections, artifacts, and rollback require live verification. |
| SEC-014 | Low | Auth callback origin | Resolved in source. Redirects use the canonical application origin rather than request-derived origin construction. | Verify Supabase and deployment redirect allowlists. |
| SEC-015 | Low | Stored content / XSS | Resolved in source. Blog markdown is sanitized, JSON-LD escapes `<`, and CSP blocks `script-src-attr`. | Reassess if a CMS/importer introduces less-trusted content. |
| SEC-016 | Low | Upload / evidence validation | Resolved in source. Upload callbacks inspect allowed signatures; evidence is served through a controlled proxy with `nosniff`, `no-store`, sandboxing, and attachment where required. | Real UploadThing/CDN response headers, cache, deletion, and retention must be verified. |
| SEC-017 | Low | Private route protection | Resolved in source. Middleware covers messages, offers, notifications, preferences, and settings; sensitive paths use MFA redirects. | Deployed anonymous/session-expiry smoke testing remains. |
| SEC-018 | Low | Health / readiness disclosure | Resolved in source. Public health is liveness-only; readiness is separate, cached, and protected by `CRON_SECRET`. | Verify deployed authz, cache, observability, and secret scope. |

## Post-review hardening deltas

### Account-scoped analytics consent

- Anonymous visitors use a local consent decision and analytics remain disabled
  until an explicit grant.
- Signed-in users resolve consent from `user_preferences`, persist through the
  preferences mutation, and refetch before analytics initialization.
- Admin and other signed-in roles use the same account authority; stale browser
  grants cannot silently initialize tracking.
- `useTrack` fails closed when no allowed analytics context exists.

### Public verification truth

- Marketing and marketplace copy no longer implies every visible seller has
  completed verification.
- Cards and detail expose the actual per-listing seller status.
- The unverified warning now states that the seller has not completed business
  verification instead of implying the status is merely hidden.
- Verification and freight evidence remain facts, not guarantees of transaction
  outcome.

### Exact release contract

The protected readiness response and deploy workflows share one release contract.
Preview, staged production, and post-promotion checks compare all five fields:

1. `buildSha`
2. `packageVersion`
3. `schemaVersion`
4. `commercialPolicyVersion`
5. exact `fingerprint`

Public `/api/health` does not disclose these values.

## Key source evidence

- Auth assurance and routing: `src/lib/auth/auth-assurance.ts`,
  `src/server/trpc.ts`, `src/lib/supabase/middleware.ts`
- Refund, dispute, and Stripe lifecycle: `src/server/services/refund.ts`,
  `src/server/routers/dispute.ts`, `src/app/api/webhooks/stripe/route.ts`
- Freight and pickup trust: `src/server/security/freight-document-access.ts`,
  `src/server/services/priority1.ts`,
  `src/lib/inngest/functions/shipment-tracking.ts`
- Upload/XSS containment: `src/lib/blog.ts`,
  `src/app/api/uploadthing/core.ts`, `src/server/security/evidence-files.ts`,
  `src/app/api/disputes/evidence/[mediaId]/route.ts`, `next.config.ts`
- Privacy/lineage: `src/server/services/privacy-retention.ts`,
  `scripts/audit-marketplace-data.mjs`,
  `drizzle/0033_security_privacy_and_tenancy.sql`
- Health/release authority: `src/app/api/health/route.ts`,
  `src/app/api/health/ready/route.ts`, `src/lib/release-contract.json`,
  `src/lib/schema-readiness-contract.ts`
- Deployment controls: `.github/workflows/deploy-preview.yml`,
  `.github/workflows/deploy-production.yml`

## Database harness limitation

Migration `0033` applied to an isolated local Postgres harness. Target readiness
did not pass because the harness intentionally lacks operational objects from
prior migrations `0024` through `0032`. This is evidence that the new migration
can execute locally; it is not evidence of a clean historical bootstrap or the
real production schema.

Production certification requires target backup, read-only mismatch audit,
explicit cleanup, migration apply, validation of every `NOT VALID` constraint,
and readiness read-back tied to the release SHA.

## Remaining production security gates

1. Verify the real Supabase project, Auth/MFA/AAL2, grants, RLS, sessions,
   redirects, schema, backups, and extensions.
2. Apply/audit/validate `0033` against the target database and retain evidence.
3. Certify Stripe payments, refunds, disputes, transfers, webhooks, duplicates,
   failures, and reconciliation with provider read-back.
4. Certify Priority1 quote, booking, pickup evidence, documents, tracking,
   cancellation, retry, and host allowlist.
5. Verify UploadThing, Inngest, Redis, Resend, PostHog, Anthropic, Vercel, and
   GitHub configurations, secret scopes, retention, alerts, and ownership.
6. Freeze, review, commit, push, deploy, and promote one exact fingerprinted SHA.
7. Complete backup/restore, rollback, incident-response, reconciliation, and
   customer-support drills.

## Residual risk ranking

- **Critical launch risk:** no immutable deployed candidate; commercial truth and
  live code are inconsistent with source.
- **High launch risk:** production database and Stripe/Priority1 workflows are
  not certified.
- **High operational risk:** authentic inventory, backup/restore, rollback,
  alerting, and incident ownership are not proven.
- **Medium residual risk:** hosted parallel browser/performance and manual
  accessibility evidence remain.
- **Known source-open issues from the reviewed 18:** none.

## Bottom line

Repository security is ready to enter protected staging.

Production security is not ready until the live database, providers, deployment
artifact, commercial contract, and operational recovery controls are certified.
