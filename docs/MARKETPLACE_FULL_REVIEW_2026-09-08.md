# PlankMarket full marketplace review

Reviewed 2026-09-08. **Resend verification is excluded.** This is a review, not another implementation pass.

## Verdict

The marketplace has a substantial transaction and operations foundation, but it is **not ready for unrestricted production trading**. The remaining weaknesses include confirmed user-facing defects, incomplete operator workflows and unverified provider journeys. They are not merely email configuration or cosmetic concerns.

The strongest existing work is server-side ownership enforcement, inventory reservation locking, signed upload records, shipping snapshots, payment/webhook recovery, payout eligibility checks and reconciliation cases. Keep that foundation. The weakest area is the connection between those controls and what the buyer or seller sees and can recover from.

The highest-priority findings are:

1. Current production tax configuration is incompatible with this candidate's checkout.
2. The payment return screen can claim confirmation and payment while the order is still pending.
3. Checkout retry creates another order instead of resuming an existing reservation.
4. Seller photo editing does not correctly hydrate or attach media.
5. Business verification expects a hosted document URL without giving an unverified customer a usable upload path.
6. Seller revenue includes unpaid and cancelled order values.

The earlier successful test suite does not contradict these findings: it did not execute these complete customer journeys. This review added focused component and CSV probes that reproduce previously uncovered behavior.

## Evidence and limits

- Candidate: local HEAD `7df15b46ba982625f9508df89da72efc80d8c245` plus the existing uncommitted changes. Bound source hash is recorded in `tmp/marketplace-full-review-20260908/graph.json`.
- Four read-only review branches completed and reduced successfully. Source references and per-finding acceptance criteria follow below.
- Fresh rendered review: nine public route variants at 1440×1000 and 390×844, including buyer/seller signup, login, browse, pricing, Pro and buyer/seller landing pages. All 18 combinations returned 200 with no measured horizontal overflow, page exceptions or detected Axe violations in the selected WCAG A/AA rules. Signup invalid-field states were also captured.
- Executed component probes reproduced confirmed/paid language for a pending order and ignored existing media. Executed CSV probes reproduced optional-cell rejection and specification loss.
- Fresh read-only Vercel production configuration: tax mode `disabled`; legal acknowledgement false; decision reference and shipping tax code absent; buyer-fee treatment undecided; Stripe key classified as live. This candidate explicitly refuses production checkout under those settings. No live purchase was attempted, and the exact deployed code was not certified.
- Authenticated dashboards, listing uploads, a populated listing detail, actual payment completion, freight booking and payouts were not rendered end to end. Their findings are source-backed unless explicitly labelled executed.
- No account creation, database mutation, payment, shipment, provider configuration change or product code edit was performed during this review.

## Readiness by area

| Area | Assessment | What matters most |
|---|---|---|
| Account creation | Usable public form; onboarding incomplete | Complete business verification without externally prepared upload URLs; preserve draft data on failures |
| Listing creation and editing | Not sufficiently reliable | Fix photo hydration, attachment and cover ordering; reliable account-scoped draft recovery |
| CSV and inventory ingestion | Needs correction before supplier rollout | Blank optional fields, silent spec loss and import retry duplication; preserve existing feed idempotency |
| Search and product detail | Good basic discovery; product-fit gaps | Real populated coverage; supported performance specs, packaging and origin clarity |
| Buying and checkout | Launch blocking defects | Tax readiness, retry/resume and truthful confirmation states |
| Shipping | Strong guarded integration; constrained origin model | Independent warehouse origin and executed booking/cancellation/document/recovery acceptance |
| Stripe and payouts | Strong service controls; incomplete journey certification | Keep money safeguards; connect visible status and recovery to authoritative records |
| Buyer dashboard | Useful foundation; metric and priority gaps | Correct open-request counts and make next required action dominant |
| Seller dashboard | Misleading financial metric | Separate unpaid reservations, collected sales, refunds and transfers; consistent reporting period |
| Admin operations | Desktop breadth; mobile/recovery gaps | Reach disputes, finance and reconciliation on phone; expose allowable remedies and retries |
| Public UI and UX | Coherent but overlong | Shorter acquisition screens, less repeated branding and one dominant recovery action |
| Production operations | Still partially unverified | Hosted restoration/security, role-based staging acceptance, exact deployment and recovery rehearsal |

## Account creation and business verification

The signup form has clear buyer/seller choices, labelled fields and inline validation. Account identity and verification are usefully separated; the server does not simply trust a client-supplied admin role. Admin assurance checks require MFA/recent authentication.

However, business verification asks the user to supply a hosted evidence URL. The validator requires an approved host, while the existing uploaders generally require an already verified account. That leaves the ordinary new customer without a self-contained way to provide the document needed to become verified. This is distinct from email verification.

Provide a private pre-verification upload flow with ownership, content checks, expiry and resumable status. A new buyer and seller should complete the process from a phone using a local file, without support generating a URL. Also fail visibly if an existing verification draft cannot load; do not offer an apparently new blank form that risks overwriting saved details.

Account roles are currently buyer-or-seller. That can support a deliberately narrow pilot, but businesses that both buy and sell need a defined supported path. Organization memberships, staff permissions and multiple warehouses are expansion decisions rather than reasons to rewrite authentication immediately.

## Listing creation, media and import

Photo editing is the clearest seller-workflow defect. The shared uploader accepts initial media IDs in its interface but does not use them. The edit page does not pass its listing ID to uploads, and Save removes media IDs from the update payload. Existing photos therefore do not hydrate, and new unattached media is not associated through Save. Cover ordering also remains client-side rather than persisting the chosen order.

These need one coherent media contract: existing records load, new records attach to the authorized listing, removals and ordering persist, and reload matches what the seller saved. Validate this through both a fresh listing and an edit of a populated listing.

CSV has three distinct weaknesses: blank optional finish/grade cells reject otherwise valid rows; brand/model/wear-layer values are silently discarded; and a retry after a lost response can create a second batch of drafts. Fix the import contract and add a seller-bound request identity. Transactional insertion alone does not solve retries.

Draft recovery is also weaker than its UX implies: changes save at step transitions, and one browser-wide draft key is shared across accounts. Persist current edits, scope drafts to the seller, restore visible media and make discard/resume explicit. Server ownership checks remain valuable, but they do not prevent a shared browser exposing a previous seller's draft text.

## Product data, discovery and buying

Recent fixes improve distance sorting, dimensional filtering and token/model matching. Those should not be reported again as missing. The remaining product-data weakness is deciding whether a lot actually fits a project.

Waterproof/installation/warranty claims need structured provenance, not inference. Cartons, usable area, minimum purchase, lot/batch identity and origin need a consistent buyer-facing contract. For a limited single-origin pilot, document the supported lot types and require those fields during assisted onboarding. Add independent warehouse/product entities only with migration and reservation compatibility.

A populated detail page still needs acceptance with representative lots: missing specs, partial-lot pricing, carton multiples, offers, stale inventory, unavailable freight, verification blocks and a sold-out lot. Empty browse screenshots cannot establish this experience.

The confirmation screen is currently unsafe as a source of truth. It displays “Order Confirmed” and “Total Paid” without checking payment success. Its URL-cleanup logic removes parameters that the same page requires, so refresh sends the customer back toward checkout. Use the durable order ID, authoritative payment/order state, bounded polling and explicit pending/error/reconciliation states. Refresh must preserve a stable receipt or a truthful pending page.

When PaymentIntent preparation fails after order creation, Continue creates another order instead of resuming the stored order ID. Depending on inventory and quote state, the buyer can encounter exhausted inventory, an unusable quote or duplicate pending reservations. Make order creation idempotent and payment preparation resumable against the same reservation, with explicit handling for changed or expired inputs.

## Shipping, Stripe, payouts and disputes

This is not a missing-integration situation. The source includes meaningful shipping quote binding, immutable commercial snapshots, shipment evidence, cancellation handling, webhook idempotency and payout controls. The newly fixed transfer-history uncertainty and expiry fairness controls remain present.

The remaining shipping-model constraint is that freight origin is tied to the seller's legal address, with differing listing ZIPs rejected. A distributor with a separate warehouse can reach a dead end. Support an explicitly owned and validated warehouse address with pickup contact/capabilities, or clearly restrict the pilot to matching legal and shipping origins. Do not simply remove the ZIP guard.

The production tax gate is separate and concrete. Current settings disable tax, while production checkout requires a supported approved policy. The deployment checker can accept disabled mode, which makes it an incomplete readiness gate. Fix the checker and complete the business-approved policy/configuration; do not switch liability modes merely to make checkout pass. Connected-account tax calculation is explicitly not a completed transaction/reversal path in this candidate.

Payouts and refunds need provider-backed acceptance rather than another static review: delayed and replayed payment webhooks; failed preparation and recovery; booking failure; verified pickup; payout retry after provider success/local failure; full refund; supported partial refund; dispute hold; and reconciliation resolution. No duplicate transfer or reservation loss is acceptable.

Admin remedy controls currently offer a partial refund that the service intentionally rejects before payout. Keep the financial rule, but make eligible actions service-derived so operators are not offered a doomed action.

## Dashboards and operator experience

Seller “Total Revenue” sums payout values across all order statuses, including pending and cancelled orders. Its trend comes from a separate period calculation. That mixes reserved business, collected money and transfer expectations. Define each metric explicitly and use a consistent period. Show pending sales, collected net sales, refunds, held seller proceeds and released transfers separately where relevant.

The buyer dashboard computes open requests from the newest 50 requests rather than an authoritative aggregate, so older open requests disappear from the count. Correct the aggregate and make overdue/required actions more useful than generic activity totals.

The mobile admin menu lacks several desktop destinations, including financial and dispute/reconciliation work, while the desktop sidebar is hidden at smaller widths. That is a real operational limitation for an owner responding from a phone. Preserve navigation parity through a searchable or grouped mobile menu. Add contextual retries and partial-load behavior when admin queries fail.

## Public design and UX

The public surface is visually consistent: cream/brown/green palette, readable type hierarchy, coherent buttons and responsive layouts. No severe public accessibility failure was detected. It does not need a wholesale visual rewrite.

The acquisition flow is too verbose. On first mobile signup, consent, navigation, another logo, explanation, progress cards and role selection consume most of the initial view before the first field. The mobile homepage is about 10,065 CSS pixels long; pricing about 8,060. Length alone is not a defect, but the inspected pricing opening uses a large amount of space before concrete economics. Shorten repeated explanation and put the user's next decision earlier.

Empty browse offers three similarly prominent recovery cards while keeping sorting/page-size controls for zero results. Use one primary buyer action, one secondary alert path and a quieter seller-supply action. This will improve comprehension more than adding decorative components.

Add explicit autocomplete semantics and appropriate phone keyboards to signup fields, and a password visibility control. Existing labels/error associations are good. The authenticated product remains visually unscored until real loading, error, blocked, recovery and successful states are captured.

## Recommended sequence and acceptance

1. **Before any paid pilot:** tax readiness; truthful and refresh-safe confirmation; idempotent checkout retry; listing-media correctness; usable verification upload; correct seller financial metrics.
2. **Before onboarding suppliers at volume:** CSV schema/retry fixes, seller-scoped continuous drafts, persisted photo ordering, explicit origin/packaging requirements.
3. **Before operational handoff:** mobile admin parity, allowable refund actions, accurate dashboard counts, retries and reconciliation rehearsal.
4. **Before public launch:** execute the full populated buyer/seller/admin journey matrix against test providers; verify hosted schema/security and the exact release candidate; then address the remaining public spacing and hierarchy refinements.

One passing scenario is insufficient. The acceptance set must include interruption, refresh, retries, concurrent stock changes, rejected verification, unavailable shipping, delayed webhooks and provider/local disagreement. Email verification remains outside this review.

## Source-backed finding register

The following register preserves detailed claims, their source anchors and concrete acceptance criteria. “Confirmed code gap” is not a claim that a production customer has already encountered an incident. “Executed” denotes a local probe, not a live provider transaction.

### Accounts and dashboards


**revenue-overstatement — high**

P1 confirmed source defect: Total Revenue includes pending/cancelled/refunded order sellerPayout values because every status is summed; it also pairs a lifetime value with a 30-day trend. Impact: seller financial expectations can be overstated. Acceptance: explicit earned/refunded/awaiting-payment totals using financial state, matching date window; fixture with unpaid and refunded orders cannot increase earned revenue.

Evidence: [order.ts:1943](<C:/Users/hands/OneDrive/Documents/Plankmarket/src/server/routers/order.ts:1943>).


**verification-no-evidence-acquisition — high**

P1 confirmed workflow gap: buyer and seller business verification require a preexisting approved-host document URL but provide no document acquisition/upload path; existing image upload requires verified status. Impact: first-time businesses cannot self-serve verification using a document on their device. Acceptance: scoped pre-verification private evidence upload with type/size/ownership validation, resume and removal, then successful business submission from desktop and phone.

Evidence: [page.tsx:371](<C:/Users/hands/OneDrive/Documents/Plankmarket/src/app/(dashboard)/seller/verification/page.tsx:371>).


**verification-query-failure — medium**

P2 confirmed recovery gap: a failed draft read becomes an empty form with Save available rather than a recoverable error. A subsequent save can replace previously saved fields with blanks; draft refetch also resets edits. Acceptance: failed fetch blocks destructive replacement, offers retry, and background refetch preserves dirty fields with explicit conflict handling.

Evidence: [page.tsx:55](<C:/Users/hands/OneDrive/Documents/Plankmarket/src/app/(dashboard)/seller/verification/page.tsx:55>).


**buyer-open-count — medium**

P2 confirmed source defect: open request count only covers newest 50 requests of all statuses. Impact: older unresolved demand can disappear behind closed history and show No open requests. Acceptance: server status aggregate/filter before pagination; test 50 newer closed requests and one older open request still reports one open.

Evidence: [page.tsx:112](<C:/Users/hands/OneDrive/Documents/Plankmarket/src/app/(dashboard)/buyer/page.tsx:112>).


**admin-mobile-parity — medium**

P2 confirmed navigation discrepancy, rendered authenticated behavior unverified: mobile admin menu omits Finance, Disputes, Reconciliation, Users and Inventory while desktop sidebar is hidden. Impact: important exception workflows require direct URLs on mobile. Acceptance: shared role-aware navigation includes all core operations, with accessible compact menu verified at390px.

Evidence: [mobile-nav.tsx:164](<C:/Users/hands/OneDrive/Documents/Plankmarket/src/components/layout/mobile-nav.tsx:164>).


**admin-error-retry — medium**

P2 confirmed recovery gap: failed admin stats/health queries expose no section retry and wait on both before showing usable data. Impact: temporary failures impede operational visibility. Acceptance: independent loading/error boundaries with retry and successfully loaded section still usable.

Evidence: [page.tsx:9](<C:/Users/hands/OneDrive/Documents/Plankmarket/src/app/(admin)/admin/page.tsx:9>).


### Listings and discovery


**photo-management-broken — high**

Confirmed source defect, high priority: existing listing photos are invisible because PhotoUpload ignores initialMediaIds. Edit uploads omit listingId and Save strips mediaIds, so new uploads are not attached to the edited listing. Resumed new/bulk wizard also cannot show prior images. Acceptance: open existing listing, see all photos, add/remove/reorder, save and reload; the authoritative media list and cover must match.

Evidence: [photo-upload.tsx:27](<C:/Users/hands/OneDrive/Documents/Plankmarket/src/components/listings/photo-upload.tsx:27>), [page.tsx:217](<C:/Users/hands/OneDrive/Documents/Plankmarket/src/app/(dashboard)/seller/listings/[id]/edit/page.tsx:217>), [listing.ts:260](<C:/Users/hands/OneDrive/Documents/Plankmarket/src/server/routers/listing.ts:260>).


**cover-order-not-persisted — medium**

Confirmed source defect: move-up/down only reorders local IDs; create/update attach with set({listingId}) and do not write sortOrder although reads sort by that field. Acceptance: choose a new cover and ordering, create/save, reload listing and confirm stable identical image order.

Evidence: [photo-upload.tsx:27](<C:/Users/hands/OneDrive/Documents/Plankmarket/src/components/listings/photo-upload.tsx:27>), [listing.ts:260](<C:/Users/hands/OneDrive/Documents/Plankmarket/src/server/routers/listing.ts:260>).


**csv-blanks-rejected — medium**

Executed defect: leaving optional finish/grade cells empty in the provided CSV shape rejects the row, because empty strings are not undefined. This forces sellers to invent irrelevant values or remove entire optional columns. Acceptance: optional blank cells import as absent while invalid populated values produce accurate row/column errors.

Evidence: [listing.ts:591](<C:/Users/hands/OneDrive/Documents/Plankmarket/src/lib/validators/listing.ts:591>), [csv-probe.log:1](<C:/Users/hands/OneDrive/Documents/Plankmarket/tmp/marketplace-full-review-20260908/csv-probe.log:1>).


**csv-spec-loss — medium**

Executed defect: CSV rows containing brand, modelNumber and wearLayer validate successfully but these fields are silently stripped. Manual listings support them, so bulk inventory loses buyer search and specification data. Acceptance: supported product attributes round-trip through CSV preview, persisted listing and detail/search; warn on unrecognized headers rather than silently dropping them.

Evidence: [listing.ts:591](<C:/Users/hands/OneDrive/Documents/Plankmarket/src/lib/validators/listing.ts:591>), [csv-probe.log:1](<C:/Users/hands/OneDrive/Documents/Plankmarket/tmp/marketplace-full-review-20260908/csv-probe.log:1>), [listing.ts:1127](<C:/Users/hands/OneDrive/Documents/Plankmarket/src/server/routers/listing.ts:1127>).


**csv-retry-duplicates — medium**

Confirmed code gap: bulkCreate accepts only rows, creates a fresh batch UUID each attempt, and inserts all rows. A retry after the first response is lost creates another draft set; transaction atomicity does not provide request idempotency. Acceptance: replay the same seller import request after lost response and return the original listings; allow an explicitly new import separately.

Evidence: [listing.ts:330](<C:/Users/hands/OneDrive/Documents/Plankmarket/src/server/routers/listing.ts:330>).


**draft-recovery-and-isolation — medium**

Confirmed code gap: listing draft is saved under one browser-wide key with no seller binding and field edits persist only at step changes. Reload mid-step loses the latest edits; another account on the same browser can inherit prior draft contents/media IDs. Server upload ownership still prevents claiming another sellers files. Acceptance: autosave dirty fields reliably, bind draft to seller, clear or isolate on account change, restore visible media and preserve edits after refresh.

Evidence: [listing-form-store.ts:72](<C:/Users/hands/OneDrive/Documents/Plankmarket/src/lib/stores/listing-form-store.ts:72>), [page.tsx:443](<C:/Users/hands/OneDrive/Documents/Plankmarket/src/app/(dashboard)/seller/listings/new/page.tsx:443>), [photo-upload.tsx:27](<C:/Users/hands/OneDrive/Documents/Plankmarket/src/components/listings/photo-upload.tsx:27>).


### Transactions and shipping


**false-payment-success — high**

Checkout success shows Order Confirmed and Total Paid after loading ends even if order is pending/processing/failed or query errors. No status polling or error branch. Acceptance: authoritative succeeded state alone displays paid success; pending polls with bounded recovery; failure/error exposes safe retry and order link; delayed webhook cannot falsely confirm.

Evidence: [page.tsx:20](<C:/Users/hands/OneDrive/Documents/Plankmarket/src/app/(marketplace)/listings/[id]/checkout/success/page.tsx:20>).


**success-refresh-recovery — medium**

Success page removes Stripe parameters from URL, yet requires them for render and redirects to checkout when absent; refreshing sanitized receipt returns a paid buyer to checkout. Next navigation update may trigger earlier; that timing needs browser proof. Acceptance: stable authorized orderId receipt survives refresh without client secret and handles ownership/query errors.

Evidence: [page.tsx:20](<C:/Users/hands/OneDrive/Documents/Plankmarket/src/app/(marketplace)/listings/[id]/checkout/success/page.tsx:20>).


**payment-intent-retry — high**

If order creation commits but PaymentIntent creation fails, retry repeats order.create instead of resuming saved orderId. Full-lot inventory is already reserved and quote artifact consumed, so buyer cannot simply retry payment; other inventory may permit additional pending reservations only with refreshed artifacts. Acceptance: resume same pending order/payment attempt after network/provider failure and browser refresh; one reservation and one order per checkout attempt.

Evidence: [page.tsx:257](<C:/Users/hands/OneDrive/Documents/Plankmarket/src/app/(marketplace)/listings/[id]/checkout/page.tsx:257>), [order.ts:730](<C:/Users/hands/OneDrive/Documents/Plankmarket/src/server/routers/order.ts:730>).


**tax-preflight-false-positive — high**

Production environment preflight accepts default disabled tax policy although runtime blocks all production checkout. Acceptance: production preflight rejects disabled mode and unsupported connected-account mode; selected supported mode has approved policy, registered jurisdiction and verified item/freight tax codes before launch. This is a readiness gate, not evidence of current deployed misconfiguration.

Evidence: [check-production-env.mjs:113](<C:/Users/hands/OneDrive/Documents/Plankmarket/scripts/check-production-env.mjs:113>), [stripe-tax.ts:189](<C:/Users/hands/OneDrive/Documents/Plankmarket/src/server/services/stripe-tax.ts:189>), [stripe-tax.test.ts:204](<C:/Users/hands/OneDrive/Documents/Plankmarket/src/server/services/__tests__/stripe-tax.test.ts:204>).


**warehouse-origin-limitation — medium**

A seller with legal ZIP different from actual warehouse cannot obtain checkout freight quotes. Acceptance: explicit verified pickup location with street/contact/ZIP associated with listing, quoted and booked from same immutable origin; legal address remains distinct. Current rejection is safe but constrains multiwarehouse suppliers.

Evidence: [shipping.ts:150](<C:/Users/hands/OneDrive/Documents/Plankmarket/src/server/routers/shipping.ts:150>).


**partial-remedy-ui — medium**

Admin claim UI offers final partial refund before payout even though refund service explicitly refuses that operation; unsupported remedy surfaces as operational failure/reconciliation instead of a clear eligibility choice. Acceptance: show service-derived allowable refund actions before confirmation and explain full refund or reviewed post-payout remedy without weakening money checks.

Evidence: [page.tsx:459](<C:/Users/hands/OneDrive/Documents/Plankmarket/src/app/(admin)/admin/disputes/page.tsx:459>), [refund.ts:947](<C:/Users/hands/OneDrive/Documents/Plankmarket/src/server/services/refund.ts:947>).


**journey-coverage — high**

Current authenticated browser tests are dashboard smoke tests, not purchase-to-settlement acceptance. Acceptance: dedicated isolated buyer/seller/admin data executes direct and accepted-offer checkout, delayed/replayed webhook, failed payment resume, freight booking failure/retry, pickup/delivery, payout, full refund, supported partial refund and dispute decisions with authoritative read-back.

Evidence: [authenticated-marketplace.spec.ts:1](<C:/Users/hands/OneDrive/Documents/Plankmarket/e2e/authenticated-marketplace.spec.ts:1>), [shipping-workflow.test.ts:241](<C:/Users/hands/OneDrive/Documents/Plankmarket/src/server/services/__tests__/shipping-workflow.test.ts:241>), [stripe-tax.test.ts:204](<C:/Users/hands/OneDrive/Documents/Plankmarket/src/server/services/__tests__/stripe-tax.test.ts:204>).


Reviewer qualification: refund processing updates sellerPayout, so the revenue finding does not assert that every refunded order retains its original value. The confirmed problems are unpaid/cancelled inclusion and inconsistent reporting periods. Component probes use mocked server responses; they reproduce UI state handling, not completed provider journeys.
