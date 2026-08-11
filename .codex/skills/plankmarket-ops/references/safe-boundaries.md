# Safe boundaries

## Read-only default

Permit source and Git inspection, local tests, local rendering, screenshots, and authenticated provider metadata reads that cannot mutate state. Record exact target identifiers and observation times. Redact credentials, tokens, customer data, and connection strings from artifacts and fingerprints.

Do not infer approval from repository access, an existing session, a prior deployment, or a request to audit, review, test, or prepare.

## Require explicit human approval

Obtain approval in the current task, name the exact target, and define rollback or recovery before any of these actions:

- Start, fund, or alter paid acquisition; publish a traction, revenue, liquidity, or launch-readiness claim.
- Execute remote SQL, apply or repair a migration, seed or alter remote data, or change tenancy/RLS policies.
- Change provider configuration, credentials, webhooks, domains, schedules, queues, storage, or access controls.
- Deploy, promote, roll back, alias, or change a production/preview environment.
- Create, capture, transfer, refund, dispute, or otherwise alter a payment or payout.
- Quote, book, dispatch, cancel, or modify a shipment, BOL, tracking record, freight charge, or claim.
- Change checkout semantics, fee calculation, payment timing, seller-transfer eligibility, cancellation/refund rules, or order-state transitions.

## Mutation graph requirements

End the read-only run before mutation. Create a separate manifest with `authority: mutation`, `human_gate.required: true`, approval identity/time, exact writes and locks, bounded retries, idempotency keys where applicable, one integrator, and halt-on-failure policies for money, data, and provider nodes. Re-run tests and read back authoritative remote state. Report local success separately from provider acceptance.
