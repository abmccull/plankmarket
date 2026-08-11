---
name: plankmarket-ops
description: Run bounded, evidence-first PlankMarket graph workflows for commercial validation, preproduction security, transaction-state UX, money paths, shipping paths, and high-risk change review. Use for repeated PlankMarket audits, launch or preproduction gates, traction claims, pricing or payout truth, schema or migration review, rendered checkout and order-state review, and any cross-cutting assessment that benefits from parallel read-only workers with deterministic reduction and fresh verification.
---

# PlankMarket Ops

Use exact repository, deployment, and provider evidence. Default to read-only work and report evidence gaps as `unverified`; never convert missing evidence into a pass.

## Run a graph

1. Resolve the repository root, branch, HEAD, dirty-tree SHA-256, deployment ID, provider project/account IDs, provider-state SHA-256, and observation time. Do not run a recipe with unresolved placeholders or expose secrets in a fingerprint.
2. Select and read one recipe:
   - Commercial viability and genuine traction: [graph-commercial-validation.yaml](references/graph-commercial-validation.yaml)
   - Schema, migrations, tenancy, and provider readiness: [graph-preproduction-security.yaml](references/graph-preproduction-security.yaml)
   - Rendered checkout, order, shipping, and recovery states: [graph-transaction-state-ux.yaml](references/graph-transaction-state-ux.yaml)
3. Keep `authority: read_only`, at most four workers active, and every write and lock set empty. Execute only nodes whose dependencies are accounted for.
4. Validate every node result against its output contract. Retry only within the declared bound. Record `expected`, `completed`, `partial`, `failed`, `blocked`, `malformed`, and `retried` counts.
5. Reduce deterministically using stable evidence identity (`type + locator + observed_at + content hash`), severity precedence, and explicit conflict retention. Never silently discard rejected or missing findings.
6. Give the reducer artifact and bound target to a fresh-context verifier for high-risk claims. Use one integrator to issue the final verdict and coverage ledger; do not let workers merge their own conclusions.
7. If changes are requested, stop the read-only graph first. Read [safe-boundaries.md](references/safe-boundaries.md), obtain the required human approval, declare exact writes and locks in a separate mutation manifest, and assign one integrator. Re-run authoritative checks and provider read-backs afterward.

## Route existing workflows

Use the existing `.grok` workflow directly when its narrower contract matches; do not duplicate or rewrite it:

- `.grok/workflows/commercial-truth-audit.rhai` - fee, payout, verification, and public-copy consistency.
- `.grok/workflows/high-risk-change-review.rhai` - pre-merge review for money, shipping, auth, verification, webhooks, and identity masking.
- `.grok/workflows/money-path-audit.rhai` - payment hold, Connect transfer, refund, dispute, fee, and webhook paths.
- `.grok/workflows/shipping-path-audit.rhai` - Priority1 quote, booking, BOL, tracking, cancellation, and order coupling.

Use the YAML recipes for broader evidence graphs, cross-provider fingerprints, completeness accounting, and commercial or rendered-state evidence not covered by a single `.grok` workflow.

## Evidence rules

- Treat `drizzle/`, its ledger, executed tests, and read-only provider state as security truth; never treat an unlinked CLI or a local migration file as proof of remote application.
- Treat genuine supplier inventory exports, named buyer RFQs, settled trades, freight invoices, claims, and repeat behavior as commercial truth. Seed listings, inventory depletion, polished UI, projections, and test transactions are not traction.
- Bind UX claims to rendered desktop and mobile evidence for loading, empty, blocked, warning, error, recovery, and success states. Source inspection alone is insufficient.
- Separate code/test evidence, rendered evidence, deployment evidence, provider evidence, and human gates in the final report.
