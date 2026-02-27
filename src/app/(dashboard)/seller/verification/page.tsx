"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  submitVerificationSchema,
  type SubmitVerificationInput,
} from "@/lib/validators/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { getErrorMessage } from "@/lib/utils";
import { useAuthStore } from "@/lib/stores/auth-store";

export default function SellerVerificationPage() {
  const { user } = useAuthStore();
  const utils = trpc.useUtils();
  const { data: profile } = trpc.auth.getProfile.useQuery();
  const { data: verificationData } = trpc.auth.getVerificationData.useQuery();

  const submitMutation = trpc.auth.submitVerification.useMutation({
    onSuccess: () => {
      toast.success("Verification submitted successfully.");
      void Promise.all([
        utils.auth.getSession.invalidate(),
        utils.auth.getProfile.invalidate(),
      ]);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const resubmitMutation = trpc.auth.resubmitVerification.useMutation({
    onSuccess: () => {
      toast.success("Verification resubmitted.");
      void Promise.all([
        utils.auth.getSession.invalidate(),
        utils.auth.getProfile.invalidate(),
      ]);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SubmitVerificationInput>({
    resolver: zodResolver(submitVerificationSchema),
  });

  useEffect(() => {
    if (!profile) return;
    reset({
      einTaxId: verificationData?.einTaxId ?? "",
      businessWebsite: profile.businessWebsite ?? "",
      verificationDocUrl: verificationData?.verificationDocUrl ?? "",
      businessAddress: profile.businessAddress ?? "",
      businessCity: profile.businessCity ?? "",
      businessState: profile.businessState ?? "",
      businessZip: profile.businessZip ?? "",
    });
  }, [profile, verificationData, reset]);

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const status = user.verificationStatus;
  const isSubmitting = submitMutation.isPending || resubmitMutation.isPending;

  const onSubmit = async (values: SubmitVerificationInput) => {
    if (status === "rejected") {
      await resubmitMutation.mutateAsync(values);
      return;
    }
    await submitMutation.mutateAsync(values);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Seller Verification</h1>
        <p className="text-muted-foreground mt-1">
          Submit your business verification to create listings.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Verification Status</CardTitle>
              <CardDescription>
                Sellers must be approved before listing inventory.
              </CardDescription>
            </div>
            {status === "verified" && (
              <Badge className="bg-green-50 text-green-700 border-green-200">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Verified
              </Badge>
            )}
            {status === "pending" && (
              <Badge
                variant="outline"
                className="bg-yellow-50 text-yellow-700 border-yellow-200"
              >
                <Clock className="h-3 w-3 mr-1" />
                Pending
              </Badge>
            )}
            {status === "rejected" && (
              <Badge
                variant="outline"
                className="bg-red-50 text-red-700 border-red-200"
              >
                <XCircle className="h-3 w-3 mr-1" />
                Rejected
              </Badge>
            )}
            {status === "unverified" && (
              <Badge variant="outline">Unverified</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {status === "verified" && (
            <p className="text-sm text-muted-foreground">
              Your account is verified and can create listings.
            </p>
          )}
          {status === "pending" && (
            <p className="text-sm text-muted-foreground">
              Your submission is under review. You can keep exploring the dashboard
              while verification is processed.
            </p>
          )}
          {status !== "verified" && status !== "pending" && (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="einTaxId">EIN / Tax ID</Label>
                <Input id="einTaxId" placeholder="12-3456789" {...register("einTaxId")} />
                {errors.einTaxId && (
                  <p className="text-sm text-destructive">{errors.einTaxId.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="businessWebsite">Business Website</Label>
                <Input
                  id="businessWebsite"
                  type="url"
                  placeholder="https://yourcompany.com"
                  {...register("businessWebsite")}
                />
                {errors.businessWebsite && (
                  <p className="text-sm text-destructive">{errors.businessWebsite.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="verificationDocUrl">Verification Document URL</Label>
                <Input
                  id="verificationDocUrl"
                  type="url"
                  placeholder="https://storage.example.com/documents/license.jpg"
                  {...register("verificationDocUrl")}
                />
                {errors.verificationDocUrl && (
                  <p className="text-sm text-destructive">{errors.verificationDocUrl.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="businessAddress">Business Address</Label>
                <Input id="businessAddress" {...register("businessAddress")} />
                {errors.businessAddress && (
                  <p className="text-sm text-destructive">{errors.businessAddress.message}</p>
                )}
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="businessCity">City</Label>
                  <Input id="businessCity" {...register("businessCity")} />
                  {errors.businessCity && (
                    <p className="text-sm text-destructive">{errors.businessCity.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="businessState">State</Label>
                  <Input id="businessState" maxLength={2} {...register("businessState")} />
                  {errors.businessState && (
                    <p className="text-sm text-destructive">{errors.businessState.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="businessZip">ZIP</Label>
                  <Input id="businessZip" {...register("businessZip")} />
                  {errors.businessZip && (
                    <p className="text-sm text-destructive">{errors.businessZip.message}</p>
                  )}
                </div>
              </div>

              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {status === "rejected" ? "Resubmit Verification" : "Submit Verification"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
