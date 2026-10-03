"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Loader2, ArrowLeft } from "lucide-react";
import { buildCanonicalAppUrl } from "@/lib/auth/canonical-app-url";

const forgotPasswordSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});
type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
const requestProblem =
  "We could not confirm your reset request. Check your inbox before requesting another link, or correct the email address and try again.";

export default function ForgotPasswordPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const active = useRef(false);
  const generation = useRef(0);
  const pending = useRef(false);
  const focusOnCorrection = useRef(false);
  const {
    register,
    handleSubmit,
    setFocus,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  useEffect(() => {
    active.current = true;
    setIsMounted(true);
    return () => {
      active.current = false;
      generation.current += 1;
    };
  }, []);
  useEffect(() => {
    if (submittedEmail === null && focusOnCorrection.current) {
      focusOnCorrection.current = false;
      setFocus("email");
    }
  }, [submittedEmail, setFocus]);

  const onSubmit = async (data: ForgotPasswordInput) => {
    if (pending.current) return;
    pending.current = true;
    const attempt = ++generation.current;
    const email = data.email.trim();
    setIsLoading(true);
    setProblem(null);
    try {
      const { error } = await createClient().auth.resetPasswordForEmail(email, {
        redirectTo: buildCanonicalAppUrl("/reset-password"),
      });
      if (!active.current || generation.current !== attempt) return;
      if (error) {
        setProblem(requestProblem);
        return;
      }
      setSubmittedEmail(email);
    } catch {
      if (active.current && generation.current === attempt)
        setProblem(requestProblem);
    } finally {
      pending.current = false;
      if (active.current && generation.current === attempt) setIsLoading(false);
    }
  };

  if (submittedEmail !== null) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="p-[min(1.5rem,24px)] text-center">
          <h1 className="text-2xl font-semibold leading-none tracking-tight">
            Check your email
          </h1>
          <CardDescription>
            If an account uses{" "}
            <span className="break-all font-medium text-foreground">
              {submittedEmail}
            </span>
            , a password reset link has been requested. Check your inbox and
            spam folder.
          </CardDescription>
        </CardHeader>
        <CardFooter className="flex flex-col gap-4 p-[min(1.5rem,24px)] pt-0">
          <Button
            type="button"
            variant="outline"
            className="h-auto min-h-11 w-full whitespace-normal"
            onClick={() => {
              focusOnCorrection.current = true;
              setSubmittedEmail(null);
              setProblem(null);
            }}
          >
            Use another email
          </Button>
          <Button
            asChild
            variant="ghost"
            className="h-auto min-h-11 w-full whitespace-normal"
          >
            <Link href="/login">
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
              Back to sign in
            </Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="p-[min(1.5rem,24px)] text-center">
        <h1 className="text-2xl font-semibold leading-none tracking-tight">
          Reset your password
        </h1>
        <CardDescription>
          Enter the email address for your account to request a password reset
          link.
        </CardDescription>
      </CardHeader>
      <form method="post" noValidate onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4 p-[min(1.5rem,24px)] pt-0">
          {problem && (
            <p
              id="reset-request-problem"
              role="alert"
              className="text-sm text-destructive"
            >
              {problem}
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              disabled={!isMounted || isLoading}
              {...register("email")}
              aria-invalid={!!errors.email}
              aria-describedby={
                [
                  errors.email ? "email-error" : null,
                  problem ? "reset-request-problem" : null,
                ]
                  .filter(Boolean)
                  .join(" ") || undefined
              }
            />
            {errors.email && (
              <p
                id="email-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {errors.email.message}
              </p>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4 p-[min(1.5rem,24px)] pt-0">
          <Button
            type="submit"
            className="h-auto min-h-11 w-full whitespace-normal"
            disabled={!isMounted || isLoading}
          >
            {isLoading && (
              <Loader2
                className="mr-2 h-4 w-4 animate-spin"
                aria-hidden="true"
              />
            )}
            Request reset link
          </Button>
          <Button
            asChild
            variant="ghost"
            className="h-auto min-h-11 w-full whitespace-normal"
          >
            <Link href="/login">
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
              Back to sign in
            </Link>
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
