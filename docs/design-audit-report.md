# PlankMarket Design Audit — 2026-09-08

## Executive assessment

The public experience has a consistent visual identity and usable small-screen layouts. Its main weakness is the distance between the marketing promise and usable inventory: the inspected candidate has no listings. The screen can capture demand, but it cannot demonstrate product comparison, delivered economics or a completed trade. No rating below should be read as an authenticated-product or launch-readiness score.

**Public-surface score: 7.0/10. Base design score: 7.1/10. System Cohesion: 7.0/10.** These are reviewer judgments on the observed routes; the complete marketplace remains unscored because critical inventory, checkout, seller and admin states were unavailable.

## Evidence captured

Local application at `http://localhost:3100`, base `7df15b4` and subsequent scoped changes. Before: `/`, `/listings`, `/login`, `/register`, `/seller-guide`, each at 1440×1000 and 390×844. Full-page screenshots, text, overflow and Axe results: `tmp/product-review-2026-09-08/capture-before/`. Five routes × two viewports returned 200, with no detected horizontal overflow, page exceptions or Axe violations in the checked rule set. Console warnings are separate from page exceptions and remained visible in development logs.

After: browse ZIP entry, nationwide-nearest selection, 100-mile filter, desktop panel/mobile drawer and invalid-ZIP feedback at both sizes: `capture-after/`. Both filter states had no detected Axe violations or horizontal overflow. Signed-out protected-route checks exposed a broken redirect before middleware relocation. Permanent E2E checks now require the actual login destination; the final 12-case desktop/mobile run passed.

Unavailable: populated cards/detail, checkout, saved-item mutation, seller upload/create/edit/order success, admin data/moderation success; authenticated loading/error/recovery states beyond source and component tests. No complete mobile workflow claim is made.

## Scorecard and detailed findings

| Dimension | /10 | Evidence and consequence |
|---|---:|---|
| Visual hierarchy | 7 | Clear browse headline and primary search; long first-visit consent/navigation stack pushes job tasks lower on mobile |
| Layout and spacing | 6 | Responsive without clipping; large empty-state gaps and three stacked calls to action make the phone page unnecessarily long |
| Typography | 8 | Consistent display headings and readable body text; small secondary labels should stay secondary rather than carrying essential transaction meaning |
| Color and contrast | 8 | Cream/brown/green palette is coherent; tested public states produced no contrast violations; unknown authenticated themes are not scored |
| Components and states | 7 | Shared controls and explicit empty/error structures; disabled sorting and ZIP warning now correspond to available behavior |
| Interaction and feedback | 6 | Filter drawer and URL state work; pre-fix sign-in redirect was a false progress promise; final middleware behavior is a required regression gate |
| Information architecture/navigation | 7 | Buyer/seller paths are legible; geography was buried and now has direct entry; many advanced tools still compete with the core trade journey |
| Conversion/task flow | 6 | Zero-result alerts and buyer requests provide recovery; absent stock prevents the main funnel and long signup exposition adds friction |
| Accessibility/inclusive UX | 8 | Named controls, headings and automated checks pass on observed states; keyboard focus and authenticated screen coverage still need expansion |
| Imagery/iconography | 6 | Consistent useful icons; no real product imagery in browse and subdued marketing photography cannot establish inventory trust |
| Brand visual system | 8 | Repeated palette, logo, serif display and commercial tone create recognizable identity across observed routes |
| Emotional trust/polish | 8 | Fees and verification limits are visible; overly technical phrases and unfulfilled progress messages reduce confidence |
| **System Cohesion** | **7** | Visual grammar is stronger than demonstrated journey continuity; buyer/seller/admin commerce states remain unverified |

Base is the rounded mean of twelve dimensions (85/12 = 7.08). No severe numerical cap was triggered by observed accessibility, hierarchy, consistency or mobile results. Coverage is restricted instead of converting missing screens into invented scores. Overall remains 7.0 because journey continuity is weaker than the shared visual language.

## Cohesion diagnosis and redesign thesis

Keep the recognizable design language, but organize the product around **find a usable lot → understand its delivered cost → complete the trade**. Let material, quantity, price, origin and evidence lead. Use rich actual product photography once supply is present; do not simulate marketplace liquidity with fabricated cards.

The new location entry strengthens intent coherence: a contractor can place nearby lots first without opening a long specification panel. Recommendations now acknowledge unsupported waterproof evidence rather than contradicting the buyer's requirement. Broad visual redesign is lower value than fixing real availability, onboarding and trade recovery.

## Prioritized improvements and acceptance criteria

1. **P0: real sign-in navigation.** Signed-out buyer/seller/admin URLs must reach login with their intended return path. No indefinite “redirecting” shell. Server API permissions remain enforced independently.
2. **P1: product-first browse.** On a populated 390px viewport, each card exposes photo, material, usable quantity, price/unit and origin without hidden horizontal content. Inspect realistic long titles and missing photos.
3. **P1: location discovery.** Enter ZIP → nearest sorting works with no radius; select a radius → constraint is visible; clear → removes location-dependent sort; invalid ZIP → useful feedback. Implemented and exercised locally.
4. **P1: mobile empty-state compression.** One primary buyer action, one secondary alert action, seller supply link below; first useful action should not require scrolling past blank space and redundant sorting controls.
5. **P1: simpler signup.** Retain essential role, business and login requirements; shorten repeated explanatory blocks and avoid duplicate logos. Test autofill, validation, password feedback and keyboard navigation on phone.
6. **P1: honest product fit.** Unknown waterproof/installation/warranty information stays visibly unknown. A saved requirement must never be silently broadened. Waterproof recommendation limitation is implemented; evidence collection remains.
7. **P2: workflow state matrix.** Capture loading/empty/error/retry/success for actual seller upload, listing edit, checkout and admin reconciliation at desktop/tablet/mobile widths; do not score from route names.

## Screen coverage ledger

| Screen/state | Desktop | Mobile | Outcome |
|---|---|---|---|
| Homepage, initial visit | Captured | Captured | Strong seller intent; lengthy content and limited inventory evidence |
| Browse, empty | Captured | Captured | Recovery actions work visually; spacing too generous |
| Browse, nearest/radius | Captured after change | Captured after change | ZIP and distance state visible, no measured overflow/Axe violations |
| Browse, invalid ZIP | Executed | Executed | Explicit warning; no invented distance |
| Filters panel/drawer | Captured after change | Captured after change | Usable scroll region and actions |
| Login/register | Captured | Captured | Legible, but signup is long |
| Seller guide | Captured | Captured | Shared design language, not seller workflow evidence |
| Protected routes signed out | Executed | Executed | Broken redirect discovered; fixed; final 12-case public/redirect E2E passed |
| Populated detail/checkout | Missing | Missing | No listings/test orders in local target |
| Seller/admin authenticated | Missing | Missing | No dedicated test sessions configured |


## Implementation follow-up: authenticated local candidate

The original public-only audit above is historical. The implemented candidate was captured on 15 routes at 1440px and 390px: home, both registration roles, pricing, populated and empty browse, buyer dashboard/orders, seller dashboard/warehouses/new listing, admin dashboard/listings/finance, and unverified buyer verification. Evidence: `tmp/plan-implementation-20260908/captures-final/`, with final progress-bar captures in `captures-progress-verified/`. Authenticated screens use synthetic local sessions and a real disposable local database; they are not live-provider acceptance evidence.

The first pass found page overflow in buyer/admin layouts, missing progress/select/menu names, low onboarding contrast and overlapping seller navigation selection. These were repaired at the shared shell/control or owning form. The second pass returned 200 for all 30 route/viewport combinations, zero page exceptions, zero page overflow and zero Axe violations in the selected WCAG rules. Admin tables scroll inside their container with a visible hint. Visual inspection confirmed repaired mobile buyer/admin layouts and a single active seller navigation item. Progress now exposes its numeric value and a distinct remaining track.

Updated bounded scorecard (reviewer judgment, not a launch score):

| Dimension | /10 | Current evidence |
|---|---:|---|
| Visual hierarchy | 8 | Distinct page titles, primary tasks and form steps |
| Layout and spacing | 7 | Shared mobile overflow resolved; dashboard and consent stacks remain long |
| Typography | 8 | Consistent readable headings and field labels |
| Color and contrast | 8 | Repaired onboarding contrast; selected automated rules pass |
| Components and states | 8 | Shared recovery, progress and form conventions; provider states covered primarily by component tests |
| Interaction and feedback | 8 | Draft reload, password toggle, select dismissal and mobile navigation executed |
| Information architecture/navigation | 7 | Warehouse/admin parity and active-item fixes; broad seller tool inventory remains dense |
| Conversion/task flow | 7 | Shorter signup, clear fee example and buyer-oriented empty recovery; no completed provider purchase in browser |
| Accessibility/inclusive UX | 8 | Named controls and numeric progress; 30 captures pass selected Axe rules; not a complete manual certification |
| Imagery/iconography | 6 | Consistent icons; synthetic fixtures cannot establish real product-photo quality |
| Brand visual system | 8 | Shared cream, brown and green identity across role surfaces |
| Emotional trust/polish | 7 | Authoritative status and clearer fees; real settlement and carrier evidence still required |
| **System Cohesion** | **8** | Shared layout, navigation, specifications and transaction recovery now agree across roles |

The twelve-dimension mean is 7.5/10. No severe observed mobile or accessibility defect remains in captured states. Provider-dependent journeys remain a coverage limitation, so this score is not production approval. The next release check is a realistic trade with provider test accounts and real inventory photography, followed by exact-deployment read-back.
