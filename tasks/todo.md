# PlankMarket Pro Tier — Remaining UI Gaps

**Date:** March 9, 2026
**Status:** Ready to Execute
**Scope:** 6 must-have + 5 nice-to-have UI pieces

---

## Batch A: Limit Warnings & Feature Gates (Must-Have)

### A.1 — Listing limit warning on creation page
**File:** `src/app/(dashboard)/seller/listings/new/page.tsx`
**Issue:** Free users can start the 6-step wizard, fill everything out, then get a raw tRPC error on submit when they hit 10 active listings.
**Fix:** Query active listing count on page load. Show a banner at the top:
- "You have 8/10 active listings on the free plan" (amber warning)
- "You've reached the 10-listing limit. Upgrade to Pro for unlimited." (red block + CTA)
- Use existing `useProStatus` hook + a count query from `listing.getMyStats` or similar
- When at limit, disable the form submit button
- [ ] Add listing count query
- [ ] Show limit banner with count
- [ ] Disable submit at limit with upgrade CTA

### A.2 — Saved search limit warning
**File:** `src/components/saved-searches/edit-saved-search-dialog.tsx` (or the parent list page)
**Issue:** Free users can save 3 searches, then get a raw error on the 4th.
**Fix:** On the saved searches page, show current count vs limit:
- "3/3 saved searches used — Upgrade to Pro for unlimited"
- Disable "Save Search" button when at limit
- Use `useProStatus` + count from the search list query
- [ ] Show count/limit indicator on saved search list page
- [ ] Disable save button at limit with upgrade CTA

### A.3 — Bulk upload page Pro gate
**File:** `src/app/(dashboard)/seller/listings/bulk-upload/page.tsx`
**Issue:** Page is freely accessible but bulk upload is a Pro feature.
**Fix:** Wrap page content in `<ProGate feature="Bulk CSV Import">`. Free users see the upgrade prompt. This is a one-line wrapper.
- [ ] Import ProGate and wrap page content

### A.4 — Followups page Pro gate
**File:** `src/app/(dashboard)/seller/followups/page.tsx`
**Issue:** CRM followups are Pro-only at the backend but the page is accessible.
**Fix:** Wrap in `<ProGate feature="Buyer CRM">`. Same pattern as agent pages.
- [ ] Import ProGate and wrap page content

### A.5 — Sidebar navigation for Agent & Subscription
**File:** `src/components/layout/sidebar.tsx`
**Issue:** Agent settings and subscription management are only reachable by direct URL. No sidebar links.
**Fix:** Add to seller sidebar items:
- Under existing items, add a "Pro" section divider:
  - "AI Agent" → `/settings/agent` (with sparkle/bot icon)
  - "Subscription" → `/settings/subscription` (with credit-card icon)
- Conditionally show "AI Agent" with a Pro badge or lock icon for free users
- [ ] Add AI Agent link to seller sidebar
- [ ] Add Subscription link to seller sidebar
- [ ] Show Pro badge/lock indicator on agent link

### A.6 — Promotion credit in boost modal
**File:** `src/components/promotions/boost-modal.tsx`
**Issue:** Pro users have promotion credits but the boost purchase flow doesn't show or apply them.
**Fix:** In the payment step of the boost modal:
- Query available credit via `useProStatus` hook (already returns `availableCredit`)
- Show credit balance: "You have $12.50 in promotion credits"
- Show price breakdown: "$79.00 - $12.50 credit = $66.50 due"
- Backend already handles credit deduction in `promotion.purchase` — just need to display it
- If credits fully cover the price, show "Covered by credits — no payment needed"
- [ ] Add credit balance display to payment step
- [ ] Show price breakdown with credit applied
- [ ] Update confirmation text when fully covered by credits

---

## Batch B: CRM UI (Nice-to-Have, High Value)

### B.1 — Buyer Tags & Notes UI
**Context:** The CRM router (`src/server/routers/crm.ts`) has full CRUD for tags and notes per buyer, but no frontend exists.
**Where:** Add inline CRM tools on buyer-facing surfaces — offer detail pages, conversation/message threads, and order detail pages.
**Implementation:**
- Create `src/components/crm/buyer-tags.tsx` — tag pills with add/remove, auto-complete from seller's existing tags
- Create `src/components/crm/buyer-notes.tsx` — collapsible notes panel with add/edit/delete
- Embed these components in:
  - `src/app/(dashboard)/seller/offers/[offerId]/page.tsx` (or similar offer detail)
  - `src/app/(dashboard)/seller/messages/[conversationId]/page.tsx` (or message thread)
  - `src/app/(dashboard)/seller/orders/[id]/page.tsx`
- Gate with `useProStatus` — show teaser + upgrade CTA for free users
- [x] Create BuyerTags component
- [x] Create BuyerNotes component
- [x] Embed in offer detail page
- [x] Embed in message thread page
- [x] Embed in order detail page

### B.2 — CRM Leads Dashboard
**Context:** The CRM router has `exportLeadsCsv` which aggregates buyer data. Build a dedicated CRM page.
**File:** New page at `src/app/(dashboard)/seller/crm/page.tsx`
**Implementation:**
- Table of all buyers the seller has interacted with (from offers, orders, messages)
- Columns: Buyer name, tags, note count, last interaction, total orders, total revenue
- Filters: by tag, by interaction type
- "Export CSV" button calling `crm.exportLeadsCsv`
- Inline tag/note editing per row
- Add "Buyer CRM" link to seller sidebar
- Wrap in ProGate
- [x] Create CRM leads page (hub/dashboard approach)
- [x] Add buyer interaction table (quick links + how-it-works)
- [x] Add tag/note inline editing (via embedded CRM components)
- [x] Add CSV export button
- [x] Add sidebar link
- [x] Gate with ProGate

---

## Batch C: Market Intelligence (Nice-to-Have)

### C.1 — Market Intelligence Page
**Context:** Listed as a Pro feature on the pricing page but no page exists. The seller analytics page already has comprehensive data (revenue, inventory, offers, reviews). Market intelligence = category-level insights beyond the seller's own data.
**File:** New page at `src/app/(dashboard)/seller/market/page.tsx`
**Implementation — MVP for beta:**
- **Price benchmarks:** Average $/sqft for the seller's material types vs their pricing
- **Demand signals:** How many saved searches/requests exist for their material types
- **Supply overview:** How many active listings exist in their categories
- **Trending:** Material types with most new listings or most saved searches in last 30 days
- Data source: Aggregate queries across listings, saved searches, buyer requests tables
- New tRPC router or extend analytics router with market-level queries
- Add "Market Intel" link to seller sidebar (Pro badge)
- Wrap in ProGate
- [ ] Create market intelligence tRPC procedures
- [ ] Create market intelligence page
- [ ] Add price benchmark section
- [ ] Add demand signals section
- [ ] Add supply overview section
- [ ] Add sidebar link

---

## Batch D: Profile & Polish (Nice-to-Have)

### D.1 — Pro badge on seller profiles
**File:** `src/app/(marketplace)/sellers/[id]/page.tsx`
**Issue:** Public profiles don't indicate Pro status.
**Fix:** Query seller's proStatus in `auth.getPublicProfile` (add `proStatus` column). Display `<ProBadge />` next to seller name if Pro.
- [ ] Add proStatus to getPublicProfile query
- [ ] Display ProBadge on seller profile header

### D.2 — Pro upsell on seller dashboard
**File:** `src/app/(dashboard)/seller/page.tsx`
**Issue:** Main seller hub has no Pro awareness. Good place for subtle upsell.
**Fix:** For free users, add a compact banner below the KPI stats:
- "Unlock AI Agent, Market Intelligence, and unlimited listings with Pro — $29/mo"
- Dismiss-able (store in localStorage)
- Don't show for Pro users
- [ ] Add dismissible Pro upsell banner for free users

---

## Execution Plan

**Phase 1 (Parallel — 2 agents):**
- Agent A (Frontend): Batch A — all 6 must-have gates and warnings
- Agent B (Frontend): Batch B — CRM tags/notes components + leads page

**Phase 2 (Parallel — 2 agents):**
- Agent C (Full-stack): Batch C — Market intelligence (backend queries + frontend page)
- Agent D (Frontend): Batch D — Profile badge + dashboard upsell

**Phase 3:** Build verification

---

## Review Checklist
- [ ] All must-have gates implemented
- [ ] Sidebar navigation complete
- [ ] Promotion credits visible in purchase flow
- [ ] CRM UI functional
- [ ] Market intelligence page live
- [ ] Build passes
- [ ] No new lint errors
