# Verified local recovery baseline

This is a schema-only export of the configured PlankMarket database, observed
2026-09-08. No customer rows, auth users, passwords or migration-ledger mutations
are included. `provenance.json` records hashes, extension prerequisites and the
observed ledger (empty). Historical SQL and the original journal are preserved.

The complete exported schema already contains the current forward migrations.
**Do not replay historical forward migrations on this baseline.** It is not a
replacement for the hosted Supabase migration ledger.

## Local restoration

Create an empty database on an isolated loopback PostgreSQL 17 server, named
`plankmarket_bootstrap_<purpose>`. Put its connection in an ignored environment
file, then run:

```text
npm run db:bootstrap:local -- --file <local-env-file> --disposable-cluster
npm run db:check:target -- --file <local-env-file>
```

The bootstrap checks the baseline hash, refuses remote addresses or existing
objects, creates cluster-wide inert compatibility roles only after the disposable-cluster acknowledgement, and restores in one transaction.
Required PostgreSQL extensions are pg_trgm, pgcrypto and uuid-ossp. It never
creates hosted Auth credentials or starts an Auth server.

Executed evidence: native PostgreSQL 17.4 restoration passed, application schema
0034 readiness passed, and a second attempt refused the nonempty database.
The SQL includes functions, triggers, constraints, indexes, policies and grants,
which schema generation alone would not recover.

## Remaining adoption gate

Hosted Supabase restoration, service-role ownership and security-advisor checks
remain required before adopting a new production migration baseline. The local
compatibility roles do not certify hosted service permissions. No production
database or ledger was changed. Keep `baselineRequired` in the historical
manifest until that hosted adoption is reviewed and verified.
