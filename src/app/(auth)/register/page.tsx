"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/lib/stores/auth-store";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registerSchema, type RegisterInput } from "@/lib/validators/auth";
import { trpc } from "@/lib/trpc/client";
import { sanitizeRedirectPath } from "@/lib/auth/safe-redirect";
import { buyerVerificationHref, getBuyerContinuation } from "@/lib/auth/buyer-continuation";
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
import { toast } from "sonner";
import { Loader2, Store, ShoppingBag } from "lucide-react";

function RegisterForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultRole = searchParams.get("role") === "seller" ? "seller" : "buyer";
  const redirect = sanitizeRedirectPath(searchParams.get("redirect"), null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      role: defaultRole as "buyer" | "seller",
    },
  });

  const selectedRole = watch("role");
  const loginParams = new URLSearchParams({ role: selectedRole });
  if (redirect) loginParams.set("redirect", redirect);
  const loginHref = `/login?${loginParams.toString()}`;
  const registerMutation = trpc.auth.register.useMutation();

  const active = useRef(false);
  const generation = useRef(0);
  const submitting = useRef(false);
  useEffect(() => {
    active.current = true;
    const unsubscribe = useAuthStore.subscribe((next, previous) => {
      if (previous.user && next.user?.id !== previous.user.id) generation.current += 1;
    });
    return () => { active.current = false; generation.current += 1; unsubscribe(); };
  }, [redirect, defaultRole]);
  const current = (attempt: number) => active.current && attempt === generation.current;
  const onSubmit = async (data: RegisterInput) => {
    if (submitting.current) return;
    submitting.current = true;
    const attempt = ++generation.current;
    setIsLoading(true); setProblem(null);
    try {
      const result = await registerMutation.mutateAsync(data);
      if (!current(attempt)) return;
      const liveUser = useAuthStore.getState().user;
      if (liveUser && liveUser.id !== result.user?.id) { setProblem("Your account changed while registration was completing. Sign in to continue with the intended account."); return; }
      toast.success("Account created. Business verification is the next step.");
      const needsBuyerVerification = data.role === "buyer" && (!redirect || getBuyerContinuation(redirect)?.isCheckout);
      router.push(needsBuyerVerification
        ? buyerVerificationHref(redirect)
        : redirect ?? (data.role === "seller" ? "/seller" : "/buyer"));
      router.refresh();
    } catch (error: unknown) {
      if (!current(attempt)) return;
      const message =
        error instanceof Error ? error.message : "Registration failed";
      setProblem(message);
    } finally {
      submitting.current = false;
      if (active.current) setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-lg">
      <CardHeader className="pb-4 text-left">
        <p className="text-xs font-medium text-muted-foreground">Step 1 of 2 · Account</p>
        <h1 className="text-2xl font-semibold leading-none tracking-tight">
          {selectedRole === "seller" ? "Create your seller account" : "Create your buyer account"}
        </h1>
        <CardDescription>
          {selectedRole === "seller"
            ? "Verify your business before publishing."
            : "Verify your business before buying."}
        </CardDescription>
      </CardHeader>
      <form method="post" onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4">
          {problem && <p role="alert" className="text-sm text-destructive">{problem} Your entered details are kept on this page.</p>}
          <fieldset disabled={isLoading} className="space-y-4">
          <div role="group" aria-label="Account purpose">
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setValue("role", "buyer")}
                aria-pressed={selectedRole === "buyer"}
                className={`flex items-center justify-center gap-2 rounded-lg border-2 p-3 transition-colors ${
                  selectedRole === "buyer"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <ShoppingBag
                  className={`h-6 w-6 ${
                    selectedRole === "buyer"
                      ? "text-primary"
                      : "text-muted-foreground"
                  }`}
                />
                <span className="text-sm font-medium">Buy Flooring</span>
              </button>
              <button
                type="button"
                onClick={() => setValue("role", "seller")}
                aria-pressed={selectedRole === "seller"}
                className={`flex items-center justify-center gap-2 rounded-lg border-2 p-3 transition-colors ${
                  selectedRole === "seller"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <Store
                  className={`h-6 w-6 ${
                    selectedRole === "seller"
                      ? "text-primary"
                      : "text-muted-foreground"
                  }`}
                />
                <span className="text-sm font-medium">Sell Flooring</span>
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              autoComplete="name"
              placeholder="John Doe"
              {...register("name")}
              aria-describedby={errors.name ? "name-error" : undefined}
              aria-invalid={!!errors.name}
            />
            {errors.name && (
              <p
                id="name-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {errors.name.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="businessName">Business Name</Label>
            <Input
              id="businessName"
              autoComplete="organization"
              placeholder="Acme Flooring Co."
              {...register("businessName")}
              aria-describedby={errors.businessName ? "businessName-error" : undefined}
              aria-invalid={!!errors.businessName}
            />
            {errors.businessName && (
              <p
                id="businessName-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {errors.businessName.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Business Email</Label>
            <Input
              id="email"
              autoComplete="email"
              type="email"
              placeholder="you@company.com"
              {...register("email")}
              aria-describedby={errors.email ? "email-error" : undefined}
              aria-invalid={!!errors.email}
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

          <div className="space-y-2">
            <Label htmlFor="phone">Phone (optional)</Label>
            <Input
              id="phone"
              autoComplete="tel"
              type="tel"
              placeholder="(555) 123-4567"
              {...register("phone")}
              aria-describedby={errors.phone ? "phone-error" : undefined}
              aria-invalid={!!errors.phone}
            />
            {errors.phone && (
              <p
                id="phone-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {errors.phone.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="zipCode">ZIP Code</Label>
            <Input
              id="zipCode"
              autoComplete="postal-code"
              placeholder="75001"
              inputMode="numeric"
              maxLength={5}
              {...register("zipCode")}
              aria-describedby={errors.zipCode ? "zipCode-error" : undefined}
              aria-invalid={!!errors.zipCode}
            />
            {errors.zipCode && (
              <p
                id="zipCode-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {errors.zipCode.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              autoComplete="new-password"
              type={showPassword ? "text" : "password"}
              {...register("password")}
              aria-describedby={errors.password ? "password-error" : "password-hint"}
              aria-invalid={!!errors.password}
            />
            <Button type="button" variant="ghost" size="sm" aria-controls="password" aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? "Hide password" : "Show password"}</Button>
            {!errors.password && (
              <p id="password-hint" className="text-sm text-muted-foreground">
                Minimum 8 characters
              </p>
            )}
            {errors.password && (
              <p
                id="password-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {errors.password.message}
              </p>
            )}
          </div>
          </fieldset>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {selectedRole === "seller" ? "Create Seller Account" : "Create Buyer Account"}
          </Button>
          <div className="space-y-2 text-xs leading-relaxed text-muted-foreground">
            <p>No EIN or documents needed here. Add them during business verification, where you can save and return later.</p>
            <p>{selectedRole === "seller"
              ? "Free listings. Completed sales have a 5% seller fee plus inventory-only processing."
              : "5% buyer fee on completed purchases. Freight is quoted before payment."}</p>
          </div>
          <p className="text-xs text-center text-muted-foreground">
            By creating an account, you agree to our{" "}
            <Link href="/terms" className="text-primary underline underline-offset-2 hover:text-primary/80">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="text-primary underline underline-offset-2 hover:text-primary/80">
              Privacy Policy
            </Link>
          </p>
          <p className="text-sm text-muted-foreground text-center">
            Already have an account?{" "}
            <Link href={loginHref} className="text-primary underline underline-offset-2 hover:text-primary/80">
              Sign in
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<p role="status">Loading account creation…</p>}>
      <RegisterForm />
    </Suspense>
  );
}
