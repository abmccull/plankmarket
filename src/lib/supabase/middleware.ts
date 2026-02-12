import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/env";

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
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session if expired
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Define protected routes
  const protectedPaths = ["/seller", "/buyer", "/admin"];
  const authPaths = ["/login", "/register"];
  const pathname = request.nextUrl.pathname;

  const isProtected = protectedPaths.some((p) => pathname.startsWith(p));
  const isAuthPage = authPaths.some((p) => pathname.startsWith(p));

  // Redirect unauthenticated users from protected routes
  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // Role-based path protection (H13 + H14):
  // Enforce that users can only access dashboard paths matching their role
  if (isProtected && user) {
    const role = user.user_metadata?.role as string | undefined;
    const rolePaths: Record<string, string> = {
      buyer: "/buyer",
      seller: "/seller",
      admin: "/admin",
    };

    // Admin can access all paths
    if (role !== "admin") {
      const allowedPath = rolePaths[role ?? ""];
      if (allowedPath && !pathname.startsWith(allowedPath)) {
        const url = request.nextUrl.clone();
        url.pathname = allowedPath;
        return NextResponse.redirect(url);
      }
    }
  }

  // Redirect authenticated users away from auth pages (use role-aware path)
  if (isAuthPage && user) {
    const url = request.nextUrl.clone();
    const role = user.user_metadata?.role as string | undefined;
    const dashboardPaths: Record<string, string> = {
      buyer: "/buyer",
      seller: "/seller",
      admin: "/admin",
    };
    url.pathname = dashboardPaths[role ?? ""] ?? "/buyer";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
