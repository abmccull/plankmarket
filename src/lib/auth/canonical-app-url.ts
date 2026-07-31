const LOCAL_APP_ORIGIN = "http://localhost:3000";

/**
 * Build security-sensitive callback URLs from deployment configuration rather
 * than the request/browser Host value, which can be attacker-controlled.
 */
export function buildCanonicalAppUrl(
  path: string,
  configuredOrigin = process.env.NEXT_PUBLIC_APP_URL,
): string {
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\")
  ) {
    throw new Error("Canonical app URLs require a same-origin absolute path");
  }

  const normalizedOrigin = configuredOrigin?.trim() || null;
  const originValue =
    normalizedOrigin ??
    (process.env.NODE_ENV === "production" ? null : LOCAL_APP_ORIGIN);
  if (!originValue) {
    throw new Error("NEXT_PUBLIC_APP_URL is required in production");
  }

  const origin = new URL(originValue);
  if (
    (origin.protocol !== "https:" &&
      !(process.env.NODE_ENV !== "production" && origin.protocol === "http:")) ||
    origin.username ||
    origin.password
  ) {
    throw new Error("NEXT_PUBLIC_APP_URL must be a trusted application origin");
  }

  return new URL(path, `${origin.origin}/`).toString();
}
