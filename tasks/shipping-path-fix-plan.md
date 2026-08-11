# PlankMarket Shipping Path — Full Fix Plan

**Source:** `shipping-path-audit` workflow (2026-08-10)  
**Verdict from audit:** `hold_high_severity` — 12 confirmed (0 blockers, 5 high, 7 medium)  
**Status:** Implemented in working tree (2026-08-10)  
**Constraint:** No live Priority1 money/carrier actions without explicit authorization; prefer dry-run + unit/integration tests

---

## Summary

Fix the full shipping integrity surface: quote caching races, expiry mismatches, post-dispatch document recovery, and medium UX/cache/document gaps. Work in four waves so checkout integrity and stuck-booking recovery land before polish. Prefer minimal, reversible edits to existing routers/services; extend shared helpers rather than rewriting the pipeline.

**Authoritative model (do not change):**
- Durable quote → pay → auto-dispatch → poll/track → pickup-gated seller transfer
- `PRIORITY1_DRY_RUN` hard-blocked in live production
- Fail closed on buyer/CAS mismatches (never book as wrong buyer)

---

## Finding inventory (all 12)

| ID | Sev | Title | Primary files |
|----|-----|-------|---------------|
| H1 | high | Shared Redis keys by `quoteId` clobber concurrent buyers | `shipping.ts`, `shipping-workflow.ts`, `order.ts` |
| H2 | high | Offer path ignores 5m dispatch buffer; checkout enforces it | `shipping-rate-cache.ts`, `shipping.ts`, `order.ts` |
| H3 | high | Document URL validation after non-retryable dispatch; no cancel | `priority1.ts`, `shipment-dispatch.ts` |
| H4 | high | Reconcile promotes to `dispatched` without BOL/labels | `shipment-dispatch.ts` |
| H5 | high | Dispatch schema allows null BOL/label after successful book | `priority1.ts`, `shipment-dispatch.ts` |
| M1 | med | Client holds quotes without expiry-driven refresh | `shipping-quote-selector.tsx`, providers |
| M2 | med | Rate cache up to 30m without Priority1 revalidation | `shipping-rate-cache.ts` |
| M3 | med | Booking snapshot TTL uncapped vs token TTL capped 1800s | `shipping.ts` |
| M4 | med | “Best value” third slot is next-cheapest only | `shipping.ts` |
| M5 | med | Orphan `shipping-quote:{id}` keys; `selectedQuoteId` fallback | `order.ts`, `verified-artifact-consumption.ts` |
| M6 | med | Extended/plural label URLs validated then discarded | `shipment-dispatch.ts`, `shipments` schema |
| M7 | med | Tracking never backfills BOL via `getDocuments` | `shipment-tracking.ts` |

---

## Target architecture (after fixes)

```
getQuotes
  → rate cache (buyer-agnostic OK for rate list ONLY)
  → filter bookable: expiresAt > now + SAFETY_BUFFER
  → mint unique quoteToken per option
  → Redis artifacts ALL keyed by quoteToken (not shared quoteId):
       shipping-quote-token:{token}
       shipping-booking-snapshot:{token}   // was :{quoteId}
       (optional deprecate shipping-quote:{quoteId})
  → same TTL on all three artifact types (min(1800, residual))

createOrder / consume
  → require selectedQuoteToken
  → validate buffer + buyerId + CAS
  → delete token + snapshot (+ quoteId key if still present)

dispatch
  → claim
  → POST dispatch
  → if parse/host fail after successful book: cancel when shipment id known, else open manual review with provider ref
  → require usable BOL or recoverable document path before finalize OR mark needs_docs + schedule backfill
  → reconcile + tracking can backfill BillOfLading / labels via getDocuments
```

---

## Wave 0 — Shared constants & test harness (foundation)

**Goal:** One source of truth for buffer/TTL so later waves stay consistent.

### Steps
1. Centralize constants in `src/server/services/shipping-workflow.ts` (already has `SHIPPING_DISPATCH_SAFETY_BUFFER_MS`):
   - `SHIPPING_QUOTE_ARTIFACT_TTL_CAP_SECONDS = 1800`
   - Export helper `isQuoteBookable(expiresAt, now = Date.now())` → `expiresAt > now + SHIPPING_DISPATCH_SAFETY_BUFFER_MS`
   - Export helper `quoteArtifactTtlSeconds(expiresAt, now)` → `min(cap, floor((expiresAt-now)/1000))` with min 1, reject if not bookable
2. Add unit tests for helpers in `shipping-workflow` test file (or extend existing).

### Verification
- `npx vitest run` on new/updated unit tests
- No behavior change yet (helpers unused by production until Wave 1)

### Rollback
- Revert commit; pure additive

---

## Wave 1 — Checkout integrity (H1, H2, M3, M5 partial)

**Goal:** Concurrent buyers stop colliding; unbookable near-expiry quotes never offered; artifact TTLs aligned.

### 1.1 H1 — Scope booking artifacts by `quoteToken` (not global `quoteId`)

**Problem:** `getShippingBookingSnapshotKey(quoteId)` and `shipping-quote:{quoteId}` are overwritten by every `getQuotes` that reuses the same Priority1 `quoteId` from the shared rate cache.

**Design (minimal, safe):**
- **Keep** rate-response cache buyer-agnostic (good for cost).
- **Change** booking snapshot Redis key to token-scoped:
  - New: `getShippingBookingSnapshotKeyByToken(quoteToken)` → `shipping-booking-snapshot:token:{token}`
  - Keep old `getShippingBookingSnapshotKey(quoteId)` as deprecated shim for one release **or** dual-write during consume only if needed for in-flight checkouts
- Token key remains source of truth; snapshot always co-located with token.
- Prefer **not** writing `shipping-quote:{quoteId}` for new flows (see 1.3). If dual-write retained temporarily, include `buyerId` + `quoteToken` in value and never treat quoteId key as authoritative for consume.

**Files:**
- `src/server/services/shipping-workflow.ts` — new key helper
- `src/server/routers/shipping.ts` — write snapshot under token key; stop overwriting global quoteId snapshot (or dual-write then delete dual-write)
- `src/server/routers/order.ts` — load snapshot via token only
- Tests: `shipping-quote-cache.test.ts`, `listing-freshness-enforcement.test.ts`, order/shipping router tests

**Implementation detail:**
```ts
// shipping.ts redis writes (concept)
await redis.set(`shipping-quote-token:${token}`, cachedQuote, { ex: ttl });
await redis.set(getShippingBookingSnapshotKeyByToken(token), snapshotJson, { ex: ttl });
// Do NOT set shipping-booking-snapshot:{quoteId} for new quotes
```

**Consume path:**
- Always require `selectedQuoteToken`
- Snapshot key = token-scoped
- CAS delete pair: token key + token snapshot key

**Verification:**
- Unit test: two buyers call getQuotes with same rate-cache hit → different tokens → snapshots independent → buyer A consume still works after buyer B getQuotes
- Existing CAS/buyer mismatch tests still pass

### 1.2 H2 — Align bookability filter at mint/cache time

**Problem:** Cache/normalize keep quotes with `expiresAt > now`; order requires `now + 5m`.

**Design:**
- In `normalizePriority1RateQuotes` / `readShippingRateResponseCache` filter: drop quotes where `!isQuoteBookable(expiresAt)`
- In `getQuotes` before minting tokens: same filter
- Optional: when writing rate cache, store only bookable quotes
- Surface clear error if zero quotes remain after filter

**Files:**
- `src/server/services/shipping-rate-cache.ts`
- `src/server/routers/shipping.ts`
- Tests for cache read/write and getQuotes empty-after-filter

**Verification:**
- Quote with `expiresAt = now + 2m` never returned from getQuotes
- Quote with `expiresAt = now + 10m` returned and consumable

### 1.3 M3 — Align snapshot TTL with token TTL

**Problem:** Snapshot used `secondsUntilProviderExpiry` uncapped; tokens used `min(1800, …)`.

**Design:**
- Use `quoteArtifactTtlSeconds` for **all** artifact writes in getQuotes
- If residual bookable time is < 1s, do not mint

**Files:**
- `src/server/routers/shipping.ts`

**Verification:**
- Assert equal TTL on token + snapshot in tests (mock redis set options)

### 1.4 M5a — Stop writing / consuming `shipping-quote:{quoteId}` as primary

**Problem:** Orphan quoteId keys; fallback path via `selectedQuoteId`.

**Design (two commits if needed):**
1. Stop writing `shipping-quote:{quoteId}` in getQuotes (token + token-snapshot only)
2. Remove consume fallback that loads `shipping-quote:{selectedQuoteId}` once validators already require token
3. Confirm `createOrderSchema` / offer consume require `selectedQuoteToken` only
4. Extend consumption to delete any legacy quoteId key **if** present (best-effort DEL) after successful token consume — optional cleanup, not required for correctness after 1.1

**Files:**
- `src/server/routers/shipping.ts`
- `src/server/routers/order.ts`
- `src/lib/validators/order.ts` (if fallback fields still optional)
- Tests that assert deleted keys

**Verification:**
- Consume only with token succeeds
- Consume with only selectedQuoteId fails validation
- No redis.set for `shipping-quote:` prefix in getQuotes

### Wave 1 gate
```
npm run typecheck
npx vitest run src/server/routers/__tests__/shipping-quote-cache.test.ts
npx vitest run src/server/services/__tests__/shipping-rate-cache.test.ts  # if exists / new
npx vitest run src/server/routers/__tests__/listing-freshness-enforcement.test.ts
# targeted order consume tests
```

**Rollback:** Revert Wave 1 commits. In-flight tokens minted under old keys expire ≤30m; worst case buyers re-quote.

---

## Wave 2 — Dispatch recovery & documents (H3, H4, H5, M6, M7)

**Goal:** Never leave a live Priority1 booking with a stuck local row and no recovery path for BOL/labels.

### 2.1 H3 — Handle post-book parse/host failures

**Problem:** Allowlist/schema validation runs after `POST .../dispatch` returns; claim already set; catch path does not cancel.

**Design (defense in depth):**
1. **Pre-parse resilience:** Keep host allowlist validation, but structure live dispatch so when HTTP 200 body is received:
   - First extract raw shipment id (minimal parse) **before** strict document URL schema
   - If document URLs fail allowlist/schema:
     - Attempt `priority1.cancel` with known id (best effort, log failures)
     - Set shipment `lastError` + open booking review path (existing `ShippingBookingReviewError` patterns)
     - Do **not** leave status ambiguously pending without review signal
2. If cancel succeeds: clear claim eligibility carefully (define state: stay `pending` with error vs `cancelled` local) — prefer **manual review** over auto-re-dispatch to avoid double book if cancel is uncertain
3. If cancel fails / id unknown: manual review with order number + raw response fingerprint in audit/lastError
4. Add metric/log line: `shipping.dispatch.post_book_validation_failed`

**Files:**
- `src/server/services/priority1.ts` — split parse: identity first, documents second
- `src/lib/inngest/functions/shipment-dispatch.ts` — cancel + review on this failure mode
- Tests: `priority1.test.ts`, `shipment-dispatch.test.ts`

**Verification:**
- Live-response fixture with bad BOL host: cancel attempted, review error set, no silent stuck without lastError
- Good dispatch still finalizes as today
- Dry-run path unchanged

### 2.2 H5 — Policy for null BOL/label after successful book

**Problem:** Schema allows null document URLs; finalize still marks dispatched.

**Design (pragmatic, not over-strict):**
- Do **not** hard-fail all null-doc dispatches if Priority1 sometimes legitimately returns docs later (confirm against `docs/priority1-api-analysis.md`)
- Implement:
  - Finalize still allowed when shipment id present
  - Set `docsPendingAt` **or** reuse `lastError`/status flag if schema change is heavy
  - Prefer minimal schema: if `bolUrl` and `labelUrl` both null after finalize → schedule immediate document backfill job (Wave 2.4) and keep status `dispatched` only if provider id exists
- If product requires BOL at pickup always: soft gate seller UI “documents preparing” rather than rolling back carrier book

**Files:**
- `priority1.ts` (comments + optional stricter logging)
- `shipment-dispatch.ts` finalize
- Possibly `shipments` schema if new column needed — **prefer avoid migration** first by using null urls + tracking backfill

**Verification:**
- Dispatch with null docs finalizes with provider id; tracking/backfill path invoked (unit test with mocks)

### 2.3 H4 — Reconcile must not strand shipments without docs

**Problem:** `reconcilePendingShipment` sets `dispatched` without bolUrl/labelUrl.

**Design:**
- After reconcile promotes status, call document backfill helper (shared with tracking)
- If getDocuments available: fetch BillOfLading; persist `bolUrl` when allowlisted
- Labels: fetch if API supports; else leave null and mark docs pending
- Never promote cancelled provider status (already guarded)

**Files:**
- `src/lib/inngest/functions/shipment-dispatch.ts`
- Shared helper e.g. `src/server/services/shipment-documents.ts` (new, small)

**Verification:**
- reconcile test: pending local + provider booked → dispatched + bolUrl set when getDocuments returns BOL
- reconcile test: getDocuments fails → still reconciled for tracking fields but lastError/docs note set

### 2.4 M7 — Tracking backfill BOL (and labels when possible)

**Problem:** `processShipment` only fetches DeliveryReceipt after delivery.

**Design:**
- When `bolUrl` is null and status is dispatched/in_transit: call `getDocuments` BillOfLading (rate-limit: once per N polls or until success)
- When `labelUrl` null: if Priority1 documents API exposes labels, fetch; else no-op
- On delivery: keep DeliveryReceipt behavior
- Validate URLs through existing allowlist helper before persist

**Files:**
- `src/lib/inngest/functions/shipment-tracking.ts`
- New shared `shipment-documents.ts`
- Tests: `shipment-tracking.test.ts`

### 2.5 M6 — Extended/plural label URL fields

**Problem:** Schema validates `capacityProviderPalletLabelExtendedUrl` / `capacityProviderPalletLabelsUrl` then discards them.

**Design (no migration preferred):**
- In finalize, resolve label URL as first non-null of:
  1. `capacityProviderPalletLabelUrl`
  2. `capacityProviderPalletLabelExtendedUrl`
  3. first URL if `capacityProviderPalletLabelsUrl` is string; if array-like string, parse only if already typed — keep simple
- Persist into existing `labelUrl` column only
- Log when falling back to extended/plural

**Files:**
- `shipment-dispatch.ts` (`finalizeDispatchedShipment`)
- Optional pure helper + unit test

**Verification:**
- Fixture with only extended URL → `labelUrl` set
- Fixture with only primary URL → unchanged behavior

### Wave 2 gate
```
npm run test:shipping
npx vitest run src/lib/inngest/functions/__tests__/shipment-dispatch.test.ts
npx vitest run src/lib/inngest/functions/__tests__/shipment-tracking.test.ts
npx vitest run src/server/services/__tests__/priority1.test.ts
```

**Rollback:** Revert Wave 2. Dry-run unaffected. Live cancel path only runs when new failure mode hits — monitor Priority1 cancel errors if partially deployed.

---

## Wave 3 — Quote UX & selection (M1, M2, M4)

**Goal:** UI and selection honesty; reduce stale rate risk without hammering Priority1.

### 3.1 M1 — Client expiry-aware quote refresh

**Design:**
- In `shipping-quote-selector.tsx`:
  - Compute earliest `quoteExpiresAt` among results
  - `refetchInterval`: min(60_000, timeUntilExpiry - buffer) or disable when no data
  - Clear `selectedQuote` when selected token’s expiry is within safety buffer or query refetches and token missing
  - Show compact “rates refresh in Xm” / “expired — refresh” copy if needed (keep minimal)
- Do **not** change global React Query defaults in `providers/index.tsx` (too broad); override per-query only

**Files:**
- `src/components/checkout/shipping-quote-selector.tsx`
- `src/components/checkout/__tests__/…` if present
- Checkout page only if selection clear needs parent callback

**Verification:**
- Component test: options include refetchInterval/staleTime derived from expiry
- Manual: advance fake timers → selection clears / refetch fires

### 3.2 M2 — Rate cache staleness policy

**Design (minimal):**
- Cap rate-response cache TTL more aggressively: `min(600, earliestBookableExpiry residual)` (10m) **or** keep 1800 but re-check bookability on read (Wave 1 already filters)
- Optional: store `fetchedAt`; if `now - fetchedAt > 10m`, treat as miss even if Redis key exists
- Do not revalidate every getQuotes against Priority1 (cost); 10m + bookability filter is enough for launch

**Files:**
- `shipping-rate-cache.ts`
- Tests in shipping-quote-cache / rate-cache tests

**Verification:**
- Cached entry older than policy → getRates called again
- Fresh cache still hits

### 3.3 M4 — Real “best value” third option

**Design:**
- After cheapest + fastest:
  - Score remaining quotes: e.g. `valueScore = shippingPrice / max(transitDays, 1)` (lower better) **or** pick median price among remaining with transit between min and max
  - Document chosen heuristic in comment matching code
  - If only 2 unique quotes, return 2

**Files:**
- `src/server/routers/shipping.ts` (selection block ~364–380)
- Prefer extract `selectTopShippingQuotes(quotes, limit=3)` pure function + unit test (new small file or in shipping-workflow)

**Verification:**
- Unit cases: cheapest≠fastest; third is true middle value not next price
- Single quote list returns 1

### Wave 3 gate
```
npx vitest run src/server/routers/__tests__/shipping-quote-cache.test.ts
npx vitest run src/components/checkout  # relevant tests
npm run typecheck
```

---

## Wave 4 — Cleanup, docs, launch evidence

### 4.1 Remove dead fallbacks & dual-write
- Delete unused `getShippingBookingSnapshotKey(quoteId)` if no callers
- Grep for `shipping-quote:` and `shipping-booking-snapshot:` prefixes; ensure only token form remains
- Update `AGENTS.md` / short note in `docs/priority1-api-analysis.md` only if behavior docs are wrong (optional)

### 4.2 Test matrix (full)
```
npm run typecheck
npm run lint
npm run test
npm run test:shipping
```

### 4.3 Provider-backed (manual / staging — not code)
- [ ] Preview: `PRIORITY1_DRY_RUN=true`
- [ ] Staging smoke: quote → checkout → pay (test Stripe) → dispatch dry-run path
- [ ] One controlled live book **only with authorization**: cancel, track, document fetch
- [ ] Confirm pickup/tracking events still gate Connect transfer (`payout-eligibility` / escrow-auto-release)

### 4.4 Re-run audit workflow
```
/shipping-path-audit
```
Success = 0 high confirmed on previously fixed claims (mediums either fixed or accepted with doc).

---

## Implementation sequence (PR-sized)

| PR | Wave | Scope | Risk |
|----|------|-------|------|
| PR1 | 0 + 1.2 | Helpers + bookability filter | Low |
| PR2 | 1.1 + 1.3 + 1.4 | Token-scoped artifacts + TTL + drop quoteId keys | Medium (checkout path) |
| PR3 | 2.1 | Post-book validation + cancel/review | High (live dispatch) |
| PR4 | 2.2–2.5 | Docs policy, reconcile, tracking backfill, label fallback | Medium |
| PR5 | 3 | Client refresh, cache TTL, best-value | Low |
| PR6 | 4 | Cleanup + full gates + audit re-run | Low |

Do not merge PR3/PR4 without shipping suite green.

---

## File change map (expected)

| File | Waves | Change type |
|------|-------|-------------|
| `src/server/services/shipping-workflow.ts` | 0,1 | helpers, key helpers |
| `src/server/services/shipping-rate-cache.ts` | 1,3 | bookable filter, TTL policy |
| `src/server/routers/shipping.ts` | 1,3 | redis keys, TTL, selection |
| `src/server/routers/order.ts` | 1 | consume by token only |
| `src/lib/validators/order.ts` | 1 | require token; drop id fallback if any |
| `src/server/services/verified-artifact-consumption.ts` | 1 | optional 3-key delete **or** leave 2-key if only token+snapshot |
| `src/server/services/priority1.ts` | 2 | split parse / identity-first |
| `src/lib/inngest/functions/shipment-dispatch.ts` | 2 | cancel/review, finalize labels, reconcile docs |
| `src/lib/inngest/functions/shipment-tracking.ts` | 2 | BOL backfill |
| `src/server/services/shipment-documents.ts` | 2 | **new** shared backfill helper |
| `src/components/checkout/shipping-quote-selector.tsx` | 3 | refetch/expiry |
| Tests under `src/server/**/__tests__`, `src/lib/inngest/**/__tests__`, checkout tests | all | |

**Avoid unless necessary:** DB migrations. Prefer existing `bolUrl`/`labelUrl`/`lastError` columns.

---

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| In-flight checkouts during key migration | Short Redis TTL; deploy PR2 in low traffic; dual-read token-first for one deploy if needed |
| Cancel after bad docs cancels a good booking incorrectly | Only cancel when HTTP 200 + extractable id + validation failure; log provider id; manual review if cancel errors |
| Stricter bookability reduces quote count | Correct behavior; empty state copy: “No bookable rates — try again” |
| getDocuments rate limits | Backfill at most once per poll cycle when null; stop after success |
| Double-book if cancel races | Keep single dispatch claim; never re-dispatch without reconcile/clear claim policy |
| Live provider behavior differs from fixtures | Staging dry-run first; one authorized live smoke |

---

## Rollback plan

1. **Per PR:** `git revert` of the PR merge commit
2. **Redis:** Old keys expire naturally (≤30m); no migration reverse needed
3. **If live cancel misbehaves:** Feature-flag or quick revert of cancel-on-validation-failure path; leave review errors
4. **DB:** No migration in preferred path → no data rollback

---

## Success criteria

- [ ] H1: Two concurrent getQuotes cannot invalidate each other’s token snapshots
- [ ] H2: No quote returned that fails order buffer check
- [ ] H3: Bad document URL after live dispatch attempts cancel + sets review/lastError
- [ ] H4: Reconcile attempts BOL backfill; does not silently omit forever without tracking path
- [ ] H5: Null docs either backfilled or explicitly pending with recovery path
- [ ] M1–M7: Each addressed per design above or explicitly deferred in Review section with owner
- [ ] `npm run test:shipping` green
- [ ] Re-run `/shipping-path-audit` shows 0 remaining **high** on fixed claims
- [ ] No regulated-escrow language introduced; payout still shipment-gated Connect transfer

---

## Out of scope (explicit)

- Changing fee model or payout delay policy
- Priority1 contract renegotiation
- Full rewrite of shipping router
- Production live book storms / load tests (separate `perf:staging`)
- Fixing commercial fee copy on marketing pages (separate `commercial-truth-audit` plan)

---

## Effort estimate (rough)

| Wave | Effort |
|------|--------|
| Wave 0–1 | 0.5–1.5 days |
| Wave 2 | 1–2 days |
| Wave 3 | 0.5 day |
| Wave 4 + audit | 0.5 day |
| **Total** | **~3–5 days** including review/tests |

---

## Checklist (execution tracking)

### Wave 0
- [x] Bookability + TTL helpers + unit tests

### Wave 1
- [x] H1 token-scoped snapshots
- [x] H2 filter at cache/mint
- [x] M3 aligned TTLs
- [x] M5 drop quoteId primary path
- [x] Wave 1 gate green

### Wave 2
- [x] H3 post-book cancel/review
- [x] H5 null-doc policy + hook
- [x] H4 reconcile + docs helper
- [x] M7 tracking BOL backfill
- [x] M6 label URL fallback
- [x] Wave 2 gate green (`test:shipping`)

### Wave 3
- [x] M1 selector refetch/expiry
- [x] M2 rate cache policy
- [x] M4 best-value selection + tests
- [x] Wave 3 gate green

### Wave 4
- [x] Dead code/key cleanup (stopped writing quoteId keys; deprecated helpers kept)
- [x] Full test matrix (`test:shipping` + typecheck + targeted suites)
- [ ] Staging provider checklist
- [ ] Re-run shipping-path-audit

---

## Review

- What shipped (6 batches): Full shipping integrity pass — token-scoped Redis, bookability tiers (20/10/5m), TZ+holiday business days, accessorials, pieces/transit filters, soft doc URLs, post-book cancel/refund/recon, label UI+backfill, tracking CAS, payout evidence, checkout ZIP clear, rate-cache no thinning.
- What was deferred: Live staging provider smoke; accessorial UI on checkout (API flags ready); multi-year holiday table needs annual refresh.
- Audit delta: #1 5 high → #5 10 high → #6 4 high → #7 pending.
- Lessons: Prefer token-scoped Redis artifacts; soft-validate optional provider document URLs; never invent quote expiry; use freight TZ+holidays for pickup windows; tier bookability for payment latency.
