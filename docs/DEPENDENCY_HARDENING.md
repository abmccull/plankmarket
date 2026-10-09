# Temporary braces depth hardening

The root development graph and pinned Vercel CLI graph use the exact npm alias
`braces: npm:@dieub/braces-depth-guard@3.0.3-pn.3`. This is a reviewed derivative,
not an official upstream release. Both lockfiles retain the registry integrity.

Upstream braces 3.0.3 is affected by
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
The derivative preserves the upstream API and MIT attribution, limits parsing
and recursive AST traversal to 100 nesting levels, and detects parent cycles.
Previously accepted deeper patterns intentionally fail with controlled errors.
This addresses the reported recursion defect; it does not promise a total
expansion-size budget or support hostile object getters.

The published artifact's registry signatures and attestation were verified with
`npm audit signatures` in an isolated install. Its ten files byte-match the
attested source commit `305a2e4bfe324bb53c336c1b03387ee1251c926f` in
[dieub/braces-depth-guard](https://github.com/dieub/braces-depth-guard).
Tarball integrity:

```text
sha512-QY+Uq4s42STyIMPoRkBuUZfYyvz0uZuwuUburLwMx5N+lWqnHHaBxcKPtgKVKjTyFnS1q4ivKu9Wxi4VG7FE9Q==
```

Before adoption, a constrained-stack subprocess reproduced upstream recursion
exhaustion and the derivative rejected the same 6,001-character input at depth
101. A separate comparison preserved 588 ordinary, escaped and malformed
pattern results. These observations complement source review; a package rename
or absence of an advisory match alone is not security acceptance.

`npm run test:dependency-guards` checks both consumer graphs, every locked braces
instance, exact integrity, ordinary glob expansion, depth boundaries, direct
AST traversal, fractional/negative option limits, length bypass and parent
cycles. Preview and production CI run it alongside the unchanged full audit.

The repository maintainer owns this temporary override. Do not track a floating
tag or automatically adopt a new fork version. Review artifact provenance,
source changes and compatibility for each update. Replace both aliases with an
official upstream fix when available, update the guard check to its reviewed
identity and integrity, and retain the behavioral regression cases. Rollback
must preserve remediation of the recursion defect; reverting to vulnerable
3.0.3 is not a safe release rollback.
