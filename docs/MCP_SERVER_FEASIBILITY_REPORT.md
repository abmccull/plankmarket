# PlankMarket MCP Server — Feasibility & Strategy Report

**Date:** March 9, 2026
**Status:** Research & Recommendation

---

## Executive Summary

Building an MCP (Model Context Protocol) server for PlankMarket is **technically feasible and strategically compelling**. The protocol is mature enough for production use, PlankMarket's tRPC API surface maps cleanly to MCP tools, and the marketplace model (sellers listing, buyers searching) is a natural fit for AI agent automation.

However, **this is not a simple wrapper project**. Transaction safety, authentication complexity, and the risk of AI-initiated purchases without human confirmation require careful design. The recommendation is to **build it in phases**, starting with read-only operations, then adding write operations with mandatory human-in-the-loop confirmation for anything involving money.

**Verdict: Build it. Phase it. Gate transactions behind human approval.**

---

## Table of Contents

1. [What Is MCP and Why It Matters](#1-what-is-mcp-and-why-it-matters)
2. [The Two Use Cases](#2-the-two-use-cases)
3. [Technical Feasibility](#3-technical-feasibility)
4. [What PlankMarket Can Expose](#4-what-plankmarket-can-expose)
5. [Architecture Options](#5-architecture-options)
6. [Pros and Cons](#6-pros-and-cons)
7. [Security and Risk Analysis](#7-security-and-risk-analysis)
8. [Competitive Landscape](#8-competitive-landscape)
9. [User Benefit Analysis](#9-user-benefit-analysis)
10. [Recommended Phased Approach](#10-recommended-phased-approach)
11. [Technical Watchouts](#11-technical-watchouts)
12. [Open Questions](#12-open-questions)

---

## 1. What Is MCP and Why It Matters

The **Model Context Protocol** is an open standard (MIT licensed, created by Anthropic, adopted by OpenAI) that lets AI agents interact with external services. Think of it as "USB-C for AI tools" — one server works across Claude Code, OpenAI Codex, Cursor, Windsurf, and any compliant client.

### How It Works

```
┌──────────────┐     JSON-RPC 2.0      ┌──────────────────┐
│  AI Agent     │◄────────────────────►│  MCP Server       │
│  (Claude Code,│                       │  (PlankMarket)    │
│   Codex, etc) │                       │                   │
│               │  Tools: search,       │  ► tRPC routes    │
│               │  create_listing,      │  ► Supabase DB    │
│               │  make_offer, etc.     │  ► Stripe, P1     │
└──────────────┘                       └──────────────────┘
```

MCP servers expose three primitives:
- **Tools** — Functions the AI can call (search listings, create orders)
- **Resources** — Read-only data the AI can reference (listing details, user profile)
- **Prompts** — Reusable workflow templates ("list my inventory", "find reclaimed oak")

### Why It Matters Now

- **Shopify** already ships MCP endpoints on every store (`/api/mcp`)
- **Stripe** has an official MCP server at `mcp.stripe.com`
- OpenAI's Codex, Claude Code, Cursor, and 20+ AI tools all consume MCP
- The `.mcp.json` config format is becoming a cross-client standard
- B2B marketplaces are the *next wave* after consumer e-commerce MCP adoption

PlankMarket building MCP support now positions it as the first lumber/building materials marketplace with AI agent integration — a meaningful competitive differentiator.

---

## 2. The Two Use Cases

### Use Case A: Seller Automation

**"I have 40 pallets of engineered hickory. List them everywhere."**

A seller using Claude Code or Codex could:
1. Describe their inventory in natural language
2. The AI agent calls `create_listing` with structured data
3. Images are uploaded via URL references
4. Freight class auto-calculated
5. Pricing set based on market context (via `search_listings` first)
6. Listing goes live — or stays in draft for seller review

**Advanced flows:**
- Bulk import from a spreadsheet via `bulk_create_listings`
- Auto-respond to buyer requests that match inventory
- Monitor analytics and adjust pricing
- Manage offers (counter, accept, reject) with AI assistance
- CRM operations (tag buyers, schedule followups)

### Use Case B: Buyer Discovery & Procurement

**"Find me 500+ sqft of reclaimed oak within 200 miles of Denver under $4/sqft."**

A buyer's AI agent could:
1. Search listings with precise filters
2. Save searches with instant alerts
3. Compare options across multiple listings
4. Make offers on promising listings
5. Track order status and shipping

**Advanced flows:**
- Post buyer requests (RFQs) and evaluate seller responses
- Negotiate offers through the turn-based system
- Monitor watchlisted items for price drops
- Automate procurement workflows for repeat buyers

---

## 3. Technical Feasibility

### Protocol Compatibility — Excellent

| Requirement | PlankMarket Status | MCP Support |
|---|---|---|
| API layer | tRPC (typed RPC) | MCP is JSON-RPC — natural fit |
| Auth | Supabase JWT + roles | MCP supports OAuth 2.0/2.1 + Bearer tokens |
| Data validation | Zod schemas everywhere | MCP uses JSON Schema (Zod exports to JSON Schema) |
| Rate limiting | Upstash Redis (60/min) | MCP has no built-in rate limiting — server must enforce |
| Real-time | Not currently | MCP supports streaming via Streamable HTTP |
| Transactions | Stripe + row-level DB locking | MCP tools can wrap transactional operations |

### Transport Options

| Transport | Best For | Deployment |
|---|---|---|
| **Streamable HTTP** (recommended) | Remote access, serverless, multi-user | Deploy as Vercel serverless function or standalone |
| **Stdio** | Local development, single-user | `npx plankmarket-mcp` runs locally |

**Recommendation:** Streamable HTTP for production (multi-user, scalable), stdio for developer testing.

### SDK & Tooling

- **TypeScript SDK** (`@modelcontextprotocol/sdk`) — first-class, well-maintained
- PlankMarket is already TypeScript + Zod — the MCP server can import types directly
- Zod schemas convert to JSON Schema for MCP tool definitions with `zodToJsonSchema()`

### Cross-Agent Compatibility

A single PlankMarket MCP server would work with:

| Agent | Support Level | Notes |
|---|---|---|
| Claude Code | Full | Tool Search, OAuth, Resources, Prompts |
| OpenAI Codex | Full | Stdio + HTTP, OAuth, tool filtering |
| Cursor | Full | Stdio + HTTP via `.mcp.json` |
| Windsurf | Full | Standard MCP support |
| Claude Desktop | Full | Via connectors |
| Custom agents | Full | Any MCP-compliant client |

**This is the key value proposition: build once, work everywhere.**

---

## 4. What PlankMarket Can Expose

### Seller Tools (17 tools)

| Tool | Source Router | Risk Level | Phase |
|---|---|---|---|
| `create_listing` | listing.create | Medium (creates data) | 2 |
| `bulk_create_listings` | listing.bulkCreate | Medium | 3 |
| `update_listing` | listing.update | Medium | 2 |
| `delete_listing` | listing.delete | High (destructive) | 3 |
| `get_my_listings` | listing.getSellerListings | Low (read-only) | 1 |
| `get_listing_analytics` | analytics.getListingStats | Low | 1 |
| `get_sales_stats` | analytics.getSalesStats | Low | 1 |
| `get_my_orders` | order.getMySellerOrders | Low | 1 |
| `update_order_status` | order.updateStatus | Medium | 2 |
| `counter_offer` | offer.counter | Medium (negotiation) | 2 |
| `accept_offer` | offer.accept | High (creates order) | 3 |
| `reject_offer` | offer.reject | Medium | 2 |
| `respond_to_buyer_request` | buyerRequest.createResponse | Medium | 2 |
| `find_matching_requests` | matching.findMatches | Low | 1 |
| `crm_tag_buyer` | crm.addTag | Low | 2 |
| `crm_add_note` | crm.addNote | Low | 2 |
| `get_freight_defaults` | listing.getFreightDefaults | Low | 1 |

### Buyer Tools (14 tools)

| Tool | Source Router | Risk Level | Phase |
|---|---|---|---|
| `search_listings` | listing.list | Low (read-only) | 1 |
| `get_listing_details` | listing.get / getBySlug | Low | 1 |
| `get_search_facets` | search.getFacets | Low | 1 |
| `save_search` | search.saveSearch | Low | 1 |
| `add_to_watchlist` | watchlist.add | Low | 1 |
| `get_watchlist` | watchlist.getMyWatchlist | Low | 1 |
| `make_offer` | offer.create | High (financial commitment) | 3 |
| `get_my_offers` | offer.getMyOffers | Low | 1 |
| `create_buyer_request` | buyerRequest.create | Medium | 2 |
| `get_shipping_quote` | shipping.getQuotes | Low | 1 |
| `create_order` | order.create | Critical (payment) | 3+ |
| `get_my_orders` | order.getMyOrders | Low | 1 |
| `send_message` | message.sendMessage | Medium (content moderation) | 2 |
| `get_conversations` | message.getConversations | Low | 1 |

### Resources (Read-Only Data)

| Resource | Description | Source |
|---|---|---|
| `plankmarket://profile` | Current user profile & stats | auth.getProfile |
| `plankmarket://listing/{id}` | Full listing details | listing.get |
| `plankmarket://notifications` | Latest notifications | notification.getLatest |
| `plankmarket://preferences` | User preferences | preferences.getMyPreferences |

### Prompts (Workflow Templates)

| Prompt | Description | Target User |
|---|---|---|
| `list-my-inventory` | Guided listing creation workflow | Sellers |
| `find-materials` | Guided search with specification builder | Buyers |
| `negotiate-offer` | Review offer history and suggest counter | Sellers |
| `market-analysis` | Search + analytics for pricing strategy | Sellers |
| `procurement-workflow` | End-to-end: search → offer → order | Buyers |

---

## 5. Architecture Options

### Option A: Thin Wrapper over tRPC (Recommended)

```
┌─────────────┐      ┌──────────────────┐      ┌───────────────┐
│  AI Agent    │─────►│  MCP Server      │─────►│  PlankMarket  │
│              │ MCP  │  (TypeScript)    │ HTTP │  tRPC API     │
│              │      │                  │      │  /api/trpc    │
└─────────────┘      │  - Auth proxy    │      └───────────────┘
                     │  - Tool defs     │
                     │  - Rate limiting  │
                     └──────────────────┘
```

**Pros:** Clean separation, no changes to core app, independently deployable
**Cons:** Extra hop, must handle auth token forwarding

### Option B: Embedded in Next.js App

```
┌─────────────┐      ┌────────────────────────────────┐
│  AI Agent    │─────►│  PlankMarket Next.js App       │
│              │ MCP  │  /api/mcp (Streamable HTTP)    │
│              │      │  ► Direct DB access via Drizzle│
└─────────────┘      └────────────────────────────────┘
```

**Pros:** No extra service, direct DB access, shared auth
**Cons:** Couples MCP to Next.js deployment, harder to scale independently

### Option C: Standalone Package (npm)

```
┌─────────────┐      ┌──────────────────┐
│  AI Agent    │─────►│  npx @plankmarket│
│              │stdio │  /mcp-server     │
│              │      │  (local process) │
└─────────────┘      └──────────────────┘
```

**Pros:** Easy distribution, works offline for read ops, great DX
**Cons:** Requires API key management, can't easily scale

### Recommended: Option A + C Hybrid

- **Production:** Streamable HTTP server (Option A) deployed to Vercel/standalone
- **Developer/power user:** npm package for stdio (Option C) for local use
- Both share the same tool definitions and validation logic

---

## 6. Pros and Cons

### Pros

| Pro | Impact | Confidence |
|---|---|---|
| **First-mover in building materials** | No lumber marketplace has MCP — competitive moat | High |
| **Cross-agent compatibility** | One server works with Claude, Codex, Cursor, etc. | High |
| **Reduces seller listing friction** | Natural language → structured listing eliminates form fatigue | High |
| **Enables buyer procurement automation** | B2B buyers can integrate PlankMarket into procurement workflows | High |
| **Leverages existing infrastructure** | tRPC + Zod + TypeScript align perfectly with MCP SDK | High |
| **Low marginal cost** | MCP server is a thin layer over existing API | High |
| **Developer ecosystem play** | Contractors/developers building procurement tools would adopt | Medium |
| **Drives API-first thinking** | Forces clean API boundaries that benefit the whole platform | Medium |
| **Opens B2B integration channel** | Large buyers could pipe PlankMarket into ERP/procurement systems | Medium |

### Cons

| Con | Impact | Mitigation |
|---|---|---|
| **Transaction safety risk** | AI accidentally buying $50K of flooring | Mandatory human confirmation for financial ops |
| **Auth complexity** | Supabase JWT → MCP OAuth bridge is non-trivial | Use OAuth 2.0 with PlankMarket as identity provider |
| **Maintenance burden** | MCP server must stay in sync with API changes | Generate tool defs from Zod schemas (single source of truth) |
| **Small current user base** | Power users who'd use MCP may be few initially | Low cost to build; positions for future growth |
| **Prompt injection risk** | Listing descriptions could contain adversarial text | Sanitize all user-generated content in tool responses |
| **Rate limiting gaps** | AI agents can hit APIs much faster than humans | Enforce existing Redis rate limits + MCP-specific throttling |
| **Support complexity** | Debugging AI agent issues is harder than UI issues | Structured logging, health checks, error codes |
| **Image upload gap** | MCP can't directly upload files (text protocol) | Provide upload URLs; agent uploads via HTTP then registers |

---

## 7. Security and Risk Analysis

### Critical Risks

#### 1. Unauthorized Transactions
**Risk:** An AI agent creates orders or accepts offers without genuine user intent.
**Mitigation:**
- Phase 3 tools (orders, offer acceptance) require **explicit user confirmation** via MCP's elicitation primitive
- Implement a `confirmation_token` pattern: tool returns a preview + token, second call with token executes
- All financial operations log to an audit trail with `initiated_by: "mcp_agent"`

#### 2. Confused Deputy Attack
**Risk:** A malicious MCP client obtains another user's auth tokens.
**Mitigation:**
- Use OAuth 2.0 with PKCE (no implicit grants)
- Scoped tokens: `seller:listings:write`, `buyer:orders:read`, etc.
- Short-lived access tokens (15 min) with refresh rotation

#### 3. Prompt Injection via Listing Data
**Risk:** A seller crafts a listing description that manipulates a buyer's AI agent.
**Mitigation:**
- Sanitize all user-generated content in tool responses
- Add `[USER_GENERATED_CONTENT]` markers around untrusted text
- Keep tool responses structured (JSON) rather than narrative

#### 4. Rate Abuse
**Risk:** AI agents overwhelm the API (10x-100x human request rates).
**Mitigation:**
- Enforce existing Redis rate limits on MCP calls
- Add MCP-specific tier: 30 requests/minute for search, 5/minute for writes
- Implement backpressure via HTTP 429 with `Retry-After` header

#### 5. Data Leakage
**Risk:** MCP tool responses expose sensitive data (Stripe IDs, internal scores, PII).
**Mitigation:**
- Create dedicated MCP response schemas that exclude sensitive fields
- Never expose: `stripeAccountId`, `stripePaymentIntentId`, `aiVerificationScore`, `lat/lng` coordinates
- Mask contact info per existing contact-masking rules

### Security Requirements Checklist

- [ ] OAuth 2.0 with PKCE for HTTP transport
- [ ] Scoped API tokens (read vs write, buyer vs seller)
- [ ] Audit logging for all write operations
- [ ] Confirmation flow for financial operations
- [ ] Input validation (Zod) on all tool inputs
- [ ] Output sanitization (strip sensitive fields)
- [ ] Rate limiting per user per tool
- [ ] Content markers on user-generated data
- [ ] Token expiry and refresh rotation
- [ ] CORS/origin restrictions on HTTP transport

---

## 8. Competitive Landscape

### Who Has MCP Already

| Platform | MCP Status | Relevance |
|---|---|---|
| Shopify | Native on every store | Consumer e-commerce (different vertical) |
| Stripe | Official MCP server | Payment processor (PlankMarket uses Stripe) |
| PayPal | Official MCP server | Payment alternative |
| Amazon | No public MCP | Largest marketplace, no agent integration yet |
| BuildDirect | No MCP | Direct competitor — no AI agent support |
| Lumber Liquidators | No MCP | Direct competitor — no AI agent support |
| FloorFolio | No MCP | Industry catalog — no AI agent support |

### PlankMarket's Opportunity

**No building materials marketplace has MCP support.** This is a greenfield opportunity to:
1. Attract tech-forward sellers who manage inventory across channels
2. Enable procurement teams at contractors/builders to automate sourcing
3. Position PlankMarket as the "developer-friendly" marketplace in the vertical
4. Create network effects: more MCP-accessible inventory → more agent-driven buyers → more sellers

---

## 9. User Benefit Analysis

### For Sellers

| Benefit | Without MCP | With MCP |
|---|---|---|
| List a product | Fill out 40+ field form | "List my 200sqft of Brazilian cherry, grade A, $5.50/sqft in Denver" |
| Bulk import | Upload CSV, fix validation errors | "Import all products from this spreadsheet" |
| Respond to RFQs | Manually browse buyer requests | Agent auto-matches and drafts responses |
| Price optimization | Check competitors manually | "What's the going rate for engineered hickory in my area?" |
| Manage offers | Check dashboard repeatedly | Agent notifies and suggests counter-offers |
| Track orders | Login to dashboard | "What's the status of my open orders?" |

**Estimated time savings:** 70-80% reduction in listing creation time, 50% reduction in offer management overhead.

### For Buyers

| Benefit | Without MCP | With MCP |
|---|---|---|
| Find materials | Browse, filter, compare manually | "Find me 500sqft of reclaimed oak under $4, within 200 miles" |
| Track prices | Set up saved searches, check email | Agent monitors and alerts on matches |
| Procurement | Manual RFQ process | "I need 2000sqft of LVP for a hotel project in Phoenix" |
| Compare options | Open multiple tabs | Agent creates comparison across listings |
| Negotiate | Back-and-forth in dashboard | Agent handles negotiation within parameters |
| Reorder | Repeat manual process | "Reorder same spec as my last order from ABC Flooring" |

**Estimated time savings:** 60-70% reduction in sourcing time for repeat procurement.

### Who Benefits Most

1. **High-volume sellers** with large, rotating inventory (10+ listings/week)
2. **Procurement managers** at commercial builders sourcing materials regularly
3. **Multi-channel sellers** who want to automate across platforms
4. **Tech-savvy contractors** building with AI tools in their workflow

### Who Benefits Least

1. **One-time sellers** offloading a single batch (form is fine)
2. **Casual buyers** making a single purchase (UI is sufficient)
3. **Non-technical users** who don't use AI coding tools (yet)

---

## 10. Recommended Phased Approach

### Phase 1: Read-Only Foundation (2-3 weeks)

**Goal:** Let agents search, browse, and monitor — zero financial risk.

**Tools:**
- `search_listings` — Full search with all 15+ filters
- `get_listing_details` — Single listing deep-dive
- `get_search_facets` — Filter options with counts
- `get_my_listings` — Seller's own inventory
- `get_my_orders` — Order history (read-only)
- `get_my_offers` — Offer history
- `get_watchlist` — Buyer's watchlist
- `get_listing_analytics` — Seller stats
- `get_sales_stats` — Revenue stats
- `get_freight_defaults` — Freight class lookup
- `find_matching_requests` — Match seller inventory to buyer RFQs
- `get_shipping_quote` — Carrier quotes (read-only)

**Resources:**
- `plankmarket://profile` — User profile
- `plankmarket://listing/{id}` — Listing data
- `plankmarket://notifications` — Recent notifications

**Auth:** API key (simple Bearer token) with read-only scope
**Transport:** Stdio (npm package) + Streamable HTTP (hosted)
**Risk:** Minimal — all read-only operations

### Phase 2: Write Operations (2-3 weeks)

**Goal:** Let sellers create/manage listings, let buyers interact.

**New Tools:**
- `create_listing` — Create listing (draft or active)
- `update_listing` — Update listing fields
- `save_search` — Save search with alerts
- `add_to_watchlist` / `remove_from_watchlist`
- `create_buyer_request` — Post an RFQ
- `respond_to_buyer_request` — Seller responds to RFQ
- `send_message` — Buyer-seller messaging
- `counter_offer` / `reject_offer` — Offer management (non-financial)
- `crm_tag_buyer` / `crm_add_note` — Seller CRM

**Auth:** OAuth 2.0 with PKCE, scoped tokens (read + write)
**Confirmation:** All writes return a preview before execution
**Risk:** Medium — creates data but no financial transactions

### Phase 3: Transactional Operations (3-4 weeks)

**Goal:** Enable offers, order creation, and payments — with mandatory human confirmation.

**New Tools:**
- `make_offer` — Submit offer (requires confirmation)
- `accept_offer` — Accept offer → creates order (requires confirmation)
- `create_order` — Buy Now (requires confirmation + payment authorization)
- `purchase_promotion` — Buy listing promotion (requires confirmation)

**Confirmation Pattern:**
```
Agent calls: make_offer({ listingId, price, quantity })
Server returns: { preview: {...}, confirmationToken: "abc123", expiresIn: 300 }
User reviews preview in agent UI
Agent calls: confirm_offer({ confirmationToken: "abc123" })
Server executes the offer
```

**Auth:** OAuth 2.0 with elevated scopes (`transactions:write`)
**Risk:** High — real money involved. Mandatory human-in-the-loop.

### Phase 4: Advanced Automation (ongoing)

- Bulk operations (bulk_create, bulk_update)
- AI listing assistant integration (generate draft from description)
- Webhook subscriptions (real-time notifications to agents)
- Multi-agent workflows (buyer agent ↔ seller agent negotiation)
- Analytics dashboards via Resources
- Saved search alert streaming

---

## 11. Technical Watchouts

### 1. Token Bloat
PlankMarket has 150+ tRPC procedures. Exposing all as MCP tools would consume the entire context window of most AI agents.

**Solution:** Expose ~30 curated tools maximum. Claude Code's Tool Search handles lazy loading automatically when tools exceed 10% of context, but other clients may not.

### 2. Image Upload Gap
MCP is a text-based protocol — it can't directly upload binary files.

**Solution:** Two-step flow:
1. Tool returns a pre-signed upload URL
2. Agent uploads image via HTTP (separate from MCP)
3. Agent calls `register_media` tool with the uploaded URL

### 3. Auth Bridge Complexity
PlankMarket uses Supabase JWT tokens. MCP clients expect OAuth 2.0 flows.

**Solution:** Build an OAuth 2.0 authorization server that:
1. Redirects to Supabase Auth login
2. Issues scoped MCP access tokens on success
3. Handles token refresh

### 4. Zod Schema → JSON Schema Conversion
MCP tool parameters use JSON Schema. PlankMarket uses Zod.

**Solution:** Use `zod-to-json-schema` package (already common in the ecosystem). Maintain Zod as source of truth; generate JSON Schema at build time.

### 5. Response Size Limits
Claude Code warns at 10K tokens and hard-caps at 25K. A search returning 50 listings with full details would exceed this.

**Solution:**
- Default to summary views (title, price, location, sqft)
- Provide `get_listing_details` for deep-dive on specific listings
- Paginate all list operations (max 20 items per page)
- Strip unnecessary fields from responses

### 6. Concurrent Agent Access
Multiple AI agents could attempt to buy the same listing simultaneously.

**Solution:** PlankMarket already has row-level locking on orders. The MCP server inherits this protection. Add idempotency keys to prevent duplicate operations.

### 7. MCP Spec Evolution
The spec is at version 2025-11-25. TypeScript SDK v2 is expected Q2 2026.

**Solution:** Pin to stable SDK version. Abstract MCP-specific code behind an interface so SDK upgrades don't require rewriting business logic.

### 8. Debugging Difficulty
MCP errors surface as opaque JSON-RPC failures.

**Solution:**
- Structured logging with correlation IDs
- Health check endpoint (`/health`)
- Error codes that map to human-readable messages
- MCP Inspector tool for development testing

---

## 12. Open Questions

1. **Pricing model** — Should MCP access be free, or a premium/API tier? (Recommendation: free for Phase 1-2, potential premium for high-volume Phase 3+)

2. **Agent-to-agent negotiation** — Should we allow a buyer's AI agent to negotiate directly with a seller's AI agent? (Recommendation: not in v1 — too many edge cases)

3. **Listing quality** — AI-generated listings may be lower quality or spammy. Should we flag MCP-created listings for review? (Recommendation: same quality checks as UI, plus `created_via: "mcp"` metadata)

4. **API key vs OAuth** — Phase 1 could use simple API keys for faster launch. Is the security tradeoff acceptable? (Recommendation: API keys for Phase 1 read-only, OAuth required for Phase 2+)

5. **npm package name** — `@plankmarket/mcp-server`? `plankmarket-mcp`? (Decision needed)

6. **Rate limits for agents** — Should MCP clients get the same 60/min as web users, or different limits? (Recommendation: same limits initially, adjust based on usage data)

7. **Multi-tenant** — Should the MCP server support multiple PlankMarket instances? (Recommendation: no, single-tenant, YAGNI)

---

## Appendix: Tech Stack Alignment

| PlankMarket | MCP Server | Compatibility |
|---|---|---|
| TypeScript | `@modelcontextprotocol/sdk` (TypeScript) | Native |
| Zod validation | JSON Schema (via zod-to-json-schema) | Direct conversion |
| tRPC procedures | MCP Tools | 1:1 mapping |
| Supabase Auth (JWT) | OAuth 2.0 / Bearer tokens | Bridge needed |
| Drizzle ORM | N/A (calls tRPC, not DB directly) | Clean separation |
| Vercel deployment | Streamable HTTP transport | Native serverless support |
| UploadThing | Pre-signed URL pattern | Workaround needed |
| Upstash Redis rate limiting | MCP rate limiting | Reuse existing |

---

*This report was compiled from analysis of the PlankMarket codebase (150+ tRPC procedures, 25 database tables, 21 routers) and research into the MCP ecosystem including Anthropic docs, OpenAI Codex docs, and production MCP servers (Shopify, Stripe, PayPal).*
