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
import { Loader2, Store, ShoppingBag, ArrowLeft } from "lucide-react";

function RegisterForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultRole = searchParams.get("role") === "seller" ? "seller" : "buyer";

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    trigger,
    formState: { errors },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      role: defaultRole as "buyer" | "seller",
    },
  });

  const selectedRole = watch("role");
  const registerMutation = trpc.auth.register.useMutation();

  const handleContinue = async () => {
    // Validate step 1 fields before advancing
    const step1Fields: (keyof RegisterInput)[] = [
      "role",
      "name",
      "businessName",
      "email",
      "phone",
      "zipCode",
      "password",
    ];
    const isValid = await trigger(step1Fields);
    if (isValid) {
      setStep(2);
    }
  };

  const onSubmit = async (data: RegisterInput) => {
    setIsLoading(true);
    try {
      await registerMutation.mutateAsync(data);

      // All accounts now go through verification
      toast.success("Account created! Your business verification is being reviewed.");
      router.push(data.role === "seller" ? "/seller" : "/buyer");
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
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="mb-2 text-sm text-muted-foreground">
          Step {step} of 2
        </div>
        <CardTitle className="text-2xl">
          {step === 1 ? "Create Your Account" : "Business Verification"}
        </CardTitle>
        <CardDescription>
          {step === 1
            ? "Join PlankMarket and start trading flooring inventory"
            : "Verify your business to complete registration"}
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4">
          {step === 1 && (
            <>
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
            </>
          )}

          {step === 2 && (
            <>
              <div className="space-y-2">
                <Label htmlFor="einTaxId">EIN / Tax ID</Label>
                <Input
                  id="einTaxId"
                  placeholder="12-3456789"
                  {...register("einTaxId")}
                  aria-describedby={errors.einTaxId ? "einTaxId-error" : undefined}
                  aria-invalid={!!errors.einTaxId}
                />
                {errors.einTaxId && (
                  <p id="einTaxId-error" className="text-sm text-destructive">
                    {errors.einTaxId.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="businessWebsite">Business Website</Label>
                <Input
                  id="businessWebsite"
                  type="url"
                  placeholder="https://yourcompany.com"
                  {...register("businessWebsite")}
                  aria-describedby={errors.businessWebsite ? "businessWebsite-error" : undefined}
                  aria-invalid={!!errors.businessWebsite}
                />
                {errors.businessWebsite && (
                  <p id="businessWebsite-error" className="text-sm text-destructive">
                    {errors.businessWebsite.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="verificationDocUrl">Business License Upload</Label>
                <Input
                  id="verificationDocUrl"
                  type="url"
                  placeholder="Upload URL from your business license"
                  {...register("verificationDocUrl")}
                  aria-describedby={errors.verificationDocUrl ? "verificationDocUrl-error" : "verificationDocUrl-hint"}
                  aria-invalid={!!errors.verificationDocUrl}
                />
                {!errors.verificationDocUrl && (
                  <p id="verificationDocUrl-hint" className="text-sm text-muted-foreground">
                    Business license or resale certificate required
                  </p>
                )}
                {errors.verificationDocUrl && (
                  <p id="verificationDocUrl-error" className="text-sm text-destructive">
                    {errors.verificationDocUrl.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="businessAddress">Business Address</Label>
                <Input
                  id="businessAddress"
                  placeholder="123 Main Street"
                  {...register("businessAddress")}
                  aria-describedby={errors.businessAddress ? "businessAddress-error" : undefined}
                  aria-invalid={!!errors.businessAddress}
                />
                {errors.businessAddress && (
                  <p id="businessAddress-error" className="text-sm text-destructive">
                    {errors.businessAddress.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="businessCity">Business City</Label>
                <Input
                  id="businessCity"
                  placeholder="Dallas"
                  {...register("businessCity")}
                  aria-describedby={errors.businessCity ? "businessCity-error" : undefined}
                  aria-invalid={!!errors.businessCity}
                />
                {errors.businessCity && (
                  <p id="businessCity-error" className="text-sm text-destructive">
                    {errors.businessCity.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="businessState">Business State</Label>
                <Input
                  id="businessState"
                  placeholder="TX"
                  maxLength={2}
                  {...register("businessState")}
                  aria-describedby={errors.businessState ? "businessState-error" : "businessState-hint"}
                  aria-invalid={!!errors.businessState}
                />
                {!errors.businessState && (
                  <p id="businessState-hint" className="text-sm text-muted-foreground">
                    2-letter state abbreviation
                  </p>
                )}
                {errors.businessState && (
                  <p id="businessState-error" className="text-sm text-destructive">
                    {errors.businessState.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="businessZip">Business ZIP Code</Label>
                <Input
                  id="businessZip"
                  placeholder="75001"
                  {...register("businessZip")}
                  aria-describedby={errors.businessZip ? "businessZip-error" : undefined}
                  aria-invalid={!!errors.businessZip}
                />
                {errors.businessZip && (
                  <p id="businessZip-error" className="text-sm text-destructive">
                    {errors.businessZip.message}
                  </p>
                )}
              </div>
            </>
          )}
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          {step === 1 ? (
            <Button
              type="button"
              onClick={handleContinue}
              className="w-full"
            >
              Continue
            </Button>
          ) : (
            <div className="flex w-full gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(1)}
                className="flex-1"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button type="submit" className="flex-1" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Account
              </Button>
            </div>
          )}
          {step === 1 && (
            <>
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
            </>
          )}
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
