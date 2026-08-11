let meta = #{
    name: "commercial-truth-audit",
    description: "Detect mismatches between PlankMarket fee/payout policy in code vs marketing, legal, emails, and README",
    when_to_use: "Before any public launch or pricing change; whenever fee, payout, verification, or escrow language is edited",
    phases: [
        #{ title: "Collect", detail: "authoritative policy vs public surfaces" },
        #{ title: "Compare", detail: "parallel surface mismatch scans" },
        #{ title: "Verify", detail: "adversarial confirmation of mismatches" },
        #{ title: "Report", detail: "commercial-truth verdict" },
    ],
};

let policy_schema = #{
    "type": "object",
    "required": ["buyer_fee", "seller_fee", "payout_model", "escrow_language_rule", "source_files", "summary"],
    "properties": #{
        "buyer_fee": #{ "type": "string" },
        "seller_fee": #{ "type": "string" },
        "payout_model": #{ "type": "string" },
        "escrow_language_rule": #{ "type": "string" },
        "source_files": #{
            "type": "array", "maxItems": 15,
            "items": #{ "type": "string" },
        },
        "summary": #{ "type": "string" },
    },
};

let findings_schema = #{
    "type": "object",
    "required": ["surface", "findings"],
    "properties": #{
        "surface": #{ "type": "string" },
        "findings": #{
            "type": "array", "maxItems": 10,
            "items": #{
                "type": "object",
                "required": ["severity", "file", "quoted_text", "conflicts_with", "issue"],
                "properties": #{
                    "severity": #{ "type": "string" },
                    "file": #{ "type": "string" },
                    "quoted_text": #{ "type": "string" },
                    "conflicts_with": #{ "type": "string" },
                    "issue": #{ "type": "string" },
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

const MAX_FINDINGS = 20;
const MAX_VERIFY = 14;

phase("Collect");
let collect_prompt = "";
collect_prompt += "Extract PlankMarket AUTHORITATIVE commercial policy from code and agent instructions. Repo root: " + root + ". ";
collect_prompt += "Use read-only tools. Read at minimum: src/lib/fees.ts, src/lib/public-commercial-copy.ts, src/lib/commercial-policy.ts if present, ";
collect_prompt += "AGENTS.md (payment model + high-risk), any fee constants, and docs that claim authority only if code confirms them. ";
collect_prompt += "Code and legal pages beat marketing and outdated docs. ";
collect_prompt += "Return buyer_fee and seller_fee as percentages currently enforced in code, payout_model description, ";
collect_prompt += "escrow_language_rule (must state not regulated escrow), source_files actually read, and summary. ";
collect_prompt += "If fees are 5%/5% say so explicitly; do not use historical 3%/2% unless that is still in code.";

let policy_r = agent(collect_prompt, #{
    label: "collect-policy",
    capability_mode: "read-only",
    output_schema: policy_schema,
});

let buyer_fee = "unknown";
let seller_fee = "unknown";
let payout_model = "unknown";
let escrow_rule = "unknown";
let policy_summary = "Policy collection failed.";
if policy_r != () && policy_r.success && policy_r.output != () {
    if policy_r.output.buyer_fee != () { buyer_fee = policy_r.output.buyer_fee; }
    if policy_r.output.seller_fee != () { seller_fee = policy_r.output.seller_fee; }
    if policy_r.output.payout_model != () { payout_model = policy_r.output.payout_model; }
    if policy_r.output.escrow_language_rule != () { escrow_rule = policy_r.output.escrow_language_rule; }
    if policy_r.output.summary != () { policy_summary = policy_r.output.summary; }
}
log("Policy: buyer=" + buyer_fee + " seller=" + seller_fee);

let policy_blob = "";
policy_blob += "buyer_fee=" + buyer_fee + "; seller_fee=" + seller_fee + "; payout_model=" + payout_model;
policy_blob += "; escrow_rule=" + escrow_rule + "; summary=" + policy_summary;

phase("Compare");
let surfaces = [
    "marketing_pages_home_pricing_how_it_works",
    "legal_terms_privacy_faq",
    "dashboard_and_checkout_ui_copy",
    "transactional_emails",
    "readme_and_docs_claims",
];

let compare_jobs = [];
for s in surfaces {
    let p = "";
    p += "Commercial-truth mismatch scan for PlankMarket. Repo root: " + root + ". Surface: " + s + ". ";
    p += "Authoritative policy (from code collection): " + policy_blob + ". ";
    p += "Use read-only tools. Search and read actual files for this surface (app marketing pages, emails, docs, components). ";
    p += "Flag any fee percentage, payout timing, verification promise, or escrow/fiduciary language that conflicts with policy. ";
    p += "Also flag historical 3% buyer / 2% seller if still present while code uses different rates. ";
    p += "For each mismatch: severity (blocker if public wrong fees/payout; high if legal/email wrong; medium otherwise), ";
    p += "file, quoted_text (short exact quote), conflicts_with (which policy field), issue (one sentence). ";
    p += "At most 10 findings. Empty list only after searching this surface thoroughly.";
    compare_jobs.push(#{
        prompt: p,
        label: "scan:" + s,
        capability_mode: "read-only",
        output_schema: findings_schema,
    });
}
let compare_results = parallel(compare_jobs);

let findings = [];
for r in compare_results {
    if r != () && r.success && r.output != () && r.output.findings != () {
        for f in r.output.findings {
            if findings.len() < MAX_FINDINGS {
                let surface = "";
                if r.output.surface != () { surface = r.output.surface; }
                findings.push(#{
                    surface: surface,
                    severity: f.severity,
                    file: f.file,
                    quoted_text: f.quoted_text,
                    conflicts_with: f.conflicts_with,
                    issue: f.issue,
                });
            }
        }
    }
}
if findings.len() >= MAX_FINDINGS {
    log("Capped findings at " + MAX_FINDINGS.to_string());
}
log("Collected " + findings.len().to_string() + " candidate mismatches");

if findings.len() == 0 {
    let empty_report = "";
    empty_report += "# PlankMarket Commercial Truth Audit\n\n";
    empty_report += "## Authoritative policy\n";
    empty_report += "- Buyer fee: " + buyer_fee + "\n";
    empty_report += "- Seller fee: " + seller_fee + "\n";
    empty_report += "- Payout model: " + payout_model + "\n";
    empty_report += "- Escrow rule: " + escrow_rule + "\n";
    empty_report += "- Summary: " + policy_summary + "\n\n";
    empty_report += "## Verdict\nNo candidate copy mismatches found in this pass.\n";
    empty_report += "Still manually spot-check live production pages vs this candidate before launch.\n";
    let path = write_scratch_file("commercial-truth-audit.md", empty_report);
    complete(#{
        path: path,
        summary: "No candidate commercial mismatches",
        confirmed: [],
        verdict: "no_code_findings",
        buyer_fee: buyer_fee,
        seller_fee: seller_fee,
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
    let quote_json = json_encode(f.quoted_text);
    let policy_json = json_encode(policy_blob);
    let vp = "";
    vp += "Adversarially verify this commercial-truth mismatch. Repo root: " + root + ". ";
    vp += "File: " + file_json + ". Quote: " + quote_json + ". Issue: " + issue_json + ". ";
    vp += "Authoritative policy: " + policy_json + ". ";
    vp += "Open the file and the policy source. real=true only if the quote exists and truly conflicts with code policy. ";
    vp += "Default real=false if the quote is outdated docs clearly marked historical, comments, or non-user-facing tests. ";
    vp += "Public marketing wrong fees/payout = blocker or high. evidence must include paths.";
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
                quoted_text: base.quoted_text,
                conflicts_with: base.conflicts_with,
                issue: base.issue,
                evidence: v.output.evidence,
            });
        }
    }
    i += 1;
}
log(confirmed.len().to_string() + "/" + to_verify.len().to_string() + " mismatches confirmed");

phase("Report");
let blockers = 0;
let highs = 0;
for c in confirmed {
    if c.severity == "blocker" { blockers += 1; }
    if c.severity == "high" { highs += 1; }
}

let verdict = "aligned";
if blockers > 0 {
    verdict = "no_ship_commercial_mismatch";
} else if highs > 0 {
    verdict = "hold_high_severity_mismatch";
} else if confirmed.len() > 0 {
    verdict = "minor_mismatches";
} else {
    verdict = "no_confirmed_mismatches";
}

let report = "";
report += "# PlankMarket Commercial Truth Audit\n\n";
report += "## Verdict: `" + verdict + "`\n\n";
report += "## Authoritative policy (from code)\n";
report += "- Buyer fee: **" + buyer_fee + "**\n";
report += "- Seller fee: **" + seller_fee + "**\n";
report += "- Payout model: " + payout_model + "\n";
report += "- Escrow language rule: " + escrow_rule + "\n";
report += "- Summary: " + policy_summary + "\n\n";
report += "## Confirmed mismatches\n\n";
if confirmed.len() == 0 {
    report += "_None survived verification._\n\n";
} else {
    for c in confirmed {
        report += "### [" + c.severity + "] " + c.issue + "\n";
        report += "- **File:** `" + c.file + "`\n";
        report += "- **Quoted:** " + c.quoted_text + "\n";
        report += "- **Conflicts with:** " + c.conflicts_with + "\n";
        report += "- **Evidence:** " + c.evidence + "\n\n";
    }
}
report += "## Launch rule\n";
report += "Do not promote production while public pages, pricing, terms, or emails disagree with `src/lib/fees.ts` and the payment-hold + Connect-transfer model.\n";

let path = write_scratch_file("commercial-truth-audit.md", report);
complete(#{
    path: path,
    summary: verdict + " — " + confirmed.len().to_string() + " confirmed",
    confirmed_count: confirmed.len(),
    blockers: blockers,
    highs: highs,
    verdict: verdict,
    buyer_fee: buyer_fee,
    seller_fee: seller_fee,
    confirmed: confirmed,
});
