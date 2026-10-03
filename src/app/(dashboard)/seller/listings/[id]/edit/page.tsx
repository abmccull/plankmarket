"use client";

import { ListingFormIssueSummary, ListingFieldError, getListingFormIssues, focusListingField, revealListingNativeError, preserveListingNumberInput } from "@/components/listings/listing-form-feedback";
import { ListingOptionalSection, ListingCommercialSummary } from "@/components/listings/listing-optional-section";


import { useState } from "react";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers/_app";
import { useParams, useRouter } from "next/navigation";
import { ProductSpecificationFields } from "@/components/listings/product-specification-fields";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CLEARABLE_LISTING_NUMBER_FIELDS,
  listingFormSchema,
  type ListingFormInput,
} from "@/lib/validators/listing";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
import { Skeleton } from "@/components/ui/skeleton";
import { QueryErrorState } from "@/components/ui/state-panel";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Save } from "lucide-react";
import { PhotoUpload } from "@/components/listings/photo-upload";
import {
  AutomaticMarkdownPreview,
  ChoiceCard,
  getFreightUiMode,
  SellerCommercialFulfillmentFields,
  type UsStateCode,
} from "@/components/marketplace/seller-commercial-fields";
import {
  WIDTH_OPTIONS,
  THICKNESS_OPTIONS,
  getWearLayerOptionsForSingle,
} from "@/lib/constants/flooring";

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

// Preserve an empty optional number as missing; the schema still enforces required values.
const numericInputValue = (value: string | number | null | undefined) =>
  value === "" || value == null ? undefined : Number(value);

type EditableListing = inferRouterOutputs<AppRouter>["listing"]["getForEdit"];
type EditableListingPatch =
  inferRouterInputs<AppRouter>["listing"]["update"]["data"];

function listingFormDefaults(listing: EditableListing) {
  return {
    title: listing.title,
    description: listing.description ?? undefined,
    materialType: listing.materialType,
    species: listing.species ?? undefined,
    finish: listing.finish ?? undefined,
    grade: listing.grade ?? undefined,
    color: listing.color ?? undefined,
    colorFamily: listing.colorFamily ?? undefined,
    thickness: listing.thickness ?? undefined,
    width: listing.width ?? undefined,
    length: listing.length ?? undefined,
    wearLayer: listing.wearLayer ?? undefined,
    brand: listing.brand ?? undefined,
    modelNumber: listing.modelNumber ?? undefined,
    packagingType: listing.packagingType,
    installationMethod: listing.installationMethod,
    waterResistance: listing.waterResistance,
    lotNumber: listing.lotNumber ?? undefined,
    sqFtPerBox: listing.sqFtPerBox ?? undefined,
    boxesPerPallet: listing.boxesPerPallet ?? undefined,
    totalSqFt: listing.totalSqFt,
    totalPallets: listing.totalPallets ?? undefined,
    moq: listing.moq ?? undefined,
    moqUnit: listing.moqUnit ?? "sqft",
    palletWeight: listing.palletWeight ?? undefined,
    palletLength: listing.palletLength ?? undefined,
    palletWidth: listing.palletWidth ?? undefined,
    palletHeight: listing.palletHeight ?? undefined,
    locationCity: listing.locationCity ?? undefined,
    locationState: listing.locationState ?? undefined,
    locationZip: listing.locationZip ?? undefined,
    askPricePerSqFt: listing.askPricePerSqFt,
    buyNowPrice: listing.buyNowPrice ?? undefined,
    allowOffers: listing.allowOffers,
    floorPrice: listing.floorPrice ?? undefined,
    fullLotOnly: listing.fullLotOnly ?? false,
    partialQuantityMarkupPercent:
      listing.partialQuantityMarkupPercent ?? undefined,
    automaticMarkdownEnabled: listing.automaticMarkdownEnabled ?? false,
    automaticMarkdownFloorPercent:
      listing.automaticMarkdownFloorPercent ?? undefined,
    automaticMarkdownIntervalDays:
      listing.automaticMarkdownIntervalDays ?? undefined,
    allowSampleRequests: listing.allowSampleRequests ?? false,
    territoryMode: listing.territoryMode ?? "unrestricted",
    allowedDestinationStates:
      (listing.allowedDestinationStates as string[]) ?? [],
    freightPaymentMode: listing.freightPaymentMode ?? "buyer_pays",
    sellerFreightStates: (listing.sellerFreightStates as string[]) ?? [],
    freightDropCharge: listing.freightDropCharge ?? undefined,
    condition: listing.condition,
    reasonCode: listing.reasonCode ?? undefined,
    certifications: (listing.certifications as string[]) ?? [],
    mediaIds: listing.media.map((item) => item.id),
  };
}

export default function EditListingPage() {
  const params = useParams();
  const router = useRouter();
  const listingId = params.id as string;

  const {
    data: listing,
    isLoading,
    isFetching,
    refetch,
    error,
  } = trpc.listing.getForEdit.useQuery(
    { id: listingId },
    { enabled: !!listingId, refetchOnWindowFocus: false },
  );

  if (error && !listing) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold">Edit Listing</h1>
        <QueryErrorState
          title="We couldn't load this listing"
          description={
            error.data?.code === "NOT_FOUND" || error.data?.code === "FORBIDDEN"
              ? "This listing is unavailable to your account. Return to your inventory or try again."
              : "Your changes have not been loaded. Check your connection and try again."
          }
          onRetry={() => void refetch()}
          isRetrying={isFetching}
          secondaryAction={{
            label: "Back to My Listings",
            onClick: () => router.push("/seller/listings"),
          }}
        />
      </div>
    );
  }

  if (isLoading || !listing) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-6 w-72" />
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-40" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <div className="grid grid-cols-2 gap-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return <EditListingForm key={listing.id} listing={listing} />;
}

function EditListingForm({ listing }: { listing: EditableListing }) {
  const router = useRouter();
  const listingId = listing.id;
  const [saveError, setSaveError] = useState<string | null>(null);
  const updateMutation = trpc.listing.update.useMutation();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting, isDirty, dirtyFields },
  } = useForm<ListingFormInput>({
    resolver: zodResolver(listingFormSchema) as never,
    shouldUnregister: false,
    shouldFocusError: false,
    defaultValues: listingFormDefaults(listing),
  });

  // eslint-disable-next-line react-hooks/incompatible-library -- React Hook Form is not memoization-safe by design
  const watchedValues = watch();
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

  const onSubmit = async (data: ListingFormInput) => {
    setSaveError(null);
    try {
      const updateData: EditableListingPatch = { ...data };
      for (const field of Object.keys(
        updateData,
      ) as (keyof EditableListingPatch)[]) {
        if (!dirtyFields[field]) delete updateData[field];
      }
      for (const field of CLEARABLE_LISTING_NUMBER_FIELDS) {
        if (dirtyFields[field] && data[field] === undefined) {
          updateData[field] = null;
        }
      }
      await updateMutation.mutateAsync({
        id: listingId,
        data: updateData,
      });
      toast.success(
        listing?.status === "draft"
          ? "Draft saved. You can publish it from your inventory."
          : "Listing updated successfully!",
      );
      router.push(
        listing?.status === "draft"
          ? "/seller/listings?status=draft"
          : `/listings/${listingId}`,
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to update listing";
      setSaveError(message);
      toast.error(message);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Edit Listing</h1>
          <p className="text-muted-foreground mt-1">
            Update your listing details
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => router.push("/seller/listings")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
      </div>

      <nav aria-label="Listing sections" className="flex flex-wrap gap-2">
        {[["product", "Product"], ["lot", "Quantity and freight"], ["pricing", "Pricing"], ["condition", "Condition"], ["photos", "Photos"]].map(([key, label]) => <a key={key} href={`#listing-${key}`} className="inline-flex min-h-11 items-center rounded-md border px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{label}</a>)}
      </nav>

      <form
        onInvalidCapture={revealListingNativeError}
        onSubmit={handleSubmit(onSubmit, issues => {
          setSaveError(null);
          const first = getListingFormIssues(issues)[0];
          if (first) requestAnimationFrame(() => focusListingField(first.field));
        })}
        className="space-y-6"
      >
        <ListingFormIssueSummary errors={errors} />
        {saveError && (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            {saveError}
          </p>
        )}
        {/* Product Details */}
        <Card id="listing-product" className="scroll-mt-24">
          <CardHeader>
            <CardTitle role="heading" aria-level={2}>Product Details</CardTitle>
            <CardDescription>
              Material, species, and dimensional specifications
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Listing Title *</Label>
              <Input data-listing-field="title" aria-invalid={Boolean(errors.title)} aria-describedby={errors.title ? "title-error" : undefined}
                id="title"
                placeholder='e.g., "Premium White Oak Hardwood - 2,500 sq ft Overstock"'
                {...register("title")}
              />
<ListingFieldError field="title" errors={errors} />

            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea data-listing-field="description" aria-invalid={Boolean(errors.description)} aria-describedby={errors.description ? "description-error" : undefined}
                id="description"
                placeholder="Describe the product, its history, and any relevant details..."
                rows={4}
                {...register("description")}
              />
<ListingFieldError field="description" errors={errors} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="materialType">Material Type *</Label>
                <Select
                  value={watchedValues.materialType}
                  onValueChange={(v) =>
                    setValue(
                      "materialType",
                      v as ListingFormInput["materialType"],
                      { shouldDirty: true },
                    )
                  }
                >
                  <SelectTrigger id="materialType" data-listing-field="materialType" aria-invalid={Boolean(errors.materialType)} aria-describedby={errors.materialType ? "materialType-error" : undefined}>
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
<ListingFieldError field="materialType" errors={errors} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="species">Species</Label>
                <Input data-listing-field="species" aria-invalid={Boolean(errors.species)} aria-describedby={errors.species ? "species-error" : undefined}
                  id="species"
                  placeholder="e.g., White Oak, Maple"
                  {...register("species")}
                />
<ListingFieldError field="species" errors={errors} />
              </div>
            </div>

            <ListingOptionalSection section="product" title="More product details" description="Dimensions, finish, packaging and performance. Existing values are kept when closed." hasErrors={getListingFormIssues(errors).some(issue => issue.step === 1 && !["title", "materialType", "species", "description"].includes(issue.field))}>
<div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="finish">Finish</Label>
                <Select
                  value={watchedValues.finish || ""}
                  onValueChange={(v) =>
                    setValue("finish", v as ListingFormInput["finish"], {
                      shouldDirty: true,
                    })
                  }
                >
                  <SelectTrigger id="finish" data-listing-field="finish" aria-invalid={Boolean(errors.finish)} aria-describedby={errors.finish ? "finish-error" : undefined}>
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
<ListingFieldError field="finish" errors={errors} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="grade">Grade</Label>
                <Select
                  value={watchedValues.grade || ""}
                  onValueChange={(v) =>
                    setValue("grade", v as ListingFormInput["grade"], {
                      shouldDirty: true,
                    })
                  }
                >
                  <SelectTrigger id="grade" data-listing-field="grade" aria-invalid={Boolean(errors.grade)} aria-describedby={errors.grade ? "grade-error" : undefined}>
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
<ListingFieldError field="grade" errors={errors} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="thickness">Thickness</Label>
                <Select
                  value={
                    watchedValues.thickness
                      ? String(watchedValues.thickness)
                      : ""
                  }
                  onValueChange={(v) =>
                    setValue("thickness", parseFloat(v), { shouldDirty: true })
                  }
                >
                  <SelectTrigger id="thickness" data-listing-field="thickness" aria-invalid={Boolean(errors.thickness)} aria-describedby={errors.thickness ? "thickness-error" : undefined}>
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
<ListingFieldError field="thickness" errors={errors} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="width">Width</Label>
                <Select
                  value={watchedValues.width ? String(watchedValues.width) : ""}
                  onValueChange={(v) =>
                    setValue("width", parseFloat(v), { shouldDirty: true })
                  }
                >
                  <SelectTrigger id="width" data-listing-field="width" aria-invalid={Boolean(errors.width)} aria-describedby={errors.width ? "width-error" : undefined}>
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
<ListingFieldError field="width" errors={errors} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="length">Length (in)</Label>
                <Input data-listing-field="length" aria-invalid={Boolean(errors.length)} aria-describedby={errors.length ? "length-error" : undefined}
                  id="length"
                  type="number"
                  step="0.01"
                  placeholder="48.0"
                  {...preserveListingNumberInput(register("length", { setValueAs: numericInputValue }))}
                />
<ListingFieldError field="length" errors={errors} />
              </div>
            </div>

            <ProductSpecificationFields register={register} />
            {/* Wear Layer - shown for vinyl, engineered, laminate */}
            {watchedValues.materialType &&
              getWearLayerOptionsForSingle(watchedValues.materialType).length >
                0 && (
                <div className="space-y-2">
                  <Label htmlFor="wearLayer">Wear Layer</Label>
                  <Select
                    value={
                      watchedValues.wearLayer
                        ? String(watchedValues.wearLayer)
                        : ""
                    }
                    onValueChange={(v) =>
                      setValue("wearLayer", parseFloat(v), {
                        shouldDirty: true,
                      })
                    }
                  >
                    <SelectTrigger id="wearLayer" data-listing-field="wearLayer" aria-invalid={Boolean(errors.wearLayer)} aria-describedby={errors.wearLayer ? "wearLayer-error" : undefined}>
                      <SelectValue placeholder="Select wear layer" />
                    </SelectTrigger>
                    <SelectContent>
                      {getWearLayerOptionsForSingle(
                        watchedValues.materialType,
                      ).map((opt) => (
                        <SelectItem key={opt.value} value={String(opt.value)}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
<ListingFieldError field="wearLayer" errors={errors} />
                </div>
              )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="color">Color</Label>
                <Input data-listing-field="color" aria-invalid={Boolean(errors.color)} aria-describedby={errors.color ? "color-error" : undefined}
                  id="color"
                  placeholder="e.g., Natural, Espresso"
                  {...register("color")}
                />
<ListingFieldError field="color" errors={errors} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="brand">Brand</Label>
                <Input data-listing-field="brand" aria-invalid={Boolean(errors.brand)} aria-describedby={errors.brand ? "brand-error" : undefined}
                  id="brand"
                  placeholder="e.g., Shaw, Mohawk"
                  {...register("brand")}
                />
<ListingFieldError field="brand" errors={errors} />
              </div>
            </div>

</ListingOptionalSection>
</CardContent>
        </Card>

        {/* Lot Details */}
        <Card id="listing-lot" className="scroll-mt-24">
          <CardHeader>
            <CardTitle role="heading" aria-level={2}>Lot Details</CardTitle>
            <CardDescription>
              Quantities, packaging, and warehouse location
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="totalSqFt">Total Square Footage *</Label>
                <Input data-listing-field="totalSqFt" aria-invalid={Boolean(errors.totalSqFt)} aria-describedby={errors.totalSqFt ? "totalSqFt-error" : undefined}
                  id="totalSqFt"
                  type="number"
                  step="0.01"
                  placeholder="2500"
                  {...preserveListingNumberInput(register("totalSqFt", { setValueAs: numericInputValue }))}
                />
<ListingFieldError field="totalSqFt" errors={errors} />

              </div>
              <div className="space-y-2">
                <Label htmlFor="totalPallets">Total Pallets *</Label>
                <Input data-listing-field="totalPallets" aria-invalid={Boolean(errors.totalPallets)} aria-describedby={errors.totalPallets ? "totalPallets-error" : undefined}
                  id="totalPallets"
                  type="number"
                  placeholder="5"
                  {...preserveListingNumberInput(register("totalPallets", {
                    setValueAs: numericInputValue,
                  }))}
                />
<ListingFieldError field="totalPallets" errors={errors} />
              </div>
            </div>

            <ListingOptionalSection section="packaging" title="Packaging quantities" description="Optional box quantities help buyers plan the lot." hasErrors={Boolean(errors.sqFtPerBox || errors.boxesPerPallet)}>
<div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sqFtPerBox">Sq Ft Per Box</Label>
                <Input data-listing-field="sqFtPerBox" aria-invalid={Boolean(errors.sqFtPerBox)} aria-describedby={errors.sqFtPerBox ? "sqFtPerBox-error" : undefined}
                  id="sqFtPerBox"
                  type="number"
                  step="0.01"
                  placeholder="20.0"
                  {...preserveListingNumberInput(register("sqFtPerBox", { setValueAs: numericInputValue }))}
                />
<ListingFieldError field="sqFtPerBox" errors={errors} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="boxesPerPallet">Boxes Per Pallet</Label>
                <Input data-listing-field="boxesPerPallet" aria-invalid={Boolean(errors.boxesPerPallet)} aria-describedby={errors.boxesPerPallet ? "boxesPerPallet-error" : undefined}
                  id="boxesPerPallet"
                  type="number"
                  placeholder="50"
                  {...preserveListingNumberInput(register("boxesPerPallet", {
                    setValueAs: numericInputValue,
                  }))}
                />
<ListingFieldError field="boxesPerPallet" errors={errors} />
              </div>
            </div>
</ListingOptionalSection>


            <div className="space-y-2">
              <Label htmlFor="moq">Minimum Order Quantity *</Label>
              <div className="flex gap-2">
                <Input data-listing-field="moq" aria-invalid={Boolean(errors.moq)} aria-describedby={errors.moq ? "moq-error" : undefined}
                  id="moq"
                  type="number"
                  step="0.01"
                  placeholder="500"
                  className="flex-1"
                  {...preserveListingNumberInput(register("moq", { setValueAs: numericInputValue }))}
                />
                <Select
                  value={watchedValues.moqUnit || "sqft"}
                  onValueChange={(v) =>
                    setValue("moqUnit", v as "pallets" | "sqft", {
                      shouldDirty: true,
                    })
                  }
                >
                  <SelectTrigger id="moqUnit" data-listing-field="moqUnit" aria-invalid={Boolean(errors.moqUnit)} aria-describedby={errors.moqUnit ? "moqUnit-error" : undefined} className="w-[130px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sqft">sq ft</SelectItem>
                    <SelectItem value="pallets">pallets</SelectItem>
                  </SelectContent>
                </Select>
              </div>
<ListingFieldError field="moq" errors={errors} />
<ListingFieldError field="moqUnit" errors={errors} />
              <p className="text-xs text-muted-foreground">
                The smallest amount you&apos;ll sell in a single transaction
              </p>

            </div>

            <Separator className="my-4" />

            <h3 className="font-medium">Shipping Dimensions</h3>
            <p className="text-sm text-muted-foreground mb-2">
              Required for shipping quotes. Standard pallet: 48&quot;L x
              40&quot;W. Typical flooring pallet weighs 1,000-2,500 lbs.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="palletWeight">Pallet Weight (lbs) *</Label>
                <Input data-listing-field="palletWeight" aria-invalid={Boolean(errors.palletWeight)} aria-describedby={errors.palletWeight ? "palletWeight-error" : undefined}
                  id="palletWeight"
                  type="number"
                  step="1"
                  placeholder="1200"
                  {...preserveListingNumberInput(register("palletWeight", {
                    setValueAs: numericInputValue,
                  }))}
                />
<ListingFieldError field="palletWeight" errors={errors} />

              </div>
              <div className="space-y-2">
                <Label htmlFor="palletLength">Pallet Length (in) *</Label>
                <Input data-listing-field="palletLength" aria-invalid={Boolean(errors.palletLength)} aria-describedby={errors.palletLength ? "palletLength-error" : undefined}
                  id="palletLength"
                  type="number"
                  step="1"
                  placeholder="48"
                  {...preserveListingNumberInput(register("palletLength", {
                    setValueAs: numericInputValue,
                  }))}
                />
<ListingFieldError field="palletLength" errors={errors} />

              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="palletWidth">Pallet Width (in) *</Label>
                <Input data-listing-field="palletWidth" aria-invalid={Boolean(errors.palletWidth)} aria-describedby={errors.palletWidth ? "palletWidth-error" : undefined}
                  id="palletWidth"
                  type="number"
                  step="1"
                  placeholder="40"
                  {...preserveListingNumberInput(register("palletWidth", {
                    setValueAs: numericInputValue,
                  }))}
                />
<ListingFieldError field="palletWidth" errors={errors} />

              </div>
              <div className="space-y-2">
                <Label htmlFor="palletHeight">Pallet Height (in) *</Label>
                <Input data-listing-field="palletHeight" aria-invalid={Boolean(errors.palletHeight)} aria-describedby={errors.palletHeight ? "palletHeight-error" : undefined}
                  id="palletHeight"
                  type="number"
                  step="1"
                  placeholder="48"
                  {...preserveListingNumberInput(register("palletHeight", {
                    setValueAs: numericInputValue,
                  }))}
                />
<ListingFieldError field="palletHeight" errors={errors} />

              </div>
            </div>

            <Separator className="my-4" />

            <h3 className="font-medium">Warehouse Location</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="locationCity">City</Label>
                <Input data-listing-field="locationCity" aria-invalid={Boolean(errors.locationCity)} aria-describedby={errors.locationCity ? "locationCity-error" : undefined}
                  id="locationCity"
                  placeholder="Dallas"
                  {...register("locationCity")}
                />
<ListingFieldError field="locationCity" errors={errors} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="locationState">State</Label>
                <Input data-listing-field="locationState" aria-invalid={Boolean(errors.locationState)} aria-describedby={errors.locationState ? "locationState-error" : undefined}
                  id="locationState"
                  placeholder="TX"
                  maxLength={2}
                  {...register("locationState")}
                />
<ListingFieldError field="locationState" errors={errors} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="locationZip">ZIP Code *</Label>
                <Input data-listing-field="locationZip" aria-invalid={Boolean(errors.locationZip)} aria-describedby={errors.locationZip ? "locationZip-error" : undefined}
                  id="locationZip"
                  placeholder="75001"
                  maxLength={10}
                  {...register("locationZip")}
                />
<ListingFieldError field="locationZip" errors={errors} />

              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pricing */}
        <Card id="listing-pricing" className="scroll-mt-24">
          <CardHeader>
            <CardTitle role="heading" aria-level={2}>Pricing</CardTitle>
            <CardDescription>Asking price and purchase options</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="askPricePerSqFt">Ask Price per Sq Ft ($) *</Label>
              <Input data-listing-field="askPricePerSqFt" aria-invalid={Boolean(errors.askPricePerSqFt)} aria-describedby={errors.askPricePerSqFt ? "askPricePerSqFt-error" : undefined}
                id="askPricePerSqFt"
                type="number"
                step="0.01"
                placeholder="2.50"
                {...preserveListingNumberInput(register("askPricePerSqFt", {
                  setValueAs: numericInputValue,
                }))}
              />
<ListingFieldError field="askPricePerSqFt" errors={errors} />

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

            <ListingOptionalSection section="commercial" title="Pricing and delivery options" description="Review your current terms below. Open to change offers, markdowns, delivery or samples." summary={<ListingCommercialSummary values={watchedValues} />} hasErrors={getListingFormIssues(errors).some(issue => issue.step === 3 && issue.field !== "askPricePerSqFt")}>
<div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="buyNowPrice">
                    Buy Now Price per Sq Ft ($, optional)
                  </Label>
                  <Input data-listing-field="buyNowPrice" aria-invalid={Boolean(errors.buyNowPrice)} aria-describedby={errors.buyNowPrice ? "buyNowPrice-error" : undefined}
                    id="buyNowPrice"
                    type="number"
                    step="0.01"
                    placeholder="4.25"
                    {...preserveListingNumberInput(register("buyNowPrice", {
                      setValueAs: numericInputValue,
                    }))}
                  />
<ListingFieldError field="buyNowPrice" errors={errors} />
                  <p className="text-xs text-muted-foreground">
                    Leave blank to use the asking price for standard checkout.
                  </p>
                </div>

                <div className="rounded-2xl border bg-card p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-1">
                      <Label
                        htmlFor="edit-allow-offers"
                        className="text-sm font-medium"
                      >
                        Allow offers
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Buyers can submit an offer and each side can accept,
                        decline, or counter when it is their turn.
                      </p>
                    </div>
                    <Switch
                      id="edit-allow-offers"
                      checked={!!watchedValues.allowOffers}
                      onCheckedChange={(checked) =>
                        setValue("allowOffers", checked, {
                          shouldDirty: true,
                          shouldValidate: true,
                        })
                      }
                    />
                  </div>

                  {watchedValues.allowOffers || errors.floorPrice ? (
                    <div className="mt-4 space-y-2">
                      {!watchedValues.allowOffers ? <p className="text-sm text-muted-foreground">Offers are off. Correct or clear the retained floor price to continue.</p> : null}
<Label htmlFor="floorPrice">
                        Internal floor price per Sq Ft ($)
                      </Label>
                      <Input data-listing-field="floorPrice" aria-invalid={Boolean(errors.floorPrice)} aria-describedby={errors.floorPrice ? "floorPrice-error" : undefined}
                        id="floorPrice"
                        type="number"
                        step="0.01"
                        placeholder="2.00"
                        {...preserveListingNumberInput(register("floorPrice", {
                          setValueAs: numericInputValue,
                        }))}
                      />
<ListingFieldError field="floorPrice" errors={errors} />
                      <p className="text-xs text-muted-foreground">
                        This minimum is not visible to buyers.
                      </p>
                    </div>
                  ) : null}
                </div>

                <div className="rounded-2xl border bg-card p-4">
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <div className="font-medium">Purchase structure</div>
                      <p className="text-sm text-muted-foreground">
                        Control whether the listing is full-lot only or allows
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
                        description="Let buyers purchase less than the full lot and add a markup for partial orders."
                        selected={!watchedValues.fullLotOnly}
                        onClick={() =>
                          setValue("fullLotOnly", false, {
                            shouldDirty: true,
                            shouldValidate: true,
                          })
                        }
                      />
                    </div>

                    {!watchedValues.fullLotOnly || errors.partialQuantityMarkupPercent ? (
                      <div className="space-y-2">
                        {watchedValues.fullLotOnly ? <p className="text-sm text-muted-foreground">Full lot only is selected. Correct or clear the retained partial-order markup to continue.</p> : null}
<Label htmlFor="partialQuantityMarkupPercent">
                          Partial-order markup (%)
                        </Label>
                        <Input data-listing-field="partialQuantityMarkupPercent" aria-invalid={Boolean(errors.partialQuantityMarkupPercent)} aria-describedby={errors.partialQuantityMarkupPercent ? "partialQuantityMarkupPercent-error" : undefined}
                          id="partialQuantityMarkupPercent"
                          type="number"
                          min={0}
                          max={500}
                          step="1"
                          {...preserveListingNumberInput(register("partialQuantityMarkupPercent", {
                            setValueAs: numericInputValue,
                          }))}
                        />
<ListingFieldError field="partialQuantityMarkupPercent" errors={errors} />
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-2xl border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <Label
                        htmlFor="edit-automatic-markdown"
                        className="text-sm font-medium"
                      >
                        Automatic markdown
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Step the listing down in four equal intervals until it
                        reaches your floor.
                      </p>
                    </div>
                    <Switch
                      id="edit-automatic-markdown"
                      checked={!!watchedValues.automaticMarkdownEnabled}
                      onCheckedChange={(checked) =>
                        setValue("automaticMarkdownEnabled", checked, {
                          shouldDirty: true,
                          shouldValidate: true,
                        })
                      }
                    />
                  </div>

                  {watchedValues.automaticMarkdownEnabled || errors.automaticMarkdownFloorPercent || errors.automaticMarkdownIntervalDays ? (
                    <div className="mt-4 space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          {!watchedValues.automaticMarkdownEnabled ? <p className="text-sm text-muted-foreground">Automatic markdown is off. Correct or clear the retained values to continue.</p> : null}
<Label htmlFor="automaticMarkdownFloorPercent">
                            Lowest allowed percent of original ask
                          </Label>
                          <Input data-listing-field="automaticMarkdownFloorPercent" aria-invalid={Boolean(errors.automaticMarkdownFloorPercent)} aria-describedby={errors.automaticMarkdownFloorPercent ? "automaticMarkdownFloorPercent-error" : undefined}
                            id="automaticMarkdownFloorPercent"
                            type="number"
                            min={1}
                            max={100}
                            step="1"
                            {...preserveListingNumberInput(register("automaticMarkdownFloorPercent", {
                              setValueAs: numericInputValue,
                            }))}
                          />
<ListingFieldError field="automaticMarkdownFloorPercent" errors={errors} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="automaticMarkdownIntervalDays">
                            Days between markdown steps
                          </Label>
                          <Input data-listing-field="automaticMarkdownIntervalDays" aria-invalid={Boolean(errors.automaticMarkdownIntervalDays)} aria-describedby={errors.automaticMarkdownIntervalDays ? "automaticMarkdownIntervalDays-error" : undefined}
                            id="automaticMarkdownIntervalDays"
                            type="number"
                            min={1}
                            max={365}
                            step="1"
                            {...preserveListingNumberInput(register("automaticMarkdownIntervalDays", {
                              setValueAs: numericInputValue,
                            }))}
                          />
<ListingFieldError field="automaticMarkdownIntervalDays" errors={errors} />
                        </div>
                      </div>

                      {watchedValues.automaticMarkdownEnabled ? <> {watchedValues.askPricePerSqFt &&
                      markdownFloorPercent > 0 &&
                      markdownIntervalDays > 0 ? (
                        <AutomaticMarkdownPreview
                          baseUnitPrice={watchedValues.askPricePerSqFt}
                          floorPercent={markdownFloorPercent}
                          intervalDays={markdownIntervalDays}
                          description="This preview uses the current ask price and updates if you change the markdown rule."
                        />
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Add a valid ask price, floor percent, and interval to
                          preview the markdown schedule.
                        </p>
                      )} </> : null}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="space-y-4">
                <SellerCommercialFulfillmentFields
                  sampleRequests={{
                    id: "edit-allow-samples",
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
                    selectedStates: (watchedValues.allowedDestinationStates ??
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
                    selectedStates: (watchedValues.sellerFreightStates ??
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
                  <p className="text-sm font-medium">Sales tax</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Sales-tax registration states are managed in seller
                    preferences and are stored for operations only. Automatic
                    tax calculation is not yet live in checkout.
                  </p>
                </div>
              </div>
            </div>
</ListingOptionalSection>

          </CardContent>
        </Card>

        {/* Condition & Certifications */}
        <Card id="listing-condition" className="scroll-mt-24">
          <CardHeader>
            <CardTitle role="heading" aria-level={2}>Condition & Certifications</CardTitle>
            <CardDescription>
              Product condition and any certifications
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="condition">Condition *</Label>
              <Select
                value={watchedValues.condition}
                onValueChange={(v) =>
                  setValue("condition", v as ListingFormInput["condition"], {
                    shouldDirty: true,
                  })
                }
              >
                <SelectTrigger id="condition" data-listing-field="condition" aria-invalid={Boolean(errors.condition)} aria-describedby={errors.condition ? "condition-error" : undefined}>
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
<ListingFieldError field="condition" errors={errors} />

            </div>

            <ListingOptionalSection section="condition" title="Reason for sale and certifications" description="Optional details. Claim only certifications you can support." hasErrors={Boolean(errors.reasonCode || errors.certifications)}>
<div className="space-y-2">
              <Label htmlFor="reasonCode">Reason Code</Label>
              <Select
                value={watchedValues.reasonCode || ""}
                onValueChange={(v) =>
                  setValue("reasonCode", v as ListingFormInput["reasonCode"], {
                    shouldDirty: true,
                  })
                }
              >
                <SelectTrigger id="reasonCode" data-listing-field="reasonCode" aria-invalid={Boolean(errors.reasonCode)} aria-describedby={errors.reasonCode ? "reasonCode-error" : undefined}>
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
<ListingFieldError field="reasonCode" errors={errors} />
            </div>

            <div className="space-y-2">
              <Label>Certifications</Label>
              <div className="flex flex-wrap gap-2">
                {CERTIFICATIONS.map((cert) => {
                  const isSelected =
                    watchedValues.certifications?.includes(cert.value) ?? false;
                  return (
                    <button type="button" aria-pressed={isSelected}
                      key={cert.value}
                      className={`min-h-11 rounded-full border px-3 py-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isSelected ? "bg-primary text-primary-foreground" : "bg-background"}`}
                      onClick={() => {
                        const current = watchedValues.certifications ?? [];
                        const updated = isSelected
                          ? current.filter((c) => c !== cert.value)
                          : [...current, cert.value];
                        setValue("certifications", updated, {
                          shouldDirty: true,
                        });
                      }}
                    >
                      {cert.label}
                    </button>
                  );
                })}
              </div>
            </div>

</ListingOptionalSection>
</CardContent>
        </Card>

        {/* Photos */}
        <Card id="listing-photos" className="scroll-mt-24" data-listing-field="mediaIds" tabIndex={-1}>
          <CardHeader>
            <CardTitle role="heading" aria-level={2}>Photos</CardTitle>
            <CardDescription>
              Manage your listing photos. The first image will be the cover
              photo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PhotoUpload
              onImagesChange={(ids) =>
                setValue("mediaIds", ids, { shouldDirty: true })
              }
              initialMediaIds={
                listing?.media?.map((media: { id: string }) => media.id) ?? []
              }
            />
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/seller/listings")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Cancel
          </Button>

          <Button type="submit" disabled={isSubmitting || !isDirty}>
            {isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save Changes
          </Button>
        </div>
      </form>
    </div>
  );
}
