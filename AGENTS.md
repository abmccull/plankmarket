# Project Agent Instructions

## Source of truth

- Treat current code, schema, migrations, tests, legal pages, and provider configuration as authoritative over dated planning documents.
- `docs/PROJECT_STATE.md` and older design documents may describe historical intent; verify every operational claim in current implementation.
- The payment model is a Stripe payment hold followed by a seller Connect transfer after the configured shipment event/delay. Marketing and user-facing copy must not call PlankMarket a regulated escrow service or imply fiduciary protection.

## High-risk workflows

For orders, payments, seller transfers, refunds, disputes, shipping, verification, or identity masking:

1. Trace the full state machine and current database fields.
2. Inspect Stripe, Priority1, Inngest, Supabase, and Redis boundaries that apply.
3. Preserve idempotency and audit history.
4. Use test/dry-run paths and current fixtures before live provider actions.
5. Verify webhook/event retries and read back resulting state.
6. Do not change money movement, transfer destination, shipping booking, or live account configuration without explicit authorization.

## Verification

- Typecheck: `npm run typecheck`
- Lint: `npm run lint`
- Tests: `npm run test`
- Shipping workflow: `npm run test:shipping`
- Build: `npm run build`

Choose targeted checks first, then run the broad gate appropriate to the change. Do not create a project skill until a repeated operational workflow needs more than these instructions and existing managed Supabase, payments, security, and ship-readiness skills.
