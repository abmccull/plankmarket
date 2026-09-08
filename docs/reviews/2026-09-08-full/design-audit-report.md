# Public design audit — full marketplace review

This is the public-surface visual score, **not a production-readiness score**. The complete authenticated marketplace remains unscored.

Overall public design: **7.0/10**. Base dimension average: **7.1/10**. System Cohesion: **7.0/10**. No severe-failure cap was triggered in the observed public states. Missing authenticated evidence prevents a whole-product score.

## Evidence

Nine route variants at desktop 1440×1000/mobile 390×844: `/`, `/listings`, `/register`, `/register?role=seller`, `/login`, `/pricing`, `/pro`, `/for-buyers`, `/for-sellers`. All 18 returned 200; no measured overflow, page exceptions or detected Axe violations. Invalid signup states captured. Evidence: `tmp/marketplace-full-review-20260908/captures/`. Initial attempt found the dev server stopped; after starting it all 18 captures succeeded. Development-only indicators are excluded from styling judgments.

## Scorecard and dimension findings

| Dimension | /10 | Finding |
|---|---:|---|
| Visual hierarchy | 7 | Clear headings; first-visit chrome and repeated signup blocks delay the form. |
| Layout and spacing | 6 | No overflow; mobile homepage/pricing and zero-results recovery are unnecessarily expansive. |
| Typography | 8 | Consistent display headings and readable body hierarchy. |
| Color and contrast | 8 | Coherent palette and no detected public contrast failures. |
| Components and states | 7 | Consistent public forms/buttons; authenticated state completeness unscored. |
| Interaction and feedback | 7 | Inline invalid signup feedback works; full business journeys unavailable. |
| Information architecture and navigation | 7 | Clear public paths; source-backed mobile admin parity issue is separately reported. |
| Conversion and task flow | 6 | Long signup preamble and competing empty-result actions delay useful decisions. |
| Accessibility and inclusive UX | 8 | No detected violations across 18 checked combinations; manual keyboard/assistive coverage remains incomplete. |
| Imagery and iconography | 6 | Icons are consistent; product/warehouse evidence unavailable in empty marketplace. |
| Brand visual system | 8 | Recognizable cream/brown/green identity across routes. |
| Emotional trust and polish | 7 | Public pages look credible; transaction truth defects are separately launch blocking. |

## Cohesion diagnosis and redesign thesis

The public brand grammar is coherent. The weaker connection is between promotion, activation and transaction recovery: too much explanation before signup, too many equal recovery actions in empty browse, and source-backed transaction states that do not consistently explain what has happened. Preserve the visual identity and simplify the journey around a buyer's next decision or an operator's next required action.

## Priorities and acceptance

1. Compact first-visit signup: reduce repeated logos/progress explanation; bring first input and primary action earlier; preserve labels, inline errors and consent choice.
2. Empty browse: one primary demand-capture action, secondary alert, quieter seller link; hide irrelevant result-management controls when empty.
3. Pricing: show actual buyer/seller economics earlier, then progressively disclose details; remove repeated sections while preserving fee transparency.
4. Capture populated listing, upload, checkout, shipping, payout and reconciliation states before scoring the authenticated product.
5. Across all critical flows, require loading, empty, blocked, warning, error, recovery and success coverage on desktop/mobile; never represent pending payment as completed.

The homepage measured 10,065 CSS pixels high on mobile, pricing 8,060, and signup 2,131 including shared chrome/footer. These measurements support the spacing review but are not a universal page-length limit. Re-capture after changes and verify task completion, not merely shorter screenshots.
