# PlankMarket Code Review

Thorough review of the PlankMarket B2B wood flooring liquidation marketplace codebase.

---

## Critical Issues

### 1. Race Condition in Order Creation (Data Integrity)

**File:** `src/server/routers/order.ts:26-123`

The order creation flow reads the listing, validates availability, creates the order, and then updates the listing quantity — all as separate, non-atomic database operations. Two concurrent buyers can both pass the availability check and purchase the same inventory, causing overselling.

```ts
// Current: separate read, insert, update with no locking
const listing = await ctx.db.query.listings.findFirst({ ... });
// ... validation ...
const [order] = await ctx.db.insert(orders).values({ ... }).returning();
// ... listing update happens separately
```

**Fix:** Wrap the entire flow in a database transaction with `SELECT ... FOR UPDATE` on the listing row to prevent concurrent reads of the same inventory.

---

### 2. Missing Ownership Check on Media Delete (Authorization Bypass)

**File:** `src/server/routers/upload.ts:74-79`

The `deleteMedia` endpoint verifies the caller is a seller but does **not** verify that the media belongs to a listing owned by that seller. Any authenticated seller can delete any other seller's media files.

```ts
deleteMedia: sellerProcedure
  .input(z.object({ id: z.string().uuid() }))
  .mutation(async ({ ctx, input }) => {
    // No ownership check — deletes any media by ID
    await ctx.db.delete(media).where(eq(media.id, input.id));
```

**Fix:** Join through the `listings` table to confirm `listings.sellerId === ctx.user.id` before deleting.

---

### 3. Missing Ownership Check on Saved Search Delete (Authorization Bypass)

**File:** `src/server/routers/search.ts:82-90`

The `deleteSavedSearch` endpoint deletes by ID without verifying the saved search belongs to the calling user. Any authenticated user can delete another user's saved searches.

```ts
deleteSavedSearch: protectedProcedure
  .input(z.object({ id: z.string().uuid() }))
  .mutation(async ({ ctx, input }) => {
    // Missing: AND userId = ctx.user.id
    await ctx.db.delete(savedSearches).where(eq(savedSearches.id, input.id));
```

**Fix:** Add `and(eq(savedSearches.id, input.id), eq(savedSearches.userId, ctx.user.id))` to the where clause.

---

### 4. Floating-Point Types for Monetary Values (Financial Accuracy)

**Files:** `src/server/db/schema/orders.ts`, `src/server/db/schema/listings.ts`

All monetary fields (`askPricePerSqFt`, `buyNowPrice`, `subtotal`, `totalPrice`, `buyerFee`, `sellerFee`, `sellerPayout`) use `real` (PostgreSQL `float4`). Floating-point arithmetic produces rounding errors that compound across order calculations. For a marketplace handling financial transactions, this can result in incorrect charges and payouts.

**Fix:** Use `numeric` / `decimal` column types (Drizzle's `decimal` or `numeric`), or store amounts as integer cents.

---

### 5. Duplicate `ordersRelations` Definition

**Files:** `src/server/db/schema/orders.ts:92-107` and `src/server/db/schema/index.ts:67-82`

`ordersRelations` is defined in both files and both are exported. The barrel export in `index.ts` re-exports from `orders.ts` (line 19) but then defines its own `ordersRelations` (line 67). This causes a duplicate symbol — depending on how Drizzle resolves this, one will shadow the other, potentially causing runtime errors or silent query failures with relations.

**Fix:** Remove the relations definition from `orders.ts` and keep all relations in the central `index.ts` file (or vice versa, but be consistent).

---

## High Severity Issues

### 6. buyNowPrice Calculation Changes as Inventory Depletes

**Files:** `src/server/routers/order.ts:66-68`, `src/app/(marketplace)/listings/[id]/checkout/page.tsx:88-90`

```ts
const pricePerSqFt = listing.buyNowPrice
  ? listing.buyNowPrice / listing.totalSqFt
  : listing.askPricePerSqFt;
```

If `buyNowPrice` is intended as a total lot price, this formula divides by the *current* `totalSqFt`. After a partial purchase reduces `totalSqFt`, subsequent buyers see a different (higher) per-sqft price for the same listing. This is likely unintended and produces inconsistent pricing.

**Fix:** Store the original `totalSqFt` on the listing (e.g., `originalTotalSqFt`) so the per-sqft calculation from `buyNowPrice` remains stable, or store `buyNowPricePerSqFt` directly.

---

### 7. Placeholder UUID Foreign Key in Media Upload

**File:** `src/server/routers/upload.ts:31`

```ts
listingId: input.listingId || "00000000-0000-0000-0000-000000000000", // temp placeholder
```

When no `listingId` is provided, a hardcoded nil UUID is used. This references a non-existent listing, which will either violate the foreign key constraint (causing an error) or create orphaned media records that are never cleaned up.

**Fix:** Make the `listingId` column nullable for staged uploads, or require a draft listing to be created first.

---

### 8. Login Redirect Always Goes to `/seller`

**Files:** `src/lib/supabase/middleware.ts:56`, `src/app/(auth)/login/page.tsx:54`

When an authenticated user visits `/login` or `/register`, the middleware redirects to `/seller` regardless of the user's role. The login page also defaults to `/seller` when no redirect param is provided. Buyers are sent to the wrong dashboard.

```ts
// middleware.ts:56
url.pathname = "/seller"; // Default redirect, will be refined by role — but it isn't
```

**Fix:** Look up the user's role from the session/DB and redirect to the appropriate dashboard path using `getDashboardPath()` from `src/lib/auth/roles.ts`.

---

### 9. No Order Status Transition Validation

**File:** `src/server/routers/order.ts:330-385`

The `updateStatus` endpoint accepts any status from the allowed enum without checking if the transition is valid from the current state. A seller could transition an order from `delivered` back to `confirmed`, or from `cancelled` to `shipped`, which is logically invalid.

**Fix:** Add a state machine or transition map that validates allowed transitions (e.g., `pending` -> `confirmed` -> `processing` -> `shipped` -> `delivered`).

---

### 10. Validated `env.ts` Module Not Actually Used

**File:** `src/env.ts` vs. all server files

The project has a well-configured `@t3-oss/env-nextjs` setup in `src/env.ts`, but no server-side code imports it. Instead, all files access `process.env.STRIPE_SECRET_KEY!`, `process.env.DATABASE_URL!`, etc. directly with non-null assertions. This means:
- Env validation never runs at startup
- Missing env vars cause runtime crashes instead of clear startup errors
- The `!` assertions hide `undefined` values

**Fix:** Import and use `env` from `@/env` everywhere instead of `process.env`.

---

## Medium Severity Issues

### 11. No Database Transaction for Order Creation

**File:** `src/server/routers/order.ts:77-120`

The order insert and listing update are separate queries. If the listing update fails after the order is created, the database is left in an inconsistent state (order exists, listing not updated). This is also related to issue #1.

**Fix:** Use `ctx.db.transaction()` to wrap all related operations.

---

### 12. Missing Query Invalidation After Watchlist Mutations

**File:** `src/app/(marketplace)/listings/[id]/page.tsx:81-101`

After adding/removing from watchlist, the `isWatchlisted` query is not invalidated, so the heart icon state doesn't update until a manual refresh.

**Fix:** Call `utils.watchlist.isWatchlisted.invalidate()` from the tRPC utils after mutation success.

---

### 13. No Search Input Debounce

**File:** `src/app/(marketplace)/listings/page.tsx:79-80`, `src/lib/stores/search-store.ts:48-51`

Every keystroke in the search input immediately triggers `setQuery`, which updates the store and fires a new tRPC query. This creates excessive API calls and database queries during typing.

**Fix:** Add debounce (300-500ms) to the search input before updating the store/firing queries.

---

### 14. View Count Easily Manipulable

**File:** `src/server/routers/listing.ts:137-142`

View count is incremented on every `getById` call with no deduplication, rate limiting, or session tracking. Repeated page loads or automated requests can trivially inflate counts.

**Fix:** Track views per user/session (e.g., via Redis with TTL), or move view tracking to a background job with deduplication.

---

### 15. LIKE Pattern Characters Not Escaped in Search

**File:** `src/server/routers/listing.ts:155-161`

While Drizzle ORM properly parameterizes the value (preventing SQL injection), the `%` and `_` special characters in user input are not escaped before use in `ilike`. A user searching for `%` would match every listing. A search for `_` matches any single character.

```ts
ilike(listings.title, `%${input.query}%`)
```

**Fix:** Escape `%`, `_`, and `\` in `input.query` before wrapping with `%..%`.

---

### 16. No Connection Pool Configuration

**File:** `src/server/db/index.ts:5-9`

```ts
const queryClient = postgres(connectionString);
```

The postgres.js client is created with defaults and no pool sizing. On Vercel (serverless), each function invocation may create a new connection, risking PostgreSQL connection exhaustion. The `DATABASE_URL` should point to a connection pooler (e.g., Supabase's pgBouncer URL), and explicit pool limits should be set.

**Fix:** Add `{ max: 1 }` for serverless or use Supabase's pooler connection string.

---

### 17. Stripe Webhook Null Safety

**File:** `src/app/api/webhooks/stripe/route.ts:15`

```ts
const signature = req.headers.get("stripe-signature")!;
```

If the `stripe-signature` header is missing, this passes `null` (asserted as string) to `constructEvent`, which will throw an unhelpful error. The `!` hides the actual issue.

**Fix:** Check for null explicitly and return a 400 response with a clear message.

---

### 18. No Rate Limiting on Auth Endpoints

**Files:** `src/server/routers/auth.ts` (register), `src/app/(auth)/login/page.tsx` (login via Supabase client)

Registration and login have no rate limiting. While Supabase has some built-in rate limiting, the tRPC `register` endpoint creates a database record on every call and should have its own protection.

**Fix:** Add rate limiting via Upstash Redis (already in the stack) at the tRPC middleware level.

---

### 19. Order Emails Not Sent

**File:** `src/server/routers/order.ts`

Email infrastructure exists (`src/lib/email/send.ts` with `sendOrderConfirmationEmail`) but the order creation flow never calls it. Neither buyers nor sellers receive email confirmation when an order is placed.

**Fix:** Call `sendOrderConfirmationEmail` (and a seller notification) after successful order creation.

---

## Low Severity / Code Quality Issues

### 20. Missing `next/image` Usage

**Files:** All component files rendering images (`listing-card.tsx`, `page.tsx` files)

Raw `<img>` tags are used everywhere instead of `next/image`, missing out on automatic image optimization, lazy loading, responsive sizing, and WebP/AVIF conversion. For a marketplace with many product images, this directly impacts performance and Core Web Vitals.

---

### 21. Checkout Form Has Stale Default Values

**File:** `src/app/(marketplace)/listings/[id]/checkout/page.tsx:49-52`

```ts
defaultValues: {
  listingId,
  quantitySqFt: listing?.totalSqFt ?? 0, // listing is undefined during initial render
},
```

`listing` is undefined during the initial render (while the query is loading), so `quantitySqFt` defaults to `0`. `useForm` captures `defaultValues` on mount and doesn't update when data arrives.

**Fix:** Use `useEffect` to call `reset()` when listing data loads, or defer rendering the form until data is available.

---

### 22. Missing `Suspense` Boundaries for `useSearchParams`

**Files:** `src/app/(auth)/register/page.tsx:34`, `src/app/(auth)/login/page.tsx:29`

`useSearchParams()` in Next.js App Router requires the component to be wrapped in a `Suspense` boundary, or the build will fail in production. Neither page has this wrapper.

**Fix:** Wrap these pages in `<Suspense>` or move `useSearchParams` into a child component wrapped in Suspense.

---

### 23. `SortOption` Type Mismatch

**Files:** `src/types/index.ts:127-135` vs. `src/lib/validators/listing.ts:183-192`

The `SortOption` type includes `"proximity"` but the Zod `listingFilterSchema` does not. The listings page works around this with a fallback (`filters.sort === "proximity" ? "date_newest" : filters.sort`), but this indicates a type/schema mismatch that should be reconciled.

---

### 24. Unnecessary Dynamic Imports in `getFacets`

**File:** `src/server/routers/search.ts:95-96`

```ts
const { listings } = await import("../db/schema");
const { eq, sql } = await import("drizzle-orm");
```

These modules are already imported at the top of the file. The dynamic imports are redundant and add unnecessary overhead.

---

### 25. `as never` Type Cast

**File:** `src/server/routers/search.ts:28`

```ts
filters: input.filters as never,
```

This suppresses a type mismatch between the Zod-inferred type and the JSONB column type. It bypasses type safety and could mask real type errors.

**Fix:** Properly type the `jsonb` column to match the Zod schema output, or use a type assertion to the correct type.

---

### 26. `reorderMedia` N+1 Query Pattern

**File:** `src/server/routers/upload.ts:58-68`

```ts
await Promise.all(
  input.mediaOrder.map(({ id, sortOrder }) =>
    ctx.db.update(media).set({ sortOrder }).where(...)
  )
);
```

This fires N separate UPDATE queries (one per media item). For large galleries, this is inefficient.

**Fix:** Use a single SQL `UPDATE ... FROM (VALUES ...)` statement or a CASE expression.

---

## Summary

| Severity | Count | Key Themes |
|----------|-------|------------|
| Critical | 5 | Race conditions, authorization bypasses, floating-point money, duplicate relations |
| High | 5 | Pricing bugs, dead env validation, wrong redirect, no state machine |
| Medium | 9 | Missing transactions, no debounce, view manipulation, no rate limiting |
| Low | 7 | Missing optimizations, type mismatches, code quality |

**Top 3 priorities to address:**
1. Wrap order creation in a DB transaction with row locking (issues #1, #11)
2. Fix authorization bypasses on media delete and saved search delete (issues #2, #3)
3. Switch monetary fields to `numeric`/`decimal` types (issue #4)
