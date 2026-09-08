# Private business verification evidence

Apply the additive verification_documents migration including attachment triggers to the reviewed target. Run `node scripts/setup-private-verification-storage.mjs --file TARGET_ENV --project EXPECTED_PROJECT_REF` for read-only inspection; explicit `--apply` provisions or updates only the private verification-documents bucket. Existing public buckets are rejected. No provider command has been executed by this patch.

Bucket constraints are public=false, file_size_limit=10485760 and PDF/JPEG/PNG MIME allowlist. Do not grant anonymous/authenticated read/write/list storage policies for this bucket. Signed tokens authorize one random incoming path; finalization validates byte signature/size and freezes a copy at a different path. Downloads require owner authentication or admin AAL2 and attachment/no-store responses. New submissions use owned references; legacy remote URLs remain historical read-only evidence.

The privacy sweep removes attached private evidence through its existing due-reference groups. A bounded orphan sweep removes unreferenced incoming intents after one day and ready uploads after seven days. Per-document row locks plus database attachment triggers serialize reference assignment against deletion. Upload finalization expires after two hours. Provider removal failure fails visibly and does not mark metadata deleted. Daily upload intent cap is20/account.

Acceptance requires private bucket policy inspection, real signed upload/download, cross-account denial, expired upload retry, simultaneous draft submission/cleanup, and buyer/seller/admin browser flows. AI egress remains opt-in; PDF evidence is available for human review.
