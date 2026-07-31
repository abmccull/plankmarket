const PROTECTED_PATHS = ["/seller", "/buyer", "/admin"] as const;

/**
 * Match a complete route segment, not a string prefix. For example,
 * "/seller" owns "/seller/orders" but not the public "/sellers/:id" route.
 */
export function isPathWithin(pathname: string, routePrefix: string): boolean {
  return pathname === routePrefix || pathname.startsWith(`${routePrefix}/`);
}

export function isProtectedAppPath(pathname: string): boolean {
  return PROTECTED_PATHS.some((path) => isPathWithin(pathname, path));
}
