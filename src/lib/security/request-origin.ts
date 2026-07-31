/**
 * Validate browser-originated, cookie-authenticated writes against the host
 * that actually received the request. Vercel supplies x-forwarded-host; local
 * development falls back to Host.
 */
export function isSameOriginWrite(request: Request): boolean {
  if (request.method === "GET" || request.method === "HEAD") {
    return true;
  }

  const origin = request.headers.get("origin");
  if (!origin) {
    return process.env.NODE_ENV !== "production";
  }

  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const requestHost = forwardedHost ?? request.headers.get("host")?.trim();
  if (!requestHost) return false;

  try {
    const originUrl = new URL(origin);
    if (process.env.NODE_ENV === "production" && originUrl.protocol !== "https:") {
      return false;
    }
    return originUrl.host === requestHost;
  } catch {
    return false;
  }
}
