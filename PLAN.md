# PlankMarket Promoted Listings — Implementation Plan

## Monetization Model

### Tier Structure (Fixed-Price)

| Tier | 7 days | 14 days | 30 days | Visibility |
|------|--------|---------|---------|------------|
| **Spotlight** | $29 | $49 | $99 | Search rank boost (top 20%), "Spotlight" badge, category carousel |
| **Featured** | $79 | $139 | $249 | Above + top 5% search rank, homepage grid, category banner, weekly email digest |
| **Premium** | $199 | $349 | $599 | Above + guaranteed top-3, homepage hero rotation, targeted email blast, enlarged card |

Revenue projection at 500 active listings with 10-20% adoption: **$9K-$21K/month** ($110K-$257K/year), representing 3-7% of GMV — consistent with eBay (2.5%) and Etsy (6%) benchmarks.

### Why Fixed-Price (Not Auction)
- Only ~500 listings — insufficient advertiser competition for meaningful auction price discovery
- B2B flooring sellers are not ad-tech savvy — transparent pricing builds trust
- Lower engineering complexity, ship faster
- Migration to hybrid CPC at 2,000+ listings

### Anti-Gaming Safeguards
- Max 20% of any search results page can be promoted (4 of 20)
- Promoted listings interleaved at positions 1, 6, 11, 16 — never consecutive
- All promoted listings labeled "Promoted" (FTC compliance)
- Quality gate: 3+ photos, 100+ char description, verified seller, 24h active minimum
- No single seller can hold >30% of promoted slots in a category
- Promotion does not extend the 90-day listing expiration; remaining credit refunded pro-rata on expiry

---

## Database Changes

### New enum: `promotion_tier`

```
spotlight | featured | premium
```

### New table: `listing_promotions`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| listing_id | uuid FK → listings | onDelete cascade |
| seller_id | uuid FK → users | onDelete cascade |
| tier | promotion_tier enum | NOT NULL |
| duration_days | integer | 7, 14, or 30 |
| price_paid | money (numeric 12,4) | Amount charged |
| starts_at | timestamptz | NOT NULL |
| expires_at | timestamptz | NOT NULL |
| is_active | boolean | Computed/managed, default true |
| stripe_payment_intent_id | varchar(255) | Payment reference |
| payment_status | varchar(50) | pending, succeeded, failed, refunded |
| created_at | timestamptz | defaultNow |
| cancelled_at | timestamptz | nullable |

**Indexes:** listing_id, seller_id, is_active + expires_at (for active promotion queries), tier + is_active (for homepage/featured queries)

### Listings table additions

| Column | Type | Notes |
|--------|------|-------|
| promotion_tier | promotion_tier enum | nullable, denormalized for fast query sorting |
| promotion_expires_at | timestamptz | nullable, denormalized |

These denormalized fields on listings enable the existing `listing.list` query to sort promoted listings without a JOIN on every search request. A background job (or trigger in the promotion router) nulls them on expiry.

---

## Backend Implementation

### 1. New `promotion` tRPC router (`src/server/routers/promotion.ts`)

**Procedures:**

#### `promotion.getPricing` (publicProcedure)
- Returns the pricing matrix (tier × duration → price)
- Hardcoded constant, no DB query

#### `promotion.purchase` (sellerProcedure)
- Input: `{ listingId, tier, durationDays }`
- Validates:
  - Listing exists, is active, and belongs to the seller
  - Listing meets quality gate (3+ media, 100+ char description, seller verified)
  - No existing active promotion on the listing
  - Seller doesn't exceed 30% category cap
- Calculates price from tier × duration matrix
- Creates Stripe PaymentIntent (direct charge, not Connect — this is platform revenue)
- Inserts `listing_promotions` row with `payment_status: "pending"`
- Returns `clientSecret` for Stripe Elements checkout

#### `promotion.activate` (internal, called from webhook)
- On `payment_intent.succeeded` for promotion payments:
  - Updates `listing_promotions.payment_status = "succeeded"`, sets `is_active = true`
  - Sets `starts_at = now()`, `expires_at = now() + duration_days`
  - Denormalizes `promotion_tier` and `promotion_expires_at` onto the listings row

#### `promotion.cancel` (sellerProcedure)
- Input: `{ promotionId }`
- Only cancellable if active
- Calculates pro-rata refund based on remaining days
- Issues Stripe refund for the pro-rata amount
- Sets `is_active = false`, `cancelled_at = now()`
- Clears denormalized fields on listings row

#### `promotion.getMyPromotions` (sellerProcedure)
- Returns all promotions for the seller (active + expired) with pagination
- Includes listing title, tier, dates, amount paid

#### `promotion.getActiveForListing` (publicProcedure)
- Input: `{ listingId }`
- Returns current active promotion (tier, expires_at) or null
- Used by listing detail page to show promotion badge

#### `promotion.expireStale` (adminProcedure or cron)
- Finds promotions where `expires_at < now()` and `is_active = true`
- Sets `is_active = false`
- Clears denormalized fields on listings
- If listing also expired (90-day window), calculates pro-rata refund

### 2. Modify `listing.list` query (`src/server/routers/listing.ts`)

Current sort logic (lines 228-256) applies a single `orderByClause`. Changes:

```
1. Query promoted listings matching all active filters
   - WHERE promotion_tier IS NOT NULL AND promotion_expires_at > now()
   - Limited to ceil(pageSize * 0.2) = 5 for a page of 24
   - Ordered by tier priority (premium > featured > spotlight), then createdAt

2. Query organic listings matching all filters
   - WHERE promotion_tier IS NULL (or expired)
   - Limited to pageSize - promotedCount
   - Ordered by the user's selected sort

3. Interleave: place promoted at positions 0, 5, 10, 15
   - Mark each with `isPromoted: true` in the response
```

The total count for pagination remains based on all matching listings (promoted + organic).

### 3. Modify Stripe webhook (`src/app/api/webhooks/stripe/route.ts`)

Add a handler for promotion payment intents (identified by `metadata.type === "promotion"`):
- On `payment_intent.succeeded`: call promotion activation logic
- On `payment_intent.payment_failed`: update promotion payment_status to "failed"

### 4. Register router in `_app.ts`

Add `promotion: promotionRouter` to the app router.

---

## Frontend Implementation

### 1. Seller Dashboard — Boost Button (`src/app/(dashboard)/seller/listings/page.tsx`)

Add a "Boost" button (rocket icon) to each active listing card. Clicking opens a modal/dialog.

### 2. Promotion Purchase Modal (new component)

- Tier selection cards (Spotlight / Featured / Premium) with benefit descriptions
- Duration picker (7 / 14 / 30 days) with price updating
- Quality gate check: show warnings if listing doesn't meet requirements
- Stripe Elements payment form (reuse existing Stripe integration pattern from checkout)
- Confirmation screen with promotion start/end dates

### 3. Listing Card Badge (`src/components/search/listing-card.tsx`)

When `isPromoted` is true on a listing result:
- Render a subtle "Promoted" label (small text, muted color) above the listing title
- For Featured/Premium tiers: add a colored left-border accent or badge variant

### 4. Homepage Featured Section (`src/app/(marketing)/page.tsx`)

Add a "Featured Inventory" section between existing hero and value props:
- Query: `listing_promotions WHERE tier IN ('featured', 'premium') AND is_active`
- Display 4-6 listing cards in a responsive grid
- "Featured" badge on each card
- "View All Inventory →" link to `/listings`

### 5. Homepage Hero Rotation (Premium tier)

For Premium promoted listings:
- Rotating hero banner (3-5 listings max) with large image, title, price, CTA
- Auto-rotate every 5 seconds with manual navigation dots

### 6. Seller Promotion Analytics (`src/app/(dashboard)/seller/analytics/page.tsx`)

Currently a placeholder page. Add:
- Active promotions list with remaining duration
- Views/clicks during promotion period vs. prior period
- ROI estimate: incremental views × historical conversion rate × lot value
- "Renew" and "Cancel" buttons per promotion

### 7. Category Page Carousel (`src/app/(marketplace)/listings/page.tsx`)

At the top of search results (below filters, above the grid):
- Horizontal scrolling carousel of 3-5 Spotlight+ promoted listings matching current filters
- Clearly labeled "Sponsored Listings"
- Only shows if there are promoted listings matching the active filters

---

## File Manifest (new + modified)

### New Files
- `src/server/db/schema/promotions.ts` — promotion_tier enum + listing_promotions table
- `src/server/routers/promotion.ts` — tRPC router
- `src/lib/validators/promotion.ts` — Zod schemas (purchasePromotionSchema, cancelPromotionSchema)
- `src/components/promotions/boost-modal.tsx` — tier selection + payment modal
- `src/components/promotions/promotion-badge.tsx` — "Promoted" / "Featured" / "Premium" badge
- `src/components/promotions/featured-carousel.tsx` — homepage + category page carousel
- `src/components/promotions/hero-banner.tsx` — rotating Premium listing hero
- `src/app/(dashboard)/seller/listings/[id]/boost/page.tsx` — dedicated boost page (alternative to modal)

### Modified Files
- `src/server/db/schema/index.ts` — export new schema + relations
- `src/server/db/schema/listings.ts` — add promotion_tier + promotion_expires_at columns
- `src/server/routers/_app.ts` — register promotion router
- `src/server/routers/listing.ts` — modify list query for promoted interleaving
- `src/app/api/webhooks/stripe/route.ts` — handle promotion payment events
- `src/app/(dashboard)/seller/listings/page.tsx` — add Boost button to listing cards
- `src/app/(dashboard)/seller/analytics/page.tsx` — add promotion analytics
- `src/app/(marketing)/page.tsx` — add Featured Inventory section + Premium hero
- `src/app/(marketplace)/listings/page.tsx` — add sponsored carousel at top
- `src/components/search/listing-card.tsx` — add isPromoted badge rendering
- `src/types/index.ts` — add PromotionTier type
- `src/env.ts` — no new env vars needed (uses existing Stripe keys)

---

## Implementation Order

1. **Database schema** — promotions table, listings columns, enum
2. **Promotion router** — pricing, purchase, activate, cancel, queries
3. **Stripe webhook** — handle promotion payment events
4. **Listing query changes** — promoted interleaving with ratio limits
5. **Boost modal + payment flow** — seller-facing purchase UX
6. **Listing card badge** — "Promoted" labeling in search results
7. **Homepage sections** — Featured grid + Premium hero rotation
8. **Category carousel** — sponsored listings at top of search
9. **Seller analytics** — promotion performance dashboard
10. **Expiry job** — cron/Inngest task to expire stale promotions
