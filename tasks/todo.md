# Audit-driven production fixes

**Date:** 2026-08-13  
**Sources:** `commercial-truth-audit`, `money-path-audit`, `shipping-path-audit`, `ship-gate`  
**Constraint:** Code/copy/CI only. No live deploy, remote SQL, or carrier booking.

## Wave A — Commercial truth (copy)

- [x] Pricing: withhold conditions; remove unpublished volume fee discount
- [x] FAQ: payment hold + not escrow; withhold conditions; split 48h inspection
- [x] Terms: not a regulated escrow service; withhold conditions
- [x] Seller payments: platform charge + later Connect transfer; 2.9% + $0.30

## Wave B — Shared payout evidence

- [x] Accept pickup proof on `exception` (and keep dry-run fail-closed)
- [x] Seller-favor dispute: pass `orderShippedAt`; use actual pickup not scheduled window

## Wave C — Money path

- [x] Expire cron: do not refund a live succeeded PI during webhook/tax lag; apply or skip
- [x] `payment_intent.succeeded`: retrieve latest_charge; refuse confirm if refunded
- [x] `createPaymentIntent`: apply already-succeeded PI locally
- [x] Dispute won: restore `held` and requeue payout when transfer missing/reversed
- [x] First-payout: do not refuse create after a completed empty transfer_group scan
- [x] Refunds: reverse Connect transfer before refunding a released order; do not persist refundedAmount if reversal fails

## Wave D — Shipping path

- [x] Origin ZIP/state match; fail closed if seller legal ZIP != warehouse ZIP
- [x] Consume: reject physical freight drift vs snapshot
- [x] Prefer primary/non-null shipment identifiers
- [x] Empty getDocuments URL is not a permanent failure
- [x] Reject example.com document hosts in env
- [x] Tracking: include claimed pending and keep delivered in the poller
- [x] Dispatch: claimed+404 is retryable, not a silent unpaid stick

## Wave E — Ship-gate repo evidence

- [x] Align production env tax preflight with disabled tax policy
- [x] Record last-good deployment before promote
- [x] Backup/restore operator runbook
- [x] Document least-privilege DB role

## Review

Implemented confirmed code/copy fixes from all four audits. Typecheck passed. Targeted vitest suites passed (refund, listing freshness, payout eligibility, shipping workflow, commercial copy, stripe transfer/charge, documents, tracking, dispatch, stripe webhook).

Still operator/live: GitHub environment protection, production PITR drill, Vercel promote of current HEAD, live Stripe/Priority1 certification, real inventory. Warehouse street is still the seller legal address when ZIPs match; a dedicated listing street field was not added this pass.

## Out of scope this pass

- Live Vercel promote, GitHub environment protection, production PITR drill
- Changing Stripe tax mode
- Replacing Priority1 with shipper-direct rates
