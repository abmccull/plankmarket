/** Reject corrupt/out-of-range aggregate values instead of displaying guessed money. */
export function aggregateCentsToDollars(value: string): number {
  if (!/^-?\d+$/.test(value)) throw new Error("Invalid financial aggregate");
  const cents = Number(value);
  if (!Number.isSafeInteger(cents)) throw new Error("Financial aggregate exceeds safe display range");
  return cents / 100;
}
