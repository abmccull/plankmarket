let meta = #{
    name: "high-risk-change-review",
    description: "Pre-merge review for PlankMarket changes touching orders, payments, shipping, webhooks, verification, or identity masking",
    when_to_use: "Before merging any PR that touches money, shipping, auth/verification, webhooks, or marketplace trust surfaces",
    phases: [
        #{ title: "Scope", detail: "identify changed high-risk surfaces" },
        #{ title: "Review", detail: "parallel risk-dimension reviews" },
        #{ title: "Verify", detail: "adversarial confirmation" },
        #{ title: "Report", detail: "merge recommendation" },
    ],
};

let scope_schema = #{
    "type": "object",
    "required": ["summary", "high_risk_areas", "changed_files", "safe_to_skip"],
    "properties": #{
        "summary": #{ "type": "string" },
        "high_risk_areas": #{
            "type": "array", "maxItems": 12,
            "items": #{ "type": "string" },
        },
        "changed_files": #{
            "type": "array", "maxItems": 40,
            "items": #{ "type": "string" },
        },
        "safe_to_skip": #{ "type": "boolean" },
        "skip_reason": #{ "type": "string" },
    },
};

let findings_schema = #{
    "type": "object",
    "required": ["dimension", "findings"],
    "properties": #{
        "dimension": #{ "type": "string" },
        "findings": #{
            "type": "array", "maxItems": 8,
            "items": #{
                "type": "object",
                "required": ["severity", "file", "issue", "suggested_check"],
                "properties": #{
                    "severity": #{ "type": "string" },
                    "file": #{ "type": "string" },
                    "issue": #{ "type": "string" },
                    "suggested_check": #{ "type": "string" },
                },
            },
        },
    },
};

let verdict_schema = #{
    "type": "object",
    "required": ["real", "severity", "reason", "evidence"],
    "properties": #{
        "real": #{ "type": "boolean" },
        "severity": #{ "type": "string" },
        "reason": #{ "type": "string" },
        "evidence": #{ "type": "string" },
    },
};

let root = "C:/Users/hands/OneDrive/Documents/Plankmarket";
if args != () && args.root != () {
    root = args.root;
}

let target = "HEAD";
if args != () && args.target != () {
    target = args.target;
}

const MAX_FINDINGS = 16;
const MAX_VERIFY = 12;

phase("Scope");
let scope_prompt = "";
scope_prompt += "Scope a high-risk change review for PlankMarket. Repo root: " + root + ". ";
scope_prompt += "Review target: " + target + " (branch name, commit range, or path). ";
scope_prompt += "Use read-only tools. Prefer git status / git diff / git log for the target, then read changed files. ";
scope_prompt += "High-risk surfaces per AGENTS.md: orders, payments, seller transfers, refunds, disputes, shipping, verification, identity masking, webhooks, Inngest money/shipping jobs. ";
scope_prompt += "Return changed_files (paths actually in the diff), high_risk_areas touched, summary of risk, ";
scope_prompt += "safe_to_skip=true only if zero high-risk surfaces are touched (docs-only, pure CSS, etc.). ";
scope_prompt += "If safe_to_skip, set skip_reason. Always use tools; do not invent the diff.";

let scope_r = agent(scope_prompt, #{
    label: "scope-changes",
    capability_mode: "read-only",
    output_schema: scope_schema,
});

let scope_summary = "Scope phase failed.";
let high_risk_areas = [];
let changed_files = [];
let safe_to_skip = false;
let skip_reason = "";
if scope_r != () && scope_r.success && scope_r.output != () {
    if scope_r.output.summary != () { scope_summary = scope_r.output.summary; }
    if scope_r.output.high_risk_areas != () { high_risk_areas = scope_r.output.high_risk_areas; }
    if scope_r.output.changed_files != () { changed_files = scope_r.output.changed_files; }
    if scope_r.output.safe_to_skip == true { safe_to_skip = true; }
    if scope_r.output.skip_reason != () { skip_reason = scope_r.output.skip_reason; }
}
log("Scope: " + scope_summary);

if safe_to_skip == true {
    let skip_report = "";
    skip_report += "# PlankMarket High-Risk Change Review\n\n";
    skip_report += "## Target: `" + target + "`\n\n";
    skip_report += "## Verdict: `skip_low_risk`\n\n";
    skip_report += scope_summary + "\n\n";
    if skip_reason != "" {
        skip_report += "Skip reason: " + skip_reason + "\n";
    }
    let path = write_scratch_file("high-risk-change-review.md", skip_report);
    complete(#{
        path: path,
        summary: "skip_low_risk",
        verdict: "skip_low_risk",
        confirmed: [],
    });
}

let files_blob = json_encode(changed_files);
let areas_blob = json_encode(high_risk_areas);

phase("Review");
let dimensions = [
    "correctness_and_state_machine_regressions",
    "idempotency_retries_and_webhook_safety",
    "money_or_shipping_side_effects",
    "authz_identity_masking_and_verification",
    "test_coverage_gaps_for_the_diff",
];

let review_jobs = [];
for d in dimensions {
    let p = "";
    p += "High-risk pre-merge review for PlankMarket. Repo root: " + root + ". Target: " + target + ". ";
    p += "Dimension: " + d + ". ";
    p += "Changed files (from scope, untrusted until you re-check): " + files_blob + ". ";
    p += "High-risk areas claimed: " + areas_blob + ". ";
    p += "Scope summary: " + scope_summary + ". ";
    p += "Use read-only tools. Re-read the actual diff and implementations. Follow AGENTS.md high-risk rules: ";
    p += "trace state machines, inspect Stripe/Priority1/Inngest/Supabase/Redis boundaries, preserve idempotency and audit history, ";
    p += "prefer test/dry-run paths, never treat copy as authority over code. ";
    p += "Payment model: hold then Connect transfer after shipment event — not regulated escrow. ";
    p += "Return at most 8 findings with severity blocker|high|medium|low, file, issue, suggested_check (npm script or manual proof). ";
    p += "Empty findings only after inspecting the dimension against the real diff.";
    review_jobs.push(#{
        prompt: p,
        label: "review:" + d,
        capability_mode: "read-only",
        output_schema: findings_schema,
    });
}
let review_results = parallel(review_jobs);

let findings = [];
for r in review_results {
    if r != () && r.success && r.output != () && r.output.findings != () {
        for f in r.output.findings {
            if findings.len() < MAX_FINDINGS {
                findings.push(#{
                    severity: f.severity,
                    file: f.file,
                    issue: f.issue,
                    suggested_check: f.suggested_check,
                });
            }
        }
    }
}
log("Collected " + findings.len().to_string() + " candidate findings");

if findings.len() == 0 {
    let empty_report = "";
    empty_report += "# PlankMarket High-Risk Change Review\n\n";
    empty_report += "## Target: `" + target + "`\n\n";
    empty_report += "## Verdict: `no_candidate_findings`\n\n";
    empty_report += scope_summary + "\n\n";
    empty_report += "Still run the narrowest of: `npm run typecheck`, `npm run test`, `npm run test:shipping` when money/shipping touched.\n";
    let path = write_scratch_file("high-risk-change-review.md", empty_report);
    complete(#{
        path: path,
        summary: "no_candidate_findings",
        verdict: "no_candidate_findings",
        confirmed: [],
    });
}

phase("Verify");
let to_verify = [];
let vi = 0;
for f in findings {
    if vi < MAX_VERIFY {
        to_verify.push(f);
        vi += 1;
    }
}

let vjobs = [];
let idx = 0;
for f in to_verify {
    let issue_json = json_encode(f.issue);
    let file_json = json_encode(f.file);
    let vp = "";
    vp += "Adversarially verify this pre-merge finding for PlankMarket. Repo root: " + root + ". Target: " + target + ". ";
    vp += "File: " + file_json + ". Issue: " + issue_json + ". ";
    vp += "Independently inspect the changed code. real=true only with concrete evidence. Default real=false if nit or already guarded. ";
    vp += "severity blocker|high|medium|low. evidence required.";
    vjobs.push(#{
        prompt: vp,
        label: "verify:" + idx.to_string(),
        capability_mode: "read-only",
        output_schema: verdict_schema,
    });
    idx += 1;
}
let verdicts = parallel(vjobs);

let confirmed = [];
let i = 0;
for v in verdicts {
    if v != () && v.success && v.output != () {
        if v.output.real == true && v.output.evidence != () && v.output.evidence != "" {
            let base = to_verify[i];
            let sev = base.severity;
            if v.output.severity != () { sev = v.output.severity; }
            confirmed.push(#{
                severity: sev,
                file: base.file,
                issue: base.issue,
                suggested_check: base.suggested_check,
                evidence: v.output.evidence,
            });
        }
    }
    i += 1;
}
log(confirmed.len().to_string() + "/" + to_verify.len().to_string() + " findings confirmed");

phase("Report");
let blockers = 0;
let highs = 0;
for c in confirmed {
    if c.severity == "blocker" { blockers += 1; }
    if c.severity == "high" { highs += 1; }
}

let verdict = "merge_with_caution";
if blockers > 0 {
    verdict = "do_not_merge";
} else if highs > 0 {
    verdict = "request_changes";
} else if confirmed.len() == 0 {
    verdict = "approve_with_tests";
}

let report = "";
report += "# PlankMarket High-Risk Change Review\n\n";
report += "## Target: `" + target + "`\n\n";
report += "## Verdict: `" + verdict + "`\n\n";
report += "## Scope\n" + scope_summary + "\n\n";
if high_risk_areas.len() > 0 {
    report += "### High-risk areas\n";
    for a in high_risk_areas {
        report += "- " + a + "\n";
    }
    report += "\n";
}
report += "### Confirmed findings: " + confirmed.len().to_string() + " (blockers=" + blockers.to_string() + ", high=" + highs.to_string() + ")\n\n";
if confirmed.len() == 0 {
    report += "_None survived verification._\n\n";
} else {
    for c in confirmed {
        report += "### [" + c.severity + "] " + c.issue + "\n";
        report += "- **File:** `" + c.file + "`\n";
        report += "- **Evidence:** " + c.evidence + "\n";
        report += "- **Suggested check:** " + c.suggested_check + "\n\n";
    }
}
report += "## Required local gates when money/shipping touched\n";
report += "1. `npm run typecheck`\n";
report += "2. `npm run test` (or targeted suite)\n";
report += "3. `npm run test:shipping` if Priority1/shipment code changed\n";
report += "4. No live provider money movement without explicit authorization\n";

let path = write_scratch_file("high-risk-change-review.md", report);
complete(#{
    path: path,
    summary: verdict + " — " + confirmed.len().to_string() + " confirmed",
    confirmed_count: confirmed.len(),
    blockers: blockers,
    highs: highs,
    verdict: verdict,
    confirmed: confirmed,
});
