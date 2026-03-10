# PlankMarket Pro Membership — Financial Model

**Date:** March 9, 2026
**Status:** Financial Analysis

---

## 1. The Market Reality

| Metric | Number | Source |
|---|---|---|
| TAM: Retailers | ~11,000 | Industry estimate |
| TAM: Distributors & manufacturers | ~2,000 | Industry estimate |
| **Total addressable market** | **~13,000** | |
| Target annual GMV | $100,000,000 | Business goal |
| Average deal size | $5,000 | Estimate |

### What Does $100M GMV Require?

```
$100M / $5,000 per deal = 20,000 transactions per year
20,000 / 12 = 1,667 transactions per month
```

If each active user averages **2.5 transactions/month** (realistic for a B2B marketplace — some buy monthly, some weekly):

```
1,667 / 2.5 = 667 active transacting users per month
```

667 active users out of 13,000 TAM = **5.1% market penetration**. Aggressive but achievable.

### Revenue at $100M GMV (Current Rates, No Pro Tier)

| Revenue Line | Rate | Annual Revenue |
|---|---|---|
| Buyer fees | 3.0% of GMV | $3,000,000 |
| Seller fees | 2.0% of GMV | $2,000,000 |
| Shipping margin | 25% markup on ~60% of orders* | ~$1,500,000 |
| Promotions | est. $50K/year | $50,000 |
| **Total platform revenue** | | **~$6,550,000** |

*Assuming 60% of orders ship (vs pickup), avg $2,000 shipping, 25% margin = $500/shipment × 12,000 shipped orders = $6M in shipping revenue, $1.2M in margin. Being conservative at $1.5M including higher-value shipments.

**The 5% take rate on $100M GMV = $5M/year in fees. That's the core business. Everything else is gravy.**

---

## 2. The Fee Discount Problem

### What a 0.5% Fee Reduction Actually Costs

If we reduce buyer fees from 3.0% → 2.5% and seller fees from 2.0% → 1.5%:

| At GMV | Fee Revenue Lost (Buyer) | Fee Revenue Lost (Seller) | Total Lost |
|---|---|---|---|
| $10M | $50,000 | $50,000 | **$100,000** |
| $25M | $125,000 | $125,000 | **$250,000** |
| $50M | $250,000 | $250,000 | **$500,000** |
| $100M | $500,000 | $500,000 | **$1,000,000** |

**At $100M GMV, the fee discount costs $1,000,000/year in lost revenue.**

### How Many Pro Subscribers to Break Even?

```
$1,000,000 / ($29 × 12) = 2,874 annual Pro subscribers
```

With 13,000 TAM, that's **22% market penetration as paying Pro subscribers.** Unrealistic.

Even at 50% of transactions involving a Pro member (not 100%):
```
$500,000 lost / ($29 × 12) = 1,437 Pro subscribers needed
```

That's still 11% of TAM as paying subscribers. Very aggressive.

### The Uncomfortable Truth

| Scenario | Fee Revenue | Sub Revenue | Total | vs Baseline |
|---|---|---|---|---|
| **Baseline** (no Pro, 5% take) at $100M | $5,000,000 | $0 | $5,000,000 | — |
| **Pro w/ fee discount** (50% Pro adoption on transactions, 500 subs) | $4,500,000 | $174,000 | $4,674,000 | **-$326,000** |
| **Pro w/ fee discount** (70% Pro, 800 subs) | $4,300,000 | $278,400 | $4,578,400 | **-$421,600** |

**Fee discounts destroy value at scale.** The subscription revenue never catches up to the lost fee revenue because the fee loss scales with GMV while subscription count is capped by TAM.

### Decision: No Fee Discounts

The 5% take rate is sacred. It scales with GMV, which is the whole point. Don't trade a scaling revenue line for a fixed one.

---

## 3. The Shipping Discount — Reframed

### What We Can't Say
"25% markup → 15% markup" — reveals margins, creates customer trust issues.

### What We Can Say
"Pro members save on shipping" or "Preferred shipping rates for Pro members."

### The Actual Mechanism

Internally reduce our markup from 25% to 20% for Pro members. Frame it externally as:

> **"Pro members save ~5% on shipping costs."**

(Because 20% markup / 25% markup = user pays ~4% less. Close enough to "~5% savings" without revealing the underlying math.)

### What This Costs Us

| Metric | Free (25% markup) | Pro (20% markup) | Our Margin Hit |
|---|---|---|---|
| $1,000 carrier rate | $1,250 charged | $1,200 charged | Lost $50 per shipment |
| $2,000 carrier rate | $2,500 charged | $2,400 charged | Lost $100 per shipment |

On a per-user basis, if a Pro user ships 2 orders/month at avg $1,500 carrier rate:
- Free margin: $375 × 2 = $750/month
- Pro margin: $300 × 2 = $600/month
- **Lost: $150/month per Pro user**

That's significant. $150/month lost per Pro user on shipping margin vs $29/month gained on subscription. **Net negative $121/month.**

### Better Option: Smaller Shipping Discount

Reduce markup from 25% to 22% for Pro. Frame as "preferred rates — save on every shipment."

| Metric | Free (25%) | Pro (22%) | Margin Hit |
|---|---|---|---|
| $1,500 carrier rate | $1,875 charged | $1,830 charged | Lost $45/shipment |

Per Pro user shipping 2x/month: lose $90/month. With $29 subscription: net -$61/month.

**Still net negative on shipping alone.** The shipping discount has to be modest or it eats the subscription revenue.

### Recommended: Symbolic Shipping Benefit

Don't frame it as a percentage discount at all. Instead:

> **"Pro members get preferred carrier rates."**

Internally, reduce markup from 25% to 23% (~$30 savings per $1,500 shipment). It's real savings for the user ($60/month on 2 shipments) but doesn't blow up our margins ($60 lost vs $29 gained = net -$31). Acceptable as a cost of reducing churn and increasing transaction volume.

Or better yet: **no shipping discount.** Keep the shipping margin intact and make Pro's value come from tools and intelligence that cost us almost nothing to deliver.

---

## 4. What Should Pro Actually Offer?

### The Principle: Offer Value That Scales With Zero Marginal Cost

| Value Type | Marginal Cost to PlankMarket | Value to User |
|---|---|---|
| Fee discounts | **Scales with GMV** (expensive) | High perceived value |
| Shipping discounts | **Scales with volume** (expensive) | High perceived value |
| AI agent features | **~$1-2/month** (nearly free) | High practical value |
| Market intelligence | **$0** (we already have the data) | Extremely high — can't get elsewhere |
| CRM tools | **$0** (already built) | Medium-high for active sellers |
| Bulk operations | **$0** (already built) | High for multi-listing sellers |
| Promotion credits | **$25/month** (fixed, drives transactions) | Medium |
| Faster payouts | **~$0** (Stripe instant payouts cost ~1%) | High perceived value |
| Priority verification | **$0** | Medium |
| Pro badge | **$0** | Low-medium (social proof) |
| Unlimited listings | **$0** | High for active sellers |

**The best Pro benefits cost us nothing to deliver.** Market intelligence, AI features, CRM, bulk ops, and unlimited listings are all zero-marginal-cost. That's where the value should come from.

---

## 5. Revised Pro Membership (No Fee Discounts)

### Free Tier

| Feature | Limit |
|---|---|
| Transaction fees | 3% buyer + 2% seller (standard) |
| Shipping rates | Standard |
| Active listings | 10 |
| Saved searches | 3 |
| AI search & listing creation | Yes |
| AI offer context ("below market") | Yes |
| Analytics | Basic (own listings only) |
| Messaging | Unlimited |
| Transactions | Unlimited |

### Pro: $29/month ($249/year)

| Feature | What You Get | Our Cost |
|---|---|---|
| **Unlimited active listings** | No cap on inventory | $0 |
| **AI autonomous agent** | Auto-offers, monitoring, repricing, negotiation, CSV import | ~$1-2/month |
| **Market intelligence** | Pricing data, demand signals, competitive position, sell-through rates | $0 |
| **Seller CRM** | Buyer tags, notes, followups, repeat buyer tracking | $0 |
| **Bulk operations** | CSV import, bulk price update, bulk relist | $0 |
| **$25 monthly promotion credit** | 1 free Spotlight boost/month | $25/month (but drives transactions we earn 5% on) |
| **Faster payouts** | Next business day vs 5 days | ~$5/month (Stripe instant payout fees) |
| **Priority verification** | 24-hour turnaround | $0 |
| **Pro badge** | Social proof on listings and offers | $0 |
| **Unlimited saved searches** | Monitor as many specs as you want | $0 |
| **Value dashboard** | See what your agent did, time saved, deals facilitated | $0 |
| **MCP server access** | Connect your own AI tools | $0 |
| **Preferred shipping rates** | Save ~2% on shipping | ~$30/month per active shipper |
| **Priority support** | Faster response times | Minimal |

**Total cost to serve a Pro user: ~$32-38/month**

**Subscription revenue: $29/month**

Wait — **that's net negative?** Let's look more carefully.

### The Promotion Credit Math

The $25 promotion credit costs us $25 — but what does it produce?

A promoted listing gets 3-5x more views. If that listing sells 30% faster, and generates a $5,000 transaction, PlankMarket earns:
- Buyer fee: $150
- Seller fee: $100
- Shipping margin: ~$375
- **Total: $625 from that one transaction**

If the promotion credit accelerates even one transaction per quarter that wouldn't have happened otherwise, it generates $625 in revenue from $75 in credits (3 months × $25). **ROI: 8.3x.**

The credit is a marketing expense, not a cost. Cut it if the math doesn't work out in practice.

### The Payout Speed Math

Stripe Instant Payouts cost 1% of the payout amount. If a Pro seller gets $5,000 in payouts per month:
- Cost: $50/month in Stripe instant payout fees

That's too expensive. Alternative: **use standard Stripe payouts but trigger them the morning after delivery confirmation** instead of waiting 5 days. This costs $0 (standard payouts are free) — we're just changing the delay timer, not using instant payouts.

> "Pro sellers get paid next business day after delivery confirmation."

Cost to us: $0. Value to seller: significant (4 days of cash flow improvement).

### Revised Cost to Serve

| Cost | Monthly |
|---|---|
| AI agent (API calls) | $1.50 |
| Promotion credit | $25.00 |
| Preferred shipping (~2% discount on margin) | $30.00* |
| Faster payouts | $0 (standard Stripe, just earlier trigger) |
| Everything else | $0 |
| **Total** | **~$56.50** |

*Only applies if user ships. Many transactions are pickup.

That's $56.50 cost vs $29 revenue. **Still negative by $27.50/month.** The promotion credit and shipping discount are the problem.

### Option A: Drop the Promotion Credit

| Cost | Monthly |
|---|---|
| AI agent | $1.50 |
| Preferred shipping | $30.00 |
| **Total** | **$31.50** |

Revenue: $29. Net: -$2.50/month. Nearly break-even on direct costs, but we're not accounting for the incremental transaction revenue the agent drives.

### Option B: Drop the Promotion Credit AND Shipping Discount

| Cost | Monthly |
|---|---|
| AI agent | $1.50 |
| Everything else | $0 |
| **Total** | **$1.50** |

Revenue: $29. **Net: $27.50/month profit per Pro user (95% margin).**

This is the cleanest model. Pro offers things that cost us nearly nothing but deliver high value: AI agent, market intelligence, unlimited listings, CRM, bulk ops, faster payouts, Pro badge.

### Option C: Keep Promotion Credit, Drop Shipping Discount

| Cost | Monthly |
|---|---|
| AI agent | $1.50 |
| Promotion credit | $25.00 |
| **Total** | **$26.50** |

Revenue: $29. **Net: $2.50/month.** Barely profitable per-user, but the promotion credit drives transactions (5% take rate). If each credit contributes to even 0.1 extra transactions per month at $5K = $250 in fee revenue. Actual net: **$252.50/month.**

---

## 6. The Right Answer: Option C (Modified)

Keep the promotion credit (it drives transactions). Drop the shipping discount (it scales badly). Drop the fee discount (it's even worse).

**But reduce the promotion credit to $15/month instead of $25.** This still covers a 7-day Spotlight discount ($29 → $14 out-of-pocket) and keeps costs manageable.

### Final Unit Economics Per Pro User

| Line | Monthly |
|---|---|
| **Revenue** | |
| Subscription | $29.00 |
| Incremental transaction fees (agent drives ~0.5 extra deals/month) | $125.00 |
| Incremental promotion purchases (credit gets them started) | $15.00 |
| **Total Revenue** | **$169.00** |
| | |
| **Costs** | |
| AI agent API | $1.50 |
| Promotion credit | $15.00 |
| **Total Cost** | **$16.50** |
| | |
| **Net Revenue Per Pro User** | **$152.50/month** |
| **Margin** | **90.2%** |

The subscription is $29. The real value is the $125 in incremental transaction fees. The AI costs $1.50. Everything else is free.

---

## 7. Scaling Model: Road to $100M GMV

### Required Transaction Volume

| Metric | Monthly | Annual |
|---|---|---|
| Target GMV | $8,333,333 | $100,000,000 |
| Avg deal size | $5,000 | |
| Transactions needed | **1,667/month** | **20,000/year** |

### Required User Base

| Assumption | Users Needed |
|---|---|
| Each active user transacts 2x/month (conservative) | 834 active users |
| Each active user transacts 3x/month (moderate) | 556 active users |
| Active users are 40% of registered users | 1,390-2,085 registered users |

**At 13,000 TAM, we need 10-16% of the market registered and 4-6% actively transacting monthly.**

### Revenue Build at $100M GMV

| Revenue Source | Rate | Annual |
|---|---|---|
| Buyer fees (3%) | Untouched | $3,000,000 |
| Seller fees (2%) | Untouched | $2,000,000 |
| Shipping margin (25% on 60% of orders) | Untouched | $1,200,000-1,500,000 |
| Pro subscriptions (est. 300 users) | $29/month | $104,400 |
| Promotion revenue (net of credits) | | $100,000-200,000 |
| **Total** | | **$6,404,400-$6,804,400** |

**The transaction fees ($5M) are 74-78% of total revenue.** Subscriptions are 1.5%. This confirms: **protect the take rate at all costs.**

### Sensitivity: What If We Had Given Fee Discounts?

| Scenario | Annual Fee Revenue | Subscription Revenue | Net vs Baseline |
|---|---|---|---|
| No Pro tier, 5% take on $100M | $5,000,000 | $0 | Baseline |
| Pro with 0.5% fee discount, 300 subs, 50% of GMV via Pro | $4,500,000 | $104,400 | **-$395,600** |
| Pro with 0.5% fee discount, 500 subs, 70% of GMV via Pro | $4,300,000 | $174,000 | **-$526,000** |
| **Pro with NO fee discount, 300 subs** | **$5,000,000** | **$104,400** | **+$104,400** |

**The fee discount costs half a million dollars at scale. The subscription generates $104K. No fee discounts. Period.**

---

## 8. User Acquisition Math

### How Many Retailers and Distributors?

To hit $100M annual GMV:

**Scenario A: Broad but shallow (lots of users, low volume each)**
- 1,500 active users × $5,556/month avg GMV each = $100M/year
- Need ~3,750 registered users (40% active rate)
- = 29% of TAM registered, 12% active monthly

**Scenario B: Concentrated (fewer high-volume users)**
- 500 active users × $16,667/month avg GMV each = $100M/year
- Need ~1,250 registered users (40% active rate)
- = 10% of TAM registered, 4% active monthly
- These are the top distributors doing serious volume

**Scenario C: Realistic mix**

| Segment | Users | Avg Monthly GMV | Annual GMV | % of Total |
|---|---|---|---|---|
| Top distributors (50+ deals/yr) | 50 | $80,000 | $48,000,000 | 48% |
| Mid distributors (20-50 deals/yr) | 150 | $20,000 | $36,000,000 | 36% |
| Regular retailers (5-20 deals/yr) | 400 | $3,333 | $16,000,000 | 16% |
| **Total** | **600 active** | | **$100,000,000** | |

**That's 600 active transacting users, ~1,500 registered, ~12% of TAM.** The top 50 distributors generate nearly half the volume. This is a classic power law.

### Pro Conversion by Segment

| Segment | Active Users | Pro Conversion | Pro Users | Sub Revenue |
|---|---|---|---|---|
| Top distributors | 50 | 80% | 40 | $13,920/yr |
| Mid distributors | 150 | 50% | 75 | $26,100/yr |
| Regular retailers | 400 | 15% | 60 | $20,880/yr |
| Occasional users | 800 | 5% | 40 | $13,920/yr |
| **Total** | **1,400** | **15.4%** | **215** | **$74,820/yr** |

~215 Pro subscribers generating ~$75K/year in subscription revenue. That's 1.1% of total platform revenue. **Confirms: subscriptions are a bonus, not the business.**

---

## 9. Maximizing Value Extraction

Given that transaction fees are 74-78% of revenue, the strategy is clear:

### A. Protect the 5% Take Rate

- No fee discounts for any reason
- No "negotiate your rate" for large sellers (yet — maybe at $50M+ individual GMV)
- The 5% is simple, fair, aligned (we only make money when you make money)
- If a competitor undercuts on fees, compete on value (intelligence, tools, agent) not price

### B. Maximize Transaction Volume (Most Important)

Every feature should be evaluated by: **does this increase GMV?**

| Feature | GMV Impact | Priority |
|---|---|---|
| AI listing creation (free) | More supply = more transactions | Highest |
| AI search (free) | Buyers find what they need = more transactions | Highest |
| Autonomous offer handling (Pro) | Faster negotiations = higher close rate | High |
| Market intelligence (Pro) | Better pricing = more sales | High |
| Smart repricing (Pro) | Rescues stale inventory = deals that would have died | High |
| RFQ matching (Pro) | Creates deals that wouldn't happen otherwise | High |
| Monitoring/alerts (Pro) | Catches time-sensitive opportunities | Medium-High |
| Promotion system | Surfaces best listings to buyers | Medium |
| Bulk import (Pro) | Unlocks large sellers who won't list 50 items manually | Medium |

### C. Maximize Shipping Revenue

Shipping margin ($1.2-1.5M at $100M GMV) is 18-23% of total revenue. This is a significant, hidden revenue line.

- **Do not discount shipping for Pro members.** It doesn't scale.
- **Do invest in shipping experience** (better quotes, tracking, fewer disputes) to increase the % of orders that ship vs pickup
- Currently assuming 60% ship — if we improve to 75%, shipping revenue increases by 25% (~$300K at scale)
- Frame shipping as a convenience, not a cost

### D. Grow Promotion Revenue

Currently estimated at $100-200K/year. Room to grow:

- The $15/month Pro credit gets sellers started with promotions
- Once they see results (promoted listings get 3-5x views), they buy more
- Estimated: 30% of Pro sellers buy $100+/year in promotions above the credit
- Growth to $300-500K/year at scale is achievable

### E. Strategic Pricing: When to Raise Pro

Start at $29/month. Evaluate at milestones:

| Milestone | Consider |
|---|---|
| 100 Pro users | Stable. $29 is right. Focus on growth. |
| 200 Pro users | Survey: "Would you still subscribe at $39?" If >70% yes, raise price for new signups. |
| 500 Pro users | Consider $39/month. Grandfather existing users. Market intelligence alone is worth it. |
| 1,000+ Pro users | Consider $49/month. Agent + intelligence + tools package is clearly differentiated. |

**Never raise price by reducing the free tier.** Always raise by adding more value to Pro.

---

## 10. Final Pro Design (No Fee Discounts, No Shipping Discounts)

### Pro: $29/month ($249/year)

**The value comes from tools and intelligence, not discounts.**

| Category | What You Get | Our Cost | User Value |
|---|---|---|---|
| **AI Agent** | | | |
| Autonomous offer handling | Set rules, agent handles 24/7 | $0.50/mo | Hours saved |
| Listing monitoring | Scans for matches every few hours | $0.50/mo | Never miss a deal |
| Smart repricing | Adjusts stale listings per market data | $0.25/mo | Rescued inventory |
| Negotiation autopilot | Counter-rounds per your rules | $0.15/mo | Faster closes |
| CSV bulk import | Upload spreadsheet, AI maps & creates | $0.10/mo | Hours saved on bulk |
| RFQ auto-matching | Agent responds to matching requests | $0.10/mo | New opportunities |
| | | | |
| **Intelligence** | | | |
| Market pricing data | What similar material sells for | $0 | Can't get elsewhere |
| Demand signals | How many buyers searching for your material | $0 | Pricing power |
| Competitive position | Where your price ranks vs similar listings | $0 | Strategic advantage |
| Sell-through rates | How fast your category moves | $0 | Inventory decisions |
| Price trend data | Is your material going up or down | $0 | Timing decisions |
| | | | |
| **Operations** | | | |
| Unlimited active listings | No 10-listing cap | $0 | Scale inventory |
| Bulk price update | Change all listings by % or amount | $0 | Efficiency |
| Bulk relist expired | One-click relist with price adjustment | $0 | Efficiency |
| Seller CRM | Tags, notes, followups, repeat buyers | $0 | Relationship mgmt |
| Unlimited saved searches | Monitor as many specs as needed | $0 | Coverage |
| | | | |
| **Account** | | | |
| $15 monthly promotion credit | 1 discounted boost/month | $15/mo | Visibility |
| Next-day payouts | Paid morning after delivery confirmed | $0 | Cash flow |
| Priority verification | 24-hour turnaround | $0 | Speed |
| Pro badge | Trust signal on listings and offers | $0 | Credibility |
| Value dashboard | What your agent did, time saved | $0 | ROI visibility |
| MCP server access | Connect Claude Code, Codex, etc. | $0 | Power users |
| Priority support | Faster response | Minimal | Peace of mind |

**Total cost to serve: ~$16.60/month** ($1.60 AI + $15 promotion credit)
**Subscription revenue: $29/month**
**Direct margin: $12.40/month (42.8%)**
**Including incremental transaction fees: ~$137.40/month (91.6%)**

---

## 11. Revenue Model Summary

### At $100M GMV

| Revenue Line | Annual | % of Total |
|---|---|---|
| Buyer fees (3.0%, no discounts) | $3,000,000 | 45.3% |
| Seller fees (2.0%, no discounts) | $2,000,000 | 30.2% |
| Shipping margin (25%, no discounts) | $1,350,000 | 20.4% |
| Pro subscriptions (~215 users) | $74,820 | 1.1% |
| Promotion revenue (net of credits) | $150,000 | 2.3% |
| Incremental fees from AI-driven transactions | Included in buyer/seller fees above | — |
| **Total** | **$6,574,820** | |
| | | |
| **AI costs** (~600 users with some AI usage) | **-$12,000** | |
| **Promotion credits** (~215 Pro × $15 × 12) | **-$38,700** | |
| **Net revenue** | **$6,524,120** | |

### What If We'd Done Fee Discounts?

| | No Discounts | With 0.5% Discounts |
|---|---|---|
| Fee revenue | $5,000,000 | $4,500,000 |
| Sub revenue | $74,820 | $74,820 |
| **Difference** | | **-$425,180** |

**Fee discounts would have cost us $425K/year at $100M GMV.** The entire Pro subscription revenue is $75K. We would have traded $425K for $75K. Bad trade.

---

## 12. Key Takeaways

1. **The 5% take rate is the business.** At $100M GMV it generates $5M/year. Protect it absolutely.

2. **Shipping margin is the #2 revenue line.** At $1.35M/year, it's 20% of revenue. Don't discount it.

3. **Pro subscriptions are a nice addon, not the business model.** ~$75K/year at scale. Design Pro to drive transactions (which generate fee revenue), not to replace fee revenue.

4. **Pro's value should come from zero-marginal-cost benefits**: AI agent ($1.60/user/month), market intelligence ($0), CRM ($0), bulk ops ($0), faster payouts ($0), unlimited listings ($0).

5. **The $15 promotion credit is a customer acquisition cost for promotion adoption.** It costs $39K/year but drives incremental transaction volume and gets sellers habituated to promoting.

6. **To hit $100M GMV, we need ~600 active transacting users.** That's 4.6% of the 13K TAM. The top 50 distributors will generate 48% of volume. Focus acquisition on them.

7. **Pro conversion target: 15-20% of active users.** ~215 Pro users at $100M GMV. The math works at much lower penetration because the subscription isn't the main revenue line.

8. **AI features for free (search, listing creation, offer context) drive marketplace liquidity.** Don't gate them. They make the platform better → more deals → more fee revenue.

9. **AI agent autonomy (auto-offers, monitoring, repricing) is Pro.** It costs us $1.60/month to deliver and drives incremental transactions worth $125+/month in fees. That's 78x ROI.

10. **Start at $29/month. Raise to $39-49 once market intelligence and agent features are proven and differentiated.** Never raise by reducing the free tier.
