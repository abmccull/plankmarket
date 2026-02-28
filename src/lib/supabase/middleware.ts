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
            supabaseResponse.cookies.set(name, value, {
              ...options,
              maxAge: 60 * 60 * 24 * 7, // 7 days
              sameSite: "lax",
              secure: process.env.NODE_ENV === "production",
            })
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

  // Redirect non-admin authenticated users away from admin routes
  if (pathname.startsWith("/admin") && user) {
    const role = user.app_metadata?.role as string | undefined;
    if (role !== "admin") {
      const dashboardPaths: Record<string, string> = {
        buyer: "/buyer",
        seller: "/seller",
        admin: "/admin",
      };
      const fallbackPath = dashboardPaths[role ?? ""] ?? "/buyer";
      return NextResponse.redirect(new URL(fallbackPath, request.url));
    }
  }

  // Keep role-specific dashboards aligned with authenticated role.
  if (pathname.startsWith("/seller") && user) {
    const role = user.app_metadata?.role as string | undefined;
    if (role !== "seller" && role !== "admin") {
      return NextResponse.redirect(new URL("/buyer", request.url));
    }
  }

  if (pathname.startsWith("/buyer") && user) {
    const role = user.app_metadata?.role as string | undefined;
    if (role !== "buyer" && role !== "admin") {
      return NextResponse.redirect(new URL("/seller", request.url));
    }
  }

  // Redirect authenticated users away from auth pages (use role-aware path)
  if (isAuthPage && user) {
    const url = request.nextUrl.clone();
    const role = user.app_metadata?.role as string | undefined;
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
