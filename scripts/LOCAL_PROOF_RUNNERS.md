# Retained local proof runners

`verify-media.cjs` and `verify-inventory.cjs` preserve earlier fixture-specific investigations. They are not standalone release checks, CI gates, or evidence that the current production marketplace works. Their historical `tmp` contracts and private fixture files are not distributed with this repository.

For prerequisites without connecting to a database or opening a browser:

```sh
node scripts/verify-media.cjs --help
node scripts/verify-inventory.cjs --help
```

Execution requires the original, explicitly admitted disposable local setup:

- PostgreSQL at `postgresql://postgres@127.0.0.1:55439/plankmarket_bootstrap_design_20260929`, with the canonical schema, required forward migrations, and known synthetic fixtures. A loopback address alone does not establish that a database is disposable.
- Private local fixture receipts under `tmp/design-review-20260929`: `database-proof.json`, `phase-b-fixtures.json`, and `browser-sessions.json`. The first two must identify the exact target; source actor/listing/order IDs must actually belong to the prepared synthetic fixture. Sessions must match those synthetic actors. Never substitute production records or publish session files.
- Installed repository dependencies, numeric pool configuration, isolated provider doubles on port 3102, and the separately prepared local application at an allowed origin. These runners do not provision the schema, seed data, create sessions, or start the application/providers.
- Explicit authorization for the database fixture mutations and browser work. A previous browser decline must be resolved before running either command. `--accepted-proposal` records acceptance of this local contract; it is not permission for production or remote operations.
- A recovery/cleanup plan for the disposable setup. The runners retain identifiable fixture/audit evidence and may archive generated listings rather than delete all fixture records. Their artifacts and preservation checks do not establish a globally clean database.

Only after those conditions are established:

```sh
node --conditions=react-server scripts/verify-media.cjs --disposable-local --accepted-proposal
node --conditions=react-server scripts/verify-inventory.cjs --disposable-local --accepted-proposal
```

Missing fixture receipts fail before provider/database/browser imports. Existing exact-target, origin, and external-fetch guards remain in place. Do not invent receipts to bypass admission or generalize these runners to a live target.

Use the repository's documented typecheck, lint, test, shipping, and build commands for their intended local gates. Database suites require their own explicit fixture admission. Current rendered acceptance, hosted provider/storage/RLS verification, exact deployment evidence, and genuine buyer/seller outcomes remain separate release requirements.
