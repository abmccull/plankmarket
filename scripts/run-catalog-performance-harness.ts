import { writeFileSync } from "node:fs";
import {
  formatExplainSummary,
  formatScenarioCatalog,
  getCatalogHarnessScenarios,
  runExplainPlans,
  type HarnessScenarioKey,
} from "../src/server/perf/catalog-query-harness";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const scenarios = selectScenarios(args.scenarioKeys);

  if (args.listOnly) {
    const output = formatScenarioCatalog(scenarios);
    persistOutput(args.outFile, output);
    console.log(output);
    return;
  }

  if (!args.explain) {
    const output = [
      "Catalog performance harness is in print mode.",
      "Use --list to see scenarios or --explain with a local scratch DATABASE_URL to run EXPLAIN ANALYZE.",
      "",
      formatScenarioCatalog(scenarios),
    ].join("\n");
    persistOutput(args.outFile, output);
    console.log(output);
    return;
  }

  const databaseUrl = args.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "Missing DATABASE_URL. Set a local scratch database URL or pass --database-url.",
    );
  }

  const results = await runExplainPlans({
    databaseUrl,
    scenarios,
    statementTimeoutMs: args.statementTimeoutMs,
  });

  const payload = args.json
    ? JSON.stringify(results, null, 2)
    : formatExplainSummary(results);
  persistOutput(args.outFile, payload);
  console.log(payload);
}

function parseArgs(argv: readonly string[]) {
  const state: {
    explain: boolean;
    json: boolean;
    listOnly: boolean;
    databaseUrl?: string;
    outFile?: string;
    statementTimeoutMs?: number;
    scenarioKeys?: HarnessScenarioKey[];
  } = {
    explain: false,
    json: false,
    listOnly: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    switch (token) {
      case "--explain":
        state.explain = true;
        break;
      case "--json":
        state.json = true;
        break;
      case "--list":
        state.listOnly = true;
        break;
      case "--database-url":
        state.databaseUrl = readValue(argv, ++index, token);
        break;
      case "--out":
        state.outFile = readValue(argv, ++index, token);
        break;
      case "--statement-timeout-ms":
        state.statementTimeoutMs = Number.parseInt(
          readValue(argv, ++index, token),
          10,
        );
        if (!Number.isFinite(state.statementTimeoutMs)) {
          throw new Error(`Invalid number for ${token}.`);
        }
        break;
      case "--scenario":
        state.scenarioKeys = readValue(argv, ++index, token)
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean) as HarnessScenarioKey[];
        break;
      default:
        throw new Error(`Unknown argument: ${token}`);
    }
  }

  return state;
}

function readValue(
  argv: readonly string[],
  index: number,
  flag: string,
): string {
  const value = argv[index];
  if (!value) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return value;
}

function selectScenarios(
  scenarioKeys?: readonly HarnessScenarioKey[],
) {
  const allScenarios = getCatalogHarnessScenarios();
  if (!scenarioKeys?.length) return allScenarios;

  const selected = scenarioKeys.map((key) => {
    const scenario = allScenarios.find((candidate) => candidate.key === key);
    if (!scenario) {
      throw new Error(`Unknown scenario key "${key}". Run with --list to inspect available keys.`);
    }
    return scenario;
  });

  return selected;
}

function persistOutput(outFile: string | undefined, output: string) {
  if (!outFile) return;
  writeFileSync(outFile, output, "utf8");
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Catalog performance harness failed.",
  );
  process.exitCode = 1;
});
