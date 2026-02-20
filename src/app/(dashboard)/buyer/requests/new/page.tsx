"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { useUploadThing } from "@/lib/uploadthing";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { ArrowLeft, Loader2, ChevronDown, ChevronUp, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDropzone } from "react-dropzone";
import Image from "next/image";
import Link from "next/link";

// ─── Constants ────────────────────────────────────────────────────────────────

const MATERIAL_TYPES = [
  { value: "hardwood", label: "Hardwood" },
  { value: "engineered", label: "Engineered" },
  { value: "laminate", label: "Laminate" },
  { value: "vinyl_lvp", label: "Vinyl / LVP" },
  { value: "bamboo", label: "Bamboo" },
  { value: "tile", label: "Tile" },
  { value: "other", label: "Other" },
] as const;

type MaterialType = (typeof MATERIAL_TYPES)[number]["value"];

const INSTALL_TYPES = [
  { value: "click", label: "Click Lock" },
  { value: "glue", label: "Glue Down" },
  { value: "nail", label: "Nail Down" },
  { value: "float", label: "Floating" },
] as const;

type InstallType = (typeof INSTALL_TYPES)[number]["value"];

const FINISH_TYPES = [
  { value: "matte", label: "Matte" },
  { value: "semi_gloss", label: "Semi-Gloss" },
  { value: "gloss", label: "Gloss" },
  { value: "wire_brushed", label: "Wire Brushed" },
  { value: "hand_scraped", label: "Hand Scraped" },
  { value: "smooth", label: "Smooth" },
  { value: "unfinished", label: "Unfinished" },
] as const;

type FinishType = (typeof FINISH_TYPES)[number]["value"];

const CERTIFICATIONS = [
  { value: "FSC", label: "FSC" },
  { value: "FloorScore", label: "FloorScore" },
  { value: "GreenGuard", label: "GreenGuard" },
  { value: "GreenGuard Gold", label: "GreenGuard Gold" },
  { value: "CARB2", label: "CARB2" },
  { value: "LEED", label: "LEED" },
  { value: "NAUF", label: "NAUF" },
] as const;

type Certification = (typeof CERTIFICATIONS)[number]["value"];

const URGENCY_OPTIONS = [
  { value: "asap", label: "ASAP" },
  { value: "2_weeks", label: "Within 2 weeks" },
  { value: "4_weeks", label: "Within 4 weeks" },
  { value: "flexible", label: "Flexible" },
] as const;

type Urgency = (typeof URGENCY_OPTIONS)[number]["value"];

// ─── Multi-select Badge helper ────────────────────────────────────────────────

function MultiSelectBadges<T extends string>({
  options,
  selected,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  selected: T[];
  onChange: (values: T[]) => void;
}) {
  const toggle = (value: T) => {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value]
    );
  };
  return (
    <div className="flex flex-wrap gap-2" role="group">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => toggle(opt.value)}
          aria-pressed={selected.includes(opt.value)}
          className="focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full"
        >
          <Badge
            variant={selected.includes(opt.value) ? "default" : "outline"}
            className="cursor-pointer select-none"
          >
            {opt.label}
          </Badge>
        </button>
      ))}
    </div>
  );
}

// ─── Form state ───────────────────────────────────────────────────────────────

interface UploadedRefImage {
  id: string;
  url: string;
  fileName: string;
}

type FormState = {
  materialTypes: MaterialType[];
  minTotalSqFt: string;
  maxTotalSqFt: string;
  priceMaxPerSqFt: string;
  priceMinPerSqFt: string;
  destinationZip: string;
  pickupOk: boolean;
  pickupRadiusMiles: string;
  shippingOk: boolean;
  thicknessMinMm: string;
  wearLayerMinMil: string;
  installTypes: InstallType[];
  waterproofRequired: boolean;
  species: string;
  finishTypes: FinishType[];
  certifications: Certification[];
  urgency: Urgency;
  notes: string;
};

const defaultForm: FormState = {
  materialTypes: [],
  minTotalSqFt: "",
  maxTotalSqFt: "",
  priceMaxPerSqFt: "",
  priceMinPerSqFt: "",
  destinationZip: "",
  pickupOk: false,
  pickupRadiusMiles: "",
  shippingOk: true,
  thicknessMinMm: "",
  wearLayerMinMil: "",
  installTypes: [],
  waterproofRequired: false,
  species: "",
  finishTypes: [],
  certifications: [],
  urgency: "flexible",
  notes: "",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewBuyerRequestPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(defaultForm);
  const [specsOpen, setSpecsOpen] = useState(false);

  const [refImages, setRefImages] = useState<UploadedRefImage[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const utils = trpc.useUtils();
  const createMutation = trpc.buyerRequest.create.useMutation({
    onSuccess: () => {
      utils.buyerRequest.getMyRequests.invalidate();
    },
  });

  const recordBuyerUpload = trpc.upload.recordBuyerUpload.useMutation();
  const deleteBuyerMedia = trpc.upload.deleteBuyerMedia.useMutation();

  const { startUpload } = useUploadThing("buyerRequestImageUploader", {
    onClientUploadComplete: async (files) => {
      if (!files) return;
      try {
        const records = await recordBuyerUpload.mutateAsync({
          files: files.map((file) => ({
            url: file.url,
            key: file.key,
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type,
          })),
        });
        const newImages = records.map((r) => ({
          id: r.id,
          url: r.url,
          fileName: r.fileName || "Untitled",
        }));
        setRefImages((prev) => [...prev, ...newImages]);
        toast.success(`${files.length} photo${files.length > 1 ? "s" : ""} uploaded`);
      } catch {
        toast.error("Failed to save image records");
      } finally {
        setIsUploading(false);
        setUploadProgress(0);
      }
    },
    onUploadError: (error) => {
      toast.error(error.message || "Failed to upload images");
      setIsUploading(false);
      setUploadProgress(0);
    },
    onUploadBegin: () => {
      setIsUploading(true);
      setUploadProgress(10);
    },
    onUploadProgress: (progress) => {
      setUploadProgress(progress);
    },
  });

  const onDropRef = useCallback(
    async (acceptedFiles: File[]) => {
      const remaining = 5 - refImages.length;
      if (acceptedFiles.length > remaining) {
        toast.error(`You can only upload ${remaining} more reference image${remaining !== 1 ? "s" : ""}`);
        return;
      }
      const oversized = acceptedFiles.filter((f) => f.size > 4 * 1024 * 1024);
      if (oversized.length > 0) {
        toast.error(`Some files exceed 4MB limit: ${oversized.map((f) => f.name).join(", ")}`);
        return;
      }
      if (acceptedFiles.length > 0) {
        await startUpload(acceptedFiles);
      }
    },
    [refImages.length, startUpload]
  );

  const refDropzone = useDropzone({
    onDrop: onDropRef,
    accept: { "image/*": [".png", ".jpg", ".jpeg", ".webp"] },
    maxFiles: 5,
    disabled: isUploading || refImages.length >= 5,
  });

  const handleDeleteRefImage = async (imageId: string) => {
    try {
      await deleteBuyerMedia.mutateAsync({ id: imageId });
      setRefImages((prev) => prev.filter((img) => img.id !== imageId));
      toast.success("Image deleted");
    } catch {
      toast.error("Failed to delete image");
    }
  };

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (form.materialTypes.length === 0) {
      toast.error("Please select at least one material type.");
      return;
    }
    if (!form.minTotalSqFt) {
      toast.error("Minimum square footage is required.");
      return;
    }
    if (!form.priceMaxPerSqFt) {
      toast.error("Maximum price per sqft is required.");
      return;
    }
    if (!form.destinationZip || !/^\d{5}$/.test(form.destinationZip)) {
      toast.error("Please enter a valid 5-digit destination ZIP code.");
      return;
    }

    try {
      // Build optional specs object
      const hasSpecs =
        form.thicknessMinMm ||
        form.wearLayerMinMil ||
        form.installTypes.length ||
        form.waterproofRequired ||
        form.species ||
        form.finishTypes.length ||
        form.certifications.length;

      const specs = hasSpecs
        ? {
            thicknessMinMm: form.thicknessMinMm
              ? Number(form.thicknessMinMm)
              : undefined,
            wearLayerMinMil: form.wearLayerMinMil
              ? Number(form.wearLayerMinMil)
              : undefined,
            installTypes: form.installTypes.length
              ? form.installTypes
              : undefined,
            waterproofRequired: form.waterproofRequired || undefined,
            species: form.species
              ? form.species.split(",").map((s) => s.trim()).filter(Boolean)
              : undefined,
            finishTypes: form.finishTypes.length
              ? form.finishTypes
              : undefined,
            certifications: form.certifications.length
              ? form.certifications
              : undefined,
          }
        : undefined;

      await createMutation.mutateAsync({
        materialTypes: form.materialTypes,
        minTotalSqFt: Number(form.minTotalSqFt),
        maxTotalSqFt: form.maxTotalSqFt ? Number(form.maxTotalSqFt) : undefined,
        priceMaxPerSqFt: Number(form.priceMaxPerSqFt),
        priceMinPerSqFt: form.priceMinPerSqFt
          ? Number(form.priceMinPerSqFt)
          : undefined,
        destinationZip: form.destinationZip,
        pickupOk: form.pickupOk,
        pickupRadiusMiles: form.pickupRadiusMiles
          ? Number(form.pickupRadiusMiles)
          : undefined,
        shippingOk: form.shippingOk,
        specs,
        urgency: form.urgency,
        notes: form.notes || undefined,
        mediaIds: refImages.length > 0 ? refImages.map((img) => img.id) : undefined,
      });

      toast.success("Request posted! Sellers will respond soon.");
      router.push("/buyer/requests");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to post request.";
      toast.error(msg);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/buyer/requests">
          <Button variant="ghost" size="icon" aria-label="Back to requests">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">New Request</h1>
          <p className="text-muted-foreground mt-0.5">
            Tell sellers what you need
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        {/* Material Types */}
        <Card>
          <CardHeader>
            <CardTitle>
              Material Types <span className="text-destructive" aria-hidden="true">*</span>
            </CardTitle>
            <CardDescription>Select all that apply</CardDescription>
          </CardHeader>
          <CardContent>
            <MultiSelectBadges
              options={MATERIAL_TYPES}
              selected={form.materialTypes}
              onChange={(v) => set("materialTypes", v)}
            />
          </CardContent>
        </Card>

        {/* Quantity */}
        <Card>
          <CardHeader>
            <CardTitle>Quantity</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="req-min-sqft">
                Min Square Footage <span aria-hidden="true" className="text-destructive">*</span>
              </Label>
              <Input
                id="req-min-sqft"
                type="number"
                min={1}
                required
                value={form.minTotalSqFt}
                onChange={(e) => set("minTotalSqFt", e.target.value)}
                placeholder="e.g. 500"
                aria-required="true"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="req-max-sqft">Max Square Footage</Label>
              <Input
                id="req-max-sqft"
                type="number"
                min={1}
                value={form.maxTotalSqFt}
                onChange={(e) => set("maxTotalSqFt", e.target.value)}
                placeholder="optional"
              />
            </div>
          </CardContent>
        </Card>

        {/* Budget */}
        <Card>
          <CardHeader>
            <CardTitle>Budget</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="req-price-min">Min Price / sqft ($)</Label>
              <Input
                id="req-price-min"
                type="number"
                min={0}
                step={0.01}
                value={form.priceMinPerSqFt}
                onChange={(e) => set("priceMinPerSqFt", e.target.value)}
                placeholder="optional"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="req-price-max">
                Max Price / sqft ($) <span aria-hidden="true" className="text-destructive">*</span>
              </Label>
              <Input
                id="req-price-max"
                type="number"
                min={0}
                step={0.01}
                required
                value={form.priceMaxPerSqFt}
                onChange={(e) => set("priceMaxPerSqFt", e.target.value)}
                placeholder="e.g. 3.50"
                aria-required="true"
              />
            </div>
          </CardContent>
        </Card>

        {/* Location */}
        <Card>
          <CardHeader>
            <CardTitle>
              Location{" "}
              <span className="text-destructive" aria-hidden="true">*</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="req-zip">
                Destination ZIP Code <span className="text-destructive" aria-hidden="true">*</span>
              </Label>
              <Input
                id="req-zip"
                value={form.destinationZip}
                onChange={(e) => set("destinationZip", e.target.value)}
                placeholder="e.g. 90210"
                maxLength={5}
                pattern="[0-9]{5}"
                aria-required="true"
              />
            </div>
            <div className="flex items-center gap-3">
              <input
                id="req-pickup"
                type="checkbox"
                checked={form.pickupOk}
                onChange={(e) => set("pickupOk", e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              <Label htmlFor="req-pickup">Willing to pick up</Label>
            </div>
            {form.pickupOk && (
              <div className="space-y-1.5 ml-7">
                <Label htmlFor="req-pickup-radius">Pickup radius (miles)</Label>
                <Input
                  id="req-pickup-radius"
                  type="number"
                  min={10}
                  max={500}
                  value={form.pickupRadiusMiles}
                  onChange={(e) => set("pickupRadiusMiles", e.target.value)}
                  placeholder="e.g. 100"
                  className="max-w-[180px]"
                />
              </div>
            )}
            <div className="flex items-center gap-3">
              <input
                id="req-shipping"
                type="checkbox"
                checked={form.shippingOk}
                onChange={(e) => set("shippingOk", e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              <Label htmlFor="req-shipping">Accept shipped lots</Label>
            </div>
          </CardContent>
        </Card>

        {/* Specs accordion */}
        <Card>
          <CardHeader className="pb-3">
            <button
              type="button"
              onClick={() => setSpecsOpen((o) => !o)}
              className="flex items-center justify-between w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              aria-expanded={specsOpen}
            >
              <div>
                <CardTitle>Product Specs</CardTitle>
                <CardDescription className="mt-0.5">
                  Optional — narrows results
                </CardDescription>
              </div>
              {specsOpen ? (
                <ChevronUp
                  className="h-4 w-4 text-muted-foreground"
                  aria-hidden="true"
                />
              ) : (
                <ChevronDown
                  className="h-4 w-4 text-muted-foreground"
                  aria-hidden="true"
                />
              )}
            </button>
          </CardHeader>
          {specsOpen && (
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="req-thick">Min Thickness (mm)</Label>
                  <Input
                    id="req-thick"
                    type="number"
                    min={0}
                    step={0.5}
                    value={form.thicknessMinMm}
                    onChange={(e) => set("thicknessMinMm", e.target.value)}
                    placeholder="e.g. 12"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="req-wear">Min Wear Layer (mil)</Label>
                  <Input
                    id="req-wear"
                    type="number"
                    min={0}
                    value={form.wearLayerMinMil}
                    onChange={(e) => set("wearLayerMinMil", e.target.value)}
                    placeholder="e.g. 12"
                  />
                </div>
              </div>
              <Separator />
              <div className="space-y-1.5">
                <Label>Install Types</Label>
                <MultiSelectBadges
                  options={INSTALL_TYPES}
                  selected={form.installTypes}
                  onChange={(v) => set("installTypes", v)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Finish Types</Label>
                <MultiSelectBadges
                  options={FINISH_TYPES}
                  selected={form.finishTypes}
                  onChange={(v) => set("finishTypes", v)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="req-species">Species (comma-separated)</Label>
                <Input
                  id="req-species"
                  value={form.species}
                  onChange={(e) => set("species", e.target.value)}
                  placeholder="e.g. Oak, Maple"
                />
              </div>
              <div className="flex items-center gap-3">
                <input
                  id="req-waterproof"
                  type="checkbox"
                  checked={form.waterproofRequired}
                  onChange={(e) =>
                    set("waterproofRequired", e.target.checked)
                  }
                  className="h-4 w-4 accent-primary"
                />
                <Label htmlFor="req-waterproof">Waterproof required</Label>
              </div>
              <div className="space-y-1.5">
                <Label>Certifications</Label>
                <MultiSelectBadges
                  options={CERTIFICATIONS}
                  selected={form.certifications}
                  onChange={(v) => set("certifications", v)}
                />
              </div>
            </CardContent>
          )}
        </Card>

        {/* Urgency */}
        <Card>
          <CardHeader>
            <CardTitle>Urgency</CardTitle>
          </CardHeader>
          <CardContent>
            <fieldset>
              <legend className="sr-only">Purchase urgency</legend>
              <div className="flex flex-wrap gap-3">
                {URGENCY_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="urgency"
                      value={opt.value}
                      checked={form.urgency === opt.value}
                      onChange={() => set("urgency", opt.value)}
                      className="accent-primary"
                    />
                    <span className="text-sm">{opt.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardHeader>
            <CardTitle>Additional Notes</CardTitle>
            <CardDescription>Optional — max 1,000 characters</CardDescription>
          </CardHeader>
          <CardContent>
            <Label htmlFor="req-notes" className="sr-only">
              Additional notes
            </Label>
            <Textarea
              id="req-notes"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              maxLength={1000}
              rows={4}
              placeholder="Any other details sellers should know..."
            />
            <p className="text-xs text-muted-foreground mt-1 text-right">
              {form.notes.length}/1000
            </p>
          </CardContent>
        </Card>

        {/* Reference Photos */}
        <Card>
          <CardHeader>
            <CardTitle>Reference Photos</CardTitle>
            <CardDescription>
              Optional — upload up to 5 images to show sellers what you&apos;re looking for
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm font-medium">
              {refImages.length} / 5 photos uploaded
            </div>

            {refImages.length < 5 && (
              <div
                {...refDropzone.getRootProps()}
                className={cn(
                  "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
                  refDropzone.isDragActive
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/25 hover:border-primary/50",
                  isUploading && "pointer-events-none opacity-50"
                )}
              >
                <input {...refDropzone.getInputProps()} aria-label="Upload reference images" />
                <div className="mx-auto w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-3">
                  <Upload className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium mb-1">
                  {refDropzone.isDragActive
                    ? "Drop images here"
                    : "Drag and drop images, or click to select"}
                </p>
                <p className="text-xs text-muted-foreground">
                  PNG, JPG, or WEBP (max 4MB each)
                </p>
              </div>
            )}

            {isUploading && (
              <div className="space-y-2">
                <Progress value={uploadProgress} className="h-2" />
                <p className="text-xs text-center text-muted-foreground">
                  Uploading... {uploadProgress}%
                </p>
              </div>
            )}

            {refImages.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                {refImages.map((image) => (
                  <div
                    key={image.id}
                    className="relative group aspect-square rounded-lg overflow-hidden border bg-muted"
                  >
                    <Image
                      src={image.url}
                      alt={image.fileName}
                      fill
                      sizes="(max-width: 640px) 33vw, 20vw"
                      className="object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Button
                        type="button"
                        size="icon"
                        variant="destructive"
                        className="h-8 w-8"
                        onClick={() => handleDeleteRefImage(image.id)}
                        aria-label={`Delete ${image.fileName}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex justify-end gap-3 pb-6">
          <Link href="/buyer/requests">
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending && (
              <Loader2
                className="mr-2 h-4 w-4 animate-spin"
                aria-hidden="true"
              />
            )}
            Post Request
          </Button>
        </div>
      </form>
    </div>
  );
}
