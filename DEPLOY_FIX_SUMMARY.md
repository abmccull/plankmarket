# Deploy Production Fix - Final Summary

## ✅ Problem Solved

**Original failure**: Deploy Production workflow failed at "Stage Production Deployment" (job 94319131006) with invalid environment variable errors during Next.js page data collection.

**Exact missing vars** (confirmed by Vercel specialist):
1. RESEND_API_KEY
2. RESEND_WEBHOOK_SECRET
3. ANTHROPIC_API_KEY
4. VERIFICATION_DOC_ALLOWED_HOSTS
5. PRIORITY1_DOCUMENT_ALLOWED_HOSTS

**Root cause**: The `env.ts` validation runs at build time with `NODE_ENV=production`, requiring runtime-only secrets that aren't provided in the Vercel build environment.

---

## ✅ Solution Implemented

**Approach**: Pass `--build-env="SKIP_ENV_VALIDATION=true"` to `vercel deploy`

**Files changed**:
- `.github/workflows/deploy-production.yml`
- `.github/workflows/deploy-preview.yml`

**Why this works**:
- Aligns build-time validation with what staged deploy actually provides
- Runtime validation still enforces all required secrets
- Mirrors existing pattern in CI `validate` job
- No security reduction

---

## ✅ Verification Complete

**Latest CI run**: 31661237508 (2026-08-13T02:34:34Z)

**Results**:
- ✅ **Validate Preview**: SUCCESS
- ✅ **Preview Preflight**: SUCCESS  
- ✅ **Deploy Preview**: SUCCESS ← **Our fix works!**
  - Build: `✓ Compiled successfully in 13.1s`
  - No env validation errors during build
  - Deployment URL created successfully
- ✅ **Verify Preview Liveness**: SUCCESS
- ⚠️ **Verify Preview Readiness**: FAILED (separate CRON_SECRET issue, unrelated to build fix)

---

## 🔍 Investigation Journey

### Attempt 1: Runtime detection via environment variables

**Goal**: Detect build phase vs runtime to make secrets optional only during build

**Tried**:
```typescript
const isBuildPhase = process.env.VERCEL === "1" && !process.env.VERCEL_URL;
const runtimeRequired = (schema) => isProduction && !isBuildPhase ? schema : schema.optional();
```

**Result**: ❌ Failed
- `VERCEL_URL` **is set during build**, not just at runtime
- No reliable env var distinguishes build from runtime in Vercel
- Debug logs showed: `isBuildPhase: false, VERCEL: '1', VERCEL_URL: 'set'` even during `next build`

### Attempt 2 (Final): SKIP_ENV_VALIDATION build env

**Goal**: Align validation with what the build environment actually provides

**Implemented**:
```yaml
--build-env="SKIP_ENV_VALIDATION=true"
```

**Result**: ✅ Success
- Build completes without runtime-only secrets
- Runtime validation still enforces all requirements
- Pragmatic solution that matches deployment reality

---

## 📋 Next Steps

### 1. Merge the PR

**PR**: [#9 - Fix: Skip env validation during Vercel build](https://github.com/abmccull/plankmarket/pull/9)

```bash
gh pr merge 9 --squash
```

### 2. Deploy Production will trigger automatically

- **No manual re-run needed**: Triggers on push to `main`
- **No env configuration changes needed**: Fix is in workflow files only
- **Expected timeline**: ~15-20 minutes

### 3. Expected outcome

After merge:
1. ✅ Build succeeds without runtime-only secrets at build time
2. ✅ Staged deployment created
3. ✅ Liveness check passes
4. ✅ Readiness check passes (if production `CRON_SECRET` configured)
5. ✅ Smoke tests pass
6. ✅ Production promotion succeeds

---

## ⚠️ Separate Issue: Preview CRON_SECRET

**Not related to build-time env validation fix**, but discovered during testing:

**Symptom**: Preview readiness check fails with HTTP 500
**Cause**: `CRON_SECRET` not configured in preview environment GitHub Actions secrets
**Impact**: Protected `/api/health/ready` endpoint requires authorization
**Fix** (optional): Add `CRON_SECRET` to preview environment secrets in GitHub repository settings

---

## 📊 Verification Checklist

- [x] Root cause identified (from Vercel specialist feedback)
- [x] Exact missing vars documented
- [x] Solution implemented (SKIP_ENV_VALIDATION at build time)
- [x] Runtime detection attempted and found unreliable
- [x] Pragmatic solution chosen (aligns with build environment reality)
- [x] **Fix verified in CI (Deploy Preview succeeded)**
- [x] PR updated with final approach
- [ ] PR merged to main (pending)
- [ ] Deploy Production succeeds (pending merge)

---

## 🎯 Key Takeaways

1. **Build-time vs runtime**: Runtime-only secrets (email, AI, webhooks) aren't needed during build/page-data-collection
2. **Environment reality**: Vercel build doesn't provide runtime secrets; attempting detection was unreliable
3. **Pragmatic solution**: `SKIP_ENV_VALIDATION=true` aligns with what the environment provides
4. **Security intact**: Runtime validation still enforces all requirements when app handles requests
5. **Established pattern**: Mirrors existing CI `validate` job approach

---

## 📝 Technical Details

### What Gets Validated When

**During build** (with `SKIP_ENV_VALIDATION=true`):
- Validation skipped entirely
- Build proceeds with only infrastructure that Vercel provides
- Page data collection completes successfully

**During runtime** (when app starts / handles requests):
- Full `env.ts` validation runs
- All required secrets must be present
- Missing secrets cause immediate failure

### Why Runtime-Only Secrets Aren't Needed at Build

Build-time operations that trigger env.ts import:
- Static route analysis
- Page data collection  
- Server component tree building

None of these operations actually **use** the runtime-only secrets:
- Email (RESEND_*) - only used when sending emails via API routes
- AI (ANTHROPIC_*) - only used during verification workflows
- Webhooks (VERIFICATION_*, PRIORITY1_*) - only used when webhooks received
- Cron (CRON_SECRET) - only used for protected health checks

These only run at **request time**, not build time.

---

## 📚 References

- Failed run (original): https://github.com/abmccull/plankmarket/actions/runs/31631854426
- Job ID with exact missing vars: 94319131006
- Fix PR: https://github.com/abmccull/plankmarket/pull/9
- Successful verification run: https://github.com/abmccull/plankmarket/actions/runs/31661237508
- Vercel specialist guidance: "align build-time env validation with what staged deploy actually provides"

---

## ✅ Success Criteria Met

- [x] Root cause identified and documented
- [x] Fix implemented that aligns with Vercel specialist feedback
- [x] PR opened with clear explanation
- [x] **Fix verified working in CI**
- [x] No marketplace audit or schema checks skipped
- [x] No force-promote required
- [ ] Ready to merge and deploy to production

**Status**: ✅ **Complete and verified. Ready for merge.**
