let meta = #{
    name: "money-path-audit",
    description: "Audit PlankMarket payment hold, Connect transfer, refund, dispute, fee, and webhook paths with adversarial verification",
    when_to_use: "Before any release that touches Stripe, fees, payouts, refunds, disputes, or webhooks; after money-path bugs; launch gate evidence",
    phases: [
        #{ title: "Map", detail: "locate money-path source of truth" },
        #{ title: "Audit", detail: "parallel domain reviews" },
        #{ title: "Verify", detail: "adversarial confirmation of findings" },
        #{ title: "Report", detail: "ship/no-ship money verdict" },
    ],
};

let map_schema = #{
    "type": "object",
    "required": ["summary", "key_files", "state_machines", "risks"],
    "properties": #{
        "summary": #{ "type": "string" },
        "key_files": #{
            "type": "array", "maxItems": 20,
            "items": #{ "type": "string" },
        },
        "state_machines": #{
            "type": "array", "maxItems": 8,
            "items": #{ "type": "string" },
        },
        "risks": #{
            "type": "array", "maxItems": 10,
            "items": #{ "type": "string" },
        },
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
                "required": ["severity", "file", "issue", "why_it_matters"],
                "properties": #{
                    "severity": #{ "type": "string" },
                    "file": #{ "type": "string" },
                    "issue": #{ "type": "string" },
                    "why_it_matters": #{ "type": "string" },
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

// Resolve repo root (default: PlankMarket on this machine)
let root = "C:/Users/hands/OneDrive/Documents/Plankmarket";
if args != () && args.root != () {
    root = args.root;
}

const MAX_FINDINGS = 16;
const MAX_VERIFY = 12;

// --- Phase 1: Map the money path ---
phase("Map");
let map_prompt = "";
map_prompt += "You are auditing PlankMarket money movement. Repo root: " + root + ". ";
map_prompt += "Use read-only tools only (read_file, grep, list_dir). Do not answer from memory. ";
map_prompt += "Map the real payment model: Stripe payment hold on buyer charge, then seller Stripe Connect transfer after the configured shipment event/delay. ";
map_prompt += "This is NOT regulated escrow — never treat marketing escrow language as authoritative. ";
map_prompt += "Inspect at least: src/lib/fees.ts, src/server/services/payment-intent-*.ts, stripe-order-transfer.ts, payout-eligibility.ts, refund.ts, stripe-webhook-*.ts, ";
map_prompt += "src/app/api/webhooks/, order-transitions.ts, reconciliation-cases.ts, AGENTS.md high-risk section, and related tests under src/server/services/__tests__/. ";
map_prompt += "Return key_files (paths you actually read), state_machines (order/payment/payout transitions you observed), risks (top structural risks), and a short summary. ";
map_prompt += "Empty arrays are only valid after tools show there is nothing there.";

let map_r = agent(map_prompt, #{
    label: "map-money-path",
    capability_mode: "read-only",
    output_schema: map_schema,
});

let map_summary = "Map phase failed or returned no usable output.";
let map_files = [];
if map_r != () && map_r.success && map_r.output != () {
    if map_r.output.summary != () { map_summary = map_r.output.summary; }
    if map_r.output.key_files != () { map_files = map_r.output.key_files; }
}
log("Money path map: " + map_summary);

// --- Phase 2: Parallel domain audits ---
phase("Audit");
let dimensions = [
    "payment_intent_hold_and_capture",
    "seller_connect_transfer_and_payout_eligibility",
    "refunds_and_chargebacks_disputes",
    "webhook_idempotency_replay_and_inbox",
    "fee_calculation_and_money_math",
    "order_state_machine_coupling_to_money",
];

let audit_jobs = [];
for d in dimensions {
    let p = "";
    p += "PlankMarket money-path audit. Repo root: " + root + ". Dimension: " + d + ". ";
    p += "Use read-only tools (read_file, grep). Read the actual implementation and tests — do not invent findings. ";
    p += "Payment model truth: Stripe payment hold, then Connect transfer after shipment event/delay; not fiduciary escrow. ";
    p += "Context from map phase (may be incomplete): " + map_summary + ". ";
    p += "For each real issue return severity (blocker|high|medium|low), file path, issue (concrete), why_it_matters (buyer/seller money impact). ";
    p += "At most 8 findings. Empty findings is valid ONLY after you inspected the relevant files for this dimension and found no issues. ";
    p += "Focus only on " + d + ". Prefer bugs, race conditions, missing idempotency, wrong transfer amounts, double-pay, stuck holds, silent fee drift.";
    audit_jobs.push(#{
        prompt: p,
        label: "audit:" + d,
        capability_mode: "read-only",
        output_schema: findings_schema,
    });
}
let audit_results = parallel(audit_jobs);

let findings = [];
for r in audit_results {
    if r != () && r.success && r.output != () && r.output.findings != () {
        for f in r.output.findings {
            if findings.len() < MAX_FINDINGS {
                let dim = "";
                if r.output.dimension != () { dim = r.output.dimension; }
                findings.push(#{
                    dimension: dim,
                    severity: f.severity,
                    file: f.file,
                    issue: f.issue,
                    why_it_matters: f.why_it_matters,
                });
            }
        }
    }
}
if findings.len() >= MAX_FINDINGS {
    log("Capped findings at " + MAX_FINDINGS.to_string() + " before verification");
}
log("Collected " + findings.len().to_string() + " candidate findings");

if findings.len() == 0 {
    let empty_report = "";
    empty_report += "# PlankMarket Money Path Audit\n\n";
    empty_report += "## Map\n" + map_summary + "\n\n";
    empty_report += "## Verdict\nNo candidate findings after parallel domain audit.\n";
    empty_report += "This is NOT proof the money path is production-ready — only that automated code review found no confirmed issues in this pass.\n";
    empty_report += "Still require provider-backed Stripe proof (webhook delivery, Connect transfer, refund/dispute) before launch.\n";
    let path = write_scratch_file("money-path-audit.md", empty_report);
    complete(#{
        path: path,
        summary: "No candidate money-path findings",
        confirmed: [],
        verdict: "no_code_findings",
    });
}

// --- Phase 3: Adversarial verify ---
phase("Verify");
let to_verify = [];
let vi = 0;
for f in findings {
    if vi < MAX_VERIFY {
        to_verify.push(f);
        vi += 1;
    }
}
if findings.len() > MAX_VERIFY {
    log("Verifying first " + MAX_VERIFY.to_string() + " of " + findings.len().to_string() + " findings");
}

let vjobs = [];
let idx = 0;
for f in to_verify {
    let issue_json = json_encode(f.issue);
    let file_json = json_encode(f.file);
    let vp = "";
    vp += "Adversarially verify this PlankMarket money-path finding. Repo root: " + root + ". ";
    vp += "Claimed file: " + file_json + ". Claimed issue: " + issue_json + ". ";
    vp += "Use read-only tools to independently inspect the shipped code and nearby tests. ";
    vp += "Set real=true ONLY with concrete evidence you personally inspected (quote path + behavior). ";
    vp += "Default real=false on ambiguity, missing file, or if the claim overstates severity. ";
    vp += "severity must be blocker|high|medium|low if real, else low. evidence must cite file paths and what you saw.";
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
                why_it_matters: base.why_it_matters,
                evidence: v.output.evidence,
                reason: v.output.reason,
            });
        }
    }
    i += 1;
}
log(confirmed.len().to_string() + "/" + to_verify.len().to_string() + " findings survived verification");

// --- Phase 4: Report ---
phase("Report");
let blockers = 0;
let highs = 0;
for c in confirmed {
    if c.severity == "blocker" { blockers += 1; }
    if c.severity == "high" { highs += 1; }
}

let verdict = "pass_with_caution";
if blockers > 0 {
    verdict = "no_ship_money_blockers";
} else if highs > 0 {
    verdict = "hold_high_severity";
} else if confirmed.len() == 0 {
    verdict = "no_confirmed_code_findings";
}

let report = "";
report += "# PlankMarket Money Path Audit\n\n";
report += "## Verdict: `" + verdict + "`\n\n";
report += "- Confirmed findings: " + confirmed.len().to_string() + "\n";
report += "- Blockers: " + blockers.to_string() + "\n";
report += "- High: " + highs.to_string() + "\n";
report += "- Candidates before verify: " + findings.len().to_string() + "\n\n";
report += "## Payment model (authoritative)\n";
report += "Stripe payment hold on buyer payment; seller Connect transfer after configured shipment event/delay. ";
report += "Not a regulated escrow/fiduciary product. Marketing must not claim otherwise.\n\n";
report += "## Map\n" + map_summary + "\n\n";
if map_files.len() > 0 {
    report += "### Key files inspected (map)\n";
    for mf in map_files {
        report += "- `" + mf + "`\n";
    }
    report += "\n";
}
report += "## Confirmed findings\n\n";
if confirmed.len() == 0 {
    report += "_None survived adversarial verification._\n\n";
} else {
    for c in confirmed {
        report += "### [" + c.severity + "] " + c.issue + "\n";
        report += "- **File:** `" + c.file + "`\n";
        report += "- **Why it matters:** " + c.why_it_matters + "\n";
        report += "- **Evidence:** " + c.evidence + "\n";
        if c.reason != () {
            report += "- **Verifier reason:** " + c.reason + "\n";
        }
        report += "\n";
    }
}
report += "## Still required for launch (provider-backed)\n";
report += "- Stripe webhook delivery success in target env (payment, refund, dispute, transfer)\n";
report += "- Connect transfer dry-run/read-back on a test order\n";
report += "- Refund and dispute replay/idempotency proof\n";
report += "- Fee copy match: code fees vs marketing/pricing/legal pages\n";

let path = write_scratch_file("money-path-audit.md", report);
complete(#{
    path: path,
    summary: verdict + " — " + confirmed.len().to_string() + " confirmed",
    confirmed_count: confirmed.len(),
    blockers: blockers,
    highs: highs,
    verdict: verdict,
    confirmed: confirmed,
});
