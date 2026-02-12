"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registerSchema, type RegisterInput } from "@/lib/validators/auth";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Store, ShoppingBag } from "lucide-react";

function RegisterForm() {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultRole = searchParams.get("role") === "seller" ? "seller" : "buyer";

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
  const registerMutation = trpc.auth.register.useMutation();

  const onSubmit = async (data: RegisterInput) => {
    setIsLoading(true);
    try {
      const result = await registerMutation.mutateAsync(data);

      if (result.requiresVerification) {
        toast.success("Account created! Please check your email to verify.");
        router.push("/verify");
      } else {
        toast.success("Account created successfully!");
        router.push(data.role === "seller" ? "/seller" : "/buyer");
        router.refresh();
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Registration failed";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Create Your Account</CardTitle>
        <CardDescription>
          Join PlankMarket and start trading flooring inventory
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4">
          {/* Role Selection */}
          <div className="space-y-2">
            <Label>I want to</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setValue("role", "buyer")}
                className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors ${
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
                className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors ${
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
              placeholder="John Doe"
              {...register("name")}
              aria-describedby={errors.name ? "name-error" : undefined}
              aria-invalid={!!errors.name}
            />
            {errors.name && (
              <p id="name-error" className="text-sm text-destructive">
                {errors.name.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="businessName">Business Name</Label>
            <Input
              id="businessName"
              placeholder="Acme Flooring Co."
              {...register("businessName")}
              aria-describedby={errors.businessName ? "businessName-error" : undefined}
              aria-invalid={!!errors.businessName}
            />
            {errors.businessName && (
              <p id="businessName-error" className="text-sm text-destructive">
                {errors.businessName.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Business Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@company.com"
              {...register("email")}
              aria-describedby={errors.email ? "email-error" : undefined}
              aria-invalid={!!errors.email}
            />
            {errors.email && (
              <p id="email-error" className="text-sm text-destructive">
                {errors.email.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone (optional)</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="(555) 123-4567"
              {...register("phone")}
              aria-describedby={errors.phone ? "phone-error" : undefined}
              aria-invalid={!!errors.phone}
            />
            {errors.phone && (
              <p id="phone-error" className="text-sm text-destructive">
                {errors.phone.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="zipCode">ZIP Code</Label>
            <Input
              id="zipCode"
              placeholder="75001"
              maxLength={5}
              {...register("zipCode")}
              aria-describedby={errors.zipCode ? "zipCode-error" : "zipCode-hint"}
              aria-invalid={!!errors.zipCode}
            />
            {!errors.zipCode && (
              <p id="zipCode-hint" className="text-sm text-muted-foreground">
                Used to show inventory near you
              </p>
            )}
            {errors.zipCode && (
              <p id="zipCode-error" className="text-sm text-destructive">
                {errors.zipCode.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              {...register("password")}
              aria-describedby={errors.password ? "password-error" : "password-hint"}
              aria-invalid={!!errors.password}
            />
            {!errors.password && (
              <p id="password-hint" className="text-sm text-muted-foreground">
                Minimum 8 characters
              </p>
            )}
            {errors.password && (
              <p id="password-error" className="text-sm text-destructive">
                {errors.password.message}
              </p>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Account
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            By creating an account, you agree to our{" "}
            <Link href="/terms" className="text-primary hover:underline">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="text-primary hover:underline">
              Privacy Policy
            </Link>
          </p>
          <p className="text-sm text-muted-foreground text-center">
            Already have an account?{" "}
            <Link href="/login" className="text-primary hover:underline">
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
