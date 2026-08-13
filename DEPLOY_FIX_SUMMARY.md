# Deploy Production Fix - Complete Summary (UPDATED)

## ✅ Root Cause Identified

**Problem**: Deploy Production workflow failed at "Stage Production Deployment" (job 94319131006) with invalid environment variable errors during Next.js page data collection.

**Exact missing vars** (confirmed by Vercel specialist):
1. RESEND_API_KEY
2. RESEND_WEBHOOK_SECRET
3. ANTHROPIC_API_KEY
4. VERIFICATION_DOC_ALLOWED_HOSTS
5. PRIORITY1_DOCUMENT_ALLOWED_HOSTS

**Root cause**: 
- The `env.ts` file uses `productionRequired()` to make certain vars required whenever `NODE_ENV=production`
- This includes **build time** (static analysis and page data collection) AND **runtime** (request handling)
- Runtime-only secrets (email, AI, webhooks, cron) aren't needed during build/static-analysis
- These secrets are stored in Vercel project settings (available at **runtime**) but not at **build time**
- CI `check-production-env` correctly treats some as optional, but staged `next build` failed during page data collection

**Failed run**: https://github.com/abmccull/plankmarket/actions/runs/31631854426

---

## ✅ Solution Implemented

**Fix**: Distinguish between **build-time** and **runtime** requirements in `env.ts`

### Changes Made

**1. Added build-phase detection**:
```typescript
/**
 * Detect if we're in a build/static-analysis phase vs runtime.
 * During build, Next.js collects page data and imports modules, but most
 * runtime-only secrets (email, AI, webhooks, cron) aren't needed.
 */
const isBuildPhase =
  process.env.CI === "true" &&
  process.env.VERCEL === "1" &&
  !process.env.VERCEL_URL;
```

**2. Added `runtimeRequired()` helper**:
```typescript
/**
 * Require in production runtime, but optional during build/page-data-collection.
 * Use for secrets only needed when handling requests (not during static analysis).
 */
const runtimeRequired = (schema: z.ZodString) =>
  isProduction && !isBuildPhase ? schema : schema.optional();
```

**3. Updated runtime-only secrets to use `runtimeRequired()`**:
- ✅ RESEND_API_KEY
- ✅ RESEND_WEBHOOK_SECRET
- ✅ ANTHROPIC_API_KEY
- ✅ VERIFICATION_WEBHOOK_SECRET
- ✅ VERIFICATION_DOC_ALLOWED_HOSTS
- ✅ PRIORITY1_API_KEY
- ✅ PRIORITY1_DOCUMENT_ALLOWED_HOSTS
- ✅ CRON_SECRET
- ✅ INNGEST_EVENT_KEY

**4. Kept `productionRequired()` for always-required secrets**:
- Database credentials (DATABASE_URL)
- Core payment secrets (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET)
- File upload (UPLOADTHING_TOKEN)
- Rate limiting (UPSTASH_REDIS_*)
- Supabase keys

### Why This Is Better Than SKIP_ENV_VALIDATION

| Approach | Build Validation | Runtime Validation | Precision |
|----------|-----------------|-------------------|-----------|
| `SKIP_ENV_VALIDATION=true` | ❌ None | ✅ Full | ❌ Too broad |
| **`runtimeRequired()` (this fix)** | ✅ Core secrets only | ✅ All secrets | ✅ Precise |

**Benefits**:
- ✅ Validates core secrets (DB, Stripe) even at build time
- ✅ Makes runtime-only secrets optional during build
- ✅ Aligns with what staged deploy actually provides
- ✅ Runtime validation still enforces all required secrets
- ✅ No workflow changes needed
- ✅ No security reduction

---

## ✅ PR Updated

**PR**: [#9 - Fix: Production deployment failure from env validation during build](https://github.com/abmccull/plankmarket/pull/9)

**Updated approach**:
- ❌ Removed: `--build-env="SKIP_ENV_VALIDATION=true"` (too broad)
- ✅ Added: Precise build-phase detection in `env.ts`
- ✅ Added: `runtimeRequired()` helper for runtime-only secrets

**Files changed**:
- `src/env.ts` (NEW: build-phase detection and runtimeRequired helper)
- `.github/workflows/deploy-production.yml` (reverted to original)
- `.github/workflows/deploy-preview.yml` (reverted to original)

---

## 🔄 Verification Status

**Previous attempt** (SKIP_ENV_VALIDATION):
- ✅ Build succeeded
- ⚠️ Too broad - skipped all validation

**Current approach** (runtimeRequired):
- ⏳ Pending: Need to test with updated env.ts changes
- ✅ More precise - validates core secrets at build time
- ✅ Aligns with Vercel specialist feedback

---

## 📋 Next Steps

### 1. Verify the fix locally (optional)

```bash
# Simulate build phase
CI=true VERCEL=1 NODE_ENV=production npm run build

# Expected: Build succeeds without requiring runtime-only secrets
```

### 2. Merge the PR

```bash
# Merge PR #9 to main
gh pr merge 9 --squash
```

### 3. Deploy Production will trigger automatically

- **No manual re-run needed**: Triggers automatically on push to `main`
- **No env configuration changes needed**: Fix is in the application code
- **Expected timeline**: ~15-20 minutes for complete deployment

### 4. Expected outcome

After merge:
1. ✅ Build succeeds without runtime-only secrets at build time
2. ✅ Build still validates core secrets (DB, Stripe, Redis, etc.)
3. ✅ Staged deployment created
4. ✅ All verification steps pass
5. ✅ Production promotion succeeds

---

## 📊 Verification Checklist

- [x] Root cause identified (from Vercel specialist)
- [x] Exact missing vars documented
- [x] Precise fix implemented (runtimeRequired)
- [x] PR updated with better approach
- [x] Core secrets still validated at build time
- [ ] Fix verified in CI (pending)
- [ ] PR merged to main (pending)
- [ ] Deploy Production succeeds (pending merge)

---

## 🎯 Key Differences from Previous Approach

### Previous Approach (SKIP_ENV_VALIDATION)
```yaml
# In workflow file
--build-env="SKIP_ENV_VALIDATION=true"
```
- ❌ Skips ALL validation at build time
- ❌ Could miss misconfigurations of core secrets
- ❌ Doesn't address root cause

### Current Approach (runtimeRequired)
```typescript
// In env.ts
const isBuildPhase = process.env.CI === "true" && 
                     process.env.VERCEL === "1" && 
                     !process.env.VERCEL_URL;

const runtimeRequired = (schema: z.ZodString) =>
  isProduction && !isBuildPhase ? schema : schema.optional();
```
- ✅ Validates core secrets at build time
- ✅ Makes only runtime-only secrets optional during build
- ✅ Addresses root cause precisely
- ✅ Aligns with Vercel specialist recommendation

---

## 📝 Technical Details

### Build Phase Detection Logic

```typescript
const isBuildPhase =
  process.env.CI === "true" &&      // Running in CI
  process.env.VERCEL === "1" &&     // Vercel environment
  !process.env.VERCEL_URL;          // Not deployed yet (still building)
```

**When true**: During `vercel deploy` build, before deployment URL is assigned
**When false**: During local dev, tests, or runtime request handling

### Secret Categories

**Core secrets** (always required in production):
- Database: `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- Payment: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- File upload: `UPLOADTHING_TOKEN`
- Rate limiting: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`

**Runtime-only secrets** (optional during build):
- Email: `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`
- AI: `ANTHROPIC_API_KEY`
- Verification: `VERIFICATION_WEBHOOK_SECRET`, `VERIFICATION_DOC_ALLOWED_HOSTS`
- Shipping: `PRIORITY1_API_KEY`, `PRIORITY1_DOCUMENT_ALLOWED_HOSTS`
- Cron: `CRON_SECRET`
- Events: `INNGEST_EVENT_KEY`

---

## 🔍 What Routes Trigger env.ts Validation?

During Next.js page data collection:
- ✅ `/api/inventory/ingest` - Imports `env.ts` → triggers validation
- ✅ All API routes that import server code
- ✅ Server components that use env vars

Our fix ensures these routes can be analyzed at build time without requiring runtime-only secrets.

---

## 📚 References

- Failed production deploy: https://github.com/abmccull/plankmarket/actions/runs/31631854426
- Job with exact missing vars: 94319131006
- Fix PR: https://github.com/abmccull/plankmarket/pull/9
- Vercel specialist guidance: "align build-time env validation with what staged deploy actually provides"
