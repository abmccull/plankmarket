# PlankMarket Pro Membership — Final Design

**Date:** March 9, 2026
**Status:** Approved — Consolidation of all pricing, financial model, and AI agent strategy docs

---

## Executive Summary

PlankMarket makes money when deals close. The 5% take rate (3% buyer + 2% seller) on transaction volume is the business. At $100M annual GMV, that's $5M/year in fee revenue. Everything else — subscriptions, promotions, shipping margin — is secondary.

Pro membership exists to **accelerate transactions**, not to replace fee revenue. Every Pro benefit should either (a) cost us nearly nothing to deliver, or (b) directly drive incremental transaction volume that generates fee revenue.

**Two tiers. No action counting. No fee discounts. No shipping discounts.**

---

## The Two Tiers

### Free: "PlankMarket Works"

Everything you need to buy and sell surplus flooring. No tricks, no crippled experience.

**For Sellers:**

| Feature | Free Limit | Rationale |
|---|---|---|
| Active listings | **10 at a time** | Enough for a small batch of surplus. Once you have 15-20+ SKUs, you're running a real operation and Pro makes sense. |
| Seller fee | **2%** (standard) | Current rate. Fair for all sellers. |
| Promotions | Full price ($29-599) | Available but expensive without credits. |
| Analytics | **Basic** — views, offer count, watchlist adds | Enough to see what's happening with your listings. |
| AI listing creation | **Yes** — describe in plain English, fields auto-fill | Reduces the #1 seller friction point. More supply = more deals. |
| AI offer insights | **Yes** — "this offer is 8% below market" | Helps users make good decisions. More good decisions = more deals. |
| Bulk CSV import | **No** | Manual creation only. |
| CRM tools | **No** — basic messaging only | Tags, notes, followups are Pro. |

**For Buyers:**

| Feature | Free Limit | Rationale |
|---|---|---|
| Buyer fee | **3%** (standard) | Current rate. |
| Saved searches | **3** | Enough for 1-2 active projects. |
| AI search | **Yes** — natural language search | Reduces the #1 buyer friction point. Buyers find what they need = more deals. |
| AI offer suggestions | **Yes** — "similar material sold at $X" | Helps buyers make informed offers. |
| Offer monitoring | **Manual check only** | Must log in to see offer status. |

**For Everyone (Free):**

| Feature | Included |
|---|---|
| Unlimited transactions | Yes — we make 5% on every deal. Never block a transaction. |
| Messaging | Unlimited |
| Offers | Unlimited |
| Notifications | In-app + email |
| Mobile access | Full |
| Verification | Standard queue |

**AI cost per free user: ~$0.10-0.30/month** (only triggers on user-initiated actions, uses gpt-4.1-nano for simple operations).

**Why free AI?** These features make the marketplace better for everyone. They reduce friction, increase liquidity, and drive transactions. Paywalling them reduces adoption, reduces transactions, reduces fee revenue. Net negative.

---

### Pro: "PlankMarket Works For You" — $29/month ($249/year)

Everything in Free, plus the tools, intelligence, and automation that make Pro a no-brainer for serious users.

**The value comes from tools and intelligence, not discounts.**

#### AI Agent (Pro Exclusive)

| Feature | What You Get | Our Cost |
|---|---|---|
| **Autonomous offer handling** | Set rules: accept above X%, counter at Y%, reject below Z%. Agent handles offers 24/7. You wake up to closed deals. | $0.50/mo |
| **Listing monitoring** (buyers) | Agent scans for matching listings every few hours during business hours. Get notified before good deals disappear. Optionally makes offers automatically. | $0.50/mo |
| **Smart repricing** (sellers) | Agent adjusts stale listings based on engagement data and market comparisons. Set a floor, agent optimizes above it. | $0.25/mo |
| **Negotiation autopilot** | Agent handles counter-offer rounds per your rules. A 3-day back-and-forth becomes a 3-hour conversation. | $0.15/mo |
| **CSV bulk import with AI** | Upload any spreadsheet — agent maps columns, fills gaps, applies your pricing strategy, creates all listings. | $0.10/mo |
| **RFQ auto-matching** (sellers) | Agent monitors buyer requests and responds with matching inventory automatically. | $0.10/mo |
| **Auto-offer** (buyers) | Set price parameters. When a match appears, agent makes offers for you. You approve or let it run. | incl. above |
| **Budget tracking** (buyers) | Monthly procurement budget with automatic spend tracking. Agent stops when you hit your limit. | $0 |

**Total AI agent cost: ~$1.60/month per Pro user.**

The market is the natural rate limiter. A surplus flooring marketplace doesn't generate infinite actions. The most active user triggers ~200 automated operations/month. That costs $1-2 in API calls. No abuse scenario exists because the market itself caps activity.

#### Market Intelligence (Pro Exclusive)

| Feature | What You Get | Our Cost |
|---|---|---|
| **Market pricing data** | What similar material actually sells for — not just listed prices | $0 |
| **Demand signals** | How many buyers are searching for your material type in your area | $0 |
| **Competitive position** | Where your price ranks vs similar active listings | $0 |
| **Sell-through rates** | How fast your category moves on the platform | $0 |
| **Price trend data** | Is your material type going up or down in value | $0 |

This intelligence is expensive to replicate and impossible to get elsewhere. It makes PlankMarket the place where you understand the market, not just where you list stuff.

#### Operations (Pro Exclusive)

| Feature | What You Get | Our Cost |
|---|---|---|
| **Unlimited active listings** | No 10-listing cap. Scale your inventory. | $0 |
| **Bulk price update** | Change all listings by % or fixed amount | $0 |
| **Bulk relist expired** | One-click relist with optional price adjustment | $0 |
| **Seller CRM** | Buyer tags, internal notes, follow-up reminders, repeat buyer tracking | $0 |
| **Unlimited saved searches** | Monitor as many material specs as you need | $0 |

#### Account Benefits (Pro Exclusive)

| Feature | What You Get | Our Cost |
|---|---|---|
| **$15 monthly promotion credit** | Applies toward any listing promotion. Gets you started with Spotlight boosts. | $15/mo |
| **Priority verification** | 24-hour turnaround vs standard queue | $0 |
| **Pro badge** | Trust signal on your listings and offers. Pro sellers get more buyer trust. Pro buyers get faster seller responses. | $0 |
| **Value dashboard** | See exactly what your agent did: offers handled, deals facilitated, time saved, ROI in plain dollars. | $0 |
| **MCP server access** | Connect your own Claude Code, Codex, or other AI tools directly to PlankMarket. Power users who want BYOK pay their own API costs. | $0 |
| **Priority support** | Faster response times | Minimal |

---

## Why This Design

### No Fee Discounts

The 5% take rate is sacred. It scales with GMV, which is the whole point.

At $100M GMV, a 0.5% fee discount costs **$425,000-$1,000,000/year** in lost revenue. The entire Pro subscription base generates ~$75K/year. You'd be trading $425K for $75K. Bad trade.

| Scenario | Annual Fee Revenue | Sub Revenue | Net vs Baseline |
|---|---|---|---|
| **No Pro tier**, 5% take on $100M | $5,000,000 | $0 | Baseline |
| **Pro with 0.5% fee discount**, 300 subs, 50% GMV via Pro | $4,500,000 | $104,400 | **-$395,600** |
| **Pro with NO fee discount**, 300 subs | $5,000,000 | $104,400 | **+$104,400** |

### No Shipping Discounts

Shipping margin is the #2 revenue line (~$1.35M/year at $100M GMV, 20% of total revenue). Any discount scales badly:

- A 5% shipping savings costs ~$150/month per active Pro shipper
- That's $150 lost vs $29 gained = net -$121/month per user
- Even a modest 2% discount loses more per user than the subscription generates

Keep the shipping margin intact. Make Pro's value come from tools and intelligence that cost nearly nothing to deliver.

### No Action Counting

Any limit creates anxiety. A user thinking "I have 7 actions left" is optimizing for the limit instead of finding materials. That's a bad experience.

Instead: **feature gates, not usage gates.** Free users get AI that helps them do things better. Pro users get AI that does things for them. Clean line. No meters. No anxiety.

The natural ceiling protects us. Even the most active user does ~200 actions/month. The market simply doesn't generate more activity than that.

### Why $29 and Not $49 or $99

$29 is "don't even think about it" pricing for B2B:
- $29 has almost no resistance ("it's one lunch")
- $49 makes some users hesitate ("do I use it enough?")
- $99 creates real friction ("I need to justify this to my boss")

The real revenue from a Pro user comes from transactions, not the subscription:

| Revenue Source | Monthly |
|---|---|
| Pro subscription | $29 |
| Incremental transaction fees (agent drives ~0.5 extra deals/month @ $5K avg) | $125 |
| **Total** | **$154** |

The subscription is 19% of the revenue from that user. The other 81% comes from transactions the agent facilitates. **Price the subscription to maximize adoption, not margin.**

Start at $29. Evaluate raises at milestones:

| Milestone | Action |
|---|---|
| 100 Pro users | Stable. $29 is right. Focus on growth. |
| 200 Pro users | Survey: "Would you still subscribe at $39?" If >70% yes, raise for new signups. |
| 500 Pro users | Consider $39/month. Grandfather existing users. |
| 1,000+ Pro users | Consider $49/month. Agent + intelligence + tools is clearly differentiated. |

**Never raise price by reducing the free tier.** Always raise by adding more value to Pro.

---

## Unit Economics

### Cost to Serve Per Pro User

| Cost | Monthly |
|---|---|
| AI agent (API calls, model routing) | $1.60 |
| $15 promotion credit | $15.00 |
| Everything else | $0 |
| **Total** | **$16.60** |

### Revenue Per Pro User

| Revenue | Monthly |
|---|---|
| Subscription | $29.00 |
| Incremental transaction fees (~0.5 extra deals/month) | $125.00 |
| Incremental promotion purchases (credit gets them started) | $15.00 |
| **Total** | **$169.00** |

**Net revenue per Pro user: $152.40/month (90.2% margin)**

The subscription is $29. The real value is the $125 in incremental transaction fees. The AI costs $1.60. Everything else is free.

### The Promotion Credit Math

The $15/month credit costs $39K/year across ~215 Pro users. But:
- A promoted listing gets 3-5x more views
- If it sells 30% faster and generates a $5,000 transaction, PlankMarket earns ~$625 in fees + shipping margin
- If the credit contributes to even 0.1 extra transactions/month = $250 in fee revenue
- The credit is a customer acquisition cost for promotion adoption, not a loss

---

## Financial Model at $100M GMV

### Market Requirements

| Metric | Value |
|---|---|
| Total addressable market | ~13,000 (11K retailers + 2K distributors/manufacturers) |
| Target annual GMV | $100,000,000 |
| Average deal size | $5,000 |
| Transactions needed | 20,000/year (1,667/month) |
| Active transacting users needed | ~600 |
| Market penetration required | ~4.6% of TAM |

### User Distribution (Power Law)

| Segment | Active Users | Avg Monthly GMV | Annual GMV | % of Total |
|---|---|---|---|---|
| Top distributors (50+ deals/yr) | 50 | $80,000 | $48,000,000 | 48% |
| Mid distributors (20-50 deals/yr) | 150 | $20,000 | $36,000,000 | 36% |
| Regular retailers (5-20 deals/yr) | 400 | $3,333 | $16,000,000 | 16% |
| **Total** | **600 active** | | **$100,000,000** | |

The top 50 distributors generate nearly half the volume. Focus acquisition on them.

### Pro Conversion by Segment

| Segment | Active Users | Pro Conversion | Pro Users | Annual Sub Revenue |
|---|---|---|---|---|
| Top distributors | 50 | 80% | 40 | $13,920 |
| Mid distributors | 150 | 50% | 75 | $26,100 |
| Regular retailers | 400 | 15% | 60 | $20,880 |
| Occasional users | 800 | 5% | 40 | $13,920 |
| **Total** | **1,400** | **15.4%** | **215** | **$74,820** |

### Revenue Summary at $100M GMV

| Revenue Line | Annual | % of Total |
|---|---|---|
| Buyer fees (3.0%, untouched) | $3,000,000 | 45.3% |
| Seller fees (2.0%, untouched) | $2,000,000 | 30.2% |
| Shipping margin (25%, untouched) | $1,350,000 | 20.4% |
| Pro subscriptions (~215 users) | $74,820 | 1.1% |
| Promotion revenue (net of credits) | $150,000 | 2.3% |
| **Total platform revenue** | **$6,574,820** | |
| | | |
| AI costs (~600 users with some usage) | -$12,000 | |
| Promotion credits (~215 Pro × $15 × 12) | -$38,700 | |
| **Net revenue** | **$6,524,120** | |

Transaction fees ($5M) are 76% of total revenue. Subscriptions are 1.1%. **The subscription is a bonus, not the business.**

---

## Early Stage Projections (Year 1)

Assuming PlankMarket reaches 1,000 active users by EOY:

| Quarter | Active Users | Pro Users (10-15%) | Sub Revenue | Incremental Tx Revenue | AI Cost | Net from AI |
|---|---|---|---|---|---|---|
| Q1 | 200 | 15 | $435 | $1,125 | $65 | **$1,495** |
| Q2 | 400 | 45 | $1,305 | $3,375 | $160 | **$4,520** |
| Q3 | 700 | 85 | $2,465 | $6,375 | $300 | **$8,540** |
| Q4 | 1,000 | 130 | $3,770 | $9,750 | $450 | **$13,070** |
| **Year Total** | | | **$7,975** | **$20,625** | **$975** | **$27,625** |

The incremental transaction revenue is 2.5x bigger than subscription revenue. The AI cost is a rounding error.

---

## Implementation Priority

Since the AI is a **transaction accelerator**, prioritize by impact on deal flow:

| Priority | Feature | Tier | Impact |
|---|---|---|---|
| **1** | AI listing creation | Free | More supply → more deals. Reduces #1 seller friction. |
| **2** | Intelligent search | Free | Buyers find what they need → more deals. Reduces #1 buyer friction. |
| **3** | Market insights/pricing suggestions | Free | Better pricing → faster sales → more deals. |
| **4** | Autonomous offer handling | Pro | Faster negotiation → higher close rates. The money feature. |
| **5** | Listing monitoring + auto-offer | Pro | Catches time-sensitive deals. High perceived value. |
| **6** | CSV bulk import with AI | Pro | Unlocks large sellers. High one-time value. |
| **7** | Smart repricing | Pro | Rescues stale listings. Steady background value. |
| **8** | Negotiation autopilot | Pro | Completes the automation story. |
| **9** | RFQ auto-matching | Pro | Creates new deals. High value, lower volume. |
| **10** | Budget/procurement management | Pro | Enterprise feature. Build when demand appears. |

**Priority 1-3 should ship as part of the core platform.** They're just how PlankMarket works — no toggle, no opt-in, no "AI" branding. Just a better search bar and a better listing form.

**Priority 4-6 are the core Pro subscription.** The "set it and forget it" automation.

---

## AI Delivery Model

### Two Routes to AI Agents

**1. Platform-side (95% of users)**
PlankMarket runs the AI agent on behalf of the user. Uses model routing (gpt-4.1-nano for scans, gpt-4.1-mini for standard ops, Claude Sonnet for complex reasoning) to keep costs at ~$1.60/user/month. Powered by Inngest for background job orchestration. Users configure rules through the PlankMarket UI.

**2. User-side MCP (power users)**
Pro members can connect their own Claude Code, Codex, or similar tools via MCP server access. They authenticate with OAuth, get access to PlankMarket tools (search, list, offer, negotiate), and run agents on their own API subscriptions. Costs PlankMarket nothing. Appeals to technical power users who want maximum control.

Both routes are powered by the same underlying MCP server exposing PlankMarket's capabilities as tools.

---

## Key Decisions (Final)

1. **Two tiers only:** Free (AI-assisted) + Pro ($29/month, autonomous)
2. **No action counting:** Feature gates, not usage gates
3. **No fee discounts:** 5% take rate is sacred. Scales with GMV.
4. **No shipping discounts:** 25% margin is the #2 revenue line. Don't touch it.
5. **No accelerated payouts:** Stripe Connect governs payout timing. Funds transfer on shipment pickup; Stripe controls bank payout (2-3 business days). We cannot promise faster.
6. **$29/month:** Maximize adoption. Real money comes from transaction fees.
7. **Free AI is baked in:** Search, listing creation, offer context are how the platform works. Not a separate feature.
8. **Pro = "the agent works for you":** Autonomous offers, monitoring, repricing, bulk import, negotiation.
9. **$15/month promotion credit:** Acceptable CAC for promotion adoption. Drives incremental transactions.
10. **The market is the rate limiter:** No usage caps needed. Surplus flooring doesn't generate infinite actions.
11. **MCP server access included in Pro:** Power users who want BYOK connect their own AI tools. Costs us nothing.

---

## Documents Superseded

This document consolidates and supersedes:
- `PRO_MEMBERSHIP_DESIGN.md` — contained fee discounts, shipping margin language, and impossible payout claims
- `PRICING_FINANCIAL_MODEL.md` — source of truth for financial model, but contained "next-day payouts" which is not possible
- `AI_AGENT_PRICING_STRATEGY.md` — earlier pricing strategy, fully incorporated here
- `AI_AGENT_VALUE_ANALYSIS.md` — value analysis, key conclusions incorporated
- `AI_AGENT_COST_MODEL.md` — cost model, key figures incorporated
- `MCP_SERVER_FEASIBILITY_REPORT.md` — technical feasibility, referenced but not superseded (still valid)
- `AGENT_WORKFLOWS_ARCHITECTURE.md` — technical architecture, referenced but not superseded (still valid)
