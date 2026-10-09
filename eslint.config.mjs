import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "tmp/**",
    // Immutable audit artifacts copied for evidence, not application sources.
    "docs/journey-*/**",
    "docs/design-review-2026-09-29/excellence-*/provenance/**",
    "docs/design-review-2026-09-29/excellence-*/artifacts/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
