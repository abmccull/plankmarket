export type AppRole = "buyer" | "seller" | "admin";

/**
 * Supabase user_metadata is user-editable and must never influence role-based
 * access decisions. Only server-controlled app_metadata is accepted here.
 */
export function resolveRole(
  user: { app_metadata?: Record<string, unknown> } | null,
): AppRole | null {
  if (!user) return null;
  const role = user.app_metadata?.role;
  return role === "buyer" || role === "seller" || role === "admin"
    ? role
    : null;
}
