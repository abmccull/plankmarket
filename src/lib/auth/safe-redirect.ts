export function sanitizeRedirectPath(path: string | null | undefined, fallback: string | null = "/"): string | null {
  if (!path) return fallback;
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return fallback;
  }
  if (!decoded.startsWith("/") || decoded.startsWith("//") || decoded.includes("://") || decoded.includes("@") || decoded.startsWith("/\\")) return fallback;
  return decoded;
}
