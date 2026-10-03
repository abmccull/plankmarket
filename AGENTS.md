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

Choose targeted checks first, then run the broad gate appropriate to the change. The repeated-workflow threshold is now met by the existing `.grok/workflows` recipes; route repeated graph audits through `.codex/skills/plankmarket-ops/SKILL.md` while keeping one-off checks under the instructions above.

## Testing policy

- Never write unit tests after you write code.
- Highly prefer E2E tests as the sole testing mechanism. Use them to verify complex features work. At the end of E2E tests, produce a verifiable and repeatable artifact.
- If you must test a system in isolation, first write down all the ways it could fail, then write the code.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
