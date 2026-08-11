import { NextResponse } from "next/server";
import { buildCanonicalAppUrl } from "@/lib/auth/canonical-app-url";
import { sanitizeRedirectPath } from "@/lib/auth/safe-redirect";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = sanitizeRedirectPath(searchParams.get("next"), "/") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(buildCanonicalAppUrl(next));
    }
  }

  return NextResponse.redirect(
    buildCanonicalAppUrl("/login?error=auth_callback_failed"),
  );
}
