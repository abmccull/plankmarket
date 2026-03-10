# PlankMarket AI Agent — Cost Model & Pricing Strategy

**Date:** March 9, 2026
**Status:** Analysis

---

## 1. Token Consumption Per Operation

These numbers are calculated from PlankMarket's actual data structures (schema sizes, response payloads, tool definitions).

### Base Overhead (Every API Call)

| Component | Tokens | Notes |
|---|---|---|
| System prompt (agent instructions) | ~500 | Agent persona, rules, safety rails |
| Tool definitions (30 tools × ~400 avg) | ~12,000 | BUT cached after first call → ~1,200 on cache hit |
| Anthropic tool system overhead | ~346 | Fixed per-call when tools are defined |
| **Total cold start** | **~12,846** | First call of session |
| **Total warm (cached)** | **~2,046** | Subsequent calls (90% cache savings on tool defs) |

### Per-Operation Token Cost (Data Only)

| Operation | Input Tokens | Output Tokens | Total |
|---|---|---|---|
| Search 20 listings | 300 | 750 | 1,050 |
| Get listing details | 50 | 375 | 425 |
| Get search facets | 50 | 200 | 250 |
| Make offer | 150 | 200 | 350 |
| Counter offer | 200 | 200 | 400 |
| Get my offers (10) | 100 | 800 | 900 |
| Create single listing | 800 | 300 | 1,100 |
| Get shipping quotes | 400 | 225 | 625 |
| Get listing analytics | 100 | 400 | 500 |
| Create buyer request | 400 | 300 | 700 |
| Send message | 300 | 100 | 400 |
| Get order details | 50 | 875 | 925 |

### Agent Reasoning Overhead

The AI doesn't just call tools — it reasons about what to do. Each "think → act" cycle adds:

| Component | Tokens |
|---|---|
| Agent reasoning (deciding what tool to call) | ~200-500 output tokens |
| Evaluating tool result (deciding next step) | ~100-300 output tokens |
| Final summary/decision | ~100-200 output tokens |
| **Total reasoning per tool cycle** | **~400-1,000 output tokens** |

---

## 2. User Personas & Monthly Usage

### Buyer Personas

#### Casual Buyer (1-2 purchases/month)
| Activity | Frequency/Month | Tokens Per | Monthly Tokens |
|---|---|---|---|
| Search sessions | 8 | 3,000 | 24,000 |
| View listing details | 15 | 425 | 6,375 |
| Get shipping quotes | 4 | 625 | 2,500 |
| Make offers | 2 | 350 | 700 |
| Offer negotiations (2 rounds) | 2 | 800 | 1,600 |
| Check order status | 3 | 925 | 2,775 |
| Agent reasoning overhead | — | — | 25,000 |
| **Total** | | | **62,950** |
| **+ Warm overhead (30 sessions × 2,046)** | | | **61,380** |
| **Grand total** | | | **~124K tokens** |

#### Active Buyer (weekly procurement)
| Activity | Frequency/Month | Tokens Per | Monthly Tokens |
|---|---|---|---|
| Search sessions | 30 | 3,000 | 90,000 |
| View listing details | 60 | 425 | 25,500 |
| Get shipping quotes | 15 | 625 | 9,375 |
| Make offers | 8 | 350 | 2,800 |
| Offer negotiations (3 rounds avg) | 8 | 1,200 | 9,600 |
| Check order status | 10 | 925 | 9,250 |
| Watchlist management | 20 | 300 | 6,000 |
| Saved search alerts evaluation | 60 | 1,500 | 90,000 |
| Agent reasoning overhead | — | — | 80,000 |
| **Total** | | | **322,525** |
| **+ Warm overhead (90 sessions × 2,046)** | | | **184,140** |
| **Grand total** | | | **~507K tokens** |

#### Power Buyer (autonomous procurement agent)
| Activity | Frequency/Month | Tokens Per | Monthly Tokens |
|---|---|---|---|
| Automated scans (every 15 min, 18hr/day) | 2,160 | 2,000 | 4,320,000 |
| Listing evaluations (5 per scan avg) | 10,800 | 425 | 4,590,000 |
| Shipping quote checks | 200 | 625 | 125,000 |
| Offers made | 30 | 350 | 10,500 |
| Offer negotiations | 20 | 1,200 | 24,000 |
| Order tracking | 15 | 925 | 13,875 |
| Budget calculations & reasoning | 2,160 | 300 | 648,000 |
| Agent reasoning overhead | — | — | 2,000,000 |
| **Total** | | | **11,731,375** |
| **+ Warm overhead (2,160 scans × 2,046)** | | | **4,419,360** |
| **Grand total** | | | **~16.2M tokens** |

### Seller Personas

#### Small Seller (5-20 listings)
| Activity | Frequency/Month | Tokens Per | Monthly Tokens |
|---|---|---|---|
| Create listings (manual, one at a time) | 10 | 1,100 | 11,000 |
| AI text extraction (from descriptions) | 5 | 1,250 | 6,250 |
| Review incoming offers | 8 | 900 | 7,200 |
| Auto-respond to offers | 5 | 400 | 2,000 |
| Check analytics | 10 | 500 | 5,000 |
| Price adjustment evaluations | 4 | 1,500 | 6,000 |
| Agent reasoning overhead | — | — | 20,000 |
| **Total** | | | **57,450** |
| **+ Warm overhead (30 sessions × 2,046)** | | | **61,380** |
| **Grand total** | | | **~119K tokens** |

#### Medium Seller (50-200 listings)
| Activity | Frequency/Month | Tokens Per | Monthly Tokens |
|---|---|---|---|
| CSV bulk imports (50 rows × 2 batches) | 2 | 12,500 | 25,000 |
| Individual listing creates/updates | 20 | 1,100 | 22,000 |
| AI text extraction | 15 | 1,250 | 18,750 |
| Review incoming offers | 30 | 900 | 27,000 |
| Auto-respond to offers | 25 | 400 | 10,000 |
| Counter offers | 10 | 400 | 4,000 |
| RFQ monitoring & responses | 15 | 1,500 | 22,500 |
| Analytics reviews | 20 | 500 | 10,000 |
| Price adjustment evaluations | 30 | 1,500 | 45,000 |
| Agent reasoning overhead | — | — | 80,000 |
| **Total** | | | **264,250** |
| **+ Warm overhead (100 sessions × 2,046)** | | | **204,600** |
| **Grand total** | | | **~469K tokens** |

#### Power Seller (autonomous listing & negotiation agent)
| Activity | Frequency/Month | Tokens Per | Monthly Tokens |
|---|---|---|---|
| CSV bulk imports (100 rows × 4 batches) | 4 | 17,500 | 70,000 |
| Offer monitoring (every 15 min, 18hr/day) | 2,160 | 1,500 | 3,240,000 |
| Auto-accept offers | 40 | 400 | 16,000 |
| Auto-counter offers | 25 | 400 | 10,000 |
| Auto-reject offers | 15 | 400 | 6,000 |
| RFQ scanning (hourly, 18hr/day) | 540 | 2,000 | 1,080,000 |
| RFQ auto-responses | 20 | 1,500 | 30,000 |
| Daily price adjustments (200 listings) | 30 | 3,000 | 90,000 |
| Promotion management | 10 | 800 | 8,000 |
| Agent reasoning overhead | — | — | 3,000,000 |
| **Total** | | | **7,550,000** |
| **+ Warm overhead (2,700 scans × 2,046)** | | | **5,524,200** |
| **Grand total** | | | **~13.1M tokens** |

---

## 3. Model Selection & Cost Per Persona

### Model Recommendation: Tiered Approach

| Task Type | Model | Why |
|---|---|---|
| **Routine scans** (search, filter, simple evaluation) | gpt-4.1-nano | $0.10/$0.40 — cheapest option for simple pattern matching |
| **Standard operations** (listing creation, offer decisions, RFQ matching) | Claude Haiku 4.5 or gpt-4.1-mini | Good reasoning at low cost |
| **Complex reasoning** (negotiation strategy, market analysis, pricing optimization) | Claude Sonnet 4.6 or gpt-4.1 | Strong reasoning when it matters |

### Cost Per Model (per million tokens)

| Model | Input | Output | Cached Input | Effective Blended* |
|---|---|---|---|---|
| gpt-4.1-nano | $0.10 | $0.40 | $0.025 | **~$0.18/MTok** |
| gpt-4.1-mini | $0.40 | $1.60 | $0.10 | **~$0.72/MTok** |
| Claude Haiku 4.5 | $1.00 | $5.00 | $0.10 | **~$2.10/MTok** |
| gpt-4.1 | $2.00 | $8.00 | $0.50 | **~$3.60/MTok** |
| Claude Sonnet 4.6 | $3.00 | $15.00 | $0.30 | **~$6.30/MTok** |

*Blended assumes 60% input (50% cached), 40% output — typical for tool-using agents.

### Monthly Cost Per Persona (Model Options)

| Persona | Tokens/Month | gpt-4.1-nano | gpt-4.1-mini | Haiku 4.5 | Sonnet 4.6 |
|---|---|---|---|---|---|
| **Casual Buyer** | 124K | $0.02 | $0.09 | $0.26 | $0.78 |
| **Active Buyer** | 507K | $0.09 | $0.37 | $1.06 | $3.19 |
| **Power Buyer** | 16.2M | $2.92 | $11.66 | $34.02 | $102.06 |
| **Small Seller** | 119K | $0.02 | $0.09 | $0.25 | $0.75 |
| **Medium Seller** | 469K | $0.08 | $0.34 | $0.99 | $2.95 |
| **Power Seller** | 13.1M | $2.36 | $9.43 | $27.51 | $82.53 |

### Recommended Model Routing Strategy

For power users (the expensive ones), use a **tiered routing strategy**:

| Operation | Model | % of Power User Tokens |
|---|---|---|
| Routine scans (search + basic filter) | gpt-4.1-nano | 70% |
| Standard ops (listing CRUD, simple offers) | gpt-4.1-mini | 20% |
| Complex reasoning (negotiation, pricing) | Claude Sonnet 4.6 | 10% |

**Power Buyer with routing:**
- 70% × 16.2M × $0.18/MTok = $2.04
- 20% × 16.2M × $0.72/MTok = $2.33
- 10% × 16.2M × $6.30/MTok = $10.21
- **Total: ~$14.58/month** (vs $102 with Sonnet-only or $2.92 with nano-only)

**Power Seller with routing:**
- 70% × 13.1M × $0.18/MTok = $1.65
- 20% × 13.1M × $0.72/MTok = $1.89
- 10% × 13.1M × $6.30/MTok = $8.25
- **Total: ~$11.79/month**

---

## 4. Additional Cost Optimizations

### Prompt Caching Impact

Tool definitions (12,000 tokens) are the biggest per-call cost. With caching:

| Scenario | Tool Def Cost per Call | Savings |
|---|---|---|
| No caching | 12,000 × $1.00/MTok = $0.012 | Baseline |
| Anthropic 5-min cache (90% hit rate) | Write: $0.015 + Reads: $0.0012 × 9 = **$0.026 amortized** | Actually costs MORE per 10 calls due to write premium |
| Anthropic 5-min cache (95% hit rate) | Write: $0.015 + Reads: $0.0012 × 19 = **$0.0384 amortized over 20** = **$0.0019/call** | **84% savings** |
| OpenAI auto-cache (gpt-4.1, 75% off) | $0.003 per cached call | **75% savings** |

**Key insight:** Caching saves enormously on power users who make thousands of calls. For casual users making 30 calls/month, the savings are negligible.

### Scan Optimization for Power Users

The biggest cost driver is **automated scans every 15 minutes**. Optimizations:

1. **Delta scanning**: Only fetch listings created/updated since last scan (add `createdAfter` filter). Reduces token count by ~80% on most scans.
2. **Fingerprint caching**: Hash the search results; if identical to last scan, skip AI evaluation entirely. Cost: $0 for no-change scans.
3. **Tiered scan frequency**: Scan every 5 minutes during peak hours, every 60 minutes overnight.
4. **Pre-filter at DB level**: Run the material/price/location filters in SQL before sending to AI. Only send listings that pass hard filters to the model for soft evaluation.

**With optimizations, power user scan costs drop ~60-70%:**
- Power Buyer: $14.58 → ~$5-6/month
- Power Seller: $11.79 → ~$4-5/month

---

## 5. Pricing Strategy

### Unit Economics Summary

| Tier | Users | Avg AI Cost/User/Month | Total Monthly AI Cost |
|---|---|---|---|
| Free (casual) | 500 | $0.05 | $25 |
| Pro (active) | 100 | $0.70 | $70 |
| Enterprise (power) | 20 | $10.00 | $200 |
| **Total** | **620** | | **$295/month** |

Even at scale (10x users), total AI cost would be ~$3,000/month — very manageable.

### Pricing Models Evaluated

#### Model A: Flat Monthly Subscription

| Tier | Price | AI Cost | Margin | Features |
|---|---|---|---|---|
| **Free** | $0 | ~$0.05 | -$0.05 | 5 AI searches/day, no auto-offers, no auto-listing |
| **Pro** | $49/month | ~$0.70 | **$48.30 (98.6%)** | Unlimited search, auto-offers, auto-listing, 10 active negotiation rules |
| **Business** | $149/month | ~$10.00 | **$139.00 (93.3%)** | Full autonomous agent, unlimited scans, CSV import, auto-negotiate, auto-price-adjust, priority scanning |

**Pros:** Simple, predictable revenue, massive margins
**Cons:** Power users could theoretically cost you $30-40/month (still profitable at $149)

#### Model B: Usage-Based (Per Action)

| Action | Price | AI Cost | Margin |
|---|---|---|---|
| AI search session | $0.05 | ~$0.005 | 90% |
| Auto-create listing (from CSV row) | $0.10 | ~$0.003 | 97% |
| Auto-offer/counter | $0.25 | ~$0.005 | 98% |
| Auto-accept (creates order) | $0.50 | ~$0.01 | 98% |
| Autonomous scan (per day) | $1.00 | ~$0.20 | 80% |
| Monthly agent subscription base | $19/month | — | — |

**Casual buyer**: $19 + 8 searches ($0.40) + 2 offers ($0.50) = **$19.90/month**
**Power buyer**: $19 + 30 scans ($30) + 30 offers ($7.50) + 5 accepts ($2.50) = **$59/month**

**Pros:** Fair — heavy users pay more, aligns costs
**Cons:** Complex pricing, unpredictable bills scare B2B buyers

#### Model C: Hybrid (Recommended)

| Tier | Price | Included | Overage |
|---|---|---|---|
| **Starter** | Free | 50 AI actions/month, manual only | — |
| **Pro** | $49/month | 500 AI actions/month, semi-autonomous | $0.10/action |
| **Business** | $149/month | 5,000 AI actions/month, full autonomous | $0.05/action |
| **Enterprise** | Custom | Unlimited, dedicated support | Custom |

**What counts as an "AI action":**
- 1 search = 1 action
- 1 listing created = 1 action
- 1 offer made/countered = 1 action
- 1 automated scan cycle = 1 action (even if it evaluates 10 listings)
- Reading data (orders, analytics) = free (doesn't count)

**Why this works:**
- Free tier is genuinely useful (50 actions = ~12 search sessions + a few offers)
- Pro covers active buyers/sellers comfortably (500 actions ≈ daily use)
- Business covers autonomous agents (5,000 actions ≈ 166 scans/month = 5-6/day)
- True power users who want 15-minute scans pay overage ($0.05 × ~2,000 extra scans = $100 → total $249/month)
- AI cost at Business tier: ~$10/month. Revenue: $149. **Margin: 93%+**

---

## 6. Worst-Case Cost Analysis

### What does the most expensive possible user look like?

**Doomsday Power Buyer:**
- Scans every 5 minutes, 24/7 = 8,640 scans/month
- Each scan evaluates 20 listings in detail = 172,800 evaluations
- Makes 100 offers/month with 5-round negotiations each
- Gets shipping quotes on every listing evaluated

**Token consumption: ~50M tokens/month**

| With nano routing (70%) | Cost |
|---|---|
| 35M tokens × $0.18/MTok | $6.30 |
| 10M tokens × $0.72/MTok | $7.20 |
| 5M tokens × $6.30/MTok | $31.50 |
| **Total** | **$45.00/month** |

At $149/month Business tier, you're still making **$104/month margin (69.8%)** on the most expensive user imaginable.

At $249/month (Business + overage), margin is **$204/month (81.9%)**.

### Break-Even Analysis

| Tier | Price | Max AI Cost Before Break-Even | What That Looks Like |
|---|---|---|---|
| Free | $0 | $0 (subsidized) | 50 actions, ~$0.05 cost, acceptable loss leader |
| Pro | $49 | $49 | Would need ~24M tokens/month on Haiku — physically impossible at 500 actions |
| Business | $149 | $149 | Would need ~83M tokens/month — would require scanning every second |

**Conclusion: It is essentially impossible for a user to cost more than their subscription.** The margins are structural because AI API costs are so low relative to the value delivered.

---

## 7. Cost Projection at Scale

### Year 1 Projection (Conservative)

| Quarter | Free Users | Pro Users | Business Users | AI Cost/Month | Revenue/Month | Margin |
|---|---|---|---|---|---|---|
| Q1 | 100 | 10 | 2 | $15 | $788 | 98% |
| Q2 | 300 | 30 | 5 | $50 | $2,215 | 98% |
| Q3 | 600 | 60 | 12 | $120 | $4,728 | 97% |
| Q4 | 1,000 | 100 | 25 | $275 | $8,625 | 97% |

**Annual AI cost: ~$5,520**
**Annual AI agent revenue: ~$196,000**

### Year 1 Projection (Aggressive)

| Quarter | Free Users | Pro Users | Business Users | AI Cost/Month | Revenue/Month | Margin |
|---|---|---|---|---|---|---|
| Q1 | 500 | 50 | 10 | $75 | $3,940 | 98% |
| Q2 | 2,000 | 200 | 30 | $320 | $14,270 | 98% |
| Q3 | 5,000 | 500 | 80 | $900 | $36,420 | 98% |
| Q4 | 10,000 | 1,000 | 200 | $2,300 | $78,800 | 97% |

**Annual AI cost: ~$43,200**
**Annual AI agent revenue: ~$1.6M**

---

## 8. Recommendations

### Model Selection
1. **Primary routing model for scans**: `gpt-4.1-nano` ($0.10/$0.40) — simple filter/match tasks
2. **Standard operations**: `gpt-4.1-mini` ($0.40/$1.60) — listing creation, offer evaluation
3. **Complex reasoning**: `Claude Sonnet 4.6` ($3/$15) — negotiation strategy, market analysis, pricing optimization
4. **Use Anthropic's MCP Connector** for the Sonnet calls (native MCP support, better tool use quality)
5. **Use OpenAI for nano/mini calls** (cheaper, more cost-effective for simple tasks)

### Pricing
- **Go with Model C (Hybrid)** — simple tiers with action-based overage
- Start at $49/$149 — adjust based on adoption data
- Free tier is critical for adoption (let users see the value before paying)
- 93%+ margins mean you have massive room to absorb edge cases

### Cost Controls
- Implement hard spending caps per user (circuit breaker if AI cost exceeds $50/month for any single user)
- Delta scanning by default (only fetch new/changed listings)
- Fingerprint caching (skip AI evaluation if search results unchanged)
- Model routing is non-negotiable — nano for scans, mini for standard, Sonnet for complex
- Log token usage per user for monitoring and pricing optimization

### What NOT to Do
- Don't use Opus for routine tasks (10x the cost of Sonnet, unnecessary for tool-calling)
- Don't let scan frequency go below 5 minutes (diminishing returns, cost explosion)
- Don't skip caching (tool definitions alone are 12K tokens — caching saves 84%+)
- Don't price per-token to users (too complex, scares B2B buyers)
- Don't offer unlimited scanning on the free tier (attracts abuse)
