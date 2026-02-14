# PlankMarket

**B2B Wholesale Flooring Liquidation Marketplace**

PlankMarket connects flooring manufacturers, distributors, and wholesalers with contractors, builders, and retailers. The platform specializes in liquidation, overstock, discontinued, and closeout flooring inventory at wholesale prices.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Environment Setup](#environment-setup)
  - [Database Setup](#database-setup)
  - [Running Locally](#running-locally)
- [Project Structure](#project-structure)
- [Architecture](#architecture)
  - [API Layer](#api-layer)
  - [Database](#database)
  - [Authentication](#authentication)
  - [Payments](#payments)
  - [Shipping](#shipping)
- [External Services](#external-services)
- [Scripts](#scripts)
- [Deployment](#deployment)
- [Documentation](#documentation)

---

## Features

### Marketplace
- **Listing management** — Multi-step creation wizard with 44 flooring-specific attributes (material type, species, finish, grade, dimensions, certifications)
- **Advanced search** — Faceted filtering across 20+ dimensions with saved search alerts
- **Offer negotiation** — Turn-based buyer/seller negotiation with counter-offers, 48-hour expiry, and full audit trail
- **Buy Now** — Instant checkout at listed price with fee breakdown

### Transactions
- **Stripe payments** — Secure card processing with PCI-compliant Stripe Elements
- **Seller payouts** — Stripe Connect for direct-to-bank transfers (subtotal minus 2% fee)
- **Escrow system** — Buyer funds held until carrier pickup confirmed, auto-released after 3 days
- **LTL freight shipping** — Priority1 API integration for commercial freight quotes, BOL generation, and real-time tracking

### Trust & Safety
- **Business verification** — AI-powered (Claude) EIN/document/website analysis + admin review
- **Identity masking** — Anonymous display names ("Verified Seller in FL") until order delivery
- **Content moderation** — Regex-based detection of contact info in messages/listings/offers with escalating enforcement
- **Rate limiting** — Three-tier Upstash Redis rate limiting (standard, strict, messaging-restricted)

### Communication
- **In-app messaging** — Threaded conversations per listing with content filtering
- **Notifications** — 9 notification types for order updates, offers, alerts
- **Email** — Transactional emails via Resend with React Email templates
- **Saved search alerts** — Automated email when new listings match saved filters

### Dashboards
- **Buyer dashboard** — Orders, watchlist, saved searches, settings
- **Seller dashboard** — Listings, orders, analytics, Stripe onboarding, verification status
- **Admin dashboard** — User management, listing moderation, order tracking, financial reporting, content moderation, seller verification review, platform settings

---

## Tech Stack

| Category | Technology |
|----------|-----------|
| Framework | [Next.js 16](https://nextjs.org) (App Router, Turbopack) |
| Language | TypeScript (strict mode) |
| UI | React 19, [Tailwind CSS v4](https://tailwindcss.com), [shadcn/ui](https://ui.shadcn.com), [Radix UI](https://radix-ui.com) |
| API | [tRPC 11](https://trpc.io) (end-to-end typesafe) |
| Database | PostgreSQL via [Supabase](https://supabase.com) |
| ORM | [Drizzle ORM](https://orm.drizzle.team) |
| Auth | [Supabase Auth](https://supabase.com/auth) |
| Payments | [Stripe](https://stripe.com) (Connect for payouts) |
| Shipping | [Priority1](https://www.priority1inc.com) LTL Freight API |
| Email | [Resend](https://resend.com) + [React Email](https://react.email) |
| Cache | [Upstash Redis](https://upstash.com) |
| Jobs | [Inngest](https://inngest.com) |
| Storage | [Uploadthing](https://uploadthing.com) |
| AI | [Anthropic Claude](https://anthropic.com) (verification) |
| Analytics | [PostHog](https://posthog.com) + [Vercel Analytics](https://vercel.com/analytics) |
| State | [Zustand](https://zustand-demo.pmnd.rs) |
| Forms | [React Hook Form](https://react-hook-form.com) + [Zod](https://zod.dev) |
| Charts | [Recharts](https://recharts.org) |
| Tables | [TanStack Table](https://tanstack.com/table) |

---

## Getting Started

### Prerequisites

- **Node.js** >= 18
- **npm** (or pnpm/yarn)
- A [Supabase](https://supabase.com) project (PostgreSQL + Auth)
- A [Stripe](https://stripe.com) account (with Connect enabled)
- An [Upstash](https://upstash.com) Redis database
- A [Resend](https://resend.com) account
- An [Inngest](https://inngest.com) account
- An [Uploadthing](https://uploadthing.com) account

### Environment Setup

1. Copy the example environment file:
   ```bash
   cp .env.example .env.local
   ```

2. Fill in your credentials in `.env.local`:

   ```env
   # Supabase
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   DATABASE_URL=postgresql://postgres:password@db.your-project.supabase.co:5432/postgres

   # Stripe
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...

   # Uploadthing
   UPLOADTHING_TOKEN=your-uploadthing-token

   # Resend
   RESEND_API_KEY=re_...
   EMAIL_FROM=PlankMarket <noreply@yourdomain.com>

   # Upstash Redis
   UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
   UPSTASH_REDIS_REST_TOKEN=your-redis-token

   # Inngest
   INNGEST_EVENT_KEY=your-inngest-event-key
   INNGEST_SIGNING_KEY=your-inngest-signing-key

   # App
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   NODE_ENV=development
   ```

   **Optional services:**
   ```env
   # AI Verification (optional)
   ANTHROPIC_API_KEY=sk-ant-...

   # LTL Shipping (optional)
   PRIORITY1_API_KEY=your-priority1-key

   # Analytics (optional)
   NEXT_PUBLIC_POSTHOG_KEY=phc_...
   NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
   NEXT_PUBLIC_SENTRY_DSN=https://...
   ```

### Database Setup

1. Generate the database schema:
   ```bash
   npm run db:generate
   ```

2. Push the schema to your database:
   ```bash
   npm run db:push
   ```

3. (Optional) Seed with sample data:
   ```bash
   npm run db:seed
   ```

4. (Optional) Open Drizzle Studio to browse the database:
   ```bash
   npm run db:studio
   ```

### Running Locally

```bash
# Install dependencies
npm install

# Start the development server (Turbopack)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

For Stripe webhooks in development, use the [Stripe CLI](https://stripe.com/docs/stripe-cli):
```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

For Inngest functions in development:
```bash
npx inngest-cli@latest dev
```

For email template development:
```bash
npm run email:dev
```

---

## Project Structure

```
plankmarket/
├── drizzle/                    # Database migrations
├── scripts/                    # Seed scripts
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (admin)/            # Admin dashboard (11 pages)
│   │   ├── (auth)/             # Login, register, password reset
│   │   ├── (dashboard)/        # Buyer/seller dashboards, messaging, offers
│   │   ├── (marketplace)/      # Browse listings, checkout, seller profiles
│   │   ├── (marketing)/        # Homepage, about, pricing, legal pages
│   │   └── api/                # API routes (tRPC, webhooks, cron)
│   ├── components/             # React components (76 files)
│   │   ├── admin/              # Admin tables, moderation views
│   │   ├── checkout/           # Payment forms, shipping quotes
│   │   ├── dashboard/          # Stats, status badges
│   │   ├── layout/             # Header, sidebar, footer
│   │   ├── listings/           # Listing forms, image gallery
│   │   ├── messaging/          # Chat interface
│   │   ├── offers/             # Offer cards, negotiation timeline
│   │   ├── search/             # Filters, listing cards
│   │   └── ui/                 # shadcn/ui primitives
│   ├── emails/                 # React Email templates
│   ├── lib/                    # Shared utilities
│   │   ├── content-filter/     # Contact info detection + filtering
│   │   ├── identity/           # Anonymous display name generation
│   │   ├── inngest/            # Background job definitions
│   │   ├── stores/             # Zustand state stores
│   │   ├── supabase/           # Auth client setup
│   │   ├── validators/         # Zod input schemas
│   │   └── utils.ts            # Formatting, fee calculations
│   ├── server/                 # Backend
│   │   ├── db/schema/          # Drizzle table definitions (18 tables)
│   │   ├── routers/            # tRPC route handlers (17 routers)
│   │   ├── services/           # Business logic (shipping, AI, moderation)
│   │   └── trpc.ts             # Middleware pipeline, procedure types
│   ├── types/                  # TypeScript type definitions
│   └── env.ts                  # Environment variable validation
├── .env.example
├── drizzle.config.ts
├── next.config.ts
├── package.json
└── tsconfig.json
```

---

## Architecture

### API Layer

The backend uses **tRPC** for end-to-end typesafe APIs. 17 routers are composed into a single app router exposed at `/api/trpc/[trpc]`.

**Authorization tiers** (enforced via middleware pipeline):

| Procedure | Auth | Verified | Role | Rate Limit |
|-----------|------|----------|------|-----------|
| `publicProcedure` | - | - | - | - |
| `rateLimitedPublicProcedure` | - | - | - | 10/min |
| `protectedProcedure` | required | - | - | 60/min |
| `verifiedProcedure` | required | required | - | 60/min |
| `buyerProcedure` | required | required | buyer | 60/min |
| `sellerProcedure` | required | required | seller | 60/min |
| `adminProcedure` | required | - | admin | 60/min |
| `messagingProcedure` | required | required | - | 60/min + content policy |

### Database

**18 PostgreSQL tables** managed with Drizzle ORM. Key tables:

- `users` — Accounts with role, verification status, Stripe Connect info
- `listings` — 44-column flooring product listings with pallet/freight metadata
- `orders` — Transactions with escrow status, shipping details, fee breakdown
- `offers` — Turn-based negotiations with event audit trail
- `conversations` / `messages` — Threaded messaging per listing
- `shipments` — LTL freight tracking with JSONB event history
- `reviews` / `disputes` — Post-purchase feedback and conflict resolution

### Authentication

Supabase Auth handles user registration and session management. Next.js middleware refreshes sessions on every request and protects dashboard routes. The tRPC context resolves the authenticated Supabase user to the local `users` table record for role-based authorization.

### Payments

Stripe handles all payment processing:

1. **Buyer pays** via Stripe Payment Intent (includes 3% buyer fee)
2. **Funds held** in platform's Stripe account (escrow)
3. **Seller ships** product via Priority1 freight
4. **Carrier picks up** → Inngest schedules escrow release
5. **3 days later** → Stripe Transfer sends payout to seller's Connect account (minus 2% seller fee)

### Shipping

Priority1 LTL freight integration provides commercial shipping:

1. Buyer enters delivery address at checkout
2. Server fetches freight quotes (origin ZIP, freight class, pallet weight/dimensions)
3. Quotes cached in Redis (15-min TTL) to prevent price manipulation
4. Buyer selects carrier/rate; server verifies from cache at order creation
5. After payment, Inngest auto-dispatches shipment via Priority1 API
6. Hourly polling updates tracking status in the `shipments` table

---

## External Services

| Service | Purpose | Required |
|---------|---------|----------|
| [Supabase](https://supabase.com) | Auth + PostgreSQL database | Yes |
| [Stripe](https://stripe.com) | Payments + seller payouts | Yes |
| [Upstash Redis](https://upstash.com) | Rate limiting + caching | Yes |
| [Resend](https://resend.com) | Transactional email | Yes |
| [Inngest](https://inngest.com) | Background jobs + crons | Yes |
| [Uploadthing](https://uploadthing.com) | File uploads | Yes |
| [Priority1](https://www.priority1inc.com) | LTL freight shipping | Optional |
| [Anthropic](https://anthropic.com) | AI business verification | Optional |
| [PostHog](https://posthog.com) | Product analytics | Optional |
| [Vercel](https://vercel.com) | Deployment + edge functions | Recommended |

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with Turbopack |
| `npm run build` | Production build |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | TypeScript type checking (`tsc --noEmit`) |
| `npm run db:generate` | Generate Drizzle migrations |
| `npm run db:migrate` | Run pending migrations |
| `npm run db:push` | Push schema to database (dev) |
| `npm run db:studio` | Open Drizzle Studio (database GUI) |
| `npm run db:seed` | Seed database with sample data |
| `npm run email:dev` | Preview email templates locally |

---

## Deployment

The application is designed for deployment on **Vercel**:

1. Connect your GitHub repository to Vercel
2. Set all environment variables in the Vercel dashboard
3. Configure the Stripe webhook endpoint to point to your production URL:
   ```
   https://your-domain.com/api/webhooks/stripe
   ```
4. Configure Inngest to use your production URL
5. Set up the Vercel cron job for `/api/cron/expire-promotions`

The `next.config.ts` includes security headers (CSP, HSTS, X-Frame-Options) that are applied automatically on deployment.

---

## Documentation

- **[Project State](./docs/PROJECT_STATE.md)** — Detailed write-up of current features, architecture, database schema, API layer, integrations, and security model
- **[.env.example](./.env.example)** — All required and optional environment variables

---

## License

Private. All rights reserved.
