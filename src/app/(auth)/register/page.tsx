"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registerSchema, type RegisterInput } from "@/lib/validators/auth";
import { trpc } from "@/lib/trpc/client";
import { sanitizeRedirectPath } from "@/lib/auth/safe-redirect";
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

  const onSubmit = async (data: RegisterInput) => {
    setIsLoading(true);
    try {
      await registerMutation.mutateAsync(data);
      toast.success("Account created. Business verification is the next step.");
      router.push(redirect ?? (data.role === "seller" ? "/seller" : "/buyer"));
      router.refresh();
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Registration failed";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-lg">
      <CardHeader className="text-center">
        <div className="mb-2 flex items-center justify-center gap-2 text-sm font-medium text-primary">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">1</span>
          Create your account
          <span className="text-muted-foreground">of 2</span>
        </div>
        <h1 className="text-2xl font-semibold leading-none tracking-tight">
          {selectedRole === "seller" ? "Create Your Seller Account" : "Create Your Buyer Account"}
        </h1>
        <CardDescription>
          {selectedRole === "seller"
            ? "Start with basic account details. Listing is free; the 5% seller fee and inventory-only processing apply only on completed sales after verification."
            : "Start browsing immediately. The 5% buyer fee applies only when a purchase is completed, and the selected freight quote is shown before payment."}
        </CardDescription>
        <p className="mt-3 text-sm text-muted-foreground">Next: verify your business. You can save your progress and return later.</p>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>I want to</Label>
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
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {selectedRole === "seller" ? "Create Seller Account" : "Create Buyer Account"}
          </Button>
          <div className="rounded-lg border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
            We do not ask for an EIN or supporting document during account
            creation. Those details are entered later in the secure,
            server-saved verification flow. If verified business identity
            details are changed later, the account returns to review.
            Marketplace fees are disclosed separately before protected
            transactions are completed.
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
    <Suspense fallback={<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />}>
      <RegisterForm />
    </Suspense>
  );
}
