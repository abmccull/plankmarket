const LOCAL_NODE_ENVS = new Set(["development", "test"]);

export const DEFAULT_LOCAL_DATABASE_POOL_MAX = 5;
export const DEFAULT_DEPLOYED_DATABASE_POOL_MAX = 1;
export const MAX_DEPLOYED_DATABASE_POOL_MAX = 4;
export const MAX_DATABASE_POOL_MAX = 10;
export const DATABASE_CONNECT_TIMEOUT_SECONDS = 10;
export const DATABASE_STATEMENT_TIMEOUT_MS = 20_000;

export function resolveDatabasePoolMax(
  configuredPoolMax: number | undefined,
  nodeEnv: string | undefined,
): number {
  if (configuredPoolMax !== undefined) {
    return configuredPoolMax;
  }

  return LOCAL_NODE_ENVS.has(nodeEnv ?? "")
    ? DEFAULT_LOCAL_DATABASE_POOL_MAX
    : DEFAULT_DEPLOYED_DATABASE_POOL_MAX;
}
