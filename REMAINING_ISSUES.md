# PlankMarket — Remaining Code Review Issues

**Date:** 2026-02-13
**Status:** Post-fix triage. These issues were deferred from the initial 45+ fix batch because they require schema migrations, architectural decisions, or multi-file refactors.

---

## At a Glance

| ID | Severity | Issue | Type | Complexity |
|----|----------|-------|------|------------|
| H1 | High | Missing indexes on foreign keys | DB migration | Low |
| H4 | High | No unique constraint on `orderNumber` | DB migration | Low |
| M3 | Medium | `listingId` not indexed on saved searches | DB migration | Low |
| M6 | Medium | No DB-level check constraints on prices/quantities | DB migration | Low |
| M11 | Medium | Search filters not synced with URL | Frontend | High |
| M15 | Medium | Checkout race condition | Backend | Already mitigated |
| M17 | Medium | No audit log table | DB + Backend | High |
| M19 | Medium | Saved search alert frequency not configurable | DB + Backend + Inngest | Medium |
| M24 | Medium | Admin can create other admins without guardrails | Backend + DB | High |
| L2 | Low | Inconsistent pagination response shapes | Backend + Frontend | Medium |
| L9 | Low | PhotoUpload ignores `initialMediaIds` | Frontend | Low |
| L12 | Low | View count manipulation | Backend + DB | Medium |

---

## Database Schema Issues

### H1. Missing Indexes on Foreign Keys

**Files:**
- `src/server/db/schema/orders.ts` — `buyerId`, `sellerId`, `listingId`
- `src/server/db/schema/offers.ts` — `buyerId`, `sellerId`, `listingId`
- `src/server/db/schema/media.ts` — `listingId`

**Problem:** Foreign key columns used in WHERE clauses, JOINs, and ORDER BY across multiple routers have no index. Every query filtering orders by buyer, offers by listing, or media by listing performs a sequential scan.

**Impact:** Query performance degrades linearly with table size. On a marketplace with 10k+ orders, buyer dashboard and admin order list become noticeably slow.

**Fix:**
```ts
// In each schema file's table config function:
export const ordersRelations = ...;
// Add:
(table) => [
  index("orders_buyer_id_idx").on(table.buyerId),
  index("orders_seller_id_idx").on(table.sellerId),
  index("orders_listing_id_idx").on(table.listingId),
]
```

**Effort:** Single migration, ~15 lines. No code changes. Non-breaking. Can run online (CREATE INDEX CONCURRENTLY).

---

### H4. No Unique Constraint on `orderNumber`

**File:** `src/server/db/schema/orders.ts:60`

**Current code:**
```ts
orderNumber: varchar("order_number", { length: 20 }).notNull(),
```

**Problem:** `orderNumber` is generated as `PM-{timestamp}-{random}` but there is no unique constraint. A collision (however unlikely) would create two orders with the same human-readable identifier, breaking order lookup, email references, and Stripe transfer groups.

**Fix:**
```ts
orderNumber: varchar("order_number", { length: 20 }).notNull().unique(),
```

**Effort:** Single migration adding a unique index. Non-breaking unless duplicate `orderNumber` values already exist in the database (check first).

---

### M3. `listingId` Not Indexed on Saved Searches

**File:** `src/server/db/schema/saved-searches.ts`

**Problem:** The saved searches table has no index on `userId`, which is the primary lookup key. Every call to `getMySavedSearches` (filtered by `userId`) scans the full table.

**Fix:** Add `index("saved_searches_user_id_idx").on(table.userId)` in the table config.

**Effort:** Trivial migration.

---

### M6. No DB-Level Check Constraints on Prices/Quantities

**Files:**
- `src/server/db/schema/listings.ts` — `askPricePerSqFt`, `totalSqFt`
- `src/server/db/schema/orders.ts` — `totalPrice`, `quantitySqFt`, `sellerPayout`
- `src/server/db/schema/offers.ts` — `offerPricePerSqFt`, `quantitySqFt`

**Problem:** While Zod validates on input, nothing prevents a bug in business logic from writing a negative price or zero quantity to the database. A CHECK constraint is the last line of defense.

**Fix:**
```sql
ALTER TABLE listings ADD CONSTRAINT listings_price_positive CHECK (ask_price_per_sq_ft > 0);
ALTER TABLE listings ADD CONSTRAINT listings_sqft_positive CHECK (total_sq_ft > 0);
ALTER TABLE orders ADD CONSTRAINT orders_total_price_positive CHECK (total_price > 0);
-- etc.
```

**Effort:** Migration-only. No code changes. Will fail if invalid data already exists (validate first).

---

## Frontend Issues

### M11. Search Filters Not Synced with URL

**Files:**
- `src/lib/stores/search-store.ts:24-65`
- `src/app/(marketplace)/listings/page.tsx`

**Current behavior:** All search/filter state lives in a Zustand store with no URL synchronization:

```ts
// search-store.ts
export const useSearchStore = create<SearchState>((set) => ({
  filters: { ...defaultFilters },
  setFilters: (filters) => set({ filters }),
  // No URL read/write
}));
```

**Problem:**
1. Users cannot bookmark or share filtered search results
2. Browser back/forward does not restore filters
3. Page refresh loses all search state
4. No SEO-friendly URLs for filtered views

**Required changes:**
1. Read `useSearchParams()` on mount and hydrate the store
2. On every filter/sort/page change, call `router.replace()` with updated query params
3. Debounce URL updates to avoid excessive history entries
4. Remove Zustand persistence for filters (URL becomes the source of truth)

**Affected components:** Filter sidebar, sort dropdown, pagination, listing page, any component calling `useSearchStore().setFilters`.

**Complexity:** High — bidirectional sync between store and URL is the tricky part. Risk of infinite update loops if not careful.

---

### L9. PhotoUpload Ignores `initialMediaIds`

**File:** `src/components/listings/photo-upload.tsx:14-27`

**Current code:**
```tsx
interface PhotoUploadProps {
  onImagesChange: (mediaIds: string[]) => void;
  initialMediaIds?: string[];  // Accepted but never used
}

export function PhotoUpload({ onImagesChange }: PhotoUploadProps) {
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  // initialMediaIds is never destructured or referenced
```

**Problem:** When editing an existing listing, previously uploaded photos don't appear. Users must re-upload all images or risk losing them on save.

**Fix:**
1. Destructure `initialMediaIds` from props
2. On mount, fetch media metadata for those IDs via a tRPC query (or accept full media objects as props)
3. Initialize `uploadedImages` state with the fetched data
4. Ensure existing images render with delete capability

**Effort:** Low — single component change + possibly a new tRPC query to fetch media by IDs.

---

## Backend / API Issues

### M15. Checkout Race Condition

**File:** `src/server/routers/order.ts:36-160`

**Current status: Already mitigated.** The `create` mutation uses a database transaction with `SELECT ... FOR UPDATE` row locking on the listing:

```ts
const [listing] = await tx
  .select()
  .from(listings)
  .where(and(eq(listings.id, input.listingId), eq(listings.status, "active")))
  .for("update");
```

This correctly serializes concurrent purchases of the same listing. The remaining minor concern is the lack of an idempotency key — duplicate form submissions could create duplicate orders. Consider adding an optional `idempotencyKey` field to `createOrderSchema` and checking for existing orders with the same key before proceeding.

---

### M17. No Audit Log Table

**File:** `src/server/routers/admin.ts:347-394`

**Problem:** Admin mutations (`updateUser`, `updateVerification`, role changes) execute silently. There is no record of who changed what, when, or why. This is a compliance and security gap — if an admin account is compromised, there is no forensic trail.

**Required schema:**
```ts
// src/server/db/schema/audit-log.ts
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  targetId: uuid("target_id"),
  action: varchar("action", { length: 50 }).notNull(),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  previousValue: jsonb("previous_value"),
  newValue: jsonb("new_value"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
```

**Required code changes:**
- Insert an audit row in every admin mutation (`updateUser`, `updateVerification`, `deleteUser`, etc.)
- Read the entity's current state before updating to capture `previousValue`
- Expose a `getAuditLog` admin query for the dashboard

**Effort:** High — new table, migration, updates to every admin mutation, and a new admin UI panel.

---

### M19. Saved Search Alert Frequency Not Configurable

**Files:**
- `src/server/db/schema/saved-searches.ts:22-23`
- `src/server/routers/search.ts`

**Current code:**
```ts
alertEnabled: boolean("alert_enabled").default(true).notNull(),
lastAlertAt: timestamp("last_alert_at", { withTimezone: true }),
```

**Problem:** Users can enable/disable alerts but cannot choose frequency (instant, daily, weekly). `lastAlertAt` exists but is never updated — there is no throttling logic. If many new listings match a saved search, the user gets spammed.

**Required changes:**
1. Add `alertFrequency` column: `varchar("alert_frequency", { length: 20 }).default("daily").notNull()`
2. Update `updateSavedSearch` mutation to accept frequency
3. Create Inngest cron functions for daily and weekly digest batches
4. In each cron run, check `lastAlertAt` + frequency to decide whether to send
5. Update `lastAlertAt` after sending
6. Add frequency selector to the saved search UI

**Effort:** Medium — schema change, new Inngest functions, and frontend UI.

---

### M24. Admin Can Create Other Admins Without Guardrails

**File:** `src/server/routers/admin.ts:347-394`

**Current code:**
```ts
updateUser: adminProcedure
  .input(z.object({
    userId: z.string().uuid(),
    role: z.enum(["buyer", "seller", "admin"]).optional(),
    // ...
  }))
  .mutation(async ({ ctx, input }) => {
    if (input.role !== undefined) {
      updateData.role = input.role; // Any admin can make anyone admin
    }
  }),
```

**Problem:** Any admin can silently promote any user to admin. A single compromised admin account gives full privilege escalation with no approval, no audit trail, and no notification to other admins.

**Options:**
1. **Super-admin role** — Only super-admins can assign the admin role. Requires adding an `adminLevel` column or a `super_admin` role enum value.
2. **Approval workflow** — Admin role requests go through an approval queue. Requires a new `admin_promotion_requests` table and UI.
3. **Minimum viable fix** — Block role changes to `admin` entirely in code, require manual DB intervention for admin creation. Simplest but least scalable.

**Recommendation:** Option 1 (super-admin) combined with M17 (audit log). The audit log captures the "who did what" and the super-admin role prevents unauthorized escalation.

**Effort:** High — schema migration, authorization logic, ties into M17.

---

### L2. Inconsistent Pagination Response Shapes

**Files:** All routers returning paginated data:

| Router | Endpoint | Returns `items`? | Returns `hasMore`? | Returns `total`? | Data key |
|--------|----------|------------------|--------------------|------------------|----------|
| listing.ts | `list` | `items` | Yes | Yes | `items` |
| listing.ts | `getMyListings` | `items` | Yes | Yes | `items` |
| order.ts | `getMyOrders` | `orders` | Yes | Yes | `orders` |
| order.ts | `getSellerOrders` | `orders` | Yes | Yes | `orders` |
| admin.ts | `getUsers` | `users` | No | Yes | `users` |
| admin.ts | `getListings` | `listings` | No | Yes | `listings` |
| admin.ts | `getOrders` | `orders` | No | Yes | `orders` |
| admin.ts | `getFinanceTransactions` | `transactions` | No | Yes | `transactions` |
| offer.ts | `list` | `offers` | No | Yes | `offers` |
| feedback.ts | query | `feedbacks` | No | Yes | `feedbacks` |
| review.ts | query | `reviews` | No | Yes | `reviews` |
| message.ts | query | `messages` | No | No | `messages` |
| dispute.ts | query | `disputes` | No | No | `disputes` |

**Problem:** Frontend code cannot use a generic pagination hook because every endpoint returns a different shape. Some omit `hasMore`, some omit `total`, and the data array key varies.

**Fix:** Create a shared pagination helper:

```ts
// src/lib/types/pagination.ts
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
}

export function paginate<T>(items: T[], total: number, page: number, limit: number): PaginatedResponse<T> {
  return { items, total, page, limit, totalPages: Math.ceil(total / limit), hasMore: (page - 1) * limit + items.length < total };
}
```

Then update every router to use `paginate()` and return `items` consistently. This is a breaking change for frontend consumers — all callsites accessing `data.users`, `data.orders`, etc. must switch to `data.items`.

**Effort:** Medium — mechanical refactor across ~13 endpoints and their frontend consumers.

---

### L12. View Count Manipulation

**File:** `src/server/routers/listing.ts:169-175`

**Current code:**
```ts
// Inside getById — fire-and-forget increment
ctx.db
  .update(listings)
  .set({ viewsCount: sql`${listings.viewsCount} + 1` })
  .where(eq(listings.id, input.id))
  .execute()
  .catch(() => {});
```

**Problem:** Every page load increments the counter with no deduplication. A user refreshing 100 times adds 100 views. Bots can trivially inflate any listing's view count.

**Options:**
1. **Session-based dedup (client)** — Track viewed listing IDs in `sessionStorage`, skip the increment if already viewed. Weakest protection (client can be bypassed).
2. **IP+user dedup table (server)** — New `listing_views` table with a unique constraint on `(listing_id, ip_hash, user_id)` scoped to a time window (e.g., 1 hour). Insert with `ON CONFLICT DO NOTHING`. Periodically aggregate into `listings.viewsCount`.
3. **Redis HyperLogLog** — Use `PFADD listing:{id}:views {ip_hash}` for approximate unique counting. Most performant, requires Redis.

**Recommendation:** Option 2 for accuracy without adding Redis as a dependency. Option 3 if Redis is already in the stack.

**Effort:** Medium — new migration for `listing_views` table, update `getById` to insert a view record, add a background job to aggregate counts.

---

## Suggested Priority Order

1. **H1 + H4 + M3 + M6** — All four are single-migration, zero-code-change index/constraint additions. Bundle them into one migration. Lowest risk, highest value.
2. **M24 + M17** — Security issues that should be addressed together. Admin escalation guard + audit log.
3. **L9** — Quick component fix, directly improves listing editing UX.
4. **M11** — Largest frontend change but high user-facing impact (shareable search URLs).
5. **L2** — Mechanical refactor, do alongside any router work.
6. **L12** — View count integrity, do when adding the `listing_views` migration.
7. **M19** — Feature enhancement, lower urgency.
8. **M15** — Already mitigated; idempotency key is a nice-to-have.
