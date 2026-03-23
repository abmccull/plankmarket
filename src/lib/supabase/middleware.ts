import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/env";

type AppRole = "buyer" | "seller" | "admin";

function resolveRole(user: { app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> } | null): AppRole | null {
  if (!user) return null;
  const fromAppMeta = user.app_metadata?.role;
  const fromUserMeta = user.user_metadata?.role;
  const role = typeof fromAppMeta === "string" ? fromAppMeta : typeof fromUserMeta === "string" ? fromUserMeta : null;
  return role === "buyer" || role === "seller" || role === "admin" ? role : null;
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
  const authPaths = ["/login", "/register"];
  const pathname = request.nextUrl.pathname;

  // Match only exact dashboard segments: /seller, /seller/*, /buyer, /buyer/*, /admin, /admin/*
  // Do NOT match hyphenated marketing pages like /seller-guide
  const firstSegment = pathname.split("/")[1];
  const isProtected = firstSegment === "seller" || firstSegment === "buyer" || firstSegment === "admin";
  const isAuthPage = authPaths.some((p) => pathname.startsWith(p));
  const role = resolveRole(user);

  // Redirect unauthenticated users from protected routes
  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // Redirect non-admin authenticated users away from admin routes
  if (firstSegment === "admin" && user) {
    if (role && role !== "admin") {
      const dashboardPaths: Record<string, string> = {
        buyer: "/buyer",
        seller: "/seller",
        admin: "/admin",
      };
      const fallbackPath = dashboardPaths[role ?? ""] ?? "/buyer";
      return NextResponse.redirect(new URL(fallbackPath, request.url));
    }
  }

  // Admin can access any dashboard route without redirect
  if (role === "admin") {
    return supabaseResponse;
  }

  // Keep role-specific dashboards aligned with authenticated role.
  if (firstSegment === "seller" && user) {
    if (role === "buyer") {
      return NextResponse.redirect(new URL("/buyer", request.url));
    }
  }

  if (firstSegment === "buyer" && user) {
    if (role === "seller") {
      return NextResponse.redirect(new URL("/seller", request.url));
    }
  }

  // Redirect authenticated users away from auth pages (use role-aware path)
  if (isAuthPage && user) {
    const url = request.nextUrl.clone();
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
