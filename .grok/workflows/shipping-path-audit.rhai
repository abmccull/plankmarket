let meta = #{
    name: "shipping-path-audit",
    description: "Audit PlankMarket Priority1 LTL quote, book, track, cancel, and order-coupling paths with adversarial verification",
    when_to_use: "Before shipping-related releases, launch gates, Priority1 config changes, or shipment/Inngest bugs",
    phases: [
        #{ title: "Map", detail: "locate shipping workflow source of truth" },
        #{ title: "Audit", detail: "parallel shipping domain reviews" },
        #{ title: "Verify", detail: "adversarial confirmation of findings" },
        #{ title: "Report", detail: "shipping readiness verdict" },
    ],
};

let map_schema = #{
    "type": "object",
    "required": ["summary", "key_files", "lifecycle", "risks"],
    "properties": #{
        "summary": #{ "type": "string" },
        "key_files": #{
            "type": "array", "maxItems": 20,
            "items": #{ "type": "string" },
        },
        "lifecycle": #{
            "type": "array", "maxItems": 12,
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

let root = "C:/Users/hands/OneDrive/Documents/Plankmarket";
if args != () && args.root != () {
    root = args.root;
}

const MAX_FINDINGS = 16;
const MAX_VERIFY = 12;

phase("Map");
let map_prompt = "";
map_prompt += "You are auditing PlankMarket LTL shipping (Priority1). Repo root: " + root + ". ";
map_prompt += "Use read-only tools only (read_file, grep, list_dir). Do not answer from memory. ";
map_prompt += "Map the lifecycle: rate quote/cache -> booking/BOL -> dispatch -> tracking -> cancellation, and how shipping couples to order/payment release. ";
map_prompt += "Inspect at least: src/server/services/priority1.ts, shipping-workflow.ts, shipment-cancellation.ts, shipping-rate-cache.ts, ";
map_prompt += "src/lib/inngest/functions/shipment-*.ts, freight-related lib constants, checkout shipping UI, and tests (priority1.test.ts, shipping-workflow.test.ts, scripts/test-shipping-dry-run.ts). ";
map_prompt += "Note PRIORITY1_DRY_RUN safety and any live-provider boundaries. ";
map_prompt += "Return key_files you actually read, lifecycle steps observed, structural risks, and a short summary.";

let map_r = agent(map_prompt, #{
    label: "map-shipping-path",
    capability_mode: "read-only",
    output_schema: map_schema,
});

let map_summary = "Map phase failed or returned no usable output.";
let map_files = [];
if map_r != () && map_r.success && map_r.output != () {
    if map_r.output.summary != () { map_summary = map_r.output.summary; }
    if map_r.output.key_files != () { map_files = map_r.output.key_files; }
}
log("Shipping path map: " + map_summary);

phase("Audit");
let dimensions = [
    "quote_rate_cache_and_selection",
    "booking_bol_and_document_hosts",
    "dispatch_tracking_inngest_retries",
    "cancellation_and_failure_recovery",
    "dry_run_vs_live_safety_rails",
    "order_payment_coupling_to_shipment_events",
];

let audit_jobs = [];
for d in dimensions {
    let p = "";
    p += "PlankMarket shipping-path audit. Repo root: " + root + ". Dimension: " + d + ". ";
    p += "Use read-only tools (read_file, grep). Read implementation and tests — do not invent findings. ";
    p += "Context from map (may be incomplete): " + map_summary + ". ";
    p += "For each real issue return severity (blocker|high|medium|low), file, issue, why_it_matters (freight cost, stuck orders, wrong pickup, lost tracking). ";
    p += "At most 8 findings. Empty findings only after inspecting relevant files for this dimension. ";
    p += "Prefer: double-book, silent dry-run in prod, missing retries, track never updates, cancel leaves carrier booked, shipment event never releases seller transfer.";
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
    log("Capped findings at " + MAX_FINDINGS.to_string());
}
log("Collected " + findings.len().to_string() + " candidate findings");

if findings.len() == 0 {
    let empty_report = "";
    empty_report += "# PlankMarket Shipping Path Audit\n\n";
    empty_report += "## Map\n" + map_summary + "\n\n";
    empty_report += "## Verdict\nNo candidate findings after parallel domain audit.\n";
    empty_report += "Still require provider-backed Priority1 proof (quote, book, track, cancel) with PRIORITY1_DRY_RUN explicitly confirmed per environment.\n";
    let path = write_scratch_file("shipping-path-audit.md", empty_report);
    complete(#{
        path: path,
        summary: "No candidate shipping-path findings",
        confirmed: [],
        verdict: "no_code_findings",
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
if findings.len() > MAX_VERIFY {
    log("Verifying first " + MAX_VERIFY.to_string() + " of " + findings.len().to_string());
}

let vjobs = [];
let idx = 0;
for f in to_verify {
    let issue_json = json_encode(f.issue);
    let file_json = json_encode(f.file);
    let vp = "";
    vp += "Adversarially verify this PlankMarket shipping finding. Repo root: " + root + ". ";
    vp += "Claimed file: " + file_json + ". Claimed issue: " + issue_json + ". ";
    vp += "Independently read the code/tests with read-only tools. ";
    vp += "real=true only with concrete evidence you inspected. Default real=false on ambiguity. ";
    vp += "severity blocker|high|medium|low if real. evidence must cite paths and observed behavior.";
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

phase("Report");
let blockers = 0;
let highs = 0;
for c in confirmed {
    if c.severity == "blocker" { blockers += 1; }
    if c.severity == "high" { highs += 1; }
}

let verdict = "pass_with_caution";
if blockers > 0 {
    verdict = "no_ship_shipping_blockers";
} else if highs > 0 {
    verdict = "hold_high_severity";
} else if confirmed.len() == 0 {
    verdict = "no_confirmed_code_findings";
}

let report = "";
report += "# PlankMarket Shipping Path Audit\n\n";
report += "## Verdict: `" + verdict + "`\n\n";
report += "- Confirmed findings: " + confirmed.len().to_string() + "\n";
report += "- Blockers: " + blockers.to_string() + "\n";
report += "- High: " + highs.to_string() + "\n\n";
report += "## Map\n" + map_summary + "\n\n";
if map_files.len() > 0 {
    report += "### Key files\n";
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
        report += "- **Evidence:** " + c.evidence + "\n\n";
    }
}
report += "## Still required for launch (provider-backed)\n";
report += "- Explicit PRIORITY1_DRY_RUN=true on preview; false only on production with ownership\n";
report += "- Live quote, book, tracking poll, cancel smoke on staging\n";
report += "- Confirm shipment events correctly unlock seller Connect transfer timing\n";
report += "- Run `npm run test:shipping` on the release candidate\n";

let path = write_scratch_file("shipping-path-audit.md", report);
complete(#{
    path: path,
    summary: verdict + " — " + confirmed.len().to_string() + " confirmed",
    confirmed_count: confirmed.len(),
    blockers: blockers,
    highs: highs,
    verdict: verdict,
    confirmed: confirmed,
});
