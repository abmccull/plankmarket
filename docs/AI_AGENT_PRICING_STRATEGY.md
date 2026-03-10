# PlankMarket AI Agent — Pricing Strategy (Revised)

**Date:** March 9, 2026
**Status:** Strategic Decision

---

## Starting Over: What Do Users Actually Do?

### The Reality of a B2B Surplus Flooring Marketplace

This isn't Amazon. Transactions are infrequent, high-value, and relationship-driven. Let's ground ourselves:

**A typical PlankMarket transaction:**
- Average order: $1,500-5,000 (500-2,000 sqft at $3-5/sqft)
- Large orders: $10,000-50,000+
- PlankMarket take rate: 5% (3% buyer + 2% seller)
- Revenue per avg transaction: $75-250

**How often do people transact?**
- A buyer might purchase 1-3 times per month
- A seller might sell 2-8 times per month
- That means a typical active user generates $150-2,000/month in platform fees

**What do users actually do between transactions?**

A seller's real month:
1. Gets a batch of surplus material (maybe 5-15 SKUs)
2. Lists them over a day or two
3. Waits for offers/inquiries
4. Responds to 3-8 offers
5. Negotiates 2-4 deals
6. Ships 2-5 orders
7. Maybe relists if something didn't move

A buyer's real month:
1. Has 1-3 active projects needing specific material
2. Searches 3-5 times per week
3. Evaluates maybe 10-20 listings total
4. Makes 2-5 offers
5. Negotiates 1-3 deals
6. Buys 1-3 orders
7. Project done, goes quiet until next job

**That's maybe 15-40 meaningful interactions per month for an active user.** Not 500. Not 5,000. 15-40.

---

## The Core Insight: AI Isn't the Product. Transactions Are.

PlankMarket makes money when deals close. Every tool should be measured by: **does this cause more deals to close, faster, at higher values?**

The AI agent isn't a SaaS product to monetize separately. It's a **transaction accelerator**. Its job is to:

1. Get sellers listed faster → more supply → more transactions
2. Help buyers find matches faster → more demand → more transactions
3. Automate offer handling → faster negotiation cycles → more transactions
4. Reduce abandoned deals → higher close rates → more transactions
5. Surface opportunities → deals that wouldn't have happened → more transactions

### The Math That Changes Everything

PlankMarket earns 5% per transaction. Average transaction: $3,000 → **$150 platform revenue.**

If the AI agent causes just **one extra transaction per user per month**, that's $150 in fee revenue — far more than any $49 subscription.

If the AI agent increases the average seller's close rate by 20% (from 5 sales/month to 6), that's $150 extra/month in fees from that one seller.

If the AI helps a buyer find material 2 days faster, they buy on PlankMarket instead of calling their buddy at a competitor. That's a $150 transaction saved.

**The AI costs $0.50-1.00/month per average user in API calls. It generates $150+ per incremental transaction it facilitates. The ROI is 150-300x. Giving it away for free is the right business move.**

---

## Proposed Model: Two Tiers, Dead Simple

### Free: AI-Assisted (Everyone Gets This)

Every PlankMarket user gets AI built into the platform. It's not a separate feature — it's how the platform works.

| What You Get | How It Works |
|---|---|
| **Smart listing creation** | Describe your material in plain English → all fields filled, pricing suggested, freight calculated. This IS the listing flow — not a separate "AI" button. |
| **Intelligent search** | Type what you need in natural language. "Reclaimed oak near Denver under $4" just works. This IS the search bar. |
| **Offer suggestions** | When you receive an offer, the platform shows: "This is 8% below market. Similar material sold at $4.20 last week." Inline, not gated. |
| **Listing insights** | "Your listing has 45 views but no offers. Similar listings are priced 12% lower." Shows up in your dashboard automatically. |
| **Smart alerts** | Saved searches ping you when matching listings appear. Buyer requests notify relevant sellers. Already part of the platform. |

**Why free:** These features make the marketplace better for everyone. They reduce friction, increase liquidity, and drive transactions. Paywalling them reduces adoption, reduces transactions, reduces fee revenue. Net negative.

**AI cost per free user: ~$0.10-0.30/month** (only triggers on user-initiated actions, uses gpt-4.1-nano for simple stuff).

### PlankMarket Pro: Autonomous Agent ($29/month)

For users who want the AI to **act on their behalf** — not just assist, but execute.

| What You Get | Why It's Worth $29 |
|---|---|
| **Seller: Auto-respond to offers** | Set rules: "Accept above 90% of ask, counter at 95% if 80-90%, reject below 80%." Agent handles offers 24/7. You wake up to closed deals. |
| **Seller: Smart repricing** | Agent adjusts stale listings based on market data and engagement. No more listings dying quietly. |
| **Seller: CSV bulk import with AI mapping** | Upload any spreadsheet — agent maps columns, fills gaps, applies your pricing strategy, creates all listings. |
| **Seller: Auto-respond to RFQs** | Agent matches your inventory to buyer requests and responds automatically. |
| **Buyer: Autonomous monitoring** | Agent scans for matching listings every few hours during business hours. You get notified before the good deals disappear. |
| **Buyer: Auto-offer** | Set price parameters. When a match appears, agent makes offers for you. You approve or let it run. |
| **Buyer: Budget tracking** | Monthly procurement budget with automatic spend tracking. Agent stops when you hit your limit. |
| **Both: Negotiation autopilot** | Agent handles counter-offers per your rules. A 3-round negotiation that takes 3 days of back-and-forth happens in 3 hours. |
| **Both: Value dashboard** | See exactly what your agent did: "Responded to 6 offers, closed 3 deals, saved you 8 hours." |

**Why $29:** This is "don't even think about it" pricing for B2B. The user who needs autonomous offers is doing $5,000+/month in transactions. $29 is noise. And the lower the price, the higher adoption, which means more transactions and more fee revenue.

**AI cost per Pro user: ~$0.50-2.00/month** (depends on activity — model routing keeps costs low).

---

## Why Not More Tiers?

### The 5,000-action Business tier doesn't exist in reality

Let's count what a "power seller" actually does in a month:

| Activity | Realistic Frequency | Actions |
|---|---|---|
| Bulk import inventory | 1-2 times (when new stock arrives) | 2 |
| Individual listing creates/edits | 5-10 | 10 |
| Offer responses (auto) | 10-20 | 20 |
| Price adjustments | 5-10 listings | 10 |
| RFQ responses | 3-5 | 5 |
| Monitoring scans | 4/day × 30 days | 120 |
| **Total** | | **~167** |

And a "power buyer":

| Activity | Realistic Frequency | Actions |
|---|---|---|
| Searches | 15-20 | 20 |
| Listing evaluations | 30-40 | 40 |
| Offers made | 5-8 | 8 |
| Offer negotiations | 3-5 full cycles | 5 |
| Shipping quotes | 8-10 | 10 |
| Monitoring scans | 4/day × 30 days | 120 |
| **Total** | | **~203** |

**The ceiling is ~200 actions/month for even the most active user.** Nobody hits 500, let alone 5,000. The market simply doesn't have that velocity. New surplus flooring listings don't appear every minute — maybe a few per day in a given category and region.

A third "Business" tier would have zero customers. It's complexity for complexity's sake.

### Why not just make it all free?

Tempting, but wrong for two reasons:

**1. Autonomous action has real cost.** Scans running 4x/day for 1,000 Pro users = 120,000 scans/month. Even at $0.001/scan that's $120/month. Not breaking the bank, but not zero. The subscription covers AI costs with massive margin.

**2. The line between "assist" and "act" matters.** Free users get AI that helps them do things better. Pro users get AI that does things for them. This is a meaningful value step that users understand intuitively:

> Free: "Here are 5 listings that match your needs" (you still click, evaluate, offer)
> Pro: "I found 3 matches, made offers on 2, and one was accepted. You're getting 600 sqft of engineered oak at $3.40/sqft delivered to Denver." (it did the work)

**3. Signals seriousness.** Free tools feel disposable. A $29/month subscription signals "this is real, it's working for you, it's worth paying for." Users who pay are more likely to configure it properly and actually use it.

---

## Why $29 and Not $49 or $99

### $29 is the "headroom" price

At $29/month, PlankMarket's real revenue from a Pro user comes from transactions, not the subscription:

| Revenue Source | Monthly | Annual |
|---|---|---|
| Pro subscription | $29 | $348 |
| Transaction fees (if agent causes 1 extra deal/month @ avg $3K) | $150 | $1,800 |
| **Total** | **$179** | **$2,148** |

The subscription is 16% of the revenue from that user. The other 84% comes from the transactions the agent facilitates. This means:

- **Price the subscription to maximize adoption, not margin**
- $29 has almost no resistance in B2B ("it's one lunch")
- $49 makes some users hesitate ("do I use it enough?")
- $99 creates real friction ("I need to justify this to my boss")

At $29, the question isn't "is it worth $29?" — it's "is it worth having someone handle my offers while I'm at a job site?" Yes. Obviously.

### The real revenue model

```
Revenue from AI agents = (Pro users × $29/month)
                        + (incremental transactions × 5% take rate)
                        + (retained users who would have churned × LTV)

Revenue is dominated by the second and third terms.
The subscription is a bonus, not the business model.
```

---

## What Counts as an "Action" — Final Model

Actually, **don't count actions at all.** Here's why:

### The problem with action limits

Any limit creates anxiety. A user thinking "I have 7 actions left this month, should I use one to search?" is a user having a bad experience. They're optimizing for the limit instead of finding materials.

On the free tier, action limits make people think the AI is rationed. On the paid tier, they make people feel nickel-and-dimed. Neither is good.

### What to do instead: Feature gates, not usage gates

| | Free | Pro ($29/month) |
|---|---|---|
| **AI-assisted search** | Always on | Always on |
| **AI listing creation** | Always on | Always on |
| **Market insights** (pricing suggestions, demand signals) | Always on | Always on |
| **Offer suggestions** ("this offer is below market") | Always on | Always on |
| **Saved search alerts** | 3 saved searches | Unlimited |
| **Autonomous offer handling** | — | Set rules, agent handles offers |
| **Autonomous monitoring** | — | Scans 4x/day in business hours |
| **Auto-offer on matches** | — | Agent makes offers per your rules |
| **Smart repricing** | — | Agent adjusts stale listings |
| **CSV bulk import with AI** | — | Upload spreadsheet, agent creates all |
| **Negotiation autopilot** | — | Agent handles counter-rounds |
| **Budget management** | — | Set monthly spend limits |
| **RFQ auto-matching** | — | Agent responds to matching requests |
| **Value dashboard** | — | See time saved, deals facilitated |

**No action counting. No usage meters. No anxiety.**

Free users get AI that makes PlankMarket better to use manually. Pro users get AI that works on their behalf. Clean line.

### Why this works financially

**Free tier cost:** ~$0.10-0.30/user/month. AI only fires on user-initiated actions (search, create listing). Uses gpt-4.1-nano for everything except pricing suggestions (mini). At 1,000 free users = $100-300/month. Trivial.

**Pro tier cost:** ~$0.50-2.00/user/month. Autonomous scans (4x/day = 120/month), offer processing, repricing checks. Model routing keeps it cheap. At 200 Pro users = $100-400/month. Covered 15x by subscriptions ($5,800/month).

**The natural ceiling protects you.** A surplus flooring marketplace doesn't generate infinite actions. The most active user might trigger 200 automated operations/month. That costs $0.50-2.00 in API calls. There is no abuse scenario because the market itself is the rate limiter.

---

## Financial Summary

### Unit Economics Per User Type

| | Free User | Pro User |
|---|---|---|
| Subscription revenue | $0 | $29/month |
| AI cost | $0.10-0.30/month | $0.50-2.00/month |
| Subscription margin | -$0.20 avg | **$27.50 avg (95%)** |
| Avg transaction fees/month | $100-200 | $200-500 |
| Incremental transactions from AI | 0-0.5/month | 0.5-2/month |
| Incremental fee revenue from AI | $0-75 | $75-300 |
| **Total platform revenue per user** | **$100-200** | **$304-829** |
| **AI as % of user's revenue** | N/A | **3.5-9.5%** |

### Projected Financials (Year 1)

Assuming PlankMarket reaches 1,000 active users by EOY:

| Quarter | Active Users | Pro Users (10-15%) | Subscription Rev | Incremental Tx Rev | AI Cost | Net from AI |
|---|---|---|---|---|---|---|
| Q1 | 200 | 15 | $435 | $1,125 | $65 | **$1,495** |
| Q2 | 400 | 45 | $1,305 | $3,375 | $160 | **$4,520** |
| Q3 | 700 | 85 | $2,465 | $6,375 | $300 | **$8,540** |
| Q4 | 1,000 | 130 | $3,770 | $9,750 | $450 | **$13,070** |
| **Year Total** | | | **$7,975** | **$20,625** | **$975** | **$27,625** |

The subscription revenue is nice. The incremental transaction revenue is 2.5x bigger. The AI cost is a rounding error.

---

## What This Means for Implementation Priority

Since the AI is a **transaction accelerator**, not a standalone product, prioritize features by their impact on deal flow:

| Priority | Feature | Impact on Transactions |
|---|---|---|
| **1** | AI listing creation (free) | More supply → more deals. Reduces the #1 seller friction point. |
| **2** | Intelligent search (free) | Buyers find what they need → more deals. Reduces the #1 buyer friction point. |
| **3** | Market insights/pricing (free) | Better pricing → faster sales → more deals. Reduces stale inventory. |
| **4** | Offer auto-response (Pro) | Faster negotiation → higher close rates. The money feature. |
| **5** | Autonomous monitoring (Pro) | Catches time-sensitive deals. High perceived value. |
| **6** | CSV bulk import (Pro) | Unlocks large sellers. High one-time value, moderate recurring. |
| **7** | Smart repricing (Pro) | Rescues stale listings. Steady background value. |
| **8** | Negotiation autopilot (Pro) | Completes the automation story. Nice-to-have, not urgent. |
| **9** | RFQ auto-matching (Pro) | Creates new deals. High value but lower volume. |
| **10** | Budget/procurement management (Pro) | Enterprise feature. Build when demand appears. |

**Priority 1-3 should ship as part of the core platform, not as an "AI feature."** They're just how PlankMarket works. No toggle, no opt-in, no AI branding. Just a better search bar and a better listing form.

**Priority 4-6 are the Pro subscription.** This is the MCP server + orchestration layer. The "set it and forget it" automation.

---

## Key Decisions

1. **Two tiers only:** Free (AI-assisted) + Pro ($29/month, autonomous)
2. **No action counting:** Feature gates, not usage gates
3. **$29/month:** Maximize adoption. Real money comes from transaction fees.
4. **Free AI is baked into the platform:** Not a separate feature. It's how search, listing creation, and insights work.
5. **Pro is "the agent works for you":** Autonomous offers, monitoring, repricing, bulk import.
6. **The market is the rate limiter:** No need for usage caps — surplus flooring doesn't generate infinite actions.
7. **MCP server access included in Pro:** Power users who want BYOK can connect their own Claude Code/Codex. Costs PlankMarket nothing.
