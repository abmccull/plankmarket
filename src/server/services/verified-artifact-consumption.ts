export interface RedisCompareDeleteClient {
  eval(
    script: string,
    keys: string[],
    args: string[],
  ): Promise<unknown>;
}

/**
 * Runs every potentially failing business/provider check before atomically
 * consuming either cached artifact. A validation failure is intentionally
 * retryable with the same quote and booking snapshot.
 */
export async function validateThenCompareDeletePair<T>(params: {
  redisClient: RedisCompareDeleteClient;
  firstKey: string;
  firstExpectedValue: string;
  secondKey: string;
  secondExpectedValue: string;
  validate: () => Promise<T> | T;
}): Promise<{ consumed: boolean; validationResult: T }> {
  const validationResult = await params.validate();
  const consumed = await params.redisClient.eval(
    "if redis.call('get', KEYS[1]) == ARGV[1] and redis.call('get', KEYS[2]) == ARGV[2] then redis.call('del', KEYS[1]); redis.call('del', KEYS[2]); return 1 else return 0 end",
    [params.firstKey, params.secondKey],
    [params.firstExpectedValue, params.secondExpectedValue],
  );
  return {
    consumed: Number(consumed) === 1,
    validationResult,
  };
}
