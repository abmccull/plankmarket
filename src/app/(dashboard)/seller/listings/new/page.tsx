"use client";

import { useState } from "react";
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
import { toast } from "sonner";
import { Loader2, ArrowLeft, ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { PhotoUpload } from "@/components/listings/photo-upload";
import { WIDTH_OPTIONS, THICKNESS_OPTIONS, getWearLayerOptionsForSingle } from "@/lib/constants/flooring";

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
  2: ["totalSqFt", "totalPallets", "palletWeight", "palletLength", "palletWidth", "palletHeight"],
  3: ["askPricePerSqFt"],
  4: ["condition"],
  5: [],
  6: [],
};

export default function CreateListingPage() {
  const router = useRouter();
  const { currentStep, formData, uploadedMediaIds, setStep, nextStep, prevStep, updateFormData, setMediaIds, reset } =
    useListingFormStore();
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      toast.success("Listing created successfully!");
      reset();
      router.push(`/listings/${listing.id}`);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to create listing";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Create New Listing</h1>
        <p className="text-muted-foreground mt-1">
          List your flooring inventory for buyers to discover
        </p>
      </div>

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

              <Separator className="my-4" />

              <div className="space-y-2">
                <Label htmlFor="moq">Minimum Order Quantity (sq ft)</Label>
                <Input
                  id="moq"
                  type="number"
                  step="0.01"
                  placeholder="500"
                  {...register("moq", { valueAsNumber: true })}
                />
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
            <CardContent className="space-y-4">
              {STEP_FIELDS[3]?.some(f => errors[f]) && (
                <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 mb-4">
                  <p className="text-sm font-medium text-destructive">
                    Please fix the highlighted fields to continue
                  </p>
                </div>
              )}
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

              <Separator className="my-4" />

              <div className="space-y-2">
                <Label htmlFor="buyNowPrice">
                  Buy Now Price ($, optional)
                </Label>
                <Input
                  id="buyNowPrice"
                  type="number"
                  step="0.01"
                  placeholder="6000.00"
                  {...register("buyNowPrice", { valueAsNumber: true })}
                />
                <p className="text-xs text-muted-foreground">
                  Set a fixed price for immediate purchase of the entire lot
                </p>
              </div>

              <Separator className="my-4" />

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300"
                    {...register("allowOffers")}
                  />
                  <span className="text-sm font-medium">Accept Offers</span>
                </label>
              </div>

              {watchedValues.allowOffers && (
                <div className="space-y-2">
                  <Label htmlFor="floorPrice">
                    Floor Price per Sq Ft ($)
                  </Label>
                  <Input
                    id="floorPrice"
                    type="number"
                    step="0.01"
                    placeholder="2.00"
                    {...register("floorPrice", { valueAsNumber: true })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Minimum price you will accept. Not visible to buyers.
                  </p>
                </div>
              )}

              <div className="rounded-lg bg-muted/50 p-4 mt-4">
                <h4 className="text-sm font-medium mb-2">Fee Breakdown</h4>
                <div className="space-y-1 text-sm text-muted-foreground">
                  <p>Seller fee: 2% of transaction value</p>
                  <p>Buyer fee: 3% (paid by buyer)</p>
                  <p>Blended rate: ~5% total transaction cost</p>
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

              {watchedValues.askPricePerSqFt > 0 &&
                watchedValues.totalSqFt > 0 && (
                  <div className="rounded-lg bg-primary/5 p-4">
                    <h3 className="font-semibold mb-2">Listing Summary</h3>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <span>Total lot value:</span>
                      <span className="font-medium text-right">
                        $
                        {(
                          watchedValues.askPricePerSqFt *
                          watchedValues.totalSqFt
                        ).toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                      <span>Seller fee (2%):</span>
                      <span className="text-right">
                        -$
                        {(
                          watchedValues.askPricePerSqFt *
                          watchedValues.totalSqFt *
                          0.02
                        ).toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                      <span className="font-medium">Your payout:</span>
                      <span className="font-medium text-right text-primary">
                        $
                        {(
                          watchedValues.askPricePerSqFt *
                          watchedValues.totalSqFt *
                          0.98
                        ).toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                  </div>
                )}
            </CardContent>
          </Card>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6">
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
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Publish Listing
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
