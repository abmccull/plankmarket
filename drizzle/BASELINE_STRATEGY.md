# Migration baseline strategy

The checked-in Drizzle journal references seven historical migrations whose SQL
files are not present. They must not be reverse-engineered from snapshots or
marked as applied on a new database: either action could silently produce a
schema that differs from production.

`migration-baseline.json` records this known debt and the older manual SQL files
that were never journaled. `npm run db:check` fails when the journal or SQL file
set drifts beyond that reviewed manifest. New SQL migrations are no longer
ignored by Git.

## Safe recovery

1. Put schema changes on hold and take a restorable production backup.
2. Read the live Drizzle migration table and export a schema-only dump from the
   live Supabase database. Do not include table data or secrets.
3. Compare the live schema against `src/server/db/schema/index.ts`, every
   retained manual migration, and the latest reviewed Drizzle snapshot.
4. Create one authoritative baseline from the verified live schema in a clean
   migration directory. Preserve the current directory as historical evidence.
5. Restore that baseline into a new scratch Supabase project, then apply every
   forward migration in order (`0014`, `0015`, `0016`, and later files).
6. Run schema diff, constraints/index checks, the Supabase security advisors,
   and the application test/build gates against the scratch project.
7. Only after the scratch result matches the live schema should operators adopt
   the new baseline and update the live migration ledger in a reviewed change.

Until this procedure is completed, do not use `npm run db:migrate` to bootstrap
a fresh database. Applying the forward SQL to an existing database still
requires normal backup, review, staging, and read-back verification. None of
the forward migrations beginning with
`0014_auth_data_hardening.sql` have been applied to any live project by this
review.
