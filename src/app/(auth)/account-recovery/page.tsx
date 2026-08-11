"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Loader2, LogOut, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";

export default function AccountRecoveryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const reason = searchParams.get("reason");
  const isMfaRecovery = reason === "mfa";

  const handleSignOut = async () => {
    setIsSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          {isMfaRecovery ? (
            <ShieldAlert className="h-5 w-5" aria-hidden="true" />
          ) : (
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          )}
        </div>
        <CardTitle>
          {isMfaRecovery
            ? "Authenticator recovery needs attention"
            : "Account setup needs attention"}
        </CardTitle>
        <CardDescription>
          {isMfaRecovery
            ? "We cannot bypass MFA in-app. Sign out, then contact support from your account email if you lost the authenticator tied to this account."
            : "Your sign-in is valid, but the marketplace profile was not completed. For security, we did not guess an account role."}
        </CardDescription>
      </CardHeader>
      <CardContent className="text-center text-sm text-muted-foreground">
        {isMfaRecovery ? (
          <>
            Sign out on this device, then contact{" "}
            <Link
              href="mailto:support@plankmarket.com"
              className="font-medium text-foreground underline underline-offset-4"
            >
              support@plankmarket.com
            </Link>{" "}
            if you need your access reviewed.
          </>
        ) : (
          <>
            Sign out and try registration again. If the issue continues, contact{" "}
            <Link
              href="mailto:support@plankmarket.com"
              className="font-medium text-foreground underline underline-offset-4"
            >
              support@plankmarket.com
            </Link>
            .
          </>
        )}
      </CardContent>
      <CardFooter>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={isSigningOut}
          onClick={handleSignOut}
        >
          {isSigningOut ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          Sign out
        </Button>
      </CardFooter>
    </Card>
  );
}
