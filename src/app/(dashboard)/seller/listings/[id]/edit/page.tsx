"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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

export default function EditListingPage() {
  const params = useParams();
  const router = useRouter();
  const listingId = params.id as string;

  const { data: listing, isLoading, error } = trpc.listing.getForEdit.useQuery(
    { id: listingId },
    { enabled: !!listingId }
  );

  const updateMutation = trpc.listing.update.useMutation();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ListingFormInput>({
    resolver: zodResolver(listingFormSchema) as never,
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

  // Pre-populate form when listing data loads
  useEffect(() => {
    if (listing) {
      reset({
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
      });
    }
  }, [listing, reset]);

  const onSubmit = async (data: ListingFormInput) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { mediaIds, ...updateData } = data;
      await updateMutation.mutateAsync({
        id: listingId,
        data: updateData,
      });
      toast.success("Listing updated successfully!");
      router.push(`/listings/${listingId}`);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to update listing";
      toast.error(message);
    }
  };

  if (error) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold">Edit Listing</h1>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              Listing not found or you do not have permission to edit it.
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => router.push("/seller/listings")}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to My Listings
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
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

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Product Details */}
        <Card>
          <CardHeader>
            <CardTitle>Product Details</CardTitle>
            <CardDescription>
              Material, species, and dimensional specifications
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Material Type *</Label>
                <Select
                  value={watchedValues.materialType}
                  onValueChange={(v) =>
                    setValue("materialType", v as ListingFormInput["materialType"], { shouldDirty: true })
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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Finish</Label>
                <Select
                  value={watchedValues.finish || ""}
                  onValueChange={(v) =>
                    setValue("finish", v as ListingFormInput["finish"], { shouldDirty: true })
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
                    setValue("grade", v as ListingFormInput["grade"], { shouldDirty: true })
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

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Thickness</Label>
                <Select
                  value={watchedValues.thickness ? String(watchedValues.thickness) : ""}
                  onValueChange={(v) => setValue("thickness", parseFloat(v), { shouldDirty: true })}
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
                  onValueChange={(v) => setValue("width", parseFloat(v), { shouldDirty: true })}
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
            {watchedValues.materialType &&
              getWearLayerOptionsForSingle(watchedValues.materialType).length > 0 && (
                <div className="space-y-2">
                  <Label>Wear Layer</Label>
                  <Select
                    value={watchedValues.wearLayer ? String(watchedValues.wearLayer) : ""}
                    onValueChange={(v) => setValue("wearLayer", parseFloat(v), { shouldDirty: true })}
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

            <div className="grid grid-cols-2 gap-4">
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

        {/* Lot Details */}
        <Card>
          <CardHeader>
            <CardTitle>Lot Details</CardTitle>
            <CardDescription>
              Quantities, packaging, and warehouse location
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
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
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
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
                    setValue("moqUnit", v as "pallets" | "sqft", { shouldDirty: true })
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

            <h3 className="font-medium">Shipping Dimensions</h3>
            <p className="text-sm text-muted-foreground mb-2">
              Required for shipping quotes. Standard pallet: 48&quot;L x 40&quot;W. Typical flooring pallet weighs 1,000-2,500 lbs.
            </p>

            <div className="grid grid-cols-2 gap-4">
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

            <div className="grid grid-cols-2 gap-4">
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

            <Separator className="my-4" />

            <h3 className="font-medium">Warehouse Location</h3>
            <div className="grid grid-cols-3 gap-4">
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

        {/* Pricing */}
        <Card>
          <CardHeader>
            <CardTitle>Pricing</CardTitle>
            <CardDescription>
              Asking price and purchase options
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="askPricePerSqFt">Ask Price per Sq Ft ($) *</Label>
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
                  <Label htmlFor="buyNowPrice">Buy Now Price per Sq Ft ($, optional)</Label>
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
                      <Label htmlFor="edit-allow-offers" className="text-sm font-medium">
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

                  {watchedValues.allowOffers ? (
                    <div className="mt-4 space-y-2">
                      <Label htmlFor="floorPrice">Internal floor price per Sq Ft ($)</Label>
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
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-2xl border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="edit-automatic-markdown" className="text-sm font-medium">
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
                          description="This preview uses the current ask price and updates if you change the markdown rule."
                        />
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Add a valid ask price, floor percent, and interval to
                          preview the markdown schedule.
                        </p>
                      )}
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
                  <p className="text-sm font-medium">Sales tax</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Sales-tax registration states are managed in seller
                    preferences and are stored for operations only. Automatic
                    tax calculation is not yet live in checkout.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Condition & Certifications */}
        <Card>
          <CardHeader>
            <CardTitle>Condition & Certifications</CardTitle>
            <CardDescription>
              Product condition and any certifications
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Condition *</Label>
              <Select
                value={watchedValues.condition}
                onValueChange={(v) =>
                  setValue("condition", v as ListingFormInput["condition"], { shouldDirty: true })
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
                  setValue("reasonCode", v as ListingFormInput["reasonCode"], { shouldDirty: true })
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
                    watchedValues.certifications?.includes(cert.value) ?? false;
                  return (
                    <Badge
                      key={cert.value}
                      variant={isSelected ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => {
                        const current = watchedValues.certifications ?? [];
                        const updated = isSelected
                          ? current.filter((c) => c !== cert.value)
                          : [...current, cert.value];
                        setValue("certifications", updated, { shouldDirty: true });
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

        {/* Photos */}
        <Card>
          <CardHeader>
            <CardTitle>Photos</CardTitle>
            <CardDescription>
              Manage your listing photos. The first image will be the cover
              photo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PhotoUpload
              onImagesChange={(ids) => setValue("mediaIds", ids, { shouldDirty: true })}
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
