"use client";

import { ListingFormIssueSummary, ListingFieldError, getListingFormIssues, focusListingField, revealListingNativeError, preserveListingNumberInput, LISTING_STEP_FIELDS } from "@/components/listings/listing-form-feedback";
import { ListingOptionalSection, ListingCommercialSummary } from "@/components/listings/listing-optional-section";
import { ListingPickupWarehouse } from "@/components/listings/listing-pickup-warehouse";
import { ReuseProductDialog } from "@/components/listings/reuse-product-dialog";
import { ReusePalletDialog } from "@/components/listings/reuse-pallet-dialog";
import { replaceProductDetails, REUSABLE_PRODUCT_KEYS, type ReusableProduct } from "@/lib/marketplace/reusable-listing-product";


import { useState, useEffect, useRef, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ProductSpecificationFields } from "@/components/listings/product-specification-fields";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  listingCreationSchema,
  listingPalletDimensionsSchema,
  CLEARABLE_LISTING_NUMBER_FIELDS,
  type ListingFormInput,
} from "@/lib/validators/listing";
import { useAccountListingDraft } from "@/hooks/use-account-listing-draft";
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
  AlertTriangle,
  ChevronDown,
  Target,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import {
  BUYER_MARKETPLACE_FEE_PERCENT,
  SELLER_MARKETPLACE_FEE_PERCENT,
  calculateOrderFees,
} from "@/lib/fees";
import { PrivatePhotoUpload } from "@/components/listings/private-photo-upload";
import { WIDTH_OPTIONS, THICKNESS_OPTIONS, getWearLayerOptionsForSingle } from "@/lib/constants/flooring";
import { getFreightDefaults, FREIGHT_CLASS_OPTIONS } from "@/lib/constants/freight-defaults";
import { OnboardingTip } from "@/components/ui/onboarding-tip";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useProStatus } from "@/hooks/use-pro-status";
import { FREE_LIMITS } from "@/lib/pro";
import Link from "next/link";
import {
  parseSellerListingDemandContext,
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
  { id: 1, title: "Product & photos", description: "Identify the material" },
  { id: 2, title: "Quantity & price", description: "Set the lot and freight" },
  { id: 3, title: "Review & publish", description: "Confirm your terms" },
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

const createStep = (legacyStep: number) => legacyStep === 6 ? 3 : [1, 4, 5].includes(legacyStep) ? 1 : 2;
const STEP_FIELDS = {
  1: [...LISTING_STEP_FIELDS[1], ...LISTING_STEP_FIELDS[4]],
  2: [...LISTING_STEP_FIELDS[2], ...LISTING_STEP_FIELDS[3]],
} as Record<number, (keyof ListingFormInput)[]>;
const numericInputValue = (value: string | number | null | undefined) => value === "" || value == null ? undefined : Number(value);
function restoredCreateDraft(data: Partial<ListingFormInput>) {
  const restored = { ...data };
  for (const field of CLEARABLE_LISTING_NUMBER_FIELDS) {
    if (restored[field] === null) restored[field] = undefined;
  }
  return restored;
}

function subscribeToListingQuery(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

export default function CreateListingPage() {
  const { user, isLoading } = useAuthStore();
  if (isLoading || !user || !["seller", "admin"].includes(user.role)) return <p role="status">Loading your listing draft…</p>;
  return <AccountListingDraft key={user.id} sellerId={user.id} />;
}

function AccountListingDraft({ sellerId }: { sellerId: string }) {
  const account = useAccountListingDraft(sellerId);
  const [confirmedReceipt, setConfirmedReceipt] = useState<string | null>(null);
  if (account.phase === "loading" && !confirmedReceipt) return <p role="status">Loading your account draft…</p>;
  const needsChoice = account.phase === "conflict";
  return <>
    {(account.message || account.mediaWarning) && <section className="mb-6 max-w-4xl mx-auto space-y-3 border-l-2 border-amber-500 pl-4" aria-label="Draft recovery">
      <p role="alert">{account.message ?? "Some saved photos are unavailable. Your details are saved; replace the affected photos before publishing."}</p>
      <div className="flex flex-wrap gap-2">
        {(account.phase === "error" || needsChoice) && !["unknown", "uploading"].includes(account.photoState) && <Button type="button" onClick={() => void account.retry()}>Check account draft again</Button>}
        {account.mediaWarning && !needsChoice && <Button type="button" variant="outline" disabled={account.photoBlocked} onClick={account.removeUnavailablePhotos}>Remove unavailable photo references</Button>}
        {needsChoice && <Button type="button" onClick={account.useAccountVersion}>{account.remoteState === "published" ? "View publication confirmation" : "Use account version"}</Button>}
        {needsChoice && account.remoteState === "editing" && <Button type="button" variant="outline" onClick={() => { if (window.confirm("Replace the account version with this device's edits? Download a recovery copy first if you need both versions.")) void account.keepThisVersion(); }}>Keep this device’s version</Button>}
        <Button type="button" variant="ghost" onClick={account.exportLocal}>Download this device’s copy</Button>
      </div>
    </section>}
    {confirmedReceipt ? <section className="max-w-2xl space-y-4" aria-labelledby="account-published-title">
      <h1 id="account-published-title" className="font-display text-3xl">Your listing was published</h1>
      <p>The server confirmed this listing. You do not need to submit this lot again.</p>
      {account.phase === "loading" && <p role="status">Refreshing your account draft…</p>}
      <div className="flex flex-wrap gap-3">
        <Button asChild><Link href={`/listings/${confirmedReceipt}`}>View published listing</Link></Button>
        <Button asChild variant="outline"><Link href="/seller/listings">Open inventory</Link></Button>
        <Button type="button" variant="outline" disabled={!["ready", "saved"].includes(account.phase)} onClick={async () => { if (await account.startNew()) setConfirmedReceipt(null); }}>Prepare another lot</Button>
      </div>
    </section> : account.resolved && !needsChoice && <fieldset disabled={account.phase === "advancing"} className="min-w-0"><legend className="sr-only">Prepare your listing</legend><SellerListingDraft key={account.generation} account={account} onPublished={setConfirmedReceipt} /></fieldset>}
  </>;
}

function SellerListingDraft({ account, onPublished }: { account: ReturnType<typeof useAccountListingDraft>; onPublished: (id: string) => void }) {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuthStore();
  const { saveError: draftSaveError, restoreError, storageReadBlocked, publishedListingId, sellerId: draftSellerId, currentStep, formData, uploadedMediaIds, setStep, nextStep, prevStep, updateFormData, setMediaIds, reset, retryRestore, saveDraft, continueWithoutSaving, completePublication } =
    useListingFormStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [photoInteractionBlocked, setPhotoBusy] = useState(false);
  const photoBusy = photoInteractionBlocked || account.photoBlocked;
  const canEditDraft = account.canEdit;
  const [confirmedListingId, setConfirmedListingId] = useState<string | null>(null);
  const publishingRef = useRef(false);
  const draftMountedRef = useRef(false);
  const listingFormRef = useRef<HTMLFormElement>(null);
  const [pendingErrorRequest, setPendingErrorRequest] = useState<{ field: keyof ListingFormInput; sequence: number } | null>(null);
  const lastFocusedRequest = useRef(0);
  const setPendingErrorField = (field: keyof ListingFormInput) => setPendingErrorRequest(previous => ({ field, sequence: (previous?.sequence ?? 0) + 1 }));
  const querySnapshot = useSyncExternalStore(subscribeToListingQuery, () => window.location.search, () => "");
  const parsedContext = parseSellerListingDemandContext(new URLSearchParams(querySnapshot));
  const demandContext = parsedContext.source === "zero_results" ? parsedContext : null;
  const demandContextAppliedRef = useRef(false);
  const { isPro } = useProStatus();
  const verificationQuery = trpc.auth.getSession.useQuery(undefined, {
    enabled: Boolean(user && !authLoading),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    retry: false,
  });
  const verifiedSession = verificationQuery.data?.user;
  const canPublish = verificationQuery.isFetchedAfterMount && !verificationQuery.isError && !verificationQuery.isLoading &&
    verificationQuery.data?.isAuthenticated === true &&
    verifiedSession?.id === user?.id &&
    (verifiedSession?.role === "admin" ||
      (verifiedSession?.role === "seller" && verifiedSession.verificationStatus === "verified"));
  const { data: sellerStats } = trpc.listing.getSellerStats.useQuery(undefined, { enabled: canPublish });
  const warehouseQuery = trpc.warehouse.list.useQuery(undefined, {
    enabled: canPublish, staleTime: 0, refetchOnMount: "always", retry: false,
  });
  const { data: sellerPreferences } = trpc.preferences.get.useQuery(undefined, { enabled: Boolean(user && !authLoading) });
  const sellerDefaultsAppliedRef = useRef(false);

  const activeListingCount = sellerStats
    ?.filter((s) => s.status === "active")
    .reduce((sum, s) => sum + s.count, 0) ?? 0;
  const atListingLimit = !isPro && activeListingCount >= FREE_LIMITS.activeListings;
  const isPreparingLocally = !canPublish;
  const verificationUnavailable = verificationQuery.isError ||
    (!verificationQuery.isLoading && (!verificationQuery.data?.isAuthenticated || verifiedSession?.id !== user?.id));

  const createMutation = trpc.listing.create.useMutation();

  const {
    register,
    handleSubmit,
    reset: resetForm,
    setValue,
    control,
    subscribe,
    trigger,
    getFieldState,
    getValues,
    clearErrors,
    formState: { errors },
  } = useForm<ListingFormInput>({
    resolver: zodResolver(listingCreationSchema) as never,
    shouldUnregister: false,
    shouldFocusError: false,
    defaultValues: restoredCreateDraft(formData),
  });

  useEffect(() => {
    useListingFormStore.getState().bindSeller(user?.id ?? null);
    sellerDefaultsAppliedRef.current = useListingFormStore.getState().defaultsApplied;
    resetForm(restoredCreateDraft(useListingFormStore.getState().formData));
    draftMountedRef.current = true;
    demandContextAppliedRef.current = false;
    return () => {
      draftMountedRef.current = false;
      const draft = useListingFormStore.getState();
      if (useAuthStore.getState().user?.id !== user?.id && draft.sellerId === user?.id) draft.bindSeller(null);
    };
  }, [user?.id, resetForm]);

  useEffect(() => {
    return subscribe({ formState: { values: true }, callback: ({ values }) => {
      const draft = useListingFormStore.getState();
      if (user?.id && draftMountedRef.current && canEditDraft() && useAuthStore.getState().user?.id === user.id && draft.sellerId === user.id) draft.updateFormData(values as Partial<ListingFormInput>);
    } });
  }, [subscribe, user?.id, canEditDraft]);

  const watchedValues = useWatch({ control }) as ListingFormInput;
  // Cached or late responses from a departed account must never supply an origin.
  const warehouseDataOwned = canPublish && warehouseQuery.isFetchedAfterMount &&
    !warehouseQuery.isError && warehouseQuery.data?.ownerId === user?.id;
  const pickupWarehouses = warehouseDataOwned
    ? warehouseQuery.data!.warehouses.filter(warehouse => warehouse.sellerId === user?.id && warehouse.active)
    : [];
  const selectedWarehouse = pickupWarehouses.find(warehouse => warehouse.id === watchedValues.warehouseId);
  const warehouseChanged = Boolean(selectedWarehouse && (
    selectedWarehouse.revision !== watchedValues.warehouseRevision ||
    selectedWarehouse.city !== watchedValues.locationCity || selectedWarehouse.state !== watchedValues.locationState ||
    selectedWarehouse.zip !== watchedValues.locationZip
  ));
  const warehouseUnavailable = canPublish && !warehouseQuery.isFetching && !warehouseDataOwned;
  const warehouseIssue = !watchedValues.warehouseId ? null
    : !canPublish ? "Business approval is needed to confirm this saved pickup warehouse. Your selection is still saved."
    : warehouseQuery.isFetching ? "Wait for the pickup warehouse details to finish loading."
    : !warehouseDataOwned ? "We could not confirm this pickup warehouse. Refresh the saved warehouses or choose a manual location."
    : !selectedWarehouse ? "This pickup warehouse is no longer available. Choose an active warehouse or enter a location manually."
    : warehouseChanged ? "Pickup warehouse details changed. Review and accept the updated details before continuing."
    : null;
  const chooseWarehouse = (id: string) => {
    if (photoBusy || !canEditDraft() || publishingRef.current || useAuthStore.getState().user?.id !== user?.id ||
        useListingFormStore.getState().sellerId !== user?.id) return;
    const warehouse = pickupWarehouses.find(row => row.id === id);
    if (id !== "manual" && !warehouse) return;
    setValue("warehouseId", warehouse?.id, { shouldDirty: true });
    setValue("warehouseRevision", warehouse?.revision, { shouldDirty: true });
    if (warehouse) {
      setValue("locationCity", warehouse.city, { shouldDirty: true });
      setValue("locationState", warehouse.state, { shouldDirty: true });
      setValue("locationZip", warehouse.zip, { shouldDirty: true });
    }
    clearErrors(["warehouseId", "warehouseRevision", "locationCity", "locationState", "locationZip"]);
    updateFormData(getValues());
  };
  const checkPickup = () => {
    if (!warehouseIssue) return true;
    setStep(2);
    setPendingErrorField("warehouseId");
    toast.error(warehouseIssue);
    return false;
  };
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
    const latestDraft = useListingFormStore.getState();
    if (photoBusy || !canEditDraft() || !user?.id || useAuthStore.getState().user?.id !== user.id || latestDraft.sellerId !== user.id || latestDraft.restoreError || demandContextAppliedRef.current || !demandContext) return;
    const formData = latestDraft.formData;
    demandContextAppliedRef.current = true;
    const context = demandContext;
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
  }, [demandContext, formData, setValue, updateFormData, user?.id, photoBusy, canEditDraft]);

  useEffect(() => {
    if (photoBusy || !canEditDraft() || publishingRef.current || sellerDefaultsAppliedRef.current || !sellerPreferences || sellerPreferences.userId !== user?.id || draftSellerId !== user.id) return;
    const latestDraft = useListingFormStore.getState();
    if (useAuthStore.getState().user?.id !== user.id || latestDraft.sellerId !== user.id || latestDraft.restoreError) return;
    const formData = latestDraft.formData;
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
    useListingFormStore.getState().markDefaultsApplied();
  }, [formData, sellerPreferences, setValue, updateFormData, user?.id, draftSellerId, photoBusy, canEditDraft]);

  // Auto-populate NMFC code and freight class when material type changes
  const prevMaterialTypeRef = useRef<ListingFormInput["materialType"] | undefined>(watchedValues.materialType);
  useEffect(() => {
    if (photoBusy || !canEditDraft()) return;
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
  }, [watchedValues.materialType, watchedValues.nmfcCode, watchedValues.freightClass, setValue, photoBusy, canEditDraft]);

  const applyPreviousPallet = (dimensions: { palletLength: number; palletWidth: number; palletHeight: number }) => {
    const draft = useListingFormStore.getState();
    if (!draftMountedRef.current || !user || useAuthStore.getState().user?.id !== user.id || draft.sellerId !== user.id ||
        !canEditDraft() || !["ready", "saved"].includes(account.phase) || photoBusy || publishingRef.current ||
        isSubmitting || draft.publishedListingId || draft.storageReadBlocked) return false;
    const checked = listingPalletDimensionsSchema.safeParse(dimensions);
    if (!checked.success) return false;
    for (const field of ["palletLength", "palletWidth", "palletHeight"] as const) {
      setValue(field, checked.data[field], { shouldDirty: true, shouldValidate: true });
    }
    updateFormData(getValues());
    toast.success("Pallet dimensions applied. Confirm this lot's weight.");
    return true;
  };
  const applyPreviousProduct = (product: ReusableProduct) => {
    const draft = useListingFormStore.getState();
    if (!draftMountedRef.current || !user || useAuthStore.getState().user?.id !== user.id || draft.sellerId !== user.id ||
        !canEditDraft() || !["ready", "saved"].includes(account.phase) || photoBusy || publishingRef.current ||
        isSubmitting || draft.publishedListingId || draft.storageReadBlocked) return false;
    const next = replaceProductDetails(getValues(), product);
    // Reuse changes product specs only; suppress automatic freight defaults for
    // this deliberate replacement while preserving normal manual material edits.
    prevMaterialTypeRef.current = next.materialType;
    // Update defaults for fields on later steps, retaining registered DOM refs
    // so explicit clears cannot re-import the preceding product's values.
    resetForm(next, { keepValues: true, keepErrors: true });
    for (const field of REUSABLE_PRODUCT_KEYS) {
      setValue(field, next[field], { shouldDirty: true, shouldValidate: false });
    }
    updateFormData(next);
    clearErrors(REUSABLE_PRODUCT_KEYS);
    toast.success("Product details applied. Review this lot's condition, quantity, price and packing.");
    return true;
  };

  useEffect(() => {
    if (pendingErrorRequest && lastFocusedRequest.current !== pendingErrorRequest.sequence) {
      focusListingField(pendingErrorRequest.field);
      lastFocusedRequest.current = pendingErrorRequest.sequence;
    }
  }, [currentStep, pendingErrorRequest]);

  const chooseIssue = (field: keyof ListingFormInput) => {
    if (photoBusy || !canEditDraft()) return;
    const targetStep = getListingFormIssues(errors).find(issue => issue.field === field)?.step ?? currentStep;
    setStep(createStep(targetStep));
    setPendingErrorField(field);
  };

  const handleNext = async () => {
    if (photoBusy) { toast.info("Wait for your photos to finish saving."); return; }
    if (currentStep === 2 && !checkPickup()) return;
    if (listingFormRef.current && !listingFormRef.current.reportValidity()) return;
    updateFormData(watchedValues);

    if (currentStep === 1 && canPublish && uploadedMediaIds.length === 0) {
      toast.error("Add at least one product photo before continuing.");
      return;
    }

    const fields = STEP_FIELDS[currentStep];
    if (!fields || fields.length === 0) {
      nextStep();
      return;
    }

    const isValid = await trigger(fields);
    if (!draftMountedRef.current || useAuthStore.getState().user?.id !== user?.id || useListingFormStore.getState().sellerId !== user?.id) return;
    if (isValid) {
      nextStep();
    } else {
      const first = fields.find(field => getFieldState(field).invalid);
      if (first) setPendingErrorField(first);
    }
  };

  const handleBack = () => {
    if (photoBusy || !canEditDraft()) return;
    updateFormData(watchedValues);
    prevStep();
  };

  const goToVerification = async () => {
    if (photoBusy || !canEditDraft()) return;
    updateFormData(watchedValues);
    if (await account.saveNow()) router.push("/seller/verification?from=listing-draft");
  };

  const onSubmit = async (data: ListingFormInput) => {
    const draft = useListingFormStore.getState();
    // The resolver may settle after sign-out, account replacement or unmount.
    if (!draftMountedRef.current || !user || useAuthStore.getState().user?.id !== user.id || draft.sellerId !== user.id) return;
    if (publishingRef.current || publishedListingId || photoBusy) return;
    if (!checkPickup()) return;
    if (!canPublish || !user) {
      toast.error("Business approval is required before publication. Your draft is unchanged.");
      return;
    }
    if (uploadedMediaIds.length === 0) {
      setStep(1);
      toast.error("Add at least one saved product photo before publishing.");
      return;
    }
    const submittingSellerId = user.id;
    const submittedDraftSnapshot = JSON.stringify({ currentStep: draft.currentStep, formData: draft.formData, uploadedMediaIds: draft.uploadedMediaIds });
    const preserveUnreadDraft = useListingFormStore.getState().storageReadBlocked;
    publishingRef.current = true;
    setIsSubmitting(true);
    let createdListing: Awaited<ReturnType<typeof createMutation.mutateAsync>>;
    try {
      const accountDraft = await account.saveNow();
      if (!accountDraft) { publishingRef.current = false; setIsSubmitting(false); return; }
      if (!draftMountedRef.current || useAuthStore.getState().user?.id !== submittingSellerId) return;
      createdListing = await createMutation.mutateAsync({ ...data, mediaIds: uploadedMediaIds, accountDraft });
    } catch (error: unknown) {
      // Reconcile the account receipt before another attempt. The saved draft
      // generation makes publication idempotent after an uncertain response.
      if (!draftMountedRef.current || useAuthStore.getState().user?.id !== submittingSellerId || useListingFormStore.getState().sellerId !== submittingSellerId) return;
      publishingRef.current = false;
      setIsSubmitting(false);
      toast.error(error instanceof Error ? error.message : "We could not confirm publication. Checking your saved draft…");
      if (data.warehouseId) void warehouseQuery.refetch();
      void account.retry();
      return;
    }

    // Once create returns success, cleanup/navigation failures cannot become a
    // failed-create UI or unlock the same submission again.
    completePublication(submittingSellerId, createdListing.id, submittedDraftSnapshot, preserveUnreadDraft);
    if (!draftMountedRef.current || useAuthStore.getState().user?.id !== submittingSellerId || useListingFormStore.getState().sellerId !== submittingSellerId) return;
    setIsSubmitting(false);
    setConfirmedListingId(createdListing.id);
    onPublished(createdListing.id);
    toast.success("Your listing was published.");
    void account.retry();
    const cleanupWarning = useListingFormStore.getState().saveError;
    if (cleanupWarning) toast.warning(cleanupWarning);
    // Stay on the confirmed receipt. Explicit links handle navigation separately
    // so a failed destination cannot turn publication into a retryable form.
  };

  if (authLoading || !user || !["seller", "admin"].includes(user.role) || draftSellerId !== user.id) {
    return <p role="status">Loading your listing draft…</p>;
  }

  const receiptListingId = confirmedListingId ?? publishedListingId;
  if (receiptListingId) {
    return <section className="max-w-2xl space-y-4" aria-labelledby="published-listing-title">
      <h1 id="published-listing-title" className="font-display text-3xl">Your listing was published</h1>
      <p>The server confirmed this listing. You do not need to submit this lot again.</p>
      {confirmedListingId && publishedListingId !== confirmedListingId && <p role="alert">Your newer local draft was kept unchanged. Check your inventory before preparing the same lot again. Choosing Prepare another lot will clear that draft.</p>}
      {draftSaveError && <p role="alert" className="text-destructive">{draftSaveError}</p>}
      <div className="flex flex-wrap gap-3">
        <Button asChild><Link href={`/listings/${receiptListingId}`}>View published listing</Link></Button>
        <Button asChild variant="outline"><Link href="/seller/listings">Open inventory</Link></Button>
        <Button type="button" variant="outline" onClick={() => {
          void account.startNew();
        }}>Prepare another lot</Button>
      </div>
    </section>;
  }

  if (restoreError) {
    return <section className="max-w-2xl space-y-4" aria-labelledby="draft-restore-title">
      <h1 id="draft-restore-title" className="font-display text-3xl">Restore your local listing draft</h1>
      <p role="alert">{restoreError}</p>
      {draftSaveError && <p role="alert" className="text-destructive">{draftSaveError}</p>}
      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={() => { if (retryRestore()) resetForm(restoredCreateDraft(useListingFormStore.getState().formData)); }}>Retry draft restore</Button>
        <Button type="button" variant="outline" onClick={continueWithoutSaving}>Continue without saving</Button>
        <Button type="button" variant="outline" onClick={() => {
          if (window.confirm("Discard the saved listing draft on this browser? This cannot be undone.") && reset()) resetForm(restoredCreateDraft(useListingFormStore.getState().formData));
        }}>Discard saved draft</Button>
      </div>
    </section>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5 sm:space-y-8">
      {draftSaveError && <div role="alert" className="space-y-2 text-destructive"><p>{draftSaveError}</p>{storageReadBlocked ? <Button type="button" variant="outline" disabled={photoBusy} onClick={() => {
        if (window.confirm("Replace the edits in this open page with the saved browser draft?") && retryRestore()) resetForm(restoredCreateDraft(useListingFormStore.getState().formData));
      }}>Restore saved version (replace these edits)</Button> : <Button type="button" variant="outline" disabled={photoBusy} onClick={() => { updateFormData(watchedValues); if (saveDraft()) toast.success("Draft saved on this browser."); }}>Retry saving draft</Button>}</div>}
      <div>
        <h1 className="font-display text-3xl">{isPreparingLocally ? "Prepare a listing" : "Create a listing"}</h1>
        <p className="text-muted-foreground mt-1">
          Prepare your lot. Publish when you’re ready.
        </p>
      </div>

      <fieldset disabled={photoBusy} className="min-w-0"><legend className="sr-only">Account draft options</legend><section className="space-y-1 border-b pb-3" aria-label="Account listing draft">
        <div className="flex items-center justify-between gap-2">
          <p role="status" className="text-sm text-muted-foreground">{account.photoState === "uploading" ? "Saving photos to your account…" : account.photoBlocked ? "Photo save needs attention" : account.phase === "saving" ? "Saving to your account…" : account.phase === "saved" ? "Saved to your account" : account.phase === "error" ? "Account save needs attention" : account.phase === "conflict" ? "Choose a draft version" : account.phase === "loading" ? "Loading account draft…" : account.phase === "advancing" ? "Opening another draft…" : "Account save pending"}</p>
          <Button type="button" className="min-h-11 shrink-0" variant="ghost" size="sm" disabled={isSubmitting || account.phase === "saving" || account.phase === "error"} onClick={() => void account.saveNow()}>Save now</Button>
        </div>
        <details className="group" open={isPreparingLocally || verificationUnavailable}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm [&::-webkit-details-marker]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span>{canPublish ? verifiedSession?.stripeOnboardingComplete ? "Business approved · Payments ready" : "Business approved · Payments not connected" : verificationUnavailable ? "Approval status unavailable" : user.verificationStatus === "pending" ? "Business verification under review" : user.verificationStatus === "rejected" ? "Business verification needs an update" : "Business approval required"}<span className="block text-xs text-muted-foreground">Setup &amp; draft options</span></span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="space-y-3 pt-3">
        {canPublish && account.phase === "saved" && <p className="text-sm text-muted-foreground">Your account draft is ready to continue on another device.</p>}
        {canPublish && <ol className="grid grid-cols-3 gap-3 text-xs sm:text-sm" aria-label="Seller readiness">
          <li><span className="font-medium">1. Business</span><br />{canPublish ? "Approved" : "Approval required"}</li>
          <li><span className="font-medium">2. Listing</span><br />{uploadedMediaIds.length ? "Photos saved" : "Add details and photos"}</li>
          <li><span className="font-medium">3. Payments</span><br />{verifiedSession?.stripeOnboardingComplete ? "Ready for checkout" : canPublish ? <button type="button" className="min-h-11 underline underline-offset-4" onClick={async () => { if (await account.saveNow()) router.push("/seller/payments?from=listing-draft"); }}>Connect payments</button> : "Available after business approval"}</li>
        </ol>}
        {isPreparingLocally && <p className="text-sm">Prepare details and private photos now. Business approval is required before publishing.</p>}
        {verificationUnavailable && <p role="alert" className="text-sm">We could not confirm your business approval. Your draft remains available; publication is locked until approval is confirmed.</p>}
        <div className="flex flex-wrap gap-3">
          {isPreparingLocally && <Button type="button" variant="outline" onClick={goToVerification}>{user.verificationStatus === "pending" ? "Save draft and check verification" : "Save draft and verify business"}</Button>}
          {isPreparingLocally && draftSaveError && <Button asChild variant="outline"><Link href="/seller/verification?from=listing-draft" target="_blank" rel="noopener noreferrer">Open verification in a new tab</Link></Button>}
          {isPreparingLocally && <Button type="button" variant="outline" disabled={verificationQuery.isFetching} onClick={() => void verificationQuery.refetch()}>Refresh approval status</Button>}
          <Button type="button" variant="ghost" disabled={isSubmitting || account.phase === "saving" || account.phase === "error"} onClick={() => {
            if (window.confirm("Discard the current account draft and prepare another lot? Uploaded photos are kept. Other devices will be asked to reload.")) void account.startNew();
          }}>Discard draft</Button>
        </div>
          </div>
        </details>
      </section></fieldset>

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
      {canPublish && sellerStats && !isPro && (
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
          <p className="text-sm text-muted-foreground">
            Free plan · {activeListingCount} of {FREE_LIMITS.activeListings} active listings
          </p>
        )
      )}

      {/* Progress Steps */}
      <div className="grid grid-cols-3 gap-2 border-b pb-4">
        {STEPS.map((step, index) => (
          <button
            key={step.id}
            type="button"
            aria-label={`Step ${step.id}: ${step.title}`}
            aria-current={currentStep === step.id ? "step" : undefined}
            disabled={isSubmitting || photoBusy}
            onClick={() => {
              if (step.id === 3 && !checkPickup()) return;
              updateFormData(watchedValues);
              setStep(step.id);
            }}
            className="flex min-h-11 min-w-0 items-center gap-2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
              {step.id}
            </div>
            <div className="min-w-0 text-left">
              <div className="text-xs font-medium">{step.title}</div>
              <div className="hidden text-xs text-muted-foreground sm:block">
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

      <form ref={listingFormRef} onInvalidCapture={revealListingNativeError} onSubmit={event => {
        if (event.target !== event.currentTarget) return;
        void handleSubmit(onSubmit, issues => {
        if (!draftMountedRef.current || useAuthStore.getState().user?.id !== user?.id || useListingFormStore.getState().sellerId !== user?.id) return;
        const first = getListingFormIssues(issues)[0];
        if (first) { setStep(createStep(first.step)); setPendingErrorField(first.field); }
      })(event); }}>
        <fieldset disabled={isSubmitting || photoBusy || account.phase === "advancing"} className="contents"><legend className="sr-only">Product details</legend>
        <ListingFormIssueSummary errors={errors} onChoose={chooseIssue} />
        {/* Product Details */}
        {currentStep === 1 && (
          <Card className="mb-5 shadow-none">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle role="heading" aria-level={2}>Product Details</CardTitle>
              {user && <ReuseProductDialog sellerId={user.id} disabled={isSubmitting || photoBusy || storageReadBlocked || !["ready", "saved"].includes(account.phase)} onApply={applyPreviousProduct} />}
            </CardHeader>
            <CardContent className="space-y-4">
              <OnboardingTip id="listing-title-tip">
                Include the brand, species and condition in your title.
              </OnboardingTip>

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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="listing-material-type">Material Type *</Label>
                  <Select
                    value={watchedValues.materialType}
                    onValueChange={(v) =>
                      setValue("materialType", v as ListingFormInput["materialType"], { shouldValidate: true })
                    }
                  >
                    <SelectTrigger data-listing-field="materialType" aria-invalid={Boolean(errors.materialType)} aria-describedby={errors.materialType ? "materialType-error" : undefined} id="listing-material-type">
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
<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="listing-finish">Finish</Label>
                  <Select
                    value={watchedValues.finish || ""}
                    onValueChange={(v) => { if (v) setValue("finish", v as ListingFormInput["finish"]); }}
                  >
                    <SelectTrigger data-listing-field="finish" aria-invalid={Boolean(errors.finish)} aria-describedby={errors.finish ? "finish-error" : undefined} id="listing-finish">
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
                  <Label htmlFor="listing-grade">Grade</Label>
                  <Select
                    value={watchedValues.grade || ""}
                    onValueChange={(v) => { if (v) setValue("grade", v as ListingFormInput["grade"]); }}
                  >
                    <SelectTrigger data-listing-field="grade" aria-invalid={Boolean(errors.grade)} aria-describedby={errors.grade ? "grade-error" : undefined} id="listing-grade">
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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="listing-thickness">Thickness</Label>
                  <Select
                    value={watchedValues.thickness ? String(watchedValues.thickness) : ""}
                    onValueChange={(v) => { const value = Number(v); if (v && Number.isFinite(value) && value > 0) setValue("thickness", value); }}
                  >
                    <SelectTrigger data-listing-field="thickness" aria-invalid={Boolean(errors.thickness)} aria-describedby={errors.thickness ? "thickness-error" : undefined} id="listing-thickness">
                      <SelectValue placeholder="Select thickness" />
                    </SelectTrigger>
                    <SelectContent>
                      {THICKNESS_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={String(opt.value)}>
                          {opt.label}
                        </SelectItem>
                      ))}
                      {watchedValues.thickness != null && Number.isFinite(watchedValues.thickness) && watchedValues.thickness > 0 && !THICKNESS_OPTIONS.some(opt => opt.value === watchedValues.thickness) && <SelectItem value={String(watchedValues.thickness)}>{watchedValues.thickness} in (saved)</SelectItem>}
                    </SelectContent>
                  </Select>
<ListingFieldError field="thickness" errors={errors} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="listing-width">Width</Label>
                  <Select
                    value={watchedValues.width ? String(watchedValues.width) : ""}
                    onValueChange={(v) => { const value = Number(v); if (v && Number.isFinite(value) && value > 0) setValue("width", value); }}
                  >
                    <SelectTrigger data-listing-field="width" aria-invalid={Boolean(errors.width)} aria-describedby={errors.width ? "width-error" : undefined} id="listing-width">
                      <SelectValue placeholder="Select width" />
                    </SelectTrigger>
                    <SelectContent>
                      {WIDTH_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={String(opt.value)}>
                          {opt.label}
                        </SelectItem>
                      ))}
                      {watchedValues.width != null && Number.isFinite(watchedValues.width) && watchedValues.width > 0 && !WIDTH_OPTIONS.some(opt => opt.value === watchedValues.width) && <SelectItem value={String(watchedValues.width)}>{watchedValues.width} in (saved)</SelectItem>}
                    </SelectContent>
                  </Select>
<ListingFieldError field="width" errors={errors} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="length">Length (in)</Label>
                  <Input data-listing-field="length" aria-invalid={Boolean(errors.length)} aria-describedby={errors.length ? "length-error" : undefined}
                    id="length"
                    type="number"
                    step="any"
                    placeholder="48.0"
                    {...preserveListingNumberInput(register("length", { setValueAs: numericInputValue }))}
                  />
<ListingFieldError field="length" errors={errors} />
                </div>
              </div>

              <ProductSpecificationFields register={register} />
              {/* Wear Layer - shown for vinyl, engineered, laminate */}
              {getWearLayerOptionsForSingle(watchedValues.materialType).length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="listing-wear-layer">Wear Layer</Label>
                  <Select
                    value={watchedValues.wearLayer ? String(watchedValues.wearLayer) : ""}
                    onValueChange={(v) => { const value = Number(v); if (v && Number.isFinite(value) && value > 0) setValue("wearLayer", value); }}
                  >
                    <SelectTrigger data-listing-field="wearLayer" aria-invalid={Boolean(errors.wearLayer)} aria-describedby={errors.wearLayer ? "wearLayer-error" : undefined} id="listing-wear-layer">
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
<ListingFieldError field="wearLayer" errors={errors} />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                <div className="space-y-2">
                  <Label htmlFor="modelNumber">Model / SKU</Label>
                  <Input id="modelNumber" data-listing-field="modelNumber" maxLength={255} aria-invalid={Boolean(errors.modelNumber)} aria-describedby={errors.modelNumber ? "modelNumber-error" : undefined} placeholder="Manufacturer product code" {...register("modelNumber")} />
                  <ListingFieldError field="modelNumber" errors={errors} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="colorFamily">Color family</Label>
                  <Input id="colorFamily" data-listing-field="colorFamily" maxLength={50} aria-invalid={Boolean(errors.colorFamily)} aria-describedby={errors.colorFamily ? "colorFamily-error" : undefined} placeholder="e.g., Brown, gray, natural" {...register("colorFamily")} />
                  <ListingFieldError field="colorFamily" errors={errors} />
                </div>
              </div>

</ListingOptionalSection>
</CardContent>
          </Card>
        )}

        {/* Condition */}
        {currentStep === 1 && (
          <Card>
            <CardHeader>
              <CardTitle role="heading" aria-level={2}>Condition & Certifications</CardTitle>
              <CardDescription>
                Describe the product condition and any certifications
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">

              <div className="space-y-2">
                <Label htmlFor="listing-condition">Condition *</Label>
                <Select
                  value={watchedValues.condition}
                  onValueChange={(v) =>
                    setValue("condition", v as ListingFormInput["condition"], { shouldValidate: true })
                  }
                >
                  <SelectTrigger data-listing-field="condition" aria-invalid={Boolean(errors.condition)} aria-describedby={errors.condition ? "condition-error" : undefined} id="listing-condition">
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
                <Label htmlFor="listing-reason-code">Reason Code</Label>
                <Select
                  value={watchedValues.reasonCode || ""}
                  onValueChange={(v) =>
                    setValue("reasonCode", v as ListingFormInput["reasonCode"])
                  }
                >
                  <SelectTrigger data-listing-field="reasonCode" aria-invalid={Boolean(errors.reasonCode)} aria-describedby={errors.reasonCode ? "reasonCode-error" : undefined} id="listing-reason-code">
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
                      watchedValues.certifications?.includes(cert.value) ??
                      false;
                    return (
                      <button type="button" aria-pressed={isSelected}
                        key={cert.value}
                        className={`min-h-11 rounded-full border px-3 py-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isSelected ? "bg-primary text-primary-foreground" : "bg-background"}`}
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
                      </button>
                    );
                  })}
                  {[...new Set(watchedValues.certifications ?? [])]
                    .filter((value) => !CERTIFICATIONS.some((cert) => cert.value === value))
                    .map((value) => (
                      <button
                        key={value}
                        type="button"
                        aria-label={`Remove certification ${value}`}
                        className="min-h-11 max-w-full rounded-full border bg-primary px-3 py-2 text-xs font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => setValue("certifications", (watchedValues.certifications ?? []).filter((cert) => cert !== value))}
                      >
                        <span className="break-all">{value}</span>
                        <span className="ml-2" aria-hidden="true">×</span>
                      </button>
                    ))}
                </div>
              </div>

</ListingOptionalSection>
</CardContent>
          </Card>
        )}

        </fieldset>
        {/* Keep recovery actions outside the disabled text/step fieldsets. */}
        {/* Photos */}
        {currentStep === 1 && (
          <Card>
            <CardHeader>
              <CardTitle role="heading" aria-level={2}>Photos</CardTitle>
              <CardDescription>
                Show the product, packaging and any damage.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PrivatePhotoUpload
                key={user.id}
                account={account}
                ownerId={user.id}
                canRestoreLegacy={canPublish}
                disabled={isSubmitting || account.phase === "advancing"}
                onInteractionBlockedChange={setPhotoBusy}
                onImagesChange={ids => {
                  if (draftMountedRef.current && !publishingRef.current && canEditDraft() && useAuthStore.getState().user?.id === user.id && useListingFormStore.getState().sellerId === user.id) setMediaIds(ids);
                }}
                mediaIds={uploadedMediaIds.filter(id => !account.unavailableMediaIds.includes(id))}
              />
            </CardContent>
          </Card>
        )}

        <fieldset disabled={isSubmitting || photoBusy || account.phase === "advancing"} className="contents"><legend className="sr-only">Lot details and publication</legend>
        {/* Lot Details */}
        {currentStep === 2 && (
          <Card>
            <CardHeader>
              <CardTitle role="heading" aria-level={2}>Lot Details</CardTitle>
              <CardDescription>
                Specify quantities, packaging, and warehouse location
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    {...preserveListingNumberInput(register("totalPallets", { setValueAs: numericInputValue }))}
                  />
<ListingFieldError field="totalPallets" errors={errors} />

                </div>
              </div>

              <ListingOptionalSection section="packaging" title={watchedValues.moqUnit === "pallets" ? "Packaging quantities - required for pallet minimums" : "Packaging quantities"} description={watchedValues.moqUnit === "pallets" ? "Enter actual square feet per box and boxes per pallet so buyers can order the correct amount." : "Optional box quantities help buyers plan the lot."} hasErrors={Boolean(errors.sqFtPerBox || errors.boxesPerPallet)}>
<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sqFtPerBox">Sq Ft Per Box</Label>
                  <Input data-listing-field="sqFtPerBox" aria-invalid={Boolean(errors.sqFtPerBox)} aria-describedby={errors.sqFtPerBox ? "sqFtPerBox-error" : undefined}
                    id="sqFtPerBox"
                    type="number"
                    step="any"
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
                    {...preserveListingNumberInput(register("boxesPerPallet", { setValueAs: numericInputValue }))}
                  />
<ListingFieldError field="boxesPerPallet" errors={errors} />
                </div>
              </div>
</ListingOptionalSection>


              <Separator className="my-4" />

              <h3 className="font-medium">Shipping Dimensions</h3>
              <p className="text-sm text-muted-foreground mb-2">
                Required for shipping quotes. Standard pallet: 48&quot;L x 40&quot;W. Typical flooring pallet weighs 1,000-2,500 lbs.
              </p>

              {user && <ReusePalletDialog sellerId={user.id} disabled={isSubmitting || photoBusy || storageReadBlocked || !["ready", "saved"].includes(account.phase)} onApply={applyPreviousPallet} />}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="palletWeight">Pallet Weight (lbs) *</Label>
                  <Input data-listing-field="palletWeight" aria-invalid={Boolean(errors.palletWeight)} aria-describedby={errors.palletWeight ? "palletWeight-error" : undefined}
                    id="palletWeight"
                    type="number"
                    step="1"
                    placeholder="1200"
                    {...preserveListingNumberInput(register("palletWeight", { setValueAs: numericInputValue }))}
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
                    {...preserveListingNumberInput(register("palletLength", { setValueAs: numericInputValue }))}
                  />
<ListingFieldError field="palletLength" errors={errors} />

                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="palletWidth">Pallet Width (in) *</Label>
                  <Input data-listing-field="palletWidth" aria-invalid={Boolean(errors.palletWidth)} aria-describedby={errors.palletWidth ? "palletWidth-error" : undefined}
                    id="palletWidth"
                    type="number"
                    step="1"
                    placeholder="40"
                    {...preserveListingNumberInput(register("palletWidth", { setValueAs: numericInputValue }))}
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
                    {...preserveListingNumberInput(register("palletHeight", { setValueAs: numericInputValue }))}
                  />
<ListingFieldError field="palletHeight" errors={errors} />

                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="nmfcCode">NMFC Code</Label>
                  <Input data-listing-field="nmfcCode" aria-invalid={Boolean(errors.nmfcCode)} aria-describedby={errors.nmfcCode ? "nmfcCode-error" : undefined}
                    id="nmfcCode"
                    placeholder="e.g., 37860"
                    {...register("nmfcCode")}
                  />
<ListingFieldError field="nmfcCode" errors={errors} />
                  <p className="text-xs text-muted-foreground">
                    Auto-filled from material type. Override if needed.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="listing-freight-class">Freight Class</Label>
                  <Select
                    value={watchedValues.freightClass || ""}
                    onValueChange={(v) => setValue("freightClass", v)}
                  >
                    <SelectTrigger data-listing-field="freightClass" aria-invalid={Boolean(errors.freightClass)} aria-describedby={errors.freightClass ? "freightClass-error" : undefined} id="listing-freight-class">
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
<ListingFieldError field="freightClass" errors={errors} />
                  <p className="text-xs text-muted-foreground">
                    Auto-filled from material type. Override if needed.
                  </p>
                </div>
              </div>

              <Separator className="my-4" />

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
                      setValue("moqUnit", v as "pallets" | "sqft", { shouldValidate: true })
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
                  The smallest amount you&apos;ll sell in a single transaction.
                  {watchedValues.moqUnit === "pallets" && " Pallet minimums require square feet per box and boxes per pallet in Packaging quantities above."}
                </p>

              </div>

              <Separator className="my-4" />

              <ListingPickupWarehouse warehouses={pickupWarehouses} selectedId={watchedValues.warehouseId}
                selected={selectedWarehouse} issue={warehouseIssue} changed={warehouseChanged}
                loading={canPublish && warehouseQuery.isFetching} unavailable={warehouseUnavailable} approved={canPublish}
                onSelect={chooseWarehouse} onRefresh={() => { void warehouseQuery.refetch(); }}
                onManage={async () => {
                  if (photoBusy || !canEditDraft()) return;
                  updateFormData(getValues());
                  if (await account.saveNow()) router.push("/seller/warehouses");
                }} />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="locationCity">City</Label>
                  <Input data-listing-field="locationCity" aria-invalid={Boolean(errors.locationCity)} aria-describedby={errors.locationCity ? "locationCity-error" : undefined}
                    id="locationCity"
                    readOnly={Boolean(watchedValues.warehouseId)}
                    placeholder="Dallas"
                    {...register("locationCity")}
                  />
<ListingFieldError field="locationCity" errors={errors} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="locationState">State</Label>
                  <Input data-listing-field="locationState" aria-invalid={Boolean(errors.locationState)} aria-describedby={errors.locationState ? "locationState-error" : undefined}
                    id="locationState"
                    readOnly={Boolean(watchedValues.warehouseId)}
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
                    readOnly={Boolean(watchedValues.warehouseId)}
                    placeholder="75001"
                    maxLength={10}
                    {...register("locationZip")}
                  />
<ListingFieldError field="locationZip" errors={errors} />

                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pricing */}
        {currentStep === 2 && (
          <Card>
            <CardHeader>
              <CardTitle role="heading" aria-level={2}>Pricing</CardTitle>
              <CardDescription>
                Set your asking price and purchase options
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">

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
                <Input data-listing-field="askPricePerSqFt" aria-invalid={Boolean(errors.askPricePerSqFt)} aria-describedby={errors.askPricePerSqFt ? "askPricePerSqFt-error" : undefined}
                  id="askPricePerSqFt"
                  type="number"
                  step="0.01"
                  placeholder="2.50"
                  {...preserveListingNumberInput(register("askPricePerSqFt", { setValueAs: numericInputValue }))}
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
                      {...preserveListingNumberInput(register("buyNowPrice", { setValueAs: numericInputValue }))}
                    />
<ListingFieldError field="buyNowPrice" errors={errors} />
                    <p className="text-xs text-muted-foreground">
                      Leave blank to use the asking price for standard checkout.
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
                          {...preserveListingNumberInput(register("floorPrice", { setValueAs: numericInputValue }))}
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
                            description="This preview uses your actual ask price. The schedule starts when the listing goes live or when you reset the rule."
                          />
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Add a valid ask price, floor percent, and interval
                            to preview the markdown schedule.
                          </p>
                        )} </> : null}
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
</ListingOptionalSection>


            </CardContent>
          </Card>
        )}

        {/* Review */}
        {currentStep === 3 && (
          <Card>
            <CardHeader>
              <CardTitle role="heading" aria-level={2}>Review Your Listing</CardTitle>
              <CardDescription>
                {isPreparingLocally ? "Review your saved details and private photos. Publish after business approval." : "Review all details before publishing"}
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
                  {selectedWarehouse && <p className="font-medium">{selectedWarehouse.label}</p>}
                  <p>
                    {watchedValues.locationCity &&
                    watchedValues.locationState
                      ? `${watchedValues.locationCity}, ${watchedValues.locationState}`
                      : "---"}
                  </p>
                  {warehouseIssue && <div className="mt-2 space-y-1">
                    <p role="alert" className="text-sm text-destructive">{warehouseIssue}</p>
                    <Button type="button" variant="link" className="min-h-11 px-0" onClick={() => { setStep(2); setPendingErrorField("warehouseId"); }}>Review pickup warehouse</Button>
                  </div>}
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

        {currentStep === 3 && canPublish && !verifiedSession?.stripeOnboardingComplete && <section className="space-y-2 border-l-2 border-amber-500 pl-4" aria-label="Payment setup">
          <h2 className="font-semibold">Connect payments to accept purchases</h2>
          <p className="text-sm text-muted-foreground">You can publish this lot for inquiries. Buyers can check out after payment setup is complete.</p>
          <Button type="button" variant="outline" onClick={async () => { if (await account.saveNow()) router.push("/seller/payments?from=listing-draft"); }}>Save and connect payments</Button>
        </section>}

        {currentStep === 3 && canPublish && uploadedMediaIds.length === 0 && <div role="status" className="space-y-2 rounded-lg border p-4"><p>Add at least one saved product photo before publishing.</p><Button type="button" variant="outline" onClick={() => setStep(1)}>Add product photos</Button></div>}

        {/* Navigation */}
        <div className="mt-6">
          {currentStep === 3 && isPreparingLocally && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 px-4 py-3 mb-4">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  Your account draft is saved as you work. Business approval and a saved product photo are required before publication.
                </p>
              </div>
            )}
          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={handleBack}
              disabled={currentStep === 1 || photoBusy}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>

            {currentStep < 3 ? (
              <Button key="listing-next" type="button" disabled={photoBusy} onClick={(event) => { event.preventDefault(); void handleNext(); }}>
                {currentStep === 1 ? "Quantity & price" : "Review listing"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : isPreparingLocally ? (
              <Button key="listing-verify" type="button" onClick={goToVerification}>Save draft and continue verification</Button>
            ) : (
              <Button
                key="listing-publish"
                type="submit"
                disabled={isSubmitting || photoBusy || atListingLimit || !canPublish || account.phase === "error" || account.mediaWarning || uploadedMediaIds.length === 0}
              >
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {verifiedSession?.stripeOnboardingComplete ? "Publish listing" : "Publish for inquiries"}
              </Button>
            )}
          </div>
        </div>
        </fieldset>
      </form>
    </div>
  );
}
