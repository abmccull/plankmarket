import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/env";
import { resolveRole } from "@/lib/supabase/roles";
import {
  isPathWithin,
  isProtectedAppPath,
} from "@/lib/supabase/middleware-paths";

const AUTH_PATHS = ["/login", "/register"] as const;
const ACCOUNT_RECOVERY_PATH = "/account-recovery";

function redirectWithSession(destination: URL, sessionResponse: NextResponse) {
  const response = NextResponse.redirect(destination);
  sessionResponse.cookies.getAll().forEach((cookie) => {
    response.cookies.set(cookie);
  });
  for (const header of ["cache-control", "expires", "pragma"] as const) {
    const value = sessionResponse.headers.get(header);
    if (value) response.headers.set(header, value);
  }
  return response;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, {
              ...options,
              sameSite: "lax",
              secure: process.env.NODE_ENV === "production",
            }),
          );
          Object.entries(headers).forEach(([name, value]) => {
            supabaseResponse.headers.set(name, value);
          });
        },
      },
    },
  );

  // Refresh session if expired
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Match only complete dashboard route segments. This keeps public routes such
  // as /seller-guide, /sellers/:id, and /administrator outside app protection.
  const pathname = request.nextUrl.pathname;

  const isProtected = isProtectedAppPath(pathname);
  const isAuthPage = AUTH_PATHS.some((path) => isPathWithin(pathname, path));
  const role = resolveRole(user);

  if (!user && pathname === ACCOUNT_RECOVERY_PATH) {
    return redirectWithSession(
      new URL("/login", request.url),
      supabaseResponse,
    );
  }

  // Auth identities without a server-controlled role must never fall through
  // to a buyer default or bounce between role dashboards.
  if (
    user &&
    !role &&
    pathname !== ACCOUNT_RECOVERY_PATH &&
    (isProtected || isAuthPage)
  ) {
    return redirectWithSession(
      new URL(ACCOUNT_RECOVERY_PATH, request.url),
      supabaseResponse,
    );
  }

  if (user && role && pathname === ACCOUNT_RECOVERY_PATH) {
    const dashboardPaths: Record<typeof role, string> = {
      buyer: "/buyer",
      seller: "/seller",
      admin: "/admin",
    };
    return redirectWithSession(
      new URL(dashboardPaths[role], request.url),
      supabaseResponse,
    );
  }

  // Redirect unauthenticated users from protected routes
  if (isProtected && !user) {
    const url = new URL("/login", request.url);
    url.searchParams.set("redirect", `${pathname}${request.nextUrl.search}`);
    return redirectWithSession(url, supabaseResponse);
  }

  // Redirect non-admin authenticated users away from admin routes
  if (isPathWithin(pathname, "/admin") && user) {
    if (role !== "admin") {
      const dashboardPaths: Record<string, string> = {
        buyer: "/buyer",
        seller: "/seller",
        admin: "/admin",
      };
      const fallbackPath = dashboardPaths[role ?? ""] ?? "/buyer";
      return redirectWithSession(
        new URL(fallbackPath, request.url),
        supabaseResponse,
      );
    }
  }

  // Admin can access any dashboard route without redirect
  if (role === "admin" && isProtected) {
    return supabaseResponse;
  }

  // Keep role-specific dashboards aligned with authenticated role.
  if (isPathWithin(pathname, "/seller") && user) {
    if (role !== "seller" && role !== "admin") {
      return redirectWithSession(
        new URL("/buyer", request.url),
        supabaseResponse,
      );
    }
  }

  if (isPathWithin(pathname, "/buyer") && user) {
    if (role !== "buyer" && role !== "admin") {
      return redirectWithSession(
        new URL("/seller", request.url),
        supabaseResponse,
      );
    }
  }

  // Redirect authenticated users away from auth pages (use role-aware path)
  if (isAuthPage && user) {
    const dashboardPaths: Record<string, string> = {
      buyer: "/buyer",
      seller: "/seller",
      admin: "/admin",
    };
    return redirectWithSession(
      new URL(dashboardPaths[role ?? ""] ?? "/buyer", request.url),
      supabaseResponse,
    );
  }

  return supabaseResponse;
}
