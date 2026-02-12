"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { Mail, Loader2 } from "lucide-react";

const COOLDOWN_SECONDS = 60;

export default function VerifyPage() {
  const [isResending, setIsResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.email) {
        setUserEmail(user.email);
      }
    };
    fetchUser();
  }, []);

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  const handleResend = async () => {
    if (!userEmail) {
      toast.error("No email found. Please log in again.");
      return;
    }

    setIsResending(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: userEmail,
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success("Verification email sent! Check your inbox.");
      setCooldown(COOLDOWN_SECONDS);
    } catch {
      toast.error("Failed to resend verification email");
    } finally {
      setIsResending(false);
    }
  };

  return (
    <Card className="w-full max-w-md text-center">
      <CardHeader>
        <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <Mail className="h-8 w-8 text-primary" />
        </div>
        <CardTitle className="text-2xl">Verify Your Email</CardTitle>
        <CardDescription>
          We have sent a verification link to your email address. Please check
          your inbox and click the link to verify your account and get started.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Did not receive the email? Check your spam folder.
        </p>
        <Button
          variant="outline"
          className="w-full"
          onClick={handleResend}
          disabled={isResending || cooldown > 0}
        >
          {isResending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {cooldown > 0
            ? `Resend in ${cooldown}s`
            : "Resend Verification Email"}
        </Button>
        <div className="pt-4 border-t space-y-2">
          <p className="text-sm text-muted-foreground">Need help?</p>
          <a
            href="mailto:support@plankmarket.com"
            className="text-sm text-primary hover:underline"
          >
            Contact support
          </a>
        </div>
        <Link href="/login" className="block">
          <Button variant="ghost" className="w-full">
            Back to Login
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
