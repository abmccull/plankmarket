const MAX_REDIRECT_PATH_LENGTH = 2_048;
const MAX_DECODE_PASSES = 3;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/;
const VALIDATION_ORIGIN = "https://redirect-validation.invalid";

function isSameOriginRelativePath(candidate: string): boolean {
  if (
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    CONTROL_CHARACTER_PATTERN.test(candidate)
  ) {
    return false;
  }

  try {
    return new URL(candidate, VALIDATION_ORIGIN).origin === VALIDATION_ORIGIN;
  } catch {
    return false;
  }
}

/**
 * Accept only bounded, same-origin relative paths.
 *
 * The caller may already have decoded an outer query parameter. We inspect a
 * few additional decoded variants to catch encoded redirect tricks, but return
 * the original string so legitimate nested query data is never normalized.
 */
export function sanitizeRedirectPath(
  path: string | null | undefined,
  fallback: string | null = "/",
): string | null {
  if (!path || path.length > MAX_REDIRECT_PATH_LENGTH) return fallback;

  let candidate = path;
  for (let pass = 0; pass <= MAX_DECODE_PASSES; pass += 1) {
    if (!isSameOriginRelativePath(candidate)) return fallback;
    if (pass === MAX_DECODE_PASSES) break;

    let decoded: string;
    try {
      decoded = decodeURIComponent(candidate);
    } catch {
      return fallback;
    }

    if (decoded === candidate) break;
    candidate = decoded;
  }

  return path;
}
