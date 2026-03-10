# PlankMarket AI Agent — Value Analysis & Action Economics

**Date:** March 9, 2026
**Status:** Strategic Analysis

---

## 1. Redefining "Actions" — The User's Mental Model

The previous cost model defined actions from the API's perspective (1 search = 1 action, 1 offer = 1 action). But users don't think in API calls. They think in **outcomes**.

### The Problem with API-Based Action Counting

A buyer says: *"Find me reclaimed oak under $4/sqft near Denver and make offers on the best ones."*

Behind the scenes, that's:
- 1 search call
- 5 listing detail fetches
- 3 shipping quote checks
- 2 offer submissions
- = **11 API calls**

But to the user, that's **one thing they asked for**. Charging 11 "actions" for one intent feels punitive and confusing.

### Better: Outcome-Based Action Units

| Action Unit | What It Represents | What Happens Behind the Scenes | API Calls |
|---|---|---|---|
| **1 Search** | "Show me what's available" | Search + facets + up to 20 listing previews | 1-3 |
| **1 Listing Evaluation** | Agent deeply analyzes a listing (price, shipping, seller quality) | Get details + shipping quote + seller reviews | 2-4 |
| **1 Offer Cycle** | Making an offer through completion (including all counter-rounds) | Create offer + up to 5 counters + accept/reject/withdraw | 2-12 |
| **1 Listing Created** | A single listing goes from nothing to published | AI extraction + create + freight lookup + geocode | 3-6 |
| **1 Bulk Import** | Entire CSV processed (up to 100 listings) | Parse + validate + bulk create + error report | 2-5 |
| **1 Scan Cycle** | One autonomous monitoring pass | Search + filter + evaluate new matches + decide | 2-10 |
| **1 Price Adjustment** | Agent adjusts pricing on one listing | Check analytics + compare market + update price | 3-5 |
| **1 RFQ Response** | Seller agent responds to a buyer request | Match inventory + draft response + submit | 2-4 |

### What's Free (Never Counted)

These are passive reads that cost almost nothing and should never be gated:
- Viewing your own listings, orders, offers, messages
- Checking notifications
- Viewing analytics dashboards
- Reading conversation history
- Checking agent status and activity log
- Viewing budget status

**Principle: Reading your own data is always free. AI doing work on your behalf costs actions.**

---

## 2. Average User Monthly Consumption

### Who Is the "Average" PlankMarket User?

PlankMarket serves the B2B reclaimed/surplus flooring market. Typical users:

**Sellers:**
- Flooring distributors with overstock (10-100 SKUs turning monthly)
- Demolition/salvage companies with reclaimed material (irregular, batch-based)
- Contractors with leftover material from jobs (1-5 listings at a time)
- Manufacturers clearing discontinued lines (periodic large batches)

**Buyers:**
- General contractors sourcing for specific projects (episodic, deadline-driven)
- Flooring installers buying for multiple jobs (regular, weekly)
- Property managers/developers buying for renovations (monthly, recurring specs)
- Retailers restocking specialty items (regular, specific needs)

### Monthly Action Consumption by Archetype

#### Sellers

| Archetype | % of Sellers | Actions/Month | What They Do |
|---|---|---|---|
| **Occasional seller** | 40% | 3-8 | List a few items when they have surplus. Maybe 3-5 listings + respond to 1-2 offers manually. AI helps with listing creation. |
| **Regular seller** | 35% | 15-40 | Lists weekly, manages 20-50 active listings. AI creates listings from descriptions, auto-responds to straightforward offers, adjusts stale pricing. |
| **Power seller** | 20% | 60-200 | 100+ listings, bulk imports, autonomous offer handling, price optimization, RFQ monitoring. This is their primary sales channel. |
| **Enterprise seller** | 5% | 300-1,000+ | Dedicated channel manager, thousands of sqft moving monthly, needs full automation. |

**Weighted average seller: ~30 actions/month**

#### Buyers

| Archetype | % of Buyers | Actions/Month | What They Do |
|---|---|---|---|
| **Project buyer** | 45% | 5-15 | Has a specific project, searches for specific material, makes 1-3 offers, buys, done for weeks. AI helps find the best deal. |
| **Regular buyer** | 30% | 20-50 | Sources material weekly for ongoing jobs. Saved searches, watchlists, regular offer activity. AI monitors and alerts. |
| **Procurement buyer** | 20% | 80-250 | Full-time sourcing role. Needs autonomous scanning, auto-offers, budget management. PlankMarket is one of several channels. |
| **Enterprise buyer** | 5% | 400-2,000+ | Dedicated procurement agent running continuously. Large monthly budgets, complex specs, high-volume negotiation. |

**Weighted average buyer: ~35 actions/month**

---

## 3. Value Calculation: What Is Each Action Worth?

### The Time-Value Framework

The core value proposition is **time saved**. B2B users' time has a real dollar cost.

| Role | Typical Hourly Cost (fully loaded) |
|---|---|
| Contractor/installer | $50-75/hr |
| Procurement manager | $60-90/hr |
| Sales/channel manager | $55-85/hr |
| Business owner (small seller) | $75-150/hr |

### Time Saved Per Action

| Action | Manual Time | With AI Agent | Time Saved | Value @ $65/hr |
|---|---|---|---|---|
| **Search + evaluate results** | 15-30 min (browse, filter, compare, check sellers) | 30 sec (agent returns ranked results) | **15-30 min** | **$16-$32** |
| **Create a listing** | 20-45 min (fill 40+ fields, upload photos, set pricing, freight specs) | 2-3 min (describe in natural language or paste specs, agent fills everything) | **18-42 min** | **$20-$46** |
| **Bulk import 50 listings** | 3-6 hours (CSV prep, field mapping, fixing validation errors, manual review) | 15-30 min (upload CSV, agent maps columns, auto-fixes, reports errors) | **2.5-5.5 hrs** | **$163-$358** |
| **Evaluate and respond to an offer** | 10-20 min (read offer, check market price, think about counter, write message) | 0 min (agent auto-handles per rules) | **10-20 min** | **$11-$22** |
| **Full offer negotiation (3 rounds)** | 30-60 min spread over days (checking, deciding, responding, waiting) | 0 min (agent handles all rounds) | **30-60 min** | **$33-$65** |
| **Daily market scan** | 30-45 min (log in, check new listings, compare to needs, bookmark) | 0 min (agent scans every 15 min, alerts on matches) | **30-45 min** | **$33-$49** |
| **Respond to buyer request (RFQ)** | 15-25 min (read request, check inventory match, write response) | 1-2 min (agent auto-matches and responds) | **13-23 min** | **$14-$25** |
| **Price adjustment analysis** | 20-30 min per listing (check views, compare market, decide new price) | 0 min (agent adjusts per rules daily) | **20-30 min** | **$22-$33** |

### Monthly Value by Archetype

#### Sellers

| Archetype | Actions | Highest-Value Actions | Monthly Time Saved | Monthly Value |
|---|---|---|---|---|
| **Occasional** | 5 | 3 listings created (saves 1.5 hrs) + 2 offer responses (saves 30 min) | **2 hours** | **$130** |
| **Regular** | 30 | 10 listings (5 hrs) + 10 offers (3.5 hrs) + 5 price adjustments (2 hrs) + 5 RFQ responses (1.5 hrs) | **12 hours** | **$780** |
| **Power** | 150 | 1 bulk import (4 hrs) + 40 offers (13 hrs) + 30 price adjustments (10 hrs) + 15 RFQ responses (5 hrs) + daily scans (15 hrs) | **47 hours** | **$3,055** |
| **Enterprise** | 500+ | Full automation. Equivalent of a part-time employee. | **80+ hours** | **$5,200+** |

#### Buyers

| Archetype | Actions | Highest-Value Actions | Monthly Time Saved | Monthly Value |
|---|---|---|---|---|
| **Project** | 10 | 5 searches (2.5 hrs) + 3 evaluations (1 hr) + 2 offers (1 hr) | **4.5 hours** | **$293** |
| **Regular** | 35 | 15 searches (5 hrs) + 10 evaluations (2 hrs) + 5 offers (2.5 hrs) + daily scan monitoring (5 hrs) | **14.5 hours** | **$943** |
| **Procurement** | 150 | Autonomous scanning (20 hrs) + 20 offers with negotiation (10 hrs) + market analysis (5 hrs) | **35 hours** | **$2,275** |
| **Enterprise** | 1,000+ | Full autonomous procurement. Replaces significant portion of sourcing role. | **60+ hours** | **$3,900+** |

### The "Other" Value: Things Time Can't Capture

Beyond time savings, the AI agent delivers value humans can't match:

| Value | Description | Worth |
|---|---|---|
| **Never miss a listing** | Agent scans every 15 min. Human checks 1-2x/day at best. The best deals on surplus material sell in hours. | First-mover advantage on underpriced inventory = potentially thousands in savings |
| **Faster offer response** | Agent responds to offers in 30 minutes (configured delay). Humans take 4-24 hours. Faster response = higher close rate. | Studies show response within 1 hour = 7x higher conversion |
| **Consistent negotiation** | Agent doesn't get emotional, doesn't leave money on the table, doesn't forget to counter. Follows optimal strategy every time. | 5-10% better realized prices over time |
| **24/7 coverage** | Agent works weekends, evenings, holidays. Material from demolition jobs gets listed on Saturdays. | Captures opportunities outside business hours |
| **Data-driven pricing** | Agent adjusts prices based on actual market data (views, watchlist adds, competitor pricing) not gut feel. | Reduces stale inventory, increases sell-through rate |
| **No context switching** | Seller doesn't stop their real work to check PlankMarket 5 times a day. | Mental energy and productivity on core business |

---

## 4. What % of Users Would Want This?

### Adoption Curve Analysis

Not every user wants AI automation. Adoption follows a predictable curve based on:
1. **Technical comfort** — Do they use software tools daily?
2. **Volume** — Do they have enough activity to benefit from automation?
3. **Pain point intensity** — How much does the manual process hurt?

### Seller Adoption Estimate

| Segment | % of Sellers | Adoption Rate | Why |
|---|---|---|---|
| **Occasional sellers** (surplus from one job) | 40% | **5-10%** | Low volume. Listing 3 items doesn't justify learning a new feature. Will use AI listing creation (it's just easier) but not automation. |
| **Regular sellers** (weekly activity) | 35% | **25-40%** | Meaningful pain point. Creating 10+ listings/month is tedious. Offer management takes real time. High motivation. |
| **Power sellers** (primary sales channel) | 20% | **60-80%** | This is their livelihood. Time saved = money earned. Will adopt aggressively once they see it work. |
| **Enterprise sellers** | 5% | **80-95%** | Have the volume to make it essential. May ask for it before you build it. |

**Blended seller adoption: ~25-35%**

### Buyer Adoption Estimate

| Segment | % of Buyers | Adoption Rate | Why |
|---|---|---|---|
| **Project buyers** (one-off purchase) | 45% | **10-15%** | Low frequency. But AI search is so much better than manual filtering that many will use it once they see it. |
| **Regular buyers** (weekly sourcing) | 30% | **30-45%** | Meaningful time savings. Saved searches with AI alerts are a killer feature. |
| **Procurement buyers** (dedicated sourcing) | 20% | **50-70%** | This is exactly what procurement teams want. Autonomous scanning + auto-offers + budget management is their dream tool. |
| **Enterprise buyers** | 5% | **70-90%** | Will integrate into procurement workflows. May require it as a condition of using the platform at scale. |

**Blended buyer adoption: ~25-35%**

### What Drives Adoption Higher

| Factor | Impact on Adoption | How to Achieve |
|---|---|---|
| **Zero-friction onboarding** | +15-20% | "Enable AI Agent" is one toggle. Pre-fill config from their existing behavior (what they search for, their typical price range). |
| **Visible ROI dashboard** | +10-15% | Show: "Your agent saved you 12 hours this month" with specific actions listed. Make the value undeniable. |
| **Social proof** | +5-10% | "Sellers using AI agents get 3x faster offer responses and 22% more sales." Show aggregate stats. |
| **Free tier generosity** | +10-15% | 50 free actions lets them feel the magic. If AI creates their first listing in 30 seconds vs 20 minutes, they're hooked. |
| **Progressive disclosure** | +5-10% | Don't show the full config YAML. Start with "What material do you sell?" and build up. |

### Realistic Adoption Timeline

| Quarter | Free (AI features used) | Pro | Business | Total Using AI |
|---|---|---|---|---|
| **Launch** | 15% of users try it | 3% convert | 0.5% convert | 18.5% |
| **Q2** | 25% | 6% | 1.5% | 32.5% |
| **Q4** | 35% | 10% | 3% | 48% |
| **Year 2** | 50% | 15% | 5% | 70% |

---

## 5. How to Make the Agent More Valuable

### Level 1: Table Stakes (Must Have at Launch)

These are the minimum features that make the agent worth enabling:

**For Sellers:**
| Feature | Value Proposition |
|---|---|
| **Natural language listing creation** | "Brazilian cherry, 500 sqft, grade A, $5.50/sqft, warehouse in Atlanta" → complete listing in 30 seconds |
| **Smart CSV import** | Upload any spreadsheet format. Agent maps columns, fills gaps, fixes errors. No more fighting with CSV templates. |
| **Offer auto-response** | Set rules once: "Accept above 90%, counter at 95% if 80-90%, reject below 80%." Never miss an offer again. |

**For Buyers:**
| Feature | Value Proposition |
|---|---|
| **Natural language search** | "Reclaimed oak under $4, near Denver, at least 500 sqft" — no clicking through 15 filter dropdowns |
| **Smart alerts** | "Tell me the moment anything matching my specs hits the market." Scans every 15 minutes, not daily email digest. |
| **One-click offer** | Agent pre-fills offer based on your rules. You just approve or let it auto-submit. |

### Level 2: Differentiation (Months 2-3)

These make PlankMarket's agent notably better than manual use:

| Feature | How It Works | Why It's Valuable |
|---|---|---|
| **Market intelligence** | Agent analyzes all listings in your category: avg price, price trends, time-to-sell, supply levels | Sellers price competitively. Buyers know if they're getting a deal. Worth the subscription alone. |
| **Negotiation coaching** | Before making/accepting an offer, agent shows: "This is 12% below market avg. Similar listings sold at $4.20. Recommend countering at $4.00." | Users make better financial decisions. Reduces regret. Increases trust in the platform. |
| **Stale listing rescue** | Agent notices your listing has 200 views but 0 offers. Suggests: "Your price is 15% above market. Reducing to $3.80 would match similar sold listings." | Sellers who would otherwise let listings expire and leave the platform instead get sales. Retention tool. |
| **Buyer-seller matching** | When a new listing matches a buyer's saved search, AND a buyer request matches a seller's inventory — agent facilitates the introduction | Creates transactions that wouldn't have happened otherwise. Direct revenue impact. |
| **Reorder memory** | Buyer says: "I need the same material as order #1234 from last month, but 800 sqft this time." Agent finds the seller, checks availability, starts the conversation. | Reduces repeat purchase friction to near zero. Builds habit. |

### Level 3: Competitive Moat (Months 4-6)

These make PlankMarket irreplaceable:

| Feature | How It Works | Why It Locks Users In |
|---|---|---|
| **Procurement autopilot** | Buyer sets: "I need 2,000 sqft/month of LVP for my hotel renovation pipeline. Budget $8K/month. Here are my specs." Agent handles everything — scanning, offering, negotiating, ordering. | The buyer's AI agent becomes their procurement department for flooring. Switching to another marketplace means reconfiguring everything. |
| **Inventory velocity scoring** | Agent tells sellers: "Your hickory listings sell in 4 days avg. Your oak takes 18 days. Consider sourcing more hickory." | Sellers optimize their business around PlankMarket's data. Creates dependency on the platform's intelligence. |
| **Cross-listing intelligence** | Agent knows what's selling on PlankMarket and suggests: "Reclaimed barn wood demand is up 40% this month. You have 3 pallets in your warehouse — consider listing them." | PlankMarket becomes a sales advisor, not just a marketplace. |
| **Network effects** | More sellers with agents = faster offer responses = better buyer experience = more buyers with agents = more demand for sellers | The autonomous agent layer makes the marketplace faster, more liquid, and more efficient for everyone. Self-reinforcing. |
| **Transaction history intelligence** | "You've bought 10,000 sqft from ABC Flooring in the last 6 months at avg $3.80/sqft. They just listed similar material at $4.20. Based on your history, you could likely negotiate to $3.60." | Institutional memory that improves with every transaction. Can't replicate this anywhere else. |

---

## 6. Value-Based Pricing Validation

### Does the Pricing Match the Value?

| Tier | Price | Value Delivered (time savings) | Price-to-Value Ratio |
|---|---|---|---|
| **Free** (50 actions) | $0 | ~$130-290/month (2-4 hrs saved) | Free money for users |
| **Pro** (500 actions) | $49/month | ~$780-940/month (12-15 hrs saved) | **User gets 16-19x their money** |
| **Business** (5,000 actions) | $149/month | ~$2,200-3,000/month (35-47 hrs saved) | **User gets 15-20x their money** |
| **Enterprise** | Custom ($500+) | ~$5,000+/month (80+ hrs saved) | **User gets 10x+ their money** |

These ratios are excellent. B2B SaaS typically targets 3-10x value-to-price ratio. PlankMarket's agent delivers **15-20x**, meaning:
1. Price is very defensible (hard to argue it's not worth it)
2. There's room to increase pricing later
3. Low churn risk (users would need a very compelling reason to cancel)

### What If We're Wrong About Value?

The risk is that users don't *perceive* the time savings because they don't track their time. Mitigation:

**Show the value explicitly in the UI:**

```
┌─────────────────────────────────────────────┐
│  Your AI Agent This Month                    │
│                                              │
│  ⏱ Time Saved: 14.5 hours                   │
│  💰 Value: ~$943 (at $65/hr)                │
│  📊 Actions Used: 127 / 500                  │
│                                              │
│  Highlights:                                 │
│  • Created 8 listings in 4 minutes total     │
│  • Auto-countered 5 offers (won 3)           │
│  • Found 12 matching listings before          │
│    competitors (avg 23 min after posting)     │
│  • Adjusted pricing on 6 stale listings      │
│    → 2 sold within 48 hours                  │
│                                              │
│  Your Pro plan costs $49/month.              │
│  Your agent delivered $943 in value.         │
│  That's 19x return. 📈                       │
└─────────────────────────────────────────────┘
```

This is the single most important retention and upgrade tool. When a free user sees "Your agent saved you 4 hours but you're capped at 50 actions — upgrade to Pro for $49 and save 12+ hours," the conversion rate will be high.

---

## 7. Revised Action Tiers

Based on everything above, here's the refined pricing:

### Action Budget Design

| Tier | Monthly Actions | Autonomous Scanning | Target User | Monthly Value |
|---|---|---|---|---|
| **Starter** (Free) | 50 | No (manual trigger only) | Try-before-you-buy. Every user starts here. | ~$200 |
| **Pro** ($49/mo) | 500 | 4x/day (every 6 hours) | Regular buyers/sellers. Weekly activity. | ~$900 |
| **Business** ($149/mo) | 5,000 | Every 15 min (business hours) | Power users. Daily activity. Full automation. | ~$2,500 |
| **Enterprise** (custom) | Unlimited | Every 5 min, 24/7 | High-volume. Multiple users. API access. | ~$5,000+ |

### What's Included at Each Tier

| Feature | Starter | Pro | Business | Enterprise |
|---|---|---|---|---|
| Natural language search | ✓ | ✓ | ✓ | ✓ |
| AI listing creation | ✓ (5/month) | ✓ | ✓ | ✓ |
| CSV bulk import | — | ✓ (2 imports/month) | ✓ (unlimited) | ✓ |
| Offer auto-response | — | ✓ (accept/reject only) | ✓ (full negotiation) | ✓ |
| Autonomous scanning | — | 4x/day | Every 15 min | Every 5 min |
| Auto-offer on matches | — | — | ✓ | ✓ |
| Auto-purchase below threshold | — | — | ✓ | ✓ |
| Price optimization | — | Suggestions only | Auto-adjust | Auto-adjust |
| Market intelligence | Basic | Full | Full + trends | Full + API |
| Budget management | — | — | ✓ | ✓ + multi-user |
| RFQ auto-matching | — | ✓ | ✓ | ✓ |
| Value dashboard | ✓ | ✓ | ✓ | ✓ + reporting |
| MCP server access (BYOK) | — | — | ✓ | ✓ |

---

## 8. Making the Free Tier Irresistible

The free tier is the funnel. It needs to be good enough that users feel the value, but limited enough that they hit the wall and want more.

### The Hook: First Experience

When a new seller signs up and goes to create their first listing:

> **Before AI:** 40-field form. Dropdowns for material type, condition, grade, finish. Manual entry for dimensions, pricing, freight specs. Upload photos one by one. Takes 20-45 minutes. Many users abandon.
>
> **With AI (free tier):**
> "Describe your material or paste your spec sheet."
> → "Brazilian cherry hardwood, select grade, semi-gloss finish, 3/4" thick, 500 sqft across 3 pallets, overstock from a canceled hotel project. Warehouse in Atlanta 30301."
> → Agent fills all 40 fields, suggests pricing based on market ($4.50-5.50/sqft range for this spec), auto-fills freight class.
> → User reviews, tweaks price, publishes. **3 minutes.**

That first experience converts. The user just saved 30 minutes on their very first interaction with the platform. They'll use all 5 free AI listings that month, then happily pay $49 for unlimited.

### The Wall: What Makes Them Upgrade

| From | To | Trigger |
|---|---|---|
| Free → Pro | $49 | "You've used 50/50 actions. Your agent found 3 listings matching your specs this week but couldn't alert you. Upgrade to Pro for 4x daily scanning." |
| Free → Pro | $49 | "You have 8 pending offers. Your agent could auto-respond to save you 3 hours. Upgrade to Pro." |
| Pro → Business | $149 | "You received 12 offers while you were offline. With Business, your agent would have handled 10 of them automatically — accepting 4, countering 5, rejecting 1. Estimated revenue captured: $8,400." |
| Pro → Business | $149 | "3 listings matching your specs sold before your 6-hour scan interval. With Business (15-min scans), you'd have seen them first." |

---

## 9. Summary: The Numbers That Matter

| Metric | Number |
|---|---|
| **Average actions/month (all users)** | ~32 |
| **Median actions/month** | ~15 (skewed by power users) |
| **% of users who would try AI features** | 60-70% (if zero-friction) |
| **% who would find regular value** | 25-35% |
| **% who would pay** | 10-15% (Pro), 3-5% (Business) |
| **Value-to-price ratio (Pro)** | 16-19x |
| **Value-to-price ratio (Business)** | 15-20x |
| **AI cost per user (Pro)** | ~$0.70/month |
| **AI cost per user (Business)** | ~$10/month |
| **Margin (Pro)** | 98.6% |
| **Margin (Business)** | 93.3% |
| **Time saved per Pro user** | ~12 hrs/month |
| **Time saved per Business user** | ~35+ hrs/month |

### The One Sentence Pitch

**"PlankMarket's AI agent turns a 20-minute listing into 30 seconds, a missed deal into an auto-offer, and a manual procurement process into autonomous buying — and it pays for itself 15x over."**
