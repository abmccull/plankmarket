export function sanitizeRedirectPath(path: string | null | undefined, fallback: string | null = "/"): string | null {
  if (!path) return fallback;
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("://") || path.includes("@") || path.startsWith("/\\")) return fallback;
  return path;
}
