"use client";

import { useEffect, useState } from "react";
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
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  FileCheck2,
  Loader2,
  LockKeyhole,
  Save,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { getErrorMessage } from "@/lib/utils";
import { useAuthStore } from "@/lib/stores/auth-store";
import { cn } from "@/lib/utils";

const STEP_LABELS = ["Business", "Evidence", "Review"] as const;

const EMPTY_DRAFT: SubmitVerificationInput = {
  einTaxId: "",
  businessWebsite: "",
  verificationDocUrl: "",
  businessAddress: "",
  businessCity: "",
  businessState: "",
  businessZip: "",
};

export default function SellerVerificationPage() {
  const { user, setUser } = useAuthStore();
  const utils = trpc.useUtils();
  const [stepOverride, setStepOverride] = useState<number | null>(null);
  const { data: profile, isLoading: isProfileLoading } =
    trpc.auth.getProfile.useQuery();
  const status = profile?.verificationStatus ?? user?.verificationStatus;
  const canEdit = status === "unverified" || status === "rejected";
  const { data: draft, isLoading: isDraftLoading } =
    trpc.auth.getVerificationDraft.useQuery(undefined, { enabled: canEdit });
  const step = stepOverride ?? draft?.currentStep ?? 1;

  const {
    register,
    getValues,
    handleSubmit,
    reset,
    setError,
    trigger,
    formState: { errors },
  } = useForm<SubmitVerificationInput>({
    resolver: zodResolver(submitVerificationSchema),
    defaultValues: EMPTY_DRAFT,
  });

  useEffect(() => {
    if (!draft) return;
    reset({
      einTaxId: draft.einTaxId,
      businessWebsite: draft.businessWebsite,
      verificationDocUrl: draft.verificationDocUrl,
      businessAddress: draft.businessAddress,
      businessCity: draft.businessCity,
      businessState: draft.businessState,
      businessZip: draft.businessZip,
    });
  }, [draft, reset]);

  const saveMutation = trpc.auth.saveVerificationDraft.useMutation({
    onSuccess: () => utils.auth.getVerificationDraft.invalidate(),
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const submitMutation = trpc.auth.submitVerificationDraft.useMutation({
    onSuccess: async () => {
      toast.success("Verification submitted for review.");
      await Promise.all([
        utils.auth.getSession.invalidate(),
        utils.auth.getProfile.invalidate(),
        utils.auth.getVerificationDraft.invalidate(),
      ]);
      const session = await utils.auth.getSession.fetch();
      if (session.user) setUser(session.user);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  if (!user || isProfileLoading || (canEdit && isDraftLoading)) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isSaving = saveMutation.isPending || submitMutation.isPending;
  const draftPayload = (currentStep: number) => ({
    currentStep,
    ...getValues(),
  });

  const saveDraft = async (currentStep = step, announce = true) => {
    await saveMutation.mutateAsync(draftPayload(currentStep));
    if (announce) toast.success("Draft saved securely.");
  };

  const continueFromBusiness = async () => {
    const valid = await trigger([
      "businessWebsite",
      "businessAddress",
      "businessCity",
      "businessState",
      "businessZip",
    ]);
    if (!getValues("businessWebsite")?.trim()) {
      setError("businessWebsite", {
        message: "Business website is required for seller verification",
      });
      return;
    }
    if (!valid) return;
    await saveDraft(2, false);
    setStepOverride(2);
  };

  const continueFromEvidence = async () => {
    const valid = await trigger(["einTaxId", "verificationDocUrl"]);
    if (!valid) return;
    await saveDraft(3, false);
    setStepOverride(3);
  };

  const submit = async () => {
    await saveDraft(3, false);
    await submitMutation.mutateAsync();
  };

  const maskedEin = getValues("einTaxId")
    ? `••-••••${getValues("einTaxId").slice(-3)}`
    : "Not added";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-sm font-medium text-primary">
          Step 2 of 2 after account creation
        </p>
        <h1 className="mt-1 text-3xl font-bold">Verify your business</h1>
        <p className="mt-2 text-muted-foreground">
          Save each step and return whenever you are ready. Approval is required
          before a seller can publish inventory.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Verification status</CardTitle>
              <CardDescription>
                Account creation and business verification are separate.
              </CardDescription>
            </div>
            {status === "verified" && (
              <Badge className="w-fit border-green-200 bg-green-50 text-green-700">
                <CheckCircle2 className="mr-1 h-3 w-3" /> Verified
              </Badge>
            )}
            {status === "pending" && (
              <Badge
                variant="outline"
                className="w-fit border-amber-200 bg-amber-50 text-amber-800"
              >
                <Clock className="mr-1 h-3 w-3" /> Under review
              </Badge>
            )}
            {status === "rejected" && (
              <Badge
                variant="outline"
                className="w-fit border-red-200 bg-red-50 text-red-700"
              >
                <XCircle className="mr-1 h-3 w-3" /> Update required
              </Badge>
            )}
            {status === "unverified" && <Badge variant="outline">Not submitted</Badge>}
          </div>
        </CardHeader>
        <CardContent>
          {status === "verified" && (
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>Your business is approved and seller publishing is unlocked.</p>
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
                Changing your verified business name or address sends the account
                back for review. Marketplace actions that require verification
                remain locked until the updated identity is approved.
              </p>
            </div>
          )}
          {status === "pending" && (
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>Your saved submission is now under review.</p>
              <p>
                While you wait, you can browse inventory, complete your profile,
                set preferences, and connect Stripe. Publishing listings and
                verified transactions remain locked until approval.
              </p>
            </div>
          )}
          {canEdit && (
            <p className="text-sm text-muted-foreground">
              {status === "rejected"
                ? "Review and update the saved information, then submit it again."
                : "Complete the three short steps below when it is convenient."}
            </p>
          )}
        </CardContent>
      </Card>

      {canEdit && (
        <>
          <Card>
            <CardContent className="pt-6">
              <ol className="grid grid-cols-3 gap-2" aria-label="Verification progress">
                {STEP_LABELS.map((label, index) => {
                  const itemStep = index + 1;
                  const complete = itemStep < step;
                  return (
                    <li
                      key={label}
                      aria-current={itemStep === step ? "step" : undefined}
                      className="flex flex-col items-center gap-2 text-center"
                    >
                      <span
                        className={cn(
                          "flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold",
                          itemStep === step && "border-primary bg-primary text-primary-foreground",
                          complete && "border-green-600 bg-green-50 text-green-700",
                        )}
                      >
                        {complete ? <CheckCircle2 className="h-4 w-4" /> : itemStep}
                      </span>
                      <span className="text-xs font-medium sm:text-sm">{label}</span>
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>

          <form onSubmit={handleSubmit(submit)}>
            {step === 1 && (
              <Card>
                <CardHeader>
                  <CardTitle>Business identity</CardTitle>
                  <CardDescription>
                    We use these details to match your company to its supporting
                    document and reduce impersonation risk.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="businessWebsite">Business website</Label>
                    <Input
                      id="businessWebsite"
                      type="url"
                      placeholder="https://yourcompany.com"
                      {...register("businessWebsite")}
                      aria-invalid={!!errors.businessWebsite}
                    />
                    <p className="text-xs text-muted-foreground">
                      Helps reviewers confirm that the company and submitted contact match.
                    </p>
                    {errors.businessWebsite && (
                      <p className="text-sm text-destructive">{errors.businessWebsite.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="businessAddress">Legal business address</Label>
                    <Input id="businessAddress" {...register("businessAddress")} />
                    {errors.businessAddress && (
                      <p className="text-sm text-destructive">{errors.businessAddress.message}</p>
                    )}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-[1fr_90px_120px]">
                    <div className="space-y-2">
                      <Label htmlFor="businessCity">City</Label>
                      <Input id="businessCity" {...register("businessCity")} />
                      {errors.businessCity && (
                        <p className="text-sm text-destructive">{errors.businessCity.message}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="businessState">State</Label>
                      <Input
                        id="businessState"
                        maxLength={2}
                        autoCapitalize="characters"
                        {...register("businessState")}
                      />
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
                  <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                    <Button type="button" variant="outline" onClick={() => saveDraft()} disabled={isSaving}>
                      <Save className="mr-2 h-4 w-4" /> Save draft
                    </Button>
                    <Button type="button" onClick={continueFromBusiness} disabled={isSaving}>
                      Save and continue <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {step === 2 && (
              <Card>
                <CardHeader>
                  <CardTitle>Business evidence</CardTitle>
                  <CardDescription>
                    These fields help confirm that the account represents an active,
                    registered business.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="einTaxId">Employer Identification Number (EIN)</Label>
                    <Input
                      id="einTaxId"
                      placeholder="12-3456789"
                      inputMode="numeric"
                      autoComplete="off"
                      {...register("einTaxId")}
                      aria-invalid={!!errors.einTaxId}
                    />
                    <p className="text-xs text-muted-foreground">
                      Used only for business verification and administrative review.
                    </p>
                    {errors.einTaxId && (
                      <p className="text-sm text-destructive">{errors.einTaxId.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="verificationDocUrl">Supporting document link</Label>
                    <Input
                      id="verificationDocUrl"
                      type="url"
                      placeholder="https://secure-upload.example/document"
                      autoComplete="off"
                      {...register("verificationDocUrl")}
                      aria-invalid={!!errors.verificationDocUrl}
                    />
                    <p className="text-xs text-muted-foreground">
                      Provide an approved secure-upload link to a business license,
                      EIN letter, or formation document. The link is validated before review.
                    </p>
                    {errors.verificationDocUrl && (
                      <p className="text-sm text-destructive">{errors.verificationDocUrl.message}</p>
                    )}
                  </div>
                  <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                    <div className="flex gap-2">
                      <Button type="button" variant="ghost" onClick={() => setStepOverride(1)}>
                        <ArrowLeft className="mr-2 h-4 w-4" /> Back
                      </Button>
                      <Button type="button" variant="outline" onClick={() => saveDraft()} disabled={isSaving}>
                        <Save className="mr-2 h-4 w-4" /> Save draft
                      </Button>
                    </div>
                    <Button type="button" onClick={continueFromEvidence} disabled={isSaving}>
                      Save and review <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {step === 3 && (
              <Card>
                <CardHeader>
                  <CardTitle>Review and submit</CardTitle>
                  <CardDescription>
                    Confirm the information matches your legal business records.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <dl className="grid gap-4 rounded-lg border bg-muted/20 p-4 sm:grid-cols-2">
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Website</dt>
                      <dd className="mt-1 break-words text-sm">{getValues("businessWebsite")}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">EIN</dt>
                      <dd className="mt-1 text-sm">{maskedEin}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Address</dt>
                      <dd className="mt-1 text-sm">
                        {getValues("businessAddress")}, {getValues("businessCity")},{" "}
                        {getValues("businessState")} {getValues("businessZip")}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Document</dt>
                      <dd className="mt-1 flex items-center gap-2 text-sm">
                        <FileCheck2 className="h-4 w-4 text-green-700" /> Secure link added
                      </dd>
                    </div>
                  </dl>
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
                    Submitting starts review. You can continue browsing and setting up
                    your account, but listings cannot be published until approval.
                  </div>
                  <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                    <Button type="button" variant="ghost" onClick={() => setStepOverride(2)}>
                      <ArrowLeft className="mr-2 h-4 w-4" /> Back
                    </Button>
                    <Button type="submit" disabled={isSaving}>
                      {isSaving ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <ShieldCheck className="mr-2 h-4 w-4" />
                      )}
                      {status === "rejected" ? "Resubmit for review" : "Submit for review"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </form>

          <div className="flex items-start gap-3 rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
            <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p>
              Drafts are saved to your authenticated PlankMarket account. EIN and
              document data are not stored in localStorage or sessionStorage on this device.
              {draft?.updatedAt
                ? ` Last saved ${new Date(draft.updatedAt).toLocaleString()}.`
                : ""}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
