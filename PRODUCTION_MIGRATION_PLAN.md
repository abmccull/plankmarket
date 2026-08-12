# Production Database Migration Plan - Schema 0034

**Status**: AWAITING APPROVAL - DO NOT EXECUTE WITHOUT REVIEW

**Date**: 2026-08-12  
**Prepared for**: Production database migration to marketplace schema version 0034  
**Failure**: Deploy #122 Production Preflight - database schema readiness check

---

## 1. Root Cause Analysis

### Deploy #122 Preflight Failure

**Job**: Production Preflight → Verify target database schema before deploy  
**Script**: `npm run db:check:target -- --file .vercel/.env.production.local`  
**Exit code**: 1

**Error Message**:
```
Target database is not ready for marketplace schema 0034 (/.vercel/.env.production.local).
Missing 450+ required schema artifacts.
```

### Missing Artifacts Summary

The production database is missing the entire marketplace schema version 0034:

- **Columns**: ~106 missing (users, orders, listings, media, shipments, etc.)
- **Constraints**: ~66 missing (foreign keys, check constraints, unique constraints)
- **Indexes**: ~61 missing (performance, uniqueness, RLS support)
- **Triggers**: ~14 missing (audit, data integrity, defaults)
- **Functions**: ~9 missing (trigger functions, validation logic)
- **Tables**: ~13 missing or without RLS (sensitive tables requiring row-level security)
- **Extensions**: pg_trgm required but may be missing
- **Overgranted tables**: Potential anon/authenticated grants on sensitive tables

### Root Cause

**The production database has never had the marketplace schema applied.** This appears to be an initial production deployment where the database was created but migrations were never executed.

Per `drizzle/BASELINE_STRATEGY.md`, there is known migration baseline debt:
- Seven historical migrations referenced in the journal but SQL files not present
- Manual migrations exist but were never journaled
- Safe baseline recovery procedure required before using `drizzle-kit migrate`

---

## 2. Forward Migrations Required

The production database needs migrations **0001 through 0034** applied in order.

### Available Migration Files

Located in `/workspace/drizzle/`:

| Migration | File | Description |
|-----------|------|-------------|
| 0001 | `0001_free_wonder_man.sql` | Initial schema foundation |
| 0003 | `0003_add_listing_slugs.sql` | Listing slug support |
| 0003 | `0003_backfill_slugs.sql` | Backfill existing slugs |
| 0010 | `0010_fee_verification_hardening.sql` | Fee and verification constraints |
| 0011 | `0011_relax_users_registration_constraints.sql` | User registration flexibility |
| 0013 | `0013_pro_fixes.sql` | Production fixes |
| **0014** | **`0014_auth_data_hardening.sql`** | **First unapplied forward migration** |
| 0015 | `0015_order_financial_reconciliation.sql` | Order financial tracking |
| 0016 | `0016_shipping_booking_evidence.sql` | Shipping evidence |
| 0017 | `0017_webhook_inbox_idempotency.sql` | Webhook deduplication |
| 0018 | `0018_progressive_verification_drafts.sql` | Verification drafts |
| 0019 | `0019_listing_freshness_trust.sql` | Listing freshness |
| 0020 | `0020_seller_commerce_preferences.sql` | Seller preferences |
| 0021 | `0021_selling_rules_foundation.sql` | Selling rules |
| 0022 | `0022_sample_requests.sql` | Sample request feature |
| 0023 | `0023_order_freight_funding.sql` | Freight funding model |
| 0024 | `0024_marketplace_control_plane.sql` | Control plane tables |
| 0025 | `0025_inventory_integrations.sql` | Inventory API integrations |
| 0026 | `0026_tax_readiness.sql` | Stripe Tax integration |
| 0027 | `0027_search_and_analytics_perf.sql` | Search performance |
| 0028 | `0028_comms_and_ops_query_indexes.sql` | Operational indexes |
| 0029 | `0029_payment_intent_preparation_claim.sql` | Payment claims |
| 0030 | `0030_stripe_webhook_durable_inbox.sql` | Stripe webhook queue |
| 0031 | `0031_shipment_cancellation_queue.sql` | Shipment cancellation |
| 0032 | `0032_media_deletion_claims.sql` | Media cleanup |
| 0033 | `0033_security_privacy_and_tenancy.sql` | Security hardening |
| **0034** | **`0034_shipment_bol_number.sql`** | **Current target schema** |

### Migration Order

Per `drizzle/BASELINE_STRATEGY.md` warning:

> **"Until this procedure is completed, do not use `npm run db:migrate` to bootstrap a fresh database."**

The historical baseline issue means we **cannot safely use Drizzle's auto-migrate** yet.

---

## 3. Safe Migration Commands (From BASELINE_STRATEGY.md)

### ⚠️ Prerequisites - DO FIRST

```bash
# 1. TAKE RESTORABLE PRODUCTION BACKUP
# This is MANDATORY before any schema changes
# Use Supabase dashboard or pg_dump
pg_dump "$DATABASE_URL" \
  --schema-only \
  --no-owner \
  --no-privileges \
  > production_schema_backup_$(date +%Y%m%d_%H%M%S).sql

# 2. EXPORT CURRENT DRIZZLE MIGRATION TABLE STATE
psql "$DATABASE_URL" <<'SQL'
SELECT * FROM drizzle.__drizzle_migrations ORDER BY created_at;
SQL
```

### Safe Recovery Procedure (Verbatim from BASELINE_STRATEGY.md)

1. **Put schema changes on hold and take a restorable production backup.**

2. **Read the live Drizzle migration table and export a schema-only dump from the live Supabase database. Do not include table data or secrets.**

3. **Compare the live schema against:**
   - `src/server/db/schema/index.ts`
   - Every retained manual migration
   - The latest reviewed Drizzle snapshot

4. **Create one authoritative baseline from the verified live schema in a clean migration directory. Preserve the current directory as historical evidence.**

5. **Restore that baseline into a new scratch Supabase project, then apply every forward migration in order (`0014`, `0015`, `0016`, and later files).**

6. **Run schema diff, constraints/index checks, the Supabase security advisors, and the application test/build gates against the scratch project.**

7. **Only after the scratch result matches the live schema should operators adopt the new baseline and update the live migration ledger in a reviewed change.**

### If Production Database is Empty (Initial Deployment)

If the production database truly has NO existing schema (empty):

```bash
# Option A: Apply all migrations manually (safer)
for migration in drizzle/*.sql; do
  echo "Applying $migration..."
  psql "$DATABASE_URL" < "$migration"
done

# Option B: Use Drizzle push (destroys/recreates, USE WITH EXTREME CAUTION)
# ONLY if database is completely empty and no data exists
DATABASE_URL="$PROD_DATABASE_URL" npm run db:push
```

**STOP**: Verify with Alec which scenario applies:
- Does production database have any existing schema/data?
- Is this a truly fresh database that needs initial bootstrap?
- Or does it have partial schema that conflicts with the migration plan?

---

## 4. Risks & Rollback Notes

### Risks

1. **Data Loss Risk** (if existing data present)
   - Some migrations may alter columns or add NOT NULL constraints
   - Backfill operations in migrations could fail on inconsistent data
   - RLS policies could lock out existing data access patterns

2. **Downtime Risk**
   - Large table alterations (orders, listings, users) may lock tables
   - Index creation on large tables can take significant time
   - Trigger creation may cause performance degradation

3. **Migration Ordering Risk**
   - Migrations must be applied in exact order
   - Skipping or reordering could create inconsistent state
   - Some migrations reference objects created in prior migrations

4. **Baseline Debt Risk**
   - Historical migrations 0002, 0004-0009, 0012 referenced but missing
   - Unknown if production has these applied under different names
   - Could result in duplicate object creation failures

5. **Application Runtime Risk**
   - Current deployed code expects schema 0034
   - Any delay in migration means runtime failures
   - Cannot roll back code without rolling back schema

### Rollback Strategy

**Before applying migrations**:
```bash
# Full database backup (schema + data)
pg_dump "$DATABASE_URL" \
  --format=custom \
  --file="production_full_backup_$(date +%Y%m%d_%H%M%S).pgdump"
```

**If migration fails mid-way**:
```bash
# Option 1: Restore from backup (cleanest)
pg_restore --clean --if-exists \
  --dbname="$DATABASE_URL" \
  production_full_backup_TIMESTAMP.pgdump

# Option 2: Manual rollback (risky - only for specific known changes)
# Reverse specific migration SQL (must be crafted per migration)
psql "$DATABASE_URL" < rollback_migration_XXXX.sql
```

**Migration Verification**:
```bash
# After each migration batch, verify readiness
npm run db:check:target -- --file .vercel/.env.production.local

# Check for unexpected grants
psql "$DATABASE_URL" <<'SQL'
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee IN ('anon', 'authenticated', 'PUBLIC')
  AND table_schema = 'public';
SQL
```

### Smoke Test After Migration

```bash
# 1. Verify schema contract passes
npm run db:check:target -- --file .vercel/.env.production.local

# 2. Check critical tables exist and have RLS
psql "$DATABASE_URL" <<'SQL'
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'users', 'orders', 'listings', 'shipments',
    'verification_drafts', 'sample_requests'
  );
SQL

# 3. Verify extensions installed
psql "$DATABASE_URL" <<'SQL'
SELECT extname FROM pg_extension WHERE extname = 'pg_trgm';
SQL

# 4. Test basic application health endpoint
curl -fsS "$PRODUCTION_URL/api/health"
```

---

## 5. Approval Required Before Execution

### What Alec Must Review/Approve

1. **Environment Confirmation**
   - [ ] Confirm production database connection string is correct
   - [ ] Verify this is the intended production database
   - [ ] Confirm database is truly empty OR has specific existing schema state

2. **Baseline Strategy Decision**
   - [ ] Should we follow full BASELINE_STRATEGY.md recovery (recommended)?
   - [ ] OR is this a fresh database where direct migration is acceptable?
   - [ ] Have historical migrations 0002, 0004-0009, 0012 been applied under different names?

3. **Migration Execution Plan**
   - [ ] Review all 34 migration files for production safety
   - [ ] Approve migration order and any required manual steps
   - [ ] Confirm rollback strategy is acceptable

4. **Downtime Window**
   - [ ] Is production currently live with traffic?
   - [ ] Do we need a maintenance window?
   - [ ] What is acceptable downtime tolerance?

5. **Backup Confirmation**
   - [ ] Verify backup procedure is tested and working
   - [ ] Confirm backup retention and restore procedure
   - [ ] Test backup restore in scratch environment first

6. **Post-Migration Deployment**
   - [ ] After migration succeeds, re-run Deploy #122 or trigger new deploy
   - [ ] Verify Production Preflight passes with schema check
   - [ ] Monitor application health post-deployment

### Suggested Execution Flow (After Approval)

```bash
# 1. Alec reviews this plan
# 2. Alec provides go/no-go decision
# 3. Alec confirms backup taken successfully
# 4. CoS/Alec executes migration commands (or delegates with supervision)
# 5. Verify schema readiness: npm run db:check:target
# 6. Trigger new production deploy
# 7. Monitor application health
```

---

## 6. Alternative: Staged Approach

If immediate production migration is too risky, consider:

1. **Deploy to Preview First**
   - Apply migrations to preview environment
   - Run full test suite against preview
   - Smoke test all critical user flows
   - Validate schema readiness check passes

2. **Scratch Environment Validation**
   - Create fresh Supabase project
   - Apply all migrations from 0001-0034
   - Verify schema matches expectations
   - Run automated tests

3. **Production Migration**
   - Only after preview/scratch validation succeeds
   - Execute during maintenance window
   - Have Alec standing by for rollback decision

---

## Summary for Alec

**Current State**: Production database missing schema 0034 (all ~450 artifacts)

**Blocker**: Deploy #122 Production Preflight correctly blocking unsafe deployment

**Recommended Path**:
1. Alec confirms production database state (empty vs partial schema)
2. Alec reviews full migration plan and approves/modifies
3. Take verified restorable backup
4. Apply migrations in scratch environment first (validation)
5. Apply migrations to production after scratch validation
6. Verify schema readiness, then trigger new deploy

**Timeline**:
- Migration review: Alec decision
- Scratch validation: ~1-2 hours (includes test runs)
- Production migration: ~15-30 minutes (depends on data volume)
- Total: Same-day possible if Alec approves immediately

**DO NOT PROCEED** until Alec explicitly approves the migration execution plan.
