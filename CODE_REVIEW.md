# PlankMarket — Comprehensive Code Review

**Date:** 2026-02-12
**Scope:** Full codebase review — database schema, authentication, API routers, UI components, background jobs, email, and infrastructure.
**Application:** B2B Flooring Inventory Liquidation Marketplace (Next.js 16.1 / tRPC / Supabase / Stripe / Drizzle ORM)

---

## Table of Contents

1. [Critical Issues](#critical-issues)
2. [High Severity Issues](#high-severity-issues)
3. [Medium Severity Issues](#medium-severity-issues)
4. [Low Severity Issues](#low-severity-issues)
5. [Summary](#summary)

---

## Critical Issues

### C1. SQL Injection Anti-Pattern via `sql.raw()` in Media Reorder

**File:** `src/server/routers/upload.ts:64-69`

User-derived values are interpolated into a raw SQL string and injected via `sql.raw()`:

```ts
const caseFragments = input.mediaOrder
  .map((m) => `WHEN '${m.id}' THEN ${m.sortOrder}`)
  .join(" ");

await ctx.db.execute(
  sql`UPDATE media SET sort_order = CASE id::text ${sql.raw(caseFragments)} END ...`
);
```

While Zod validates `m.id` as UUID and `m.sortOrder` as integer, the `sql.raw()` pattern bypasses parameterized queries. If validation is ever relaxed, this becomes a direct SQL injection vector. Should be refactored to use parameterized queries.

---

### C2. Escrow Auto-Release Does Not Actually Transfer Funds

**File:** `src/lib/inngest/functions/escrow-auto-release.ts:47-55`

The function marks `escrowStatus` as `"released"` and sends the seller an email saying "funds have been released and transferred to your account," but there is no actual Stripe Transfer API call. The comment says "In a real implementation, this would trigger Stripe Transfer API." The database state claims money was transferred when no transfer occurred. This is a financial integrity issue.

---

### C3. Promotion Race Condition Between Cron Job and Stripe Webhook

**Files:** `src/app/api/cron/expire-promotions/route.ts:46-53`, `src/app/api/webhooks/stripe/route.ts:52-77`

Race condition flow:
1. Cron reads stale promotions (including listing X's expired promotion)
2. Stripe webhook fires for a new promotion payment on listing X, writes new `promotionTier`/`promotionExpiresAt`
3. Cron's bulk update runs: `SET promotionTier = null, promotionExpiresAt = null` for all listings in its stale set — including listing X
4. **Result:** The newly paid-for promotion is invisible because denormalized fields were wiped

The cron job should only clear fields for listings that have no remaining active promotions, and ideally use row-level locking.

---

### C4. Cascade Delete Chain from Users Destroys Business Data

**File:** `src/server/db/schema/listings.ts:92`

Deleting a user cascades to listings (`onDelete: "cascade"`), which further cascades to media, watchlist items, offers, offer events, conversations, messages, and promotions. Combined with `restrict` on orders (`orders.ts:31,34`), this creates a paradox: if a user's listing has orders, the cascade tries to delete the listing but is blocked by the `restrict` — resulting in a foreign key violation error. For a marketplace, soft-delete is strongly preferred over cascade deletion.

---

### C5. Floating-Point Types for Financial Values (Inconsistent)

**Files:** `src/server/db/schema/offers.ts:38-40`, `src/server/db/schema/offer-events.ts:35-37`

The schema defines a `money` custom type (`numeric(12,4)`) for precise financial storage, but offers and offer events use `real` (float4) for `offerPricePerSqFt`, `quantitySqFt`, and `totalPrice`. This inconsistency means offer negotiation calculations use floating-point arithmetic while orders use precise decimal, causing price discrepancies when an accepted offer becomes an order.

---

### C6. Open Redirect on Login Page

**File:** `src/app/(auth)/login/page.tsx:61`

```ts
router.push(redirect || getDashboardPath(session.user.role));
```

The `redirect` parameter from `searchParams.get("redirect")` is used directly without validation. An attacker can craft `/login?redirect=https://evil.com` to redirect users to a phishing site after authentication. The value should be validated as a relative path on the same origin.

---

### C7. Seed Script Can Destroy Production Data

**File:** `scripts/seed.ts:670-686`

The seed script unconditionally deletes ALL data from every table and ALL Supabase auth users with no environment check or confirmation. If run against a production database (e.g., if `.env.local` contains a production connection string), all data is permanently destroyed.

---

### C8. Abandoned Checkout Detection Logic is Wrong

**File:** `src/lib/inngest/functions/abandoned-checkout.ts:30-38`

The check queries orders by `listingId` only, ignoring `buyerId`. If *any* buyer placed *any* order on a listing, all future abandoned-checkout reminders for every other buyer are suppressed. The query should filter by both `listingId` AND `buyerId`.

---

## High Severity Issues

### H1. `||` Instead of `??` for Accepted Offer Price

**File:** `src/server/routers/offer.ts:410`

```ts
const acceptedPrice = offer.counterPricePerSqFt || offer.offerPricePerSqFt;
```

If `counterPricePerSqFt` is `0`, the `||` operator falls through to `offerPricePerSqFt`. A counter-offer of $0/sqft is silently ignored and the original offer price used instead. Should use nullish coalescing (`??`).

---

### H2. No Ownership Check on Media Upload and Reorder

**File:** `src/server/routers/upload.ts:27-43, 59-73`

`recordUpload` and `reorderMedia` accept a `listingId` but never verify the listing belongs to the calling seller. Any authenticated seller can attach media to or reorder media on any other seller's listing.

---

### H3. No Rate Limiting on Any Endpoint

Despite having Upstash Redis configured, there is no rate limiting applied to any tRPC endpoint. Critical endpoints that need rate limiting:
- `auth.register` — mass account creation
- `payment.createPaymentIntent` — payment abuse
- `message.sendMessage` — spam
- `offer.createOffer` — offer flooding
- All public query endpoints — data scraping

---

### H4. No `updatedAt` Auto-Update Mechanism

**Files:** All schema files with `updatedAt` columns

Every `updatedAt` column uses `.defaultNow()` which only sets the value on INSERT. There is no database trigger or Drizzle hook to update it on UPDATE. If application code forgets to set `updatedAt`, it permanently shows the creation timestamp. Affected tables: users, listings, orders, offers, disputes, saved searches, reviews.

---

### H5. Unverified Sellers Can Create Listings

**File:** `src/server/routers/listing.ts:16`

The `sellerProcedure` only checks role, not verification status. A newly registered, unverified seller can immediately create listings and accept payments. The `verified` check only exists in the promotion router. For a B2B marketplace handling real money, seller verification should be required before listing creation.

---

### H6. No Webhook Idempotency Protection

**File:** `src/app/api/webhooks/stripe/route.ts:37-147`

Stripe can deliver webhook events more than once. The handler does not track processed `event.id` values. Re-processing `payment_intent.succeeded` recalculates `startsAt`/`expiresAt` relative to `new Date()`, resetting promotion timing.

---

### H7. `parseInt` Without NaN Check on Webhook Metadata

**File:** `src/app/api/webhooks/stripe/route.ts:49`

```ts
parseInt(durationDays, 10) * 24 * 60 * 60 * 1000
```

If `durationDays` is missing or non-numeric from PaymentIntent metadata, `parseInt` returns `NaN`, producing an invalid `expiresAt` date written to the database.

---

### H8. Deactivated Users Can Still Use the API

**File:** `src/server/trpc.ts:55-68`

The `enforceAuth` middleware checks `ctx.authUser` and `ctx.user` exist but does not check `ctx.user.active`. An admin can deactivate a user, but that user continues to authenticate and use the API until their Supabase session expires.

---

### H9. Role-Based Order Access Check Instead of Relation-Based

**File:** `src/server/routers/order.ts:170-174`

```ts
ctx.user.role === "seller"
  ? eq(orders.sellerId, ctx.user.id)
  : eq(orders.buyerId, ctx.user.id)
```

Access is based on the user's *role*, not their *relation* to the order. The correct check should be "is this user the buyer OR the seller?" regardless of role.

---

### H10. HTML Injection in Background Job Emails

**Files:** All 4 Inngest functions (`abandoned-checkout.ts`, `escrow-auto-release.ts`, `saved-search-alerts.ts`, `listing-expiry-warning.ts`)

User-controlled values (listing titles, user names) are interpolated directly into raw HTML email strings without escaping. A seller with a listing title containing `<img src=x onerror=...>` gets that rendered in emails. The codebase has React-email templates with proper JSX escaping, but the Inngest functions use raw HTML strings instead.

---

### H11. Duplicate Emails on Inngest Retries

**Files:** All 4 Inngest functions

All email sending happens inside a single `step.run()`. If the step fails after sending some emails, the retry re-sends to all recipients including those already emailed. Each user's email should be its own Inngest step, or use `step.sendEvent` to fan out.

---

### H12. Cron Secret Reuses Inngest Event Key

**File:** `src/app/api/cron/expire-promotions/route.ts:18`

The cron endpoint uses `INNGEST_EVENT_KEY` as its auth bearer token. If either secret leaks, both systems are compromised. These should be separate secrets.

---

### H13. Client-Side-Only Admin Route Protection

**File:** `src/app/(admin)/layout.tsx:18-22`

The admin layout is a `"use client"` component that checks role and calls `router.push("/")`. No server-side middleware enforces admin-only access. The page UI shell renders briefly before redirect, and the redirect can be suppressed.

---

### H14. No Role-Based Middleware Path Protection

**File:** `src/lib/supabase/middleware.ts:39-52`

The middleware checks only authentication, not authorization. A buyer can navigate to `/admin` or `/seller` pages without being blocked at the middleware layer. tRPC queries would fail, but the UI shell and layouts are still rendered.

---

## Medium Severity Issues

### M1. Listing Update Doesn't Re-derive Geo Coordinates

**File:** `src/server/routers/listing.ts:64-91`

The `create` procedure does ZIP-to-lat/lng lookup, but `update` doesn't recalculate coordinates when `locationZip` changes, causing stale distance calculations in search.

---

### M2. Non-Atomic Watchlist Count Updates

**File:** `src/server/routers/watchlist.ts:13-65`

The watchlist insert and listing count increment are separate queries with no transaction. Concurrent operations cause count drift.

---

### M3. No Status Check Before Listing Edit

**File:** `src/server/routers/listing.ts:57-92`

A seller can update a listing with status `"sold"`, `"expired"`, or `"archived"`. Only `"active"` or `"draft"` should be editable.

---

### M4. Order Status Update TOCTOU Race Condition

**File:** `src/server/routers/order.ts:370-431`

The status check and update are not in a transaction. Concurrent requests can bypass the status transition validation.

---

### M5. Offer Quantity Not Validated Against Listing Availability

**File:** `src/server/routers/offer.ts:104-227`

Unlike order creation, `createOffer` does not check that the requested quantity is available. An offer for 1,000,000 sq ft on a 100 sq ft listing is accepted.

---

### M6. Duplicate Offer and Promotion Race Conditions

**Files:** `src/server/routers/offer.ts:150-174`, `src/server/routers/promotion.ts:107-201`

Existing-item checks are performed outside transactions. Two concurrent requests can both pass the check and create duplicates.

---

### M7. Missing LIKE Wildcard Escaping in Admin Routes

**File:** `src/server/routers/admin.ts:84-91, 150, 224, 517`

Admin search uses `like()` with raw input in four places. The public listing search properly escapes `%` and `_`, but admin searches don't. Lower risk since admin-only, but still a correctness issue.

---

### M8. `updateProfile` Spreads Raw Input into DB Update

**File:** `src/server/routers/auth.ts:85-92`

```ts
.set({ ...input, updatedAt: new Date() })
```

While the schema is currently restricted, the spread pattern means any field added to the schema automatically gets written. If `role` or `verified` were added, it becomes a privilege escalation vector.

---

### M9. Full User Row Leaked via API Responses

**Files:** `src/server/routers/auth.ts:70-79` (register, getProfile)

Registration and profile endpoints return the full user database row including `authId`, `stripeAccountId`, and other internal fields. Should select only necessary columns.

---

### M10. `watch()` Without Arguments Causes Full-Form Re-renders

**Files:** `src/app/(dashboard)/seller/listings/new/page.tsx:139`, `src/components/listings/make-offer-dialog.tsx:74`

Calling `watch()` with no arguments subscribes to ALL form field changes, causing the entire component tree to re-render on every keystroke. Should use `watch("specificField")` or `useWatch`.

---

### M11. Search Filters Not Synchronized with URL

**File:** `src/lib/stores/search-store.ts`

All search/filter state lives in Zustand memory, not URL query parameters. Bookmarking, browser back/forward, sharing links, and page refresh all lose filter state.

---

### M12. ErrorBoundary Defined But Never Used

**File:** `src/components/ui/error-boundary.tsx`

The component exists but is never imported or used in any layout. A tRPC query failure or rendering exception results in an uncaught error with a white screen.

---

### M13. Missing Error Handling on tRPC Queries (Multiple Pages)

**Files:** Checkout page (`src/app/(marketplace)/listings/[id]/checkout/page.tsx:40-42`), buyer orders (`src/app/(dashboard)/buyer/orders/page.tsx:12-15`), seller listings (`src/app/(dashboard)/seller/listings/page.tsx:29-33`), and others.

Multiple pages destructure `{ data, isLoading }` from tRPC queries without handling `error` or `isError`. Failed queries silently show "Not Found" states instead of error messages.

---

### M14. Raw `<img>` Tags Bypass Next.js Image Domain Restrictions

**Files:** `src/components/promotions/hero-banner.tsx:53-58`, `src/components/promotions/sponsored-carousel.tsx:83-87`

Raw `<img>` tags bypass the `remotePatterns` restriction in `next.config.ts`. Malicious sellers could have listing images from attacker-controlled domains rendered in these components. Also misses image optimization, lazy loading, and responsive sizing.

---

### M15. Checkout Race Between Order Creation and Payment

**File:** `src/app/(marketplace)/listings/[id]/checkout/page.tsx:78-104`

`onSubmit` performs sequential mutations: `createOrder` then `createPaymentIntent`. If the user navigates away between steps, an order exists without a payment intent. The `orderId` and `clientSecret` are in ephemeral React state — page refresh loses them.

---

### M16. Stringly-Typed Status Fields Without Enum Enforcement

**Files:** `src/server/db/schema/users.ts:35` (`verificationStatus`), `orders.ts:54,68` (`paymentStatus`, `escrowStatus`), `feedback.ts:22` (`type`), `promotions.ts:40` (`paymentStatus`)

Five fields use `varchar` where a `pgEnum` is warranted. Any arbitrary string can be inserted at the database level.

---

### M17. No Audit Logging

No audit trail exists for security-sensitive operations: admin role changes, verification approvals, dispute resolutions, payment events, login events. For a financial marketplace, this is a compliance gap.

---

### M18. Missing Rating CHECK Constraints

**File:** `src/server/db/schema/reviews.ts:29,36-38`

Rating fields (1-5 scale) have no database-level CHECK constraint. Application validation exists but nothing prevents inserting `rating = 999` directly.

---

### M19. Media `listingId` Nullable — Orphan Records

**File:** `src/server/db/schema/media.ts:16-17`

`listingId` is not `.notNull()`, allowing orphan media records with no listing association. Combined with no cleanup job, these accumulate indefinitely.

---

### M20. No Tax Tracking on Orders

**File:** `src/server/db/schema/orders.ts`

No `taxAmount` field. For a commerce application, this is a legal compliance issue in most jurisdictions.

---

### M21. No Order-to-Offer Link

**File:** `src/server/db/schema/orders.ts`

No `offerId` foreign key. When an accepted offer becomes an order, there is no database link tracing order provenance.

---

### M22. Saved Search Alerts — Timestamp Gap Causes Missed Listings

**File:** `src/lib/inngest/functions/saved-search-alerts.ts:119-123`

`lastAlertAt` is updated to `new Date()` after the query, but the query executed potentially seconds earlier. Listings created between query execution and timestamp update are missed in the next cycle.

---

### M23. No Unsubscribe Link in Email Templates

**File:** `src/emails/components/layout.tsx:37-45`

The email footer says "You are receiving this email because you have an account" but provides no unsubscribe mechanism. For promotional emails, this may violate CAN-SPAM requirements.

---

### M24. Admin Can Create Other Admins Without Audit

**File:** `src/server/routers/admin.ts:342-389`

An admin can set any user's role to `"admin"` with no two-admin approval, no audit trail, and no self-protection mechanisms.

---

### M25. Legacy and Modern Offer Endpoints Coexist

**File:** `src/server/routers/offer.ts`

Modern endpoints (`createOffer`, `counterOffer`, etc.) and deprecated legacy endpoints (`respond` at line 910, `withdraw` at line 993) are both accessible. The legacy `respond` doesn't create `offerEvents` records, doesn't update `lastActorId`, and doesn't send notifications — bypassing the offer state machine audit trail.

---

## Low Severity Issues

### L1. No `lastLoginAt` Tracking on Users

**File:** `src/server/db/schema/users.ts`

Cannot track user engagement or detect dormant accounts.

---

### L2. Inconsistent Pagination Response Shapes

Multiple response formats across routers: `{ items }` vs `{ offers }` vs `{ disputes }` vs `{ conversations }`. Some include `hasMore`, some don't. A consistent shape would simplify client-side pagination.

---

### L3. Missing Pagination on Several Endpoints

**Files:** `search.ts:38-45` (`getMySavedSearches`), `offer.ts:857-903` (`getByListing`), `admin.ts:288-295` (`getPendingVerifications`), `offer.ts:715-758` (`getOfferHistory`)

These endpoints return unbounded result sets with no limit.

---

### L4. N+1 Query in Promotion Expiry

**File:** `src/server/routers/promotion.ts:454-496`

Each stale promotion triggers an individual listing lookup. Should batch-fetch listing data.

---

### L5. Hardcoded Email `from` Address in Inngest Functions

**Files:** All 4 Inngest functions

All hardcode `"PlankMarket <noreply@plankmarket.com>"` instead of using the validated `env.EMAIL_FROM`. Environment overrides are never applied for background job emails.

---

### L6. Freight Estimate Uses Artificial Delay

**File:** `src/components/listings/freight-estimate.tsx:51-57`

`calculateEstimate` wraps a synchronous calculation in `setTimeout(..., 500)` to simulate async behavior. This 500ms delay degrades UX for no reason.

---

### L7. Weak Password Requirements

**File:** `src/lib/validators/auth.ts:6-9`

Only enforces min 8 / max 72 character length. No complexity requirements (uppercase, lowercase, digits, special characters).

---

### L8. `zodResolver(listingFormSchema) as never` Type Suppression

**File:** `src/app/(dashboard)/seller/listings/new/page.tsx:135`

The `as never` cast hides genuine type mismatches between the Zod resolver and form schema.

---

### L9. PhotoUpload Ignores `initialMediaIds` Prop

**File:** `src/components/listings/photo-upload.tsx:26`

Accepts `initialMediaIds` but never uses it. State always initializes empty, so previously uploaded images are lost on re-render.

---

### L10. ARIA Accessibility Issues

**Files:** Multiple components

| Component | Issue |
|-----------|-------|
| `hero-banner.tsx:101-131` | Carousel nav buttons lack `aria-label` |
| `sponsored-carousel.tsx:51-66` | Scroll buttons lack `aria-label` |
| `faceted-filters.tsx:230-241` | Mixed `role="option"` with `aria-pressed` (contradictory) |
| `listing-card.tsx:146,155,159` | Decorative icons missing `aria-hidden` |
| `seller/listings/new/page.tsx:228-267` | Step nav buttons lack accessible labels on mobile |
| `seller/listings/new/page.tsx:283-293` | Form errors missing `aria-describedby` |
| `seller/listings/new/page.tsx:744-765` | Certification badges act as toggles without proper ARIA |
| `admin/layout.tsx:41` | Missing `id="main-content"` for skip navigation |

---

### L11. Missing `Suspense` Boundaries for `useSearchParams`

**Files:** `src/app/(auth)/register/page.tsx:34`, `src/app/(auth)/login/page.tsx:29`

`useSearchParams()` in Next.js App Router requires a `Suspense` boundary or the production build will fail.

---

### L12. View Count Easily Manipulable

**File:** `src/server/routers/listing.ts:137-142`

View count incremented on every `getById` call with no deduplication or rate limiting.

---

### L13. Dual-State Form Management in Listing Creation

**File:** `src/app/(dashboard)/seller/listings/new/page.tsx:122-137`

Uses both Zustand store (persisted to localStorage) and react-hook-form simultaneously. The dual source of truth creates sync issues across step navigation.

---

### L14. `noreply` Sender with "Reply to this email" Copy

**File:** `src/lib/inngest/functions/abandoned-checkout.ts:83`

Email body says "Reply to this email and we'll help" but the sender is `noreply@plankmarket.com`.

---

### L15. No Connection Pool Configuration

**File:** `src/server/db/index.ts:5-9`

The postgres.js client uses defaults with no pool sizing. On serverless (Vercel), each invocation may create a new connection, risking PostgreSQL connection exhaustion.

---

### L16. Redundant Database Indexes

**Files:** `src/server/db/schema/orders.ts:91`, `src/server/db/schema/reviews.ts:57`

Indexes on `orderNumber` and `orderId` are redundant because both columns already have `.unique()` constraints, which create unique indexes automatically.

---

### L17. No Dispute Status on Orders

**File:** `src/server/db/schema/orders.ts:15-23`

The `orderStatusEnum` is missing a `"disputed"` status. When a dispute is opened, the order status doesn't reflect it.

---

### L18. `payment.getConnectStatus` Swallows All Stripe Errors

**File:** `src/server/routers/payment.ts:213-215`

Any Stripe API error returns `{ connected: false, onboardingComplete: false }`, potentially misleading the user about their actual Stripe status.

---

### L19. Inconsistent Currency Formatting

Various files use manual `$${value.toLocaleString()}` while others use a shared `formatCurrency()` utility. Inconsistent formatting across the app.

---

---

## Summary

| Severity | Count | Key Themes |
|----------|-------|------------|
| **Critical** | 8 | SQL injection pattern, fake escrow release, promotion race condition, cascade deletes, financial precision, open redirect, seed script safety, wrong checkout detection |
| **High** | 14 | Business logic errors ($0 price bug), authorization bypasses, no rate limiting, no webhook idempotency, client-only admin guard, HTML injection in emails |
| **Medium** | 25 | Race conditions, missing transactions, stale geo data, no audit logging, no tax tracking, inconsistent enums, search UX gaps, error handling gaps |
| **Low** | 19 | Accessibility issues, pagination gaps, N+1 queries, password policy, type suppressions, formatting inconsistencies |

### Top 5 Priorities

1. **Fix the SQL injection pattern** in `upload.ts` — replace `sql.raw()` with parameterized queries (C1)
2. **Implement the actual Stripe Transfer** in escrow auto-release, or clearly mark it as unimplemented and suppress the misleading email (C2)
3. **Fix the promotion cron/webhook race condition** — use row-level locking and only clear denormalized fields when no active promotions remain (C3)
4. **Add ownership checks** on media upload, reorder, and delete endpoints (H2)
5. **Add rate limiting** using the already-configured Upstash Redis on auth, payment, and messaging endpoints (H3)
