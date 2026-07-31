"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  listingFormSchema,
  type ListingFormInput,
} from "@/lib/validators/listing";
import { useListingFormStore } from "@/lib/stores/listing-form-store";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Loader2,
  ArrowLeft,
  ArrowRight,
  Check,
  AlertTriangle,
  Target,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import {
  BUYER_MARKETPLACE_FEE_PERCENT,
  SELLER_MARKETPLACE_FEE_PERCENT,
  calculateOrderFees,
} from "@/lib/fees";
import { PhotoUpload } from "@/components/listings/photo-upload";
import { WIDTH_OPTIONS, THICKNESS_OPTIONS, getWearLayerOptionsForSingle } from "@/lib/constants/flooring";
import { getFreightDefaults, FREIGHT_CLASS_OPTIONS } from "@/lib/constants/freight-defaults";
import { OnboardingTip } from "@/components/ui/onboarding-tip";
import { celebrateMilestone } from "@/lib/utils/celebrate";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useProStatus } from "@/hooks/use-pro-status";
import { FREE_LIMITS } from "@/lib/pro";
import Link from "next/link";
import {
  parseSellerListingDemandContext,
  type SellerListingDemandContext,
} from "@/lib/marketplace/search-gap";
import {
  AutomaticMarkdownPreview,
  ChoiceCard,
  getCommercialReviewSummary,
  getFreightUiMode,
  SellerCommercialFulfillmentFields,
  type UsStateCode,
} from "@/components/marketplace/seller-commercial-fields";
import { getSellerListingPreferenceDefaults } from "@/lib/selling-rules";

const STEPS = [
  { id: 1, title: "Product Details", description: "Material and specs" },
  { id: 2, title: "Lot Details", description: "Quantities and location" },
  { id: 3, title: "Pricing", description: "Set your prices" },
  { id: 4, title: "Condition", description: "Condition and certs" },
  { id: 5, title: "Photos", description: "Upload images" },
  { id: 6, title: "Review", description: "Review and publish" },
];

const MATERIAL_TYPES = [
  { value: "hardwood", label: "Hardwood" },
  { value: "engineered", label: "Engineered Hardwood" },
  { value: "laminate", label: "Laminate" },
  { value: "vinyl_lvp", label: "Vinyl / LVP" },
  { value: "bamboo", label: "Bamboo" },
  { value: "tile", label: "Tile" },
  { value: "other", label: "Other" },
];

const FINISH_TYPES = [
  { value: "matte", label: "Matte" },
  { value: "semi_gloss", label: "Semi-Gloss" },
  { value: "gloss", label: "Gloss" },
  { value: "wire_brushed", label: "Wire Brushed" },
  { value: "hand_scraped", label: "Hand Scraped" },
  { value: "distressed", label: "Distressed" },
  { value: "smooth", label: "Smooth" },
  { value: "textured", label: "Textured" },
  { value: "oiled", label: "Oiled" },
  { value: "unfinished", label: "Unfinished" },
  { value: "other", label: "Other" },
];

const GRADE_TYPES = [
  { value: "select", label: "Select" },
  { value: "1_common", label: "#1 Common" },
  { value: "2_common", label: "#2 Common" },
  { value: "3_common", label: "#3 Common" },
  { value: "cabin", label: "Cabin" },
  { value: "character", label: "Character" },
  { value: "rustic", label: "Rustic" },
  { value: "premium", label: "Premium" },
  { value: "standard", label: "Standard" },
  { value: "economy", label: "Economy" },
  { value: "other", label: "Other" },
];

const CONDITION_TYPES = [
  { value: "new_overstock", label: "New Overstock" },
  { value: "discontinued", label: "Discontinued" },
  { value: "slight_damage", label: "Slight Damage" },
  { value: "returns", label: "Returns" },
  { value: "seconds", label: "Seconds" },
  { value: "remnants", label: "Remnants" },
  { value: "closeout", label: "Closeout" },
  { value: "other", label: "Other" },
];

const REASON_CODES = [
  { value: "overproduction", label: "Overproduction" },
  { value: "color_change", label: "Color Change" },
  { value: "line_discontinuation", label: "Line Discontinuation" },
  { value: "warehouse_clearance", label: "Warehouse Clearance" },
  { value: "customer_return", label: "Customer Return" },
  { value: "slight_defect", label: "Slight Defect" },
  { value: "packaging_damage", label: "Packaging Damage" },
  { value: "end_of_season", label: "End of Season" },
  { value: "other", label: "Other" },
];

const CERTIFICATIONS = [
  { value: "fsc", label: "FSC Certified" },
  { value: "floorscore", label: "FloorScore" },
  { value: "greenguard", label: "GreenGuard" },
  { value: "greenguard_gold", label: "GreenGuard Gold" },
  { value: "carb2", label: "CARB2 Compliant" },
  { value: "leed", label: "LEED" },
  { value: "nauf", label: "NAUF" },
];

const STEP_FIELDS: Record<number, (keyof ListingFormInput)[]> = {
  1: ["title", "materialType"],
  2: ["totalSqFt", "totalPallets", "palletWeight", "palletLength", "palletWidth", "palletHeight", "locationZip", "moq", "moqUnit"],
  3: [
    "askPricePerSqFt",
    "partialQuantityMarkupPercent",
    "automaticMarkdownFloorPercent",
    "automaticMarkdownIntervalDays",
    "allowedDestinationStates",
    "sellerFreightStates",
    "freightDropCharge",
  ],
  4: ["condition"],
  5: [],
  6: [],
};

export default function CreateListingPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { currentStep, formData, uploadedMediaIds, setStep, nextStep, prevStep, updateFormData, setMediaIds, reset } =
    useListingFormStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [demandContext, setDemandContext] =
    useState<SellerListingDemandContext | null>(null);
  const demandContextAppliedRef = useRef(false);
  const { isPro } = useProStatus();
  const { data: sellerStats } = trpc.listing.getSellerStats.useQuery();
  const { data: sellerPreferences } = trpc.preferences.get.useQuery();
  const sellerDefaultsAppliedRef = useRef(false);

  const activeListingCount = sellerStats
    ?.filter((s) => s.status === "active")
    .reduce((sum, s) => sum + s.count, 0) ?? 0;
  const atListingLimit = !isPro && activeListingCount >= FREE_LIMITS.activeListings;
  const requiresVerification =
    !!user &&
    user.role !== "admin" &&
    user.verificationStatus !== "verified";

  const createMutation = trpc.listing.create.useMutation();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    trigger,
    formState: { errors },
  } = useForm<ListingFormInput>({
    resolver: zodResolver(listingFormSchema) as never,
    defaultValues: formData as Partial<ListingFormInput>,
  });

  const watchedValues = watch();
  const rawListingSubtotal =
    Number(watchedValues.askPricePerSqFt) *
    Number(watchedValues.totalSqFt);
  const listingSubtotal = Number.isFinite(rawListingSubtotal)
    ? Math.max(0, rawListingSubtotal)
    : 0;
  const projectedFees = calculateOrderFees(listingSubtotal, 0);
  const freightMode = getFreightUiMode({
    freightPaymentMode: watchedValues.freightPaymentMode,
    sellerFreightStates: watchedValues.sellerFreightStates,
  });
  const markdownFloorPercent = Number(
    watchedValues.automaticMarkdownFloorPercent ?? 0,
  );
  const markdownIntervalDays = Number(
    watchedValues.automaticMarkdownIntervalDays ?? 0,
  );
  const commercialReviewSummary = getCommercialReviewSummary({
    fullLotOnly: watchedValues.fullLotOnly,
    partialQuantityMarkupPercent: watchedValues.partialQuantityMarkupPercent,
    automaticMarkdownEnabled: watchedValues.automaticMarkdownEnabled,
    automaticMarkdownFloorPercent:
      watchedValues.automaticMarkdownFloorPercent,
    automaticMarkdownIntervalDays: watchedValues.automaticMarkdownIntervalDays,
    allowOffers: watchedValues.allowOffers,
    floorPrice: watchedValues.floorPrice,
    allowSampleRequests: watchedValues.allowSampleRequests,
    territoryMode: watchedValues.territoryMode,
    allowedDestinationStates: watchedValues.allowedDestinationStates,
    freightPaymentMode: watchedValues.freightPaymentMode,
    sellerFreightStates:
      (watchedValues.sellerFreightStates as UsStateCode[] | undefined) ??
      undefined,
    freightDropCharge: watchedValues.freightDropCharge,
  });

  useEffect(() => {
    if (demandContextAppliedRef.current) return;
    demandContextAppliedRef.current = true;

    const context = parseSellerListingDemandContext(
      new URLSearchParams(window.location.search),
    );
    if (context.source !== "zero_results") return;

    setDemandContext(context);
    const prefill: Partial<ListingFormInput> = {};
    if (!formData.materialType && context.materialTypes[0]) {
      prefill.materialType = context.materialTypes[0];
    }
    if (!formData.condition && context.conditions[0]) {
      prefill.condition = context.conditions[0];
    }
    if (!formData.species && context.species[0]) {
      prefill.species = context.species[0]
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
    }
    if (!formData.finish && context.finishTypes[0]) {
      prefill.finish = context.finishTypes[0];
    }

    for (const [field, value] of Object.entries(prefill)) {
      setValue(field as keyof ListingFormInput, value, {
        shouldDirty: false,
      });
    }
    if (Object.keys(prefill).length > 0) updateFormData(prefill);
  }, [formData, setValue, updateFormData]);

  useEffect(() => {
    if (sellerDefaultsAppliedRef.current || !sellerPreferences) return;
    sellerDefaultsAppliedRef.current = true;

    const sellerDefaults = getSellerListingPreferenceDefaults(sellerPreferences);
    const nextDefaults: Partial<ListingFormInput> = {};

    if (!formData.locationZip && sellerPreferences.originZip) {
      nextDefaults.locationZip = sellerPreferences.originZip;
      setValue("locationZip", sellerPreferences.originZip, {
        shouldDirty: false,
      });
    }

    if (formData.allowOffers == null && sellerPreferences.defaultAllowOffers != null) {
      nextDefaults.allowOffers = sellerPreferences.defaultAllowOffers;
      setValue("allowOffers", sellerPreferences.defaultAllowOffers, {
        shouldDirty: false,
      });
    }

    if (formData.fullLotOnly == null) {
      nextDefaults.fullLotOnly = !sellerDefaults.canSplitLots;
      setValue("fullLotOnly", !sellerDefaults.canSplitLots, {
        shouldDirty: false,
      });
    }

    if (formData.partialQuantityMarkupPercent == null) {
      nextDefaults.partialQuantityMarkupPercent =
        sellerDefaults.partialQuantityMarkupPercent ?? undefined;
      setValue(
        "partialQuantityMarkupPercent",
        sellerDefaults.partialQuantityMarkupPercent ?? null,
        {
          shouldDirty: false,
        },
      );
    }

    if (formData.automaticMarkdownEnabled == null) {
      nextDefaults.automaticMarkdownEnabled =
        sellerDefaults.automaticMarkdownEnabled;
      setValue(
        "automaticMarkdownEnabled",
        sellerDefaults.automaticMarkdownEnabled,
        { shouldDirty: false },
      );
    }

    if (formData.automaticMarkdownFloorPercent == null) {
      nextDefaults.automaticMarkdownFloorPercent =
        sellerDefaults.automaticMarkdownFloorPercent ?? undefined;
      setValue(
        "automaticMarkdownFloorPercent",
        sellerDefaults.automaticMarkdownFloorPercent ?? null,
        { shouldDirty: false },
      );
    }

    if (formData.automaticMarkdownIntervalDays == null) {
      nextDefaults.automaticMarkdownIntervalDays =
        sellerDefaults.automaticMarkdownIntervalDays ?? undefined;
      setValue(
        "automaticMarkdownIntervalDays",
        sellerDefaults.automaticMarkdownIntervalDays ?? null,
        { shouldDirty: false },
      );
    }

    if (formData.allowSampleRequests == null) {
      nextDefaults.allowSampleRequests = sellerDefaults.allowSampleRequests;
      setValue("allowSampleRequests", sellerDefaults.allowSampleRequests, {
        shouldDirty: false,
      });
    }

    if (formData.territoryMode == null) {
      nextDefaults.territoryMode = sellerDefaults.sellingTerritoryMode;
      setValue("territoryMode", sellerDefaults.sellingTerritoryMode, {
        shouldDirty: false,
      });
    }

    if (!formData.allowedDestinationStates?.length) {
      nextDefaults.allowedDestinationStates =
        sellerDefaults.allowedDestinationStates.length > 0
          ? sellerDefaults.allowedDestinationStates
          : undefined;
      setValue(
        "allowedDestinationStates",
        sellerDefaults.allowedDestinationStates.length > 0
          ? sellerDefaults.allowedDestinationStates
          : [],
        { shouldDirty: false },
      );
    }

    if (formData.freightPaymentMode == null) {
      nextDefaults.freightPaymentMode = sellerDefaults.freightPaymentMode;
      setValue("freightPaymentMode", sellerDefaults.freightPaymentMode, {
        shouldDirty: false,
      });
    }

    if (!formData.sellerFreightStates?.length) {
      nextDefaults.sellerFreightStates =
        sellerDefaults.sellerFreightStates.length > 0
          ? sellerDefaults.sellerFreightStates
          : undefined;
      setValue(
        "sellerFreightStates",
        sellerDefaults.sellerFreightStates.length > 0
          ? sellerDefaults.sellerFreightStates
          : [],
        { shouldDirty: false },
      );
    }

    if (formData.freightDropCharge == null) {
      nextDefaults.freightDropCharge = sellerDefaults.freightDropCharge ?? undefined;
      setValue("freightDropCharge", sellerDefaults.freightDropCharge ?? null, {
        shouldDirty: false,
      });
    }

    if (Object.keys(nextDefaults).length > 0) {
      updateFormData(nextDefaults);
    }
  }, [formData, sellerPreferences, setValue, updateFormData]);

  // Auto-populate NMFC code and freight class when material type changes
  const prevMaterialTypeRef = useRef(watchedValues.materialType);
  useEffect(() => {
    const prev = prevMaterialTypeRef.current;
    const curr = watchedValues.materialType;
    if (curr === prev) return;

    const prevDefaults = getFreightDefaults(prev);
    const currDefaults = getFreightDefaults(curr);
    prevMaterialTypeRef.current = curr;

    // Only auto-fill if current values are empty or match the previous material type's defaults
    const currentNmfc = watchedValues.nmfcCode;
    const currentFreight = watchedValues.freightClass;

    const nmfcIsDefault = !currentNmfc || currentNmfc === prevDefaults?.nmfcCode;
    const freightIsDefault = !currentFreight || currentFreight === prevDefaults?.freightClass;

    if (nmfcIsDefault) {
      setValue("nmfcCode", currDefaults?.nmfcCode ?? "");
    }
    if (freightIsDefault) {
      setValue("freightClass", currDefaults?.freightClass ?? "");
    }
  }, [watchedValues.materialType, watchedValues.nmfcCode, watchedValues.freightClass, setValue]);

  useEffect(() => {
    if (!requiresVerification) return;

    toast.error("Verification is required before creating listings.");
    router.replace("/seller/verification");
  }, [requiresVerification, router]);

  const handleNext = async () => {
    updateFormData(watchedValues);

    // Step 5: photo validation (not a form field)
    if (currentStep === 5) {
      if (uploadedMediaIds.length === 0) {
        toast.error("Please upload at least one photo");
        return;
      }
      nextStep();
      return;
    }

    const fields = STEP_FIELDS[currentStep];
    if (!fields || fields.length === 0) {
      nextStep();
      return;
    }

    const isValid = await trigger(fields);
    if (isValid) {
      nextStep();
    }
  };

  const handleBack = () => {
    updateFormData(watchedValues);
    prevStep();
  };

  const onSubmit = async (data: ListingFormInput) => {
    setIsSubmitting(true);
    try {
      // Include uploaded media IDs in the submission
      const listingData = {
        ...data,
        mediaIds: uploadedMediaIds,
      };
      const listing = await createMutation.mutateAsync(listingData);
      celebrateMilestone(
        "Listing Created!",
        "Your listing is now live on PlankMarket!"
      );
      reset();
      router.push(`/listings/${listing.id}`);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to create listing";
      if (
        typeof message === "string" &&
        message.includes("/seller/verification")
      ) {
        toast.error("Verification is required before creating listings.");
        router.push("/seller/verification");
        return;
      }
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (requiresVerification) {
    return null;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Create New Listing</h1>
        <p className="text-muted-foreground mt-1">
          List your flooring inventory for buyers to discover
        </p>
      </div>

      {demandContext && (
        <Card className="border-primary/30 bg-primary/[0.03]">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Target className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold">Search context carried into this draft</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Product criteria from the marketplace search are available as a
                  starting point. Review every listing value before publishing;
                  this context is not a reservation or guaranteed order.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {demandContext.query && (
                    <Badge variant="outline">Search: {demandContext.query}</Badge>
                  )}
                  {demandContext.materialTypes.map((material) => (
                    <Badge key={material} variant="outline">
                      {material.replaceAll("_", " ")}
                    </Badge>
                  ))}
                  {demandContext.conditions.map((condition) => (
                    <Badge key={condition} variant="outline">
                      {condition.replaceAll("_", " ")}
                    </Badge>
                  ))}
                  {(demandContext.priceMin || demandContext.priceMax) && (
                    <Badge variant="outline">
                      Target price: {demandContext.priceMin ? `$${demandContext.priceMin}` : "any"}
                      {" – "}
                      {demandContext.priceMax ? `$${demandContext.priceMax}` : "any"}/sq ft
                    </Badge>
                  )}
                  {(demandContext.minLotSize || demandContext.maxLotSize) && (
                    <Badge variant="outline">
                      Lot: {demandContext.minLotSize || "any"}–{demandContext.maxLotSize || "any"} sq ft
                    </Badge>
                  )}
                  {demandContext.states.length > 0 && (
                    <Badge variant="outline">
                      Origin: {demandContext.states.join(", ")}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Listing Limit Banner (free users only) */}
      {!isPro && (
        atListingLimit ? (
          <div className="flex items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0" aria-hidden="true" />
            <div className="flex-1">
              <p className="text-sm font-medium text-destructive">
                You&apos;ve reached the {FREE_LIMITS.activeListings}-listing limit.{" "}
                <Link href="/pro" className="underline underline-offset-2 font-semibold">
                  Upgrade to Pro
                </Link>{" "}
                for unlimited listings.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-lg border border-amber-500/50 bg-amber-50 dark:bg-amber-950/20 p-4">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" aria-hidden="true" />
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              You have {activeListingCount}/{FREE_LIMITS.activeListings} active listings on the Free plan
            </p>
          </div>
        )
      )}

      {/* Progress Steps */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {STEPS.map((step, index) => (
          <button
            key={step.id}
            onClick={() => {
              updateFormData(watchedValues);
              setStep(step.id);
            }}
            className="flex items-center gap-2 shrink-0"
          >
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-colors",
                currentStep === step.id
                  ? "bg-primary text-primary-foreground"
                  : currentStep > step.id
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
              )}
            >
              {currentStep > step.id ? (
                <Check className="h-4 w-4" />
              ) : (
                step.id
              )}
            </div>
            <div className="hidden md:block text-left">
              <div className="text-xs font-medium">{step.title}</div>
              <div className="text-xs text-muted-foreground">
                {step.description}
              </div>
            </div>
            {index < STEPS.length - 1 && (
              <div
                className={cn(
                  "hidden md:block h-px w-8",
                  currentStep > step.id ? "bg-primary" : "bg-border"
                )}
              />
            )}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        {/* Step 1: Product Details */}
        {currentStep === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Product Details</CardTitle>
              <CardDescription>
                Describe the flooring product you are listing
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <OnboardingTip id="listing-title-tip">
                Tip: Include brand, species, and condition in your title for better search visibility
              </OnboardingTip>
              {STEP_FIELDS[1]?.some(f => errors[f]) && (
                <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 mb-4">
                  <p className="text-sm font-medium text-destructive">
                    Please fix the highlighted fields to continue
                  </p>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="title">Listing Title *</Label>
                <Input
                  id="title"
                  placeholder='e.g., "Premium White Oak Hardwood - 2,500 sq ft Overstock"'
                  {...register("title")}
                />
                {errors.title && (
                  <p className="text-sm text-destructive">
                    {errors.title.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Describe the product, its history, and any relevant details..."
                  rows={4}
                  {...register("description")}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Material Type *</Label>
                  <Select
                    value={watchedValues.materialType}
                    onValueChange={(v) =>
                      setValue("materialType", v as ListingFormInput["materialType"], { shouldValidate: true })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select material" />
                    </SelectTrigger>
                    <SelectContent>
                      {MATERIAL_TYPES.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.materialType && (
                    <p className="text-sm text-destructive">
                      {errors.materialType.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="species">Species</Label>
                  <Input
                    id="species"
                    placeholder="e.g., White Oak, Maple"
                    {...register("species")}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Finish</Label>
                  <Select
                    value={watchedValues.finish || ""}
                    onValueChange={(v) =>
                      setValue("finish", v as ListingFormInput["finish"])
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select finish" />
                    </SelectTrigger>
                    <SelectContent>
                      {FINISH_TYPES.map((f) => (
                        <SelectItem key={f.value} value={f.value}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Grade</Label>
                  <Select
                    value={watchedValues.grade || ""}
                    onValueChange={(v) =>
                      setValue("grade", v as ListingFormInput["grade"])
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select grade" />
                    </SelectTrigger>
                    <SelectContent>
                      {GRADE_TYPES.map((g) => (
                        <SelectItem key={g.value} value={g.value}>
                          {g.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Thickness</Label>
                  <Select
                    value={watchedValues.thickness ? String(watchedValues.thickness) : ""}
                    onValueChange={(v) => setValue("thickness", parseFloat(v))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select thickness" />
                    </SelectTrigger>
                    <SelectContent>
                      {THICKNESS_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={String(opt.value)}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Width</Label>
                  <Select
                    value={watchedValues.width ? String(watchedValues.width) : ""}
                    onValueChange={(v) => setValue("width", parseFloat(v))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select width" />
                    </SelectTrigger>
                    <SelectContent>
                      {WIDTH_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={String(opt.value)}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="length">Length (in)</Label>
                  <Input
                    id="length"
                    type="number"
                    step="0.01"
                    placeholder="48.0"
                    {...register("length", { valueAsNumber: true })}
                  />
                </div>
              </div>

              {/* Wear Layer - shown for vinyl, engineered, laminate */}
              {getWearLayerOptionsForSingle(watchedValues.materialType).length > 0 && (
                <div className="space-y-2">
                  <Label>Wear Layer</Label>
                  <Select
                    value={watchedValues.wearLayer ? String(watchedValues.wearLayer) : ""}
                    onValueChange={(v) => setValue("wearLayer", parseFloat(v))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select wear layer" />
                    </SelectTrigger>
                    <SelectContent>
                      {getWearLayerOptionsForSingle(watchedValues.materialType).map((opt) => (
                        <SelectItem key={opt.value} value={String(opt.value)}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="color">Color</Label>
                  <Input
                    id="color"
                    placeholder="e.g., Natural, Espresso"
                    {...register("color")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="brand">Brand</Label>
                  <Input
                    id="brand"
                    placeholder="e.g., Shaw, Mohawk"
                    {...register("brand")}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Lot Details */}
        {currentStep === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Lot Details</CardTitle>
              <CardDescription>
                Specify quantities, packaging, and warehouse location
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {STEP_FIELDS[2]?.some(f => errors[f]) && (
                <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 mb-4">
                  <p className="text-sm font-medium text-destructive">
                    Please fix the highlighted fields to continue
                  </p>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="totalSqFt">Total Square Footage *</Label>
                  <Input
                    id="totalSqFt"
                    type="number"
                    step="0.01"
                    placeholder="2500"
                    {...register("totalSqFt", { valueAsNumber: true })}
                  />
                  {errors.totalSqFt && (
                    <p className="text-sm text-destructive">
                      {errors.totalSqFt.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="totalPallets">Total Pallets *</Label>
                  <Input
                    id="totalPallets"
                    type="number"
                    placeholder="5"
                    {...register("totalPallets", { valueAsNumber: true })}
                  />
                  {errors.totalPallets && (
                    <p className="text-sm text-destructive">
                      {errors.totalPallets.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sqFtPerBox">Sq Ft Per Box</Label>
                  <Input
                    id="sqFtPerBox"
                    type="number"
                    step="0.01"
                    placeholder="20.0"
                    {...register("sqFtPerBox", { valueAsNumber: true })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="boxesPerPallet">Boxes Per Pallet</Label>
                  <Input
                    id="boxesPerPallet"
                    type="number"
                    placeholder="50"
                    {...register("boxesPerPallet", { valueAsNumber: true })}
                  />
                </div>
              </div>

              <Separator className="my-4" />

              <h3 className="font-medium">Shipping Dimensions</h3>
              <p className="text-sm text-muted-foreground mb-2">
                Required for shipping quotes. Standard pallet: 48&quot;L x 40&quot;W. Typical flooring pallet weighs 1,000-2,500 lbs.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="palletWeight">Pallet Weight (lbs) *</Label>
                  <Input
                    id="palletWeight"
                    type="number"
                    step="1"
                    placeholder="1200"
                    {...register("palletWeight", { valueAsNumber: true })}
                  />
                  {errors.palletWeight && (
                    <p className="text-sm text-destructive">
                      {errors.palletWeight.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="palletLength">Pallet Length (in) *</Label>
                  <Input
                    id="palletLength"
                    type="number"
                    step="1"
                    placeholder="48"
                    {...register("palletLength", { valueAsNumber: true })}
                  />
                  {errors.palletLength && (
                    <p className="text-sm text-destructive">
                      {errors.palletLength.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="palletWidth">Pallet Width (in) *</Label>
                  <Input
                    id="palletWidth"
                    type="number"
                    step="1"
                    placeholder="40"
                    {...register("palletWidth", { valueAsNumber: true })}
                  />
                  {errors.palletWidth && (
                    <p className="text-sm text-destructive">
                      {errors.palletWidth.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="palletHeight">Pallet Height (in) *</Label>
                  <Input
                    id="palletHeight"
                    type="number"
                    step="1"
                    placeholder="48"
                    {...register("palletHeight", { valueAsNumber: true })}
                  />
                  {errors.palletHeight && (
                    <p className="text-sm text-destructive">
                      {errors.palletHeight.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="nmfcCode">NMFC Code</Label>
                  <Input
                    id="nmfcCode"
                    placeholder="e.g., 37860"
                    {...register("nmfcCode")}
                  />
                  <p className="text-xs text-muted-foreground">
                    Auto-filled from material type. Override if needed.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Freight Class</Label>
                  <Select
                    value={watchedValues.freightClass || ""}
                    onValueChange={(v) => setValue("freightClass", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select freight class" />
                    </SelectTrigger>
                    <SelectContent>
                      {FREIGHT_CLASS_OPTIONS.map((fc) => (
                        <SelectItem key={fc} value={fc}>
                          {fc}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Auto-filled from material type. Override if needed.
                  </p>
                </div>
              </div>

              <Separator className="my-4" />

              <div className="space-y-2">
                <Label htmlFor="moq">Minimum Order Quantity *</Label>
                <div className="flex gap-2">
                  <Input
                    id="moq"
                    type="number"
                    step="0.01"
                    placeholder="500"
                    className="flex-1"
                    {...register("moq", { valueAsNumber: true })}
                  />
                  <Select
                    value={watchedValues.moqUnit || "sqft"}
                    onValueChange={(v) =>
                      setValue("moqUnit", v as "pallets" | "sqft", { shouldValidate: true })
                    }
                  >
                    <SelectTrigger className="w-[130px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sqft">sq ft</SelectItem>
                      <SelectItem value="pallets">pallets</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">
                  The smallest amount you&apos;ll sell in a single transaction
                </p>
                {errors.moq && (
                  <p className="text-sm text-destructive">
                    {errors.moq.message}
                  </p>
                )}
              </div>

              <Separator className="my-4" />

              <h3 className="font-medium">Warehouse Location</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="locationCity">City</Label>
                  <Input
                    id="locationCity"
                    placeholder="Dallas"
                    {...register("locationCity")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="locationState">State</Label>
                  <Input
                    id="locationState"
                    placeholder="TX"
                    maxLength={2}
                    {...register("locationState")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="locationZip">ZIP Code *</Label>
                  <Input
                    id="locationZip"
                    placeholder="75001"
                    maxLength={10}
                    {...register("locationZip")}
                  />
                  {errors.locationZip && (
                    <p className="text-sm text-destructive">
                      {errors.locationZip.message}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Pricing */}
        {currentStep === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>Pricing</CardTitle>
              <CardDescription>
                Set your asking price and purchase options
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {STEP_FIELDS[3]?.some(f => errors[f]) && (
                <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 mb-4">
                  <p className="text-sm font-medium text-destructive">
                    Please fix the highlighted fields to continue
                  </p>
                </div>
              )}
              <div className="rounded-2xl border bg-muted/30 p-4">
                <p className="text-sm font-medium">Seller defaults are preloaded</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  This listing starts from your account preferences, but every
                  setting below can be overridden here before publish.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="askPricePerSqFt">
                  Ask Price per Sq Ft ($) *
                </Label>
                <Input
                  id="askPricePerSqFt"
                  type="number"
                  step="0.01"
                  placeholder="2.50"
                  {...register("askPricePerSqFt", { valueAsNumber: true })}
                />
                {errors.askPricePerSqFt && (
                  <p className="text-sm text-destructive">
                    {errors.askPricePerSqFt.message}
                  </p>
                )}
                {watchedValues.askPricePerSqFt > 0 &&
                  watchedValues.totalSqFt > 0 && (
                    <p className="text-sm text-muted-foreground">
                      Total lot value: $
                      {(
                        watchedValues.askPricePerSqFt * watchedValues.totalSqFt
                      ).toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                      })}
                    </p>
                  )}
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="buyNowPrice">
                      Buy Now Price per Sq Ft ($, optional)
                    </Label>
                    <Input
                      id="buyNowPrice"
                      type="number"
                      step="0.01"
                      placeholder="4.25"
                      {...register("buyNowPrice", { valueAsNumber: true })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Leave blank if this listing should only move through offers
                      or negotiated checkout.
                    </p>
                  </div>

                  <div className="rounded-2xl border bg-card p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="space-y-1">
                        <Label htmlFor="allow-offers" className="text-sm font-medium">
                          Allow offers
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Buyers can submit an offer and each side can accept,
                          decline, or counter when it is their turn.
                        </p>
                      </div>
                      <Switch
                        id="allow-offers"
                        checked={!!watchedValues.allowOffers}
                        onCheckedChange={(checked) =>
                          setValue("allowOffers", checked, {
                            shouldDirty: true,
                            shouldValidate: true,
                          })
                        }
                      />
                    </div>

                    {watchedValues.allowOffers ? (
                      <div className="mt-4 space-y-2">
                        <Label htmlFor="floorPrice">
                          Internal floor price per Sq Ft ($)
                        </Label>
                        <Input
                          id="floorPrice"
                          type="number"
                          step="0.01"
                          placeholder="2.00"
                          {...register("floorPrice", { valueAsNumber: true })}
                        />
                        <p className="text-xs text-muted-foreground">
                          This minimum is not visible to buyers.
                        </p>
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-2xl border bg-card p-4">
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <div className="font-medium">How can buyers purchase this lot?</div>
                        <p className="text-sm text-muted-foreground">
                          Choose whether the listing is full-lot only or supports
                          partial quantity pricing.
                        </p>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <ChoiceCard
                          title="Full lot only"
                          description="Buyers must take the entire listing quantity."
                          selected={!!watchedValues.fullLotOnly}
                          onClick={() => {
                            setValue("fullLotOnly", true, {
                              shouldDirty: true,
                              shouldValidate: true,
                            });
                            setValue("partialQuantityMarkupPercent", null, {
                              shouldDirty: true,
                              shouldValidate: true,
                            });
                          }}
                        />
                        <ChoiceCard
                          title="Allow partial quantities"
                          description="Let buyers purchase less than the full lot and add a partial-order markup."
                          selected={!watchedValues.fullLotOnly}
                          onClick={() =>
                            setValue("fullLotOnly", false, {
                              shouldDirty: true,
                              shouldValidate: true,
                            })
                          }
                        />
                      </div>

                      {!watchedValues.fullLotOnly ? (
                        <div className="space-y-2">
                          <Label htmlFor="partialQuantityMarkupPercent">
                            Partial-order markup (%)
                          </Label>
                          <Input
                            id="partialQuantityMarkupPercent"
                            type="number"
                            min={0}
                            max={500}
                            step="1"
                            {...register("partialQuantityMarkupPercent", {
                              valueAsNumber: true,
                            })}
                          />
                          <p className="text-xs text-muted-foreground">
                            A 20% markup turns a {watchedValues.askPricePerSqFt?.toFixed?.(2) ?? "0.00"}/sq ft ask into{" "}
                            {watchedValues.askPricePerSqFt
                              ? (
                                  watchedValues.askPricePerSqFt *
                                  (1 +
                                    Number(
                                      watchedValues.partialQuantityMarkupPercent ?? 0,
                                    ) /
                                      100)
                                ).toFixed(2)
                              : "0.00"}
                            /sq ft for smaller purchases.
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-2xl border bg-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <Label
                          htmlFor="automatic-markdown"
                          className="text-sm font-medium"
                        >
                          Automatic markdown
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Move the listing down in four equal steps until it
                          reaches your floor.
                        </p>
                      </div>
                      <Switch
                        id="automatic-markdown"
                        checked={!!watchedValues.automaticMarkdownEnabled}
                        onCheckedChange={(checked) =>
                          setValue("automaticMarkdownEnabled", checked, {
                            shouldDirty: true,
                            shouldValidate: true,
                          })
                        }
                      />
                    </div>

                    {watchedValues.automaticMarkdownEnabled ? (
                      <div className="mt-4 space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="automaticMarkdownFloorPercent">
                              Lowest allowed percent of original ask
                            </Label>
                            <Input
                              id="automaticMarkdownFloorPercent"
                              type="number"
                              min={1}
                              max={100}
                              step="1"
                              {...register("automaticMarkdownFloorPercent", {
                                valueAsNumber: true,
                              })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="automaticMarkdownIntervalDays">
                              Days between markdown steps
                            </Label>
                            <Input
                              id="automaticMarkdownIntervalDays"
                              type="number"
                              min={1}
                              max={365}
                              step="1"
                              {...register("automaticMarkdownIntervalDays", {
                                valueAsNumber: true,
                              })}
                            />
                          </div>
                        </div>

                        {watchedValues.askPricePerSqFt &&
                        markdownFloorPercent > 0 &&
                        markdownIntervalDays > 0 ? (
                          <AutomaticMarkdownPreview
                            baseUnitPrice={watchedValues.askPricePerSqFt}
                            floorPercent={markdownFloorPercent}
                            intervalDays={markdownIntervalDays}
                            description="This preview uses your actual ask price. The schedule starts when the listing goes live or when you reset the rule."
                          />
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Add a valid ask price, floor percent, and interval
                            to preview the markdown schedule.
                          </p>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-4">
                  <SellerCommercialFulfillmentFields
                    sampleRequests={{
                      id: "allow-samples",
                      enabled: !!watchedValues.allowSampleRequests,
                      onChange: (checked) =>
                        setValue("allowSampleRequests", checked, {
                          shouldDirty: true,
                        }),
                    }}
                    territory={{
                      mode:
                        watchedValues.territoryMode === "allowed_states"
                          ? "allowed_states"
                          : "unrestricted",
                      selectedStates:
                        (watchedValues.allowedDestinationStates ??
                          []) as UsStateCode[],
                      onChange: ({ mode, selectedStates }) => {
                        setValue("territoryMode", mode, {
                          shouldDirty: true,
                          shouldValidate: true,
                        });
                        setValue("allowedDestinationStates", selectedStates, {
                          shouldDirty: true,
                          shouldValidate: true,
                        });
                      },
                      error: errors.allowedDestinationStates?.message,
                    }}
                    freight={{
                      mode: freightMode,
                      selectedStates:
                        (watchedValues.sellerFreightStates ??
                          []) as UsStateCode[],
                      onChange: ({
                        persistence,
                        selectedStates,
                        shouldClearDropCharge,
                      }) => {
                        setValue(
                          "freightPaymentMode",
                          persistence.freightPaymentMode,
                          {
                            shouldDirty: true,
                            shouldValidate: true,
                          },
                        );
                        setValue("sellerFreightStates", selectedStates, {
                          shouldDirty: true,
                          shouldValidate: true,
                        });
                        if (shouldClearDropCharge) {
                          setValue("freightDropCharge", null, {
                            shouldDirty: true,
                            shouldValidate: true,
                          });
                        }
                      },
                      dropChargeInputId: "freightDropCharge",
                      dropChargeValue:
                        watchedValues.freightDropCharge != null
                          ? String(watchedValues.freightDropCharge)
                          : "",
                      onDropChargeChange: (value) =>
                        setValue(
                          "freightDropCharge",
                          value.length > 0 ? Number(value) : null,
                          {
                            shouldDirty: true,
                            shouldValidate: true,
                          },
                        ),
                      statesError: errors.sellerFreightStates?.message,
                      dropChargeError: errors.freightDropCharge?.message,
                    }}
                  />

                  <div className="rounded-2xl border bg-muted/50 p-4">
                    <h4 className="text-sm font-medium mb-2">Fee Breakdown</h4>
                    <div className="space-y-1 text-sm text-muted-foreground">
                      <p>
                        Seller marketplace fee: {SELLER_MARKETPLACE_FEE_PERCENT}% of
                        inventory subtotal
                      </p>
                      <p>
                        Buyer marketplace fee: {BUYER_MARKETPLACE_FEE_PERCENT}% of
                        inventory subtotal (paid by buyer)
                      </p>
                      <p>
                        Seller Stripe fee: 2.9% + $0.30 on inventory subtotal
                        only
                      </p>
                      <p>
                        Freight is quoted separately. Any seller shipping
                        contribution is deducted from the final net payout.
                      </p>
                    </div>
                  </div>

                  <div className="rounded-2xl border bg-card p-4">
                    <p className="text-sm font-medium">Sales tax</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Sales-tax registration states are managed in your seller
                      preferences and are stored for operations only. Automatic
                      tax calculation is not yet live in checkout.
                    </p>
                    <Link
                      href="/preferences"
                      className="mt-3 inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
                    >
                      Manage seller defaults
                    </Link>
                  </div>
                </div>
              </div>

            </CardContent>
          </Card>
        )}

        {/* Step 4: Condition */}
        {currentStep === 4 && (
          <Card>
            <CardHeader>
              <CardTitle>Condition & Certifications</CardTitle>
              <CardDescription>
                Describe the product condition and any certifications
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {STEP_FIELDS[4]?.some(f => errors[f]) && (
                <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 mb-4">
                  <p className="text-sm font-medium text-destructive">
                    Please fix the highlighted fields to continue
                  </p>
                </div>
              )}
              <div className="space-y-2">
                <Label>Condition *</Label>
                <Select
                  value={watchedValues.condition}
                  onValueChange={(v) =>
                    setValue("condition", v as ListingFormInput["condition"], { shouldValidate: true })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select condition" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONDITION_TYPES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.condition && (
                  <p className="text-sm text-destructive">
                    {errors.condition.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Reason Code</Label>
                <Select
                  value={watchedValues.reasonCode || ""}
                  onValueChange={(v) =>
                    setValue("reasonCode", v as ListingFormInput["reasonCode"])
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Why is this being sold?" />
                  </SelectTrigger>
                  <SelectContent>
                    {REASON_CODES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Certifications</Label>
                <div className="flex flex-wrap gap-2">
                  {CERTIFICATIONS.map((cert) => {
                    const isSelected =
                      watchedValues.certifications?.includes(cert.value) ??
                      false;
                    return (
                      <Badge
                        key={cert.value}
                        variant={isSelected ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => {
                          const current =
                            watchedValues.certifications ?? [];
                          const updated = isSelected
                            ? current.filter((c) => c !== cert.value)
                            : [...current, cert.value];
                          setValue("certifications", updated);
                        }}
                      >
                        {cert.label}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 5: Photos */}
        {currentStep === 5 && (
          <Card>
            <CardHeader>
              <CardTitle>Photos</CardTitle>
              <CardDescription>
                Upload up to 20 photos of your flooring product. The first image will be the cover photo.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PhotoUpload
                onImagesChange={setMediaIds}
                initialMediaIds={uploadedMediaIds}
              />
            </CardContent>
          </Card>
        )}

        {/* Step 6: Review */}
        {currentStep === 6 && (
          <Card>
            <CardHeader>
              <CardTitle>Review Your Listing</CardTitle>
              <CardDescription>
                Review all details before publishing
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="font-medium text-sm text-muted-foreground mb-1">
                  Title
                </h3>
                <p className="font-semibold">{watchedValues.title || "---"}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <h3 className="font-medium text-sm text-muted-foreground mb-1">
                    Material
                  </h3>
                  <p>
                    {MATERIAL_TYPES.find(
                      (m) => m.value === watchedValues.materialType
                    )?.label || "---"}
                  </p>
                </div>
                <div>
                  <h3 className="font-medium text-sm text-muted-foreground mb-1">
                    Species
                  </h3>
                  <p>{watchedValues.species || "---"}</p>
                </div>
                <div>
                  <h3 className="font-medium text-sm text-muted-foreground mb-1">
                    Total Sq Ft
                  </h3>
                  <p>{watchedValues.totalSqFt?.toLocaleString() || "---"}</p>
                </div>
                <div>
                  <h3 className="font-medium text-sm text-muted-foreground mb-1">
                    Price per Sq Ft
                  </h3>
                  <p>
                    $
                    {watchedValues.askPricePerSqFt?.toFixed(2) || "---"}
                  </p>
                </div>
                <div>
                  <h3 className="font-medium text-sm text-muted-foreground mb-1">
                    Condition
                  </h3>
                  <p>
                    {CONDITION_TYPES.find(
                      (c) => c.value === watchedValues.condition
                    )?.label || "---"}
                  </p>
                </div>
                <div>
                  <h3 className="font-medium text-sm text-muted-foreground mb-1">
                    Location
                  </h3>
                  <p>
                    {watchedValues.locationCity &&
                    watchedValues.locationState
                      ? `${watchedValues.locationCity}, ${watchedValues.locationState}`
                      : "---"}
                  </p>
                </div>
                {watchedValues.palletWeight && (
                  <div>
                    <h3 className="font-medium text-sm text-muted-foreground mb-1">
                      Pallet Weight
                    </h3>
                    <p>{watchedValues.palletWeight?.toLocaleString()} lbs</p>
                  </div>
                )}
                {watchedValues.palletLength && (
                  <div>
                    <h3 className="font-medium text-sm text-muted-foreground mb-1">
                      Pallet Dimensions
                    </h3>
                    <p>
                      {watchedValues.palletLength}&quot; x {watchedValues.palletWidth}&quot; x {watchedValues.palletHeight}&quot;
                    </p>
                  </div>
                )}
              </div>

              <div className="rounded-lg border bg-card p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">Commercial rules</h3>
                    <p className="text-xs text-muted-foreground">
                      Final purchase settings buyers will encounter on this
                      listing.
                    </p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {commercialReviewSummary.map((item) => (
                    <div
                      key={item.label}
                      className="rounded-md border bg-muted/30 px-3 py-2"
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {item.label}
                        </p>
                        {item.badge ? (
                          <Badge variant="outline" className="text-[10px]">
                            {item.badge}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-sm">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {watchedValues.askPricePerSqFt > 0 &&
                watchedValues.totalSqFt > 0 && (
                  <div className="rounded-lg bg-primary/5 p-4">
                    <h3 className="font-semibold mb-1">
                      Projected payout before freight
                    </h3>
                    <p className="mb-3 text-xs text-muted-foreground">
                      Inventory-only estimate at the current asking price.
                      {freightMode !== "buyer_pays"
                        ? " Your final seller shipping contribution is calculated from the buyer's selected freight quote and deducted from net payout."
                        : " The buyer pays the selected freight quote."}
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <span>Inventory subtotal:</span>
                      <span className="font-medium text-right">
                        {formatCurrency(listingSubtotal)}
                      </span>
                      <span>
                        Seller marketplace fee (
                        {SELLER_MARKETPLACE_FEE_PERCENT}%):
                      </span>
                      <span className="text-right">
                        -{formatCurrency(projectedFees.sellerFee)}
                      </span>
                      <span>Estimated payment processing:</span>
                      <span className="text-right">
                        -{formatCurrency(projectedFees.sellerStripeFee)}
                      </span>
                      <span className="font-medium">
                        Payout before freight:
                      </span>
                      <span className="font-medium text-right text-primary">
                        {formatCurrency(projectedFees.sellerPayout)}
                      </span>
                    </div>
                  </div>
                )}
            </CardContent>
          </Card>
        )}

        {/* Navigation */}
        <div className="mt-6">
          {currentStep === 6 &&
            user?.verificationStatus !== "verified" &&
            user?.role !== "admin" && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 px-4 py-3 mb-4">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  Verification is required before creating listings. Complete verification to continue.
                </p>
              </div>
            )}
          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={handleBack}
              disabled={currentStep === 1}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>

            {currentStep < 6 ? (
              <Button type="button" onClick={handleNext}>
                Next
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={
                  isSubmitting ||
                  atListingLimit ||
                  (user?.verificationStatus !== "verified" &&
                    user?.role !== "admin")
                }
              >
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Publish Listing
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
