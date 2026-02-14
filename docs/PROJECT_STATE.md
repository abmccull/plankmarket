# PlankMarket: Current Project State

> B2B Wholesale Flooring Liquidation Marketplace
> Last updated: February 2026

---

## 1. Overview

PlankMarket is a full-stack B2B marketplace that connects flooring manufacturers, distributors, and wholesalers (sellers) with contractors, builders, retailers, and flooring installers (buyers). The platform specializes in liquidation, overstock, discontinued, and closeout flooring inventory sold at wholesale prices.

The platform handles the complete transaction lifecycle: listing creation, product discovery, price negotiation, payment processing, LTL freight shipping, escrow management, and post-purchase reviews. It enforces business verification, identity masking, and content moderation to protect marketplace integrity and prevent off-platform circumvention.

**Revenue model:** 3% buyer fee + 2% seller fee on each transaction, plus optional paid promotion tiers for enhanced listing visibility.

---

## 2. Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Framework** | Next.js (App Router, Turbopack) | 16.1.6 |
| **Language** | TypeScript (strict mode) | 5.x |
| **UI** | React | 19.2.3 |
| **Styling** | Tailwind CSS v4, shadcn/ui, Radix UI | latest |
| **Database** | PostgreSQL (via Supabase) | — |
| **ORM** | Drizzle ORM | 0.45.1 |
| **API Layer** | tRPC (end-to-end typesafe) | 11.x |
| **Auth** | Supabase Auth (email + magic link) | 2.95.3 |
| **Payments** | Stripe (Connect for seller payouts) | 20.3.1 |
| **Shipping** | Priority1 LTL Freight API | custom |
| **Email** | Resend + React Email | 6.9.2 |
| **Caching/Rate Limiting** | Upstash Redis | 1.36.2 |
| **Task Scheduling** | Inngest | 3.52.0 |
| **File Upload** | Uploadthing | 7.7.4 |
| **AI** | Anthropic Claude (business verification) | 0.74.0 |
| **Analytics** | PostHog + Vercel Analytics | — |
| **State Management** | Zustand | 5.0.11 |
| **Forms** | React Hook Form + Zod | 7.71.1 / 4.3.6 |
| **Tables** | TanStack Table | 8.21.3 |
| **Charts** | Recharts | 3.7.0 |
| **Deployment** | Vercel | — |

---

## 3. Architecture

### 3.1 High-Level Architecture

```
                    ┌──────────────┐
                    │   Vercel CDN  │
                    └──────┬───────┘
                           │
            ┌──────────────▼──────────────┐
            │     Next.js App Router      │
            │  (SSR + Client Components)  │
            └──────┬───────────────┬──────┘
                   │               │
         ┌─────────▼──────┐  ┌────▼────────────┐
         │  tRPC Client   │  │  API Routes      │
         │  (React Query) │  │  /api/webhooks/* │
         └─────────┬──────┘  │  /api/inngest    │
                   │         │  /api/uploadthing │
         ┌─────────▼──────┐  └────┬────────────┘
         │  tRPC Server   │       │
         │  (17 Routers)  │◄──────┘
         └─────────┬──────┘
                   │
    ┌──────────────▼──────────────┐
    │     Middleware Pipeline      │
    │  Auth → RateLimit → Role    │
    │  → Verified → ContentPolicy │
    └──────────────┬──────────────┘
                   │
    ┌──────────────▼──────────────┐
    │      Drizzle ORM Layer      │
    │      (18 tables, typed)     │
    └──────────────┬──────────────┘
                   │
    ┌──────────────▼──────────────┐
    │   Supabase PostgreSQL DB    │
    └─────────────────────────────┘

External Services:
  ├── Stripe (payments, payouts, Connect)
  ├── Priority1 (LTL freight shipping)
  ├── Resend (transactional email)
  ├── Upstash Redis (caching, rate limits)
  ├── Inngest (background jobs, crons)
  ├── Uploadthing (file storage)
  ├── Anthropic Claude (AI verification)
  └── PostHog (analytics)
```

### 3.2 Request Flow

1. **Client** renders React components with tRPC hooks (`useQuery` / `useMutation`)
2. **tRPC client** batches requests via `httpBatchLink` to `/api/trpc`
3. **tRPC server** creates context (DB connection, auth user, IP extraction)
4. **Middleware pipeline** enforces auth, rate limits, role checks, verification status, and content policy
5. **Router handlers** execute business logic using Drizzle ORM
6. **Response** is serialized with SuperJSON and returned to the client
7. **React Query** manages caching, refetching, and optimistic updates

### 3.3 Authentication Flow

```
User → Supabase Auth (email/password or magic link)
  → Supabase callback → /api/auth/callback
  → Next.js middleware checks session on every request
  → tRPC context resolves authUser → DB user lookup
  → Role-based access (buyer/seller/admin) enforced per procedure
```

### 3.4 Payment Flow

```
Buyer selects listing → Checkout page
  → Stripe PaymentIntent created (buyer fee included)
  → Buyer completes Stripe payment form
  → Stripe webhook confirms payment
  → Order created with escrow status = "held"
  → Seller ships → carrier picks up
  → Inngest schedules escrow release (3 days post-pickup)
  → Stripe Transfer to seller's Connect account (minus seller fee)
```

### 3.5 Shipping Flow

```
Buyer requests quotes → shipping.getShippingQuotes
  → Priority1 rates API (origin ZIP → destination ZIP, freight class, weight)
  → Quotes cached in Redis (15-min TTL) with unique IDs
  → Buyer selects quote at checkout → server verifies from Redis cache
  → Order placed → Inngest dispatches shipment via Priority1
  → Inngest polls tracking hourly → updates shipment status
  → Delivery confirmed → escrow release triggered
```

---

## 4. Database Schema

18 tables with full relational integrity. Key relationships:

```
users ──┬──< listings ──< media
        │       │
        │       ├──< offers ──< offer_events
        │       │
        │       ├──< conversations ──< messages
        │       │
        │       └──< watchlist
        │
        ├──< orders ──┬──< reviews
        │             ├──< disputes ──< dispute_messages
        │             └──< shipments
        │
        ├──< notifications
        ├──< saved_searches
        ├──< feedback
        └──< content_violations

listing_promotions (listings × promotion tiers)
platform_settings (admin key-value config)
```

### Table Summary

| Table | Purpose | Key Relations |
|-------|---------|---------------|
| `users` | Buyer/seller/admin accounts with verification status | Root entity |
| `listings` | Flooring inventory (44 columns of product detail) | belongs to seller |
| `media` | Listing images with sort order | belongs to listing |
| `orders` | Purchase transactions with escrow tracking | buyer + seller + listing |
| `offers` | Turn-based price negotiations with expiry | buyer + seller + listing |
| `offer_events` | Audit trail for offer negotiations | belongs to offer |
| `conversations` | 1:1 messaging threads (unique per listing+buyer) | buyer + seller + listing |
| `messages` | Individual messages in conversations | belongs to conversation |
| `reviews` | Post-delivery ratings (1-5 + subcategories) | one per order |
| `disputes` | Order conflict resolution | one per order |
| `dispute_messages` | Messages in dispute threads | belongs to dispute |
| `shipments` | LTL freight tracking with event history (JSONB) | one per order |
| `listing_promotions` | Paid visibility boosts (spotlight/featured/premium) | listing + seller |
| `watchlist` | User-saved listings | user + listing |
| `saved_searches` | Saved filter configurations with alert toggle | belongs to user |
| `notifications` | User notifications (9 types) | belongs to user |
| `feedback` | User feedback submissions | optional user |
| `content_violations` | Content moderation audit log | user + reviewer |
| `platform_settings` | Admin-configurable key-value settings | admin updater |

### Indexing Strategy

Listings have 9 indexes covering the most common query patterns: seller_id, status, material_type, condition, location_state, ask_price, created_at, total_sq_ft, and a composite lat/lng index for proximity search. Orders are indexed on buyer_id, seller_id, listing_id, status, created_at, and order_number for efficient lookups from both buyer and seller perspectives.

---

## 5. API Layer

### 5.1 tRPC Routers (17 total)

All routers are composed in `src/server/routers/_app.ts` and exposed at `/api/trpc/[trpc]`.

| Router | Procedures | Access Levels | Purpose |
|--------|-----------|---------------|---------|
| `auth` | 4 | public, rateLimited, protected | Registration, profile, session |
| `listing` | 6 | public, seller | CRUD, browse, status management |
| `order` | 5 | buyer, seller, protected | Create orders, update status, stats |
| `payment` | 4 | public, protected, seller, verified | Stripe intents, Connect onboarding |
| `offer` | 8 | verified, seller | Make/accept/reject/counter/withdraw offers |
| `search` | 4 | public, protected | Full-text search, saved searches |
| `watchlist` | 4 | verified | Add/remove/check watchlisted listings |
| `message` | 5 | verified, messaging | Conversations, send/read messages |
| `review` | 4 | verified, public, seller | Create/respond to reviews |
| `shipping` | 2 | buyer, protected | Get Priority1 quotes, update status |
| `promotion` | 4+ | public, seller, admin | Buy/cancel promotions, pricing |
| `notification` | 3 | protected | Read/dismiss notifications |
| `dispute` | 5 | protected, admin | Create/manage disputes |
| `feedback` | 2 | protected, admin | Submit/review feedback |
| `upload` | 1 | seller | Record uploaded media |
| `admin` | 10+ | admin | User/listing/order/finance management |

### 5.2 Procedure Types (Authorization Tiers)

```
publicProcedure           → No auth (browse listings, view pricing)
rateLimitedPublicProcedure → No auth + strict rate limit (registration)
protectedProcedure        → Authenticated + standard rate limit
verifiedProcedure         → Authenticated + business verified (or admin)
buyerProcedure            → Buyer role + verified
sellerProcedure           → Seller role + verified
adminProcedure            → Admin role only
messagingProcedure        → Verified + content policy enforcement
strictRateLimitedProcedure → Authenticated + 10 req/min
```

### 5.3 Rate Limiting

| Tier | Limit | Scope | Applied To |
|------|-------|-------|-----------|
| Standard | 60 req/min | per user or IP | All authenticated endpoints |
| Strict | 10 req/min | per user or IP | Auth endpoints, sensitive operations |
| Messaging (restricted) | 5 msg/hour | per user | Users with 3+ content violations |

### 5.4 Webhook Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/api/webhooks/stripe` | Payment confirmations, failures, Connect events |
| `/api/webhooks/verify-business` | AI verification completion callback |
| `/api/inngest` | Inngest function execution endpoint |
| `/api/uploadthing` | Uploadthing file upload handler |
| `/api/cron/expire-promotions` | Scheduled promotion expiry (Vercel cron) |
| `/api/auth/callback` | Supabase auth callback (email confirmation) |

---

## 6. Frontend Architecture

### 6.1 Route Groups

The app uses Next.js route groups to apply different layouts:

| Group | Layout | Pages | Purpose |
|-------|--------|-------|---------|
| `(marketing)` | Marketing header + footer | 8 | Public-facing pages |
| `(auth)` | Minimal auth layout | 5 | Login, register, password reset |
| `(marketplace)` | Marketplace header + search | 4 | Browse/view/checkout listings |
| `(dashboard)` | Sidebar navigation | 16 | Buyer/seller dashboards, messaging |
| `(admin)` | Admin sidebar | 11 | Admin management panels |

**Total pages: 47**

### 6.2 Client State Management

| Store | Library | Purpose |
|-------|---------|---------|
| `auth-store` | Zustand | Current user session, role |
| `search-store` | Zustand | Search filters, sort, pagination |
| `listing-form-store` | Zustand | Multi-step listing creation wizard |
| `onboarding-store` | Zustand | Seller onboarding progress |
| Server state | React Query (via tRPC) | All API data, 5-min stale time |

### 6.3 Component Organization (76 components)

```
src/components/
├── admin/          # Admin-specific (user tables, listing moderation)
├── auth/           # Auth provider, login/register forms
├── brand/          # Logo, branding elements
├── checkout/       # Payment form, shipping quotes, order summary
├── dashboard/      # Stats cards, status badges, verification gate
├── layout/         # Header, footer, sidebar navigation
├── listings/       # Listing forms, detail views, image galleries
├── messaging/      # Chat bubbles, conversation list, message input
├── offers/         # Offer cards, timeline, make-offer modal
├── promotions/     # Featured carousel, hero banner, sponsored carousel
├── search/         # Search bar, filter sidebar, listing cards
├── shared/         # Review cards, empty states, loading spinners
├── shipping/       # Shipping quote selector, tracking display
└── ui/             # shadcn/ui primitives (button, card, dialog, etc.)
```

### 6.4 Provider Stack

```tsx
<PostHogAnalyticsProvider>        // Analytics tracking
  <trpc.Provider>                 // tRPC client
    <QueryClientProvider>         // React Query cache
      <ThemeProvider>             // Light/dark mode
        <AuthProvider>            // Session management
          {children}
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </trpc.Provider>
</PostHogAnalyticsProvider>
<Toaster />                       // sonner toast notifications
```

---

## 7. Integrated Services

### 7.1 Supabase

**Role:** Authentication + PostgreSQL database hosting

- Email/password authentication with email verification
- Magic link support
- Middleware-based session refresh on every request
- Service role key for server-side admin operations
- PostgreSQL database with connection pooling

### 7.2 Stripe

**Role:** Payment processing + seller payouts

- **Stripe Elements:** Client-side payment form (PCI compliant)
- **Payment Intents:** Server-created with buyer fee baked in
- **Stripe Connect:** Seller onboarding for direct payouts
- **Webhooks:** `payment_intent.succeeded`, `payment_intent.payment_failed`
- **Transfers:** Automated seller payout (subtotal - 2% seller fee) to Connect account
- **Promotion payments:** Separate payment flow for listing promotions

### 7.3 Priority1 LTL Freight

**Role:** Commercial freight shipping for palletized flooring

- **Quote API:** Get rates from origin/destination ZIP with freight class, weight, and pallet dimensions
- **Shipment creation:** BOL and shipping label generation
- **Tracking:** Real-time status polling with location updates
- **Integration points:**
  - Checkout: buyer selects from multiple carrier quotes
  - Quote caching: Redis with 15-min TTL, server-side verification prevents price manipulation
  - Auto-dispatch: Inngest function creates shipment after payment
  - Auto-tracking: Inngest polls hourly for status updates
  - Margin: 15% markup on carrier rates

### 7.4 Inngest

**Role:** Background job scheduling and event-driven workflows

| Function | Trigger | Purpose |
|----------|---------|---------|
| `saved-search-alerts` | `listing/created` event | Email users when new listings match saved searches |
| `listing-expiry-warning` | Daily cron | Warn sellers before listing expires, deactivate expired |
| `abandoned-checkout` | `order/created` event | Remind buyers of incomplete orders after 1 hour |
| `escrow-auto-release` | `order/picked-up` event | Release escrowed funds 3 days after carrier pickup |
| `shipment-dispatch` | `order/paid` event | Auto-create Priority1 shipment from selected quote |
| `shipment-tracking` | Hourly cron | Poll Priority1 API for tracking updates |

### 7.5 Resend + React Email

**Role:** Transactional email delivery

| Template | Trigger |
|----------|---------|
| Welcome email | User registration |
| Order confirmation | Order placed |
| (Extensible for) | Shipping updates, review requests, offer notifications |

Templates are built with `@react-email/components` for consistent rendering across email clients.

### 7.6 Uploadthing

**Role:** File upload and storage

- Client-side upload (bypasses server for large files)
- Server-side upload recording via tRPC
- Used for: listing photos, verification documents
- CDN delivery via `utfs.io`

### 7.7 Anthropic Claude (AI Business Verification)

**Role:** Automated seller verification

- Uses `claude-sonnet-4-5-20250929` model
- Analyzes: EIN format, website legitimacy, uploaded documents (OCR via vision)
- Produces: 0-100 trust score, pass/fail, detailed reasoning
- Anti-prompt-injection: user input sanitized before AI processing
- Integrated as webhook callback for async processing

### 7.8 Upstash Redis

**Role:** Caching, rate limiting, counters

| Use Case | Key Pattern | TTL |
|----------|-------------|-----|
| Standard rate limit | `rl:standard:{userId}` | sliding 60s |
| Strict rate limit | `rl:strict:{userId}` | sliding 60s |
| Messaging rate limit | `rl:messaging-restricted:{userId}` | sliding 60m |
| Shipping quote cache | `shipping-quote:{quoteId}` | 15 min |
| Violation counter | `violation-count:{userId}` | 30 days |
| View deduplication | `listing-view:{listingId}:{ip}` | 24 hours |

### 7.9 PostHog

**Role:** Product analytics

- Proxied through Next.js rewrites (`/ingest/` → PostHog servers) to avoid ad blockers
- Event tracking for user flows, feature usage

### 7.10 Vercel

**Role:** Deployment and infrastructure

- Edge middleware for auth
- Serverless functions for API routes
- Cron jobs for scheduled tasks
- Analytics integration
- CDN for static assets

---

## 8. Security Architecture

### 8.1 Authentication & Authorization

- Supabase Auth with email verification
- Session refresh on every request via middleware
- Role-based access control (buyer/seller/admin) enforced at the tRPC procedure level
- Account suspension check (`active` flag) in auth middleware
- Verification status check for marketplace actions

### 8.2 Rate Limiting

Three tiers of Upstash Redis-backed sliding window rate limits prevent abuse at the API level. The messaging rate limit provides additional throttling for users flagged by content moderation.

### 8.3 Content Moderation (Anti-Circumvention)

A two-part system prevents users from sharing contact information to take transactions off-platform:

**Part A — Identity Masking:**
- Seller identities are anonymized across the platform ("Verified Seller in FL")
- Progressive disclosure reveals real identity only after order delivery
- Masking applies to: listing cards, detail pages, messages, offers, reviews, order views
- Admin users always see full identities

**Part B — Content Filtering:**
- Regex-based detection of phone numbers, emails, URLs in all free-text fields
- Whitelist-first approach avoids false positives on flooring content (prices, dimensions, sq ft, SKUs)
- High-confidence detections block submission; medium-confidence detections flag for admin review
- Escalating enforcement: warning → messaging rate limit (5/hour) → account suspension

### 8.4 Payment Security

- Shipping quotes cached server-side in Redis; client cannot manipulate prices
- Server-side fee calculations (never trust client values)
- Stripe webhook signature verification
- Escrow system holds buyer funds until carrier pickup confirmed
- Row-level locking on listings during purchase to prevent double-selling

### 8.5 HTTP Security Headers

```
Content-Security-Policy: strict allowlists for Stripe, PostHog, Supabase
Strict-Transport-Security: max-age=31536000 (HSTS)
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

### 8.6 Input Validation

All user input validated with Zod schemas at the tRPC boundary. Content filter refinements (`noContactInfo()`) applied to all free-text fields. File uploads restricted to allowed MIME types via Uploadthing configuration.

---

## 9. Business Features

### 9.1 Listing Management

Sellers create listings through a multi-step wizard capturing:
- Product specs (material type, species, finish, grade, color, dimensions)
- Lot details (sq ft per box, boxes per pallet, total sq ft, MOQ)
- Shipping info (pallet weight/dimensions, freight class, origin location)
- Pricing (ask price per sq ft, buy now price, floor price, allow offers toggle)
- Condition & reason code (overstock, discontinued, returns, etc.)
- Certifications (FSC, FloorScore, GreenGuard, CARB2, etc.)
- Photos (up to multiple images with drag-and-drop ordering)

Listings have a lifecycle: `draft` → `active` → `sold`/`expired`/`archived`

### 9.2 Search & Discovery

- Full-text search across listing title and description
- Faceted filtering: material type, species, color family, finish, width, thickness, wear layer, condition, state, certifications, price range, lot size
- Sort options: price, date, lot value, popularity, proximity
- Saved searches with email alerts via Inngest
- Watchlist for tracking interesting listings
- Promoted listings (spotlight, featured, premium tiers)

### 9.3 Offer Negotiation

Turn-based negotiation system:
1. Buyer submits offer (price per sq ft + quantity + optional message)
2. Seller can accept, reject, or counter
3. Counter-offers bounce back to buyer
4. Each side takes turns until accepted, rejected, or withdrawn
5. Offers expire after 48 hours
6. Full audit trail in `offer_events` table
7. On acceptance, order is created at agreed price

### 9.4 Checkout & Payment

Three-step checkout:
1. **Shipping:** Enter delivery address, select Priority1 freight quote
2. **Review:** Verify order details, see fee breakdown
3. **Payment:** Stripe Elements form (card input)

Order summary displays: subtotal, 3% buyer fee, shipping cost, total. Server-side fee calculation prevents tampering.

### 9.5 Order Lifecycle

```
pending → confirmed → processing → shipped → delivered
   ↓          ↓            ↓
cancelled  cancelled    cancelled

delivered → refunded (via dispute)
```

Each transition is validated against a state machine. Timestamps recorded at each stage. Escrow status tracks fund flow: `held` → `released` (to seller) or `refunded` (to buyer on cancellation).

### 9.6 Shipping & Tracking

- LTL freight quotes from Priority1 with multiple carrier options
- Auto-dispatch via Inngest after payment confirmation
- Real-time tracking with location updates stored as JSONB events
- BOL and shipping label document URLs
- Delivery confirmation triggers escrow release countdown

### 9.7 Reviews & Disputes

**Reviews:** Buyers leave ratings after delivery (overall 1-5 + communication, accuracy, shipping sub-ratings). Sellers can respond. Reviews display anonymous reviewer names.

**Disputes:** Either party can open a dispute on an order. Threaded messages. Admin resolves with outcome (resolved for buyer/seller). Dispute resolution can trigger refund.

### 9.8 Admin Dashboard

11 admin pages covering:
- User management (list, suspend, view details)
- Listing moderation (review, approve, reject)
- Order management (view all orders, update status)
- Shipment tracking (monitor all active shipments)
- Seller verification review (AI score + manual decision)
- Financial reporting (revenue, fees, charts)
- Promotion management (active promotions, revenue)
- Content moderation (review flagged violations, mark false positives)
- User feedback review
- Platform settings (key-value configuration)

### 9.9 Notifications

9 notification types delivered in-app:
`order_confirmed`, `order_shipped`, `order_delivered`, `new_offer`, `listing_match`, `listing_expiring`, `payment_received`, `review_received`, `system`

Each includes structured data payload for deep linking to relevant pages.

---

## 10. Data Validation

All input validation uses Zod schemas in `src/lib/validators/`:

| Validator | Schemas | Content Filter |
|-----------|---------|----------------|
| `auth.ts` | register, updateProfile | — |
| `listing.ts` | listingForm (multi-step), listingFilter | title, description |
| `order.ts` | createOrder, updateOrderStatus | — |
| `offer.ts` | createOffer, counter, accept, reject, withdraw, respond | message, counterMessage |
| `review.ts` | createReview, respondToReview | title, comment, sellerResponse |
| `message.ts` | sendMessage, getMessages | body |
| `shipping.ts` | getShippingQuotes | — |
| `promotion.ts` | purchasePromotion, cancelPromotion | — |

Content-filtered fields use `.superRefine(noContactInfo("field name"))` which blocks phone numbers, emails, and URLs while whitelisting flooring-specific content patterns.

---

## 11. Environment Configuration

Environment variables validated at build time using `@t3-oss/env-nextjs` with Zod schemas.

**Required (server-side):**
- `DATABASE_URL` — PostgreSQL connection string
- `SUPABASE_SERVICE_ROLE_KEY` — Admin Supabase operations
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — Payment processing
- `UPLOADTHING_TOKEN` — File uploads
- `RESEND_API_KEY`, `EMAIL_FROM` — Email delivery
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` — Caching/rate limits
- `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` — Background jobs

**Required (client-side):**
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Auth
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — Payment UI
- `NEXT_PUBLIC_APP_URL` — Base URL for links

**Optional:**
- `ANTHROPIC_API_KEY` — AI business verification
- `PRIORITY1_API_KEY` — LTL freight shipping
- `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` — Analytics
- `NEXT_PUBLIC_SENTRY_DSN` — Error tracking

---

## 12. Type System

Core domain types defined in `src/types/index.ts`:

- **14 string union types** covering all domain enums (roles, statuses, material types, conditions, etc.)
- **`SearchFilters` interface** with 20+ filter dimensions for listing search
- **`PaginatedResponse<T>` generic** used across all list endpoints
- **Drizzle inferred types** (`typeof users.$inferSelect`) for database entities
- **Zod inferred types** (`z.infer<typeof schema>`) for form/API inputs

The tRPC + Drizzle + Zod stack provides end-to-end type safety from database schema to UI component props.

---

## 13. Flooring Domain Model

The platform models flooring products with industry-standard attributes:

| Category | Options |
|----------|---------|
| **Material** | Hardwood, Engineered, Laminate, Vinyl/LVP, Bamboo, Tile |
| **Species** | Oak, Maple, Walnut, Hickory, Cherry, Ash, Birch, Pine, Teak, Mahogany, Acacia, Brazilian Cherry, Santos Mahogany, Tigerwood, Bamboo, Cork |
| **Finish** | Matte, Semi-gloss, Gloss, Wire Brushed, Hand Scraped, Distressed, Smooth, Textured, Oiled, Unfinished |
| **Grade** | Select, #1 Common, #2 Common, #3 Common, Cabin, Character, Rustic, Premium, Standard, Economy |
| **Condition** | New Overstock, Discontinued, Slight Damage, Returns, Seconds, Remnants, Closeout |
| **Color Family** | Light, Medium, Dark, Gray, White, Blonde, Brown, Red, Ebony, Natural, Multi |
| **Certifications** | FSC, FloorScore, GreenGuard, GreenGuard Gold, CARB2, LEED, NAUF |
| **Dimensions** | Width (2.25"–9"+), Thickness (6mm–3/4"), Wear Layer (6 mil–40 mil vinyl / 0.6mm–6mm engineered) |

---

## 14. Known Limitations & Future Work

### Current Limitations
- **Test infrastructure:** `@testing-library/react` not yet installed; 11 test files exist but cannot run
- **i18n:** next-intl configured but only English messages present
- **Search:** Filter-based search; no dedicated full-text search engine (Algolia/Meilisearch)
- **Real-time messaging:** Polling-based; no WebSocket/SSE for live updates
- **Mobile app:** Web-only; no native mobile apps

### Potential Enhancements
- WebSocket-based real-time messaging
- Full-text search engine integration
- Native mobile apps (React Native)
- Multi-currency support
- Advanced analytics and reporting
- Automated pricing suggestions (AI)
- Bulk listing import (CSV/spreadsheet)
- Integration with freight tracking APIs beyond Priority1
