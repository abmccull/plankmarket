"use client";
import { useCheckoutStartedAnalytics } from "@/lib/analytics/use-checkout-started";
import { ResaleCheckout } from "@/components/checkout/resale-checkout";
import { freightReviewServicesFromParams } from "@/lib/marketplace/freight-review-context";

import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createOrderSchema,
  type CreateOrderInput,
} from "@/lib/validators/order";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { QueryErrorState } from "@/components/ui/state-panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatSqFt } from "@/lib/utils";
import { BUYER_MARKETPLACE_FEE_PERCENT, calculateOrderFees } from "@/lib/fees";
import { resolveListingUnitPrice } from "@/lib/listing-pricing";
import { getKnownMinimumOrderSqFt, getPurchaseQuantityPreview } from "@/lib/marketplace/purchase-quantity-preview";
import { PurchaseQuantityPreview } from "@/components/listings/purchase-quantity-preview";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
  ShieldCheck,
  Package,
  Check,
  Truck,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { StripeProvider } from "@/components/checkout/stripe-provider";
import { StripePaymentForm } from "@/components/checkout/stripe-payment-form";
import ShippingQuoteSelector, {
  type SelectedShippingQuote,
} from "@/components/checkout/shipping-quote-selector";
import { ListingImage as Image } from "@/components/listings/listing-image";
import Link from "next/link";
import { buyerVerificationHref } from "@/lib/auth/buyer-continuation";
import { purchaseIntentFromParams, withPurchaseIntent } from "@/lib/marketplace/purchase-intent";
import {
  checkoutAttemptKey,
  readCheckoutAttempt,
  persistCheckoutAttempt,
  type CheckoutAttempt,
} from "@/lib/checkout-attempt";

type CheckoutStep = "address" | "shipping" | "payment";
type SavedAddressOption = "new" | string; // "new" or address id
interface AuthoritativeOrderTax {
  resaleApplied?: boolean;
  amount: number;
  total: number;
  status: string;
  liability: string;
  jurisdictions: Array<{
    state: string | null;
    ratePercent: string;
    taxabilityReason: string;
  }>;
}

const ADDRESS_FIELDS = [
  "shippingName",
  "shippingAddress",
  "shippingCity",
  "shippingState",
  "shippingZip",
  "shippingPhone",
] as const;

function CheckoutReadError({
  title,
  description,
  onRetry,
  isRetrying,
  backHref,
  backLabel,
}: {
  title: string;
  description: string;
  onRetry: () => void;
  isRetrying: boolean;
  backHref: string;
  backLabel: string;
}) {
  return (
    <div className="container mx-auto max-w-xl px-4 py-12">
      <QueryErrorState
        title={title}
        description={description}
        onRetry={onRetry}
        isRetrying={isRetrying}
        secondaryAction={{ label: backLabel, href: backHref }}
      />
    </div>
  );
}

const STEPS: { key: CheckoutStep; label: string }[] = [
  { key: "address", label: "Address" },
  { key: "shipping", label: "Shipping" },
  { key: "payment", label: "Payment" },
];

export default function CheckoutPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const listingId = params.id as string;
  const recordCheckoutStarted = useCheckoutStartedAnalytics();
  const offerId = searchParams.get("offerId");
  const purchaseIntent = purchaseIntentFromParams(searchParams);
  const reviewedFreightServices = freightReviewServicesFromParams(searchParams);
  const detailHref = withPurchaseIntent(`/listings/${listingId}`, purchaseIntent);

  const buyerQuery = trpc.auth.getProfile.useQuery(undefined, { retry: 1 });
  const buyer = buyerQuery.data;
  const [attempt, setAttempt] = useState<CheckoutAttempt | null>(null);
  const [loadedAttemptFor, setLoadedAttemptFor] = useState<string | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const attemptKey = buyer
    ? checkoutAttemptKey(buyer.id, listingId, offerId)
    : null;
  const attemptReady = Boolean(attemptKey && loadedAttemptFor === attemptKey);
  const activeCheckoutContext = useRef<string | null>(null);
  const checkoutGeneration = useRef(0);
  useLayoutEffect(() => {
    checkoutGeneration.current += 1;
    activeCheckoutContext.current = attemptKey;
    return () => {
      checkoutGeneration.current += 1;
      activeCheckoutContext.current = null;
    };
  }, [attemptKey]);
  const isCurrentCheckout = (context: { key: string; generation: number }) =>
    activeCheckoutContext.current === context.key &&
    checkoutGeneration.current === context.generation;

  useEffect(() => {
    setLoadedAttemptFor(null);
    setAuthoritativeTax(null);
    submittingRef.current = false;
    setIsSubmitting(false);
    setAttempt(null);
    setClientSecret(null);
    setOrderId(null);
    if (!attemptKey) return;
    try {
      const saved = readCheckoutAttempt(window.sessionStorage, attemptKey);
      if (
        saved &&
        (saved.mode === "offer"
          ? saved.input.offerId !== offerId
          : Boolean(offerId) || saved.input.listingId !== listingId)
      ) {
        throw new Error("Saved checkout does not match this listing or offer");
      }
      setAttempt(saved);
      setRecoveryError(null);
    } catch {
      setRecoveryError(
        "We could not read your saved checkout. Open your orders to verify any reservation before starting again.",
      );
    }
    setLoadedAttemptFor(attemptKey);
  }, [attemptKey, listingId, offerId]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState<CheckoutStep>("address");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [selectedQuote, setSelectedQuote] =
    useState<SelectedShippingQuote | null>(null);
  const [selectedAddressId, setSelectedAddressId] =
    useState<SavedAddressOption>("new");
  const [authoritativeTax, setAuthoritativeTax] =
    useState<AuthoritativeOrderTax | null>(null);
  const [liftgateDelivery, setLiftgateDelivery] = useState(() => freightReviewServicesFromParams(searchParams).liftgateDelivery);
  const [residentialDelivery, setResidentialDelivery] = useState(() => freightReviewServicesFromParams(searchParams).residentialDelivery);
  const [appointmentDelivery, setAppointmentDelivery] = useState(() => freightReviewServicesFromParams(searchParams).appointmentDelivery);

  const listingQuery = trpc.listing.getById.useQuery(
    { id: listingId },
    { retry: 1 },
  );
  const { data: listing, isLoading } = listingQuery;
  const purchaseConfigQuery = trpc.listing.getPurchaseConfig.useQuery(
    { listingId },
    { enabled: !!listingId, retry: 1 },
  );
  const { data: purchaseConfig, isLoading: isPurchaseConfigLoading } =
    purchaseConfigQuery;

  // An offer URL always remains offer checkout, even while its read is failing.
  const offerQuery = trpc.offer.getOfferById.useQuery(
    { offerId: offerId! },
    { enabled: !!offerId, retry: 1 },
  );
  const { data: offer, isLoading: isOfferLoading } = offerQuery;
  const offerMatchesListing = !offerId || offer?.listingId === listingId;
  const freshOfferIsValid = () =>
    !offerId ||
    Boolean(
      offer &&
      offerMatchesListing &&
      offer.buyerId === buyer?.id &&
      offer.status === "accepted" &&
      (!offer.expiresAt || new Date(offer.expiresAt).getTime() > Date.now()),
    );
  const ensureFreshOffer = () => {
    if (freshOfferIsValid()) return true;
    toast.error(
      "Your offer is no longer available for checkout. We are refreshing its status.",
    );
    void offerQuery.refetch();
    return false;
  };
  const buyerApproved = Boolean(buyer && (buyer.role === "admin" || buyer.verificationStatus === "verified"));
  const checkoutDataReady = Boolean(
    buyer &&
    buyerApproved &&
    listing &&
    purchaseConfig &&
    !buyerQuery.isError &&
    !listingQuery.isError &&
    !purchaseConfigQuery.isError &&
    (!offerId || (!offerQuery.isError && freshOfferIsValid())),
  );

  // Check seller payment readiness
  useEffect(() => {
    if (!attemptReady || attempt || recoveryError || !buyerApproved) return;
    if (listing?.seller && !listing.seller.stripeOnboardingComplete) {
      toast.error("This seller hasn't set up payment processing yet.");
      router.push(detailHref);
    }
  }, [listing, detailHref, router, attemptReady, attempt, recoveryError, buyerApproved]);

  const abandonCheckout = trpc.order.abandonCheckout.useMutation();
  const createOrder = trpc.order.create.useMutation();
  const createOrderFromOffer = trpc.order.createFromOffer.useMutation();
  const createPaymentIntent = trpc.payment.createPaymentIntent.useMutation();

  const {
    register,
    watch,
    reset,
    trigger,
    getValues,
    setValue,
    formState: { errors, dirtyFields },
  } = useForm<CreateOrderInput>({
    resolver: zodResolver(createOrderSchema),
    defaultValues: {
      listingId,
      quantitySqFt: 0,
    },
  });

  // Determine offer-based overrides
  const isOfferCheckout = !!offerId;
  const offerPrice = offer
    ? (offer.counterPricePerSqFt ?? offer.offerPricePerSqFt)
    : null;
  const offerQuantity = offer?.quantitySqFt ?? null;
  const quantityListing = useMemo(() => listing && purchaseConfig ? { ...listing, purchaseTerms: {
    fullLotOnly: purchaseConfig.fullLotOnly,
    partialQuantityMarkupPercent: purchaseConfig.partialQuantityMarkupPercent,
    sqFtPerBox: listing.sqFtPerBox,
    boxesPerPallet: listing.boxesPerPallet,
  } } : null, [listing, purchaseConfig]);
  const quantityPreview = useMemo(() => !offerId && quantityListing
    ? getPurchaseQuantityPreview(quantityListing, purchaseIntent.quantitySqFt) : null,
  [offerId, quantityListing, purchaseIntent.quantitySqFt]);
  const knownMinimumSqFt = quantityListing ? getKnownMinimumOrderSqFt(quantityListing) : null;

  const initializedFormRef = useRef<string | null>(null);
  const defaultAddressAppliedRef = useRef<string | null>(null);
  const explicitAddressChoiceRef = useRef<string | null>(null);
  const addressInteractionRef = useRef<string | null>(null);
  const [formReadyFor, setFormReadyFor] = useState<string | null>(null);

  // Only a new buyer/listing/offer context initializes the form. Fresh query
  // objects must never erase receiving details, quantity, or purchase purpose.
  useEffect(() => {
    if (!checkoutDataReady || !listing || !attemptKey || attempt) return;
    if (initializedFormRef.current === attemptKey) return;
    initializedFormRef.current = attemptKey;
    const jobZip = offerId ? undefined : purchaseIntent.zip;
    // A job ZIP is an explicit new receiving site; never blend it with a saved address.
    defaultAddressAppliedRef.current = jobZip ? attemptKey : null;
    explicitAddressChoiceRef.current = jobZip ? attemptKey : null;
    addressInteractionRef.current = null;
    const suggestedQuantity = quantityPreview
      ? quantityPreview.status === "ready" ? quantityPreview.quantitySqFt : 0
      : listing.totalSqFt;
    reset({ listingId, quantitySqFt: offerQuantity ?? suggestedQuantity, shippingZip: jobZip ?? "" });
    setSelectedAddressId("new");
    setSelectedQuote(null);
    setLiftgateDelivery(!offerId && reviewedFreightServices.liftgateDelivery);
    setResidentialDelivery(!offerId && reviewedFreightServices.residentialDelivery);
    setAppointmentDelivery(!offerId && reviewedFreightServices.appointmentDelivery);
    setCurrentStep("address");
    setFormReadyFor(attemptKey);
  }, [
    checkoutDataReady,
    listing,
    listingId,
    offerQuantity,
    offerId,
    purchaseConfig,
    purchaseIntent.quantitySqFt,
    purchaseIntent.zip,
    reviewedFreightServices.liftgateDelivery,
    reviewedFreightServices.residentialDelivery,
    reviewedFreightServices.appointmentDelivery,
    quantityPreview,
    attemptKey,
    attempt,
    reset,
  ]);

  const savedAddressesQuery = trpc.shippingAddress.list.useQuery(undefined, {
    retry: 1,
  });
  const savedAddresses = savedAddressesQuery.data;

  // A late default is useful only before the buyer has edited or chosen a site.
  useEffect(() => {
    if (
      !attemptKey ||
      formReadyFor !== attemptKey ||
      !savedAddresses ||
      savedAddressesQuery.isError
    )
      return;
    if (defaultAddressAppliedRef.current === attemptKey) return;
    defaultAddressAppliedRef.current = attemptKey;
    if (
      explicitAddressChoiceRef.current === attemptKey ||
      addressInteractionRef.current === attemptKey ||
      ADDRESS_FIELDS.some((field) => dirtyFields[field])
    )
      return;
    const address =
      savedAddresses.find((item) => item.isDefault) ?? savedAddresses[0];
    if (!address) return;
    setSelectedAddressId(address.id);
    setValue("shippingName", address.name);
    setValue("shippingAddress", address.address);
    setValue("shippingCity", address.city);
    setValue("shippingState", address.state);
    setValue("shippingZip", address.zip);
    setValue("shippingPhone", address.phone ?? "");
  }, [
    attemptKey,
    formReadyFor,
    savedAddresses,
    savedAddressesQuery.isError,
    dirtyFields,
    setValue,
  ]);

  const handleAddressSelect = (addressId: SavedAddressOption) => {
    explicitAddressChoiceRef.current = attemptKey;
    setSelectedQuote(null);
    setSelectedAddressId(addressId);
    if (addressId === "new") {
      setValue("shippingName", "");
      setValue("shippingAddress", "");
      setValue("shippingCity", "");
      setValue("shippingState", "");
      setValue("shippingZip", "");
      setValue("shippingPhone", "");
      return;
    }
    const addr = savedAddresses?.find((a) => a.id === addressId);
    if (addr) {
      setValue("shippingName", addr.name);
      setValue("shippingAddress", addr.address);
      setValue("shippingCity", addr.city);
      setValue("shippingState", addr.state);
      setValue("shippingZip", addr.zip);
      setValue("shippingPhone", addr.phone ?? "");
    }
  };

  const watchedQuantity = watch("quantitySqFt");
  const quantitySqFt = Number.isFinite(watchedQuantity) ? watchedQuantity : 0;
  const currentQuantityPreview = !isOfferCheckout && quantityListing
    ? getPurchaseQuantityPreview(quantityListing, quantitySqFt) : null;
  const unresolvedJobQuantity = Boolean(quantityPreview && quantityPreview.status !== "ready");
  const canEstimateQuantity = Boolean(attempt || isOfferCheckout || (
    currentQuantityPreview?.status === "ready" && Math.abs(currentQuantityPreview.quantitySqFt - quantitySqFt) <= 1e-8
  ));
  const shippingState = watch("shippingState") || "";
  const shippingZip = watch("shippingZip") || "";

  const handleAccessorialToggle = (
    setter: Dispatch<SetStateAction<boolean>>,
    checked: boolean,
  ) => {
    setSelectedQuote(null);
    setter(checked);
  };

  const directPurchasePricing =
    !isOfferCheckout && listing
      ? resolveListingUnitPrice({
          baseUnitPrice: listing.buyNowPrice ?? listing.askPricePerSqFt,
          availableQuantity: listing.totalSqFt,
          requestedQuantity: quantitySqFt,
          fullLotOnly: purchaseConfig?.fullLotOnly ?? true,
          partialQuantityMarkupPercent:
            purchaseConfig?.partialQuantityMarkupPercent ?? null,
        })
      : null;

  // Handle "Continue to Shipping" — validate address fields
  const handleContinueToShipping = async () => {
    if (
      !attemptKey ||
      !attemptReady ||
      !ensureFreshOffer() ||
      !checkoutDataReady ||
      formReadyFor !== attemptKey
    )
      return;
    const context = { key: attemptKey, generation: checkoutGeneration.current };
    const isValid = await trigger([
      "quantitySqFt",
      "shippingName",
      "shippingAddress",
      "shippingCity",
      "shippingState",
      "shippingZip",
    ]);
    if (!isCurrentCheckout(context) || !isValid) return;
    if (!ensureFreshOffer()) return;

    if (!isOfferCheckout && (currentQuantityPreview?.status !== "ready" || Math.abs(currentQuantityPreview.quantitySqFt - quantitySqFt) > 1e-8)) {
      toast.error("Review the quantity against this lot’s minimum, full-lot and box requirements before requesting freight.");
      return;
    }

    if (directPurchasePricing && !directPurchasePricing.purchaseAllowed) {
      toast.error(
        "This seller currently sells this listing only as a full lot.",
      );
      return;
    }

    if (
      purchaseConfig?.sellingTerritoryMode === "allowed_states" &&
      purchaseConfig.allowedDestinationStates.length > 0 &&
      shippingState.trim().length > 0 &&
      !purchaseConfig.allowedDestinationStates.includes(
        shippingState.trim().toUpperCase(),
      )
    ) {
      toast.error(
        `This seller currently sells only into ${purchaseConfig.allowedDestinationStates.join(", ")}.`,
      );
      return;
    }

    recordCheckoutStarted(attemptKey, {
      listing_id: listingId,
      seller_id: listing?.sellerId ?? "",
      quantity_sqft: quantitySqFt,
      lot_value: subtotal,
    });
    // Always re-select freight after address step so totals match destination.
    setSelectedQuote(null);
    setCurrentStep("shipping");
  };

  // Replays always submit the exact saved payload and request ID. A payment
  // preparation failure therefore never creates a second reservation.
  const resumeAttempt = async (
    saved: CheckoutAttempt,
    context: { key: string; generation: number },
  ) => {
    const order =
      saved.mode === "offer"
        ? await createOrderFromOffer.mutateAsync(saved.input)
        : await createOrder.mutateAsync(saved.input);
    if (!isCurrentCheckout(context)) return;
    setOrderId(order.id);
    setAuthoritativeTax({
      amount: Number(order.taxAmount),
      total: Number(order.totalPrice),
      resaleApplied: order.resaleApplied,
      status: order.taxStatus,
      liability: order.taxLiability,
      jurisdictions: order.taxJurisdictionSummary,
    });
    if (
      order.status !== "pending" ||
      !["pending", "failed"].includes(order.paymentStatus ?? "pending")
    ) {
      // Processing/captured payments are never cancelled or retried as a new
      // order. The order page reads their authoritative current status.
      if (attemptKey && ["cancelled", "refunded"].includes(order.status)) {
        window.sessionStorage.removeItem(attemptKey);
      }
      router.push(`/buyer/orders/${order.id}`);
      return;
    }
    const payment = await createPaymentIntent.mutateAsync({
      orderId: order.id,
    });
    if (!isCurrentCheckout(context)) return;
    if (!payment.clientSecret)
      throw new Error("Payment is not ready. Resume this order to try again.");
    setClientSecret(payment.clientSecret);
    setCurrentStep("payment");
  };

  const handleContinueToPayment = async () => {
    if (submittingRef.current) return;
    if (!attemptKey || !attemptReady) return;
    if (
      !attempt &&
      (!ensureFreshOffer() || !checkoutDataReady || formReadyFor !== attemptKey)
    )
      return;
    const quoteExpiry = selectedQuote
      ? new Date(selectedQuote.quoteExpiresAt).getTime()
      : null;
    if (
      !attempt &&
      selectedQuote &&
      (quoteExpiry === null ||
        !Number.isFinite(quoteExpiry) ||
        quoteExpiry <= Date.now() + 15_000)
    ) {
      setSelectedQuote(null);
      toast.error(
        "This freight quote has expired. Select a fresh quote before continuing.",
      );
      return;
    }
    if (!attempt && !selectedQuote) {
      toast.error("Please select a shipping option to continue.");
      return;
    }
    const context = { key: attemptKey, generation: checkoutGeneration.current };
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      let saved = attempt;
      if (!saved) {
        const formData = getValues();
        const shippingQuoteFields = {
          purchasePurpose: formData.purchasePurpose ?? "business_use",
          requestId: crypto.randomUUID(),
          selectedQuoteToken: selectedQuote!.quoteToken,
          selectedQuoteId: String(selectedQuote!.quoteId),
          selectedCarrier: selectedQuote!.carrierName,
          shippingPrice: selectedQuote!.shippingPrice,
          estimatedTransitDays: selectedQuote!.transitDays,
          quoteExpiresAt: selectedQuote!.quoteExpiresAt,
        };
        const candidate: CheckoutAttempt = isOfferCheckout
          ? {
              mode: "offer",
              input: {
                offerId: offerId!,
                shippingName: formData.shippingName,
                shippingAddress: formData.shippingAddress,
                shippingCity: formData.shippingCity,
                shippingState: formData.shippingState,
                shippingZip: formData.shippingZip,
                shippingPhone: formData.shippingPhone,
                ...shippingQuoteFields,
              },
            }
          : { mode: "direct", input: { ...formData, ...shippingQuoteFields } };
        // If storage is unavailable, do not start a purchase we cannot recover.
        saved = persistCheckoutAttempt(
          window.sessionStorage,
          attemptKey,
          candidate,
        );
        setAttempt(saved);
      }
      await resumeAttempt(saved, context);
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Checkout could not be completed. Resume your saved checkout to try again.";
      if (isCurrentCheckout(context)) toast.error(message);
    } finally {
      if (isCurrentCheckout(context)) {
        submittingRef.current = false;
        setIsSubmitting(false);
      }
    }
  };

  const handleChangeCheckout = async () => {
    if (!attempt || !attemptKey || !attemptReady || submittingRef.current)
      return;
    const context = { key: attemptKey, generation: checkoutGeneration.current };
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      await abandonCheckout.mutateAsync({ requestId: attempt.input.requestId });
      // The server tombstone commits before local state is removed. A delayed
      // request using the old ID now fails rather than creating a hidden order.
      window.sessionStorage.removeItem(attemptKey);
      if (!isCurrentCheckout(context)) return;
      // Keep the saved receiving intent when a refreshed checkout is abandoned.
      // A new signed freight quote is still required before any new attempt.
      reset({
        listingId,
        quantitySqFt:
          attempt.mode === "direct"
            ? attempt.input.quantitySqFt
            : (offerQuantity ?? listing?.totalSqFt ?? 0),
        shippingName: attempt.input.shippingName,
        shippingAddress: attempt.input.shippingAddress,
        shippingCity: attempt.input.shippingCity,
        shippingState: attempt.input.shippingState,
        shippingZip: attempt.input.shippingZip,
        shippingPhone: attempt.input.shippingPhone,
        purchasePurpose: attempt.input.purchasePurpose,
      });
      initializedFormRef.current = attemptKey;
      defaultAddressAppliedRef.current = attemptKey;
      explicitAddressChoiceRef.current = attemptKey;
      setFormReadyFor(attemptKey);
      setSelectedAddressId("new");
      setAttempt(null);
      setOrderId(null);
      setClientSecret(null);
      setAuthoritativeTax(null);
      setSelectedQuote(null);
      setCurrentStep("address");
      toast.success(
        "Checkout reset. Confirm your details and select shipping again.",
      );
    } catch (error) {
      if (isCurrentCheckout(context))
        toast.error(
          error instanceof Error
            ? error.message
            : "We could not safely reset this checkout. Resume it to check its status.",
        );
    } finally {
      if (isCurrentCheckout(context)) {
        submittingRef.current = false;
        setIsSubmitting(false);
      }
    }
  };

  // Identity failure is not an unfinished loading state. Account recovery must
  // happen before either a fresh purchase or a stored attempt can be resumed.
  if (buyerQuery.isError || (!buyer && !buyerQuery.isLoading)) {
    const checkoutPath = withPurchaseIntent(`/listings/${listingId}/checkout${offerId ? `?offerId=${encodeURIComponent(offerId)}` : ""}`, purchaseIntent);
    return (
      <CheckoutReadError
        title="We couldn't verify your account"
        description="Your checkout has not been changed. Retry account verification or sign in again before continuing."
        onRetry={() => void buyerQuery.refetch()}
        isRetrying={buyerQuery.isFetching}
        backHref={`/login?redirect=${encodeURIComponent(checkoutPath)}`}
        backLabel="Sign in again"
      />
    );
  }

  if (!attemptReady)
    return (
      <div
        className="flex items-center justify-center min-h-[400px]"
        role="status"
      >
        <Loader2
          className="h-8 w-8 animate-spin text-muted-foreground"
          aria-hidden="true"
        />
        <span className="sr-only">Preparing your checkout</span>
      </div>
    );

  // Render recovery before live catalog guards: a full-lot reservation can make
  // the original listing unavailable, and an accepted offer may now be linked.
  if (recoveryError || (attempt && !clientSecret)) {
    return (
      <div className="container mx-auto max-w-xl px-4 py-12 space-y-5">
        <h1 className="text-2xl font-bold">Resume checkout</h1>
        <p>
          {recoveryError ??
            "Your checkout details are saved. Resume to recover the same order and payment. Your quantity and shipping details stay locked while we check its status."}
        </p>
        {!recoveryError && (
          <Button disabled={isSubmitting} onClick={handleContinueToPayment}>
            {isSubmitting ? "Checking your order…" : "Resume saved checkout"}
          </Button>
        )}
        {!recoveryError && (
          <Button
            variant="outline"
            disabled={isSubmitting}
            onClick={handleChangeCheckout}
          >
            Change checkout details
          </Button>
        )}
        <Button variant="outline" onClick={() => router.push("/buyer/orders")}>
          View my orders
        </Button>
      </div>
    );
  }
  if (attempt && clientSecret && orderId) {
    return (
      <div className="container mx-auto max-w-xl px-4 py-12 space-y-5">
        <h1 className="text-2xl font-bold">Complete payment</h1>
        {authoritativeTax && (
          <p className="text-lg font-semibold">
            Order total: {formatCurrency(authoritativeTax.total)}
          </p>
        )}
        <StripeProvider clientSecret={clientSecret}>
          <StripePaymentForm listingId={listingId} orderId={orderId} />
        </StripeProvider>
        <Button
          variant="outline"
          onClick={() => router.push(`/buyer/orders/${orderId}`)}
        >
          View this order
        </Button>
      </div>
    );
  }

  // Existing order recovery and payment above remain available; this is only
  // guidance for a new purchase and the server remains authoritative.
  if (buyer && !buyerApproved) {
    const checkoutPath = withPurchaseIntent("/listings/" + listingId + "/checkout" + (offerId ? "?offerId=" + encodeURIComponent(offerId) : ""), purchaseIntent);
    const pending = buyer.verificationStatus === "pending";
    const rejected = buyer.verificationStatus === "rejected";
    return (
      <section className="container mx-auto max-w-xl space-y-5 px-4 py-12" aria-labelledby="buyer-approval-title">
        <ShieldCheck className="h-8 w-8 text-primary" aria-hidden="true" />
        <h1 id="buyer-approval-title" className="font-display text-2xl">{pending ? "Your business review is in progress" : rejected ? "Update your business verification" : "Verify your business before checkout"}</h1>
        <p className="text-muted-foreground">{pending ? "You can continue checkout after your business is approved. Open verification to check your review status." : rejected ? "Review the requested changes to your business details before continuing checkout." : "Business approval is required to purchase. Add your business details and supporting document; you can save your progress and return later."}</p>
        <p className="text-sm text-muted-foreground">Your selected lot and offer link will stay with this step. Inventory and pricing are confirmed again when you return.</p>
        <div className="flex flex-wrap gap-3">
          <Button asChild className="h-auto min-h-11 whitespace-normal"><Link href={buyerVerificationHref(checkoutPath)}>{pending ? "Check verification status" : rejected ? "Update verification" : "Verify my business"}</Link></Button>
          <Button asChild variant="outline" className="h-auto min-h-11 whitespace-normal"><Link href={detailHref}>Back to selected lot</Link></Button>
        </div>
      </section>
    );
  }

  if (listingQuery.isError || (!listing && !isLoading)) {
    const unavailable = ["NOT_FOUND", "FORBIDDEN"].includes(
      listingQuery.error?.data?.code ?? "",
    );
    return (
      <CheckoutReadError
        title={
          unavailable ? "Listing unavailable" : "We couldn't load this listing"
        }
        description={
          unavailable
            ? "This listing is unavailable to your account. Return to the listing or browse other inventory."
            : "We could not verify the listing. Your entered details are preserved; retry before continuing."
        }
        onRetry={() => void listingQuery.refetch()}
        isRetrying={listingQuery.isFetching}
        backHref={detailHref}
        backLabel="Back to listing"
      />
    );
  }
  if (
    purchaseConfigQuery.isError ||
    (!purchaseConfig && !isPurchaseConfigLoading)
  ) {
    return (
      <CheckoutReadError
        title="Purchase rules unavailable"
        description="We could not verify quantity and territory rules. Your entered details are preserved; retry before continuing."
        onRetry={() => void purchaseConfigQuery.refetch()}
        isRetrying={purchaseConfigQuery.isFetching}
        backHref={detailHref}
        backLabel="Back to listing"
      />
    );
  }
  if (offerId && (offerQuery.isError || (!offer && !isOfferLoading))) {
    return (
      <CheckoutReadError
        title="We couldn't load your offer"
        description="Your negotiated terms could not be verified. Retry or return to your offer; this checkout will not switch to the listing price."
        onRetry={() => void offerQuery.refetch()}
        isRetrying={offerQuery.isFetching}
        backHref={`/offers/${offerId}`}
        backLabel="Back to offer"
      />
    );
  }
  if (offerId && offer && !freshOfferIsValid()) {
    return (
      <CheckoutReadError
        title="Offer unavailable for checkout"
        description={
          !offerMatchesListing
            ? "This offer belongs to another listing. Open the offer to continue with the correct lot."
            : offer.buyerId !== buyer?.id
              ? "Only the buyer on this offer can complete its checkout."
              : offer.status !== "accepted"
                ? "This offer is no longer accepted for checkout. Open the offer to review its current status."
                : "This offer has expired. Open the offer to review your next step."
        }
        onRetry={() => void offerQuery.refetch()}
        isRetrying={offerQuery.isFetching}
        backHref={`/offers/${offerId}`}
        backLabel="Back to offer"
      />
    );
  }
  if (
    !attemptReady ||
    isLoading ||
    isPurchaseConfigLoading ||
    (offerId && isOfferLoading) ||
    formReadyFor !== attemptKey ||
    !listing ||
    !purchaseConfig
  ) {
    return (
      <div
        className="flex items-center justify-center min-h-[400px]"
        role="status"
      >
        <Loader2
          className="h-8 w-8 animate-spin text-muted-foreground"
          aria-hidden="true"
        />
        <span className="sr-only">Preparing your checkout</span>
      </div>
    );
  }

  // Use offer price if checking out from an accepted offer, otherwise listing price
  const pricePerSqFt =
    isOfferCheckout && offerPrice !== null
      ? offerPrice
      : (directPurchasePricing?.finalUnitPrice ??
        listing.buyNowPrice ??
        listing.askPricePerSqFt);
  const subtotal = Math.round(quantitySqFt * pricePerSqFt * 100) / 100;
  const buyerShippingCost = selectedQuote?.buyerFreightCharge ?? 0;
  const sellerFreightContribution =
    selectedQuote?.sellerFreightContribution ?? 0;
  const feeBreakdown = calculateOrderFees(
    subtotal,
    buyerShippingCost,
    sellerFreightContribution,
  );
  const buyerFee = feeBreakdown.buyerFee;
  const total = feeBreakdown.totalCharge;
  const displayedTotal = authoritativeTax?.total ?? total;

  const stepIndex = STEPS.findIndex((s) => s.key === currentStep);

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          if (currentStep === "shipping") {
            setSelectedQuote(null);
            setCurrentStep("address");
          } else {
            router.push(detailHref);
          }
        }}
        className="mb-6"
      >
        <ArrowLeft className="mr-1 h-4 w-4" />
        {currentStep === "shipping" ? "Back to address" : "Back to listing"}
      </Button>

      <h1 className="text-2xl font-bold mb-4">Checkout</h1>

      {/* Accepted Offer banner */}
      {isOfferCheckout && (
        <div className="rounded-lg border-2 border-green-500 bg-green-50 p-4 mb-6 dark:bg-green-950/30">
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2 sm:flex">
            <CheckCircle2
              className="h-5 w-5 text-green-600 shrink-0"
              aria-hidden="true"
            />
            <p className="min-w-0 flex-1 font-semibold text-green-800 dark:text-green-300">
              Completing checkout for accepted offer
            </p>
            <Badge
              variant="secondary"
              className="col-start-2 w-fit shrink-0 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
            >
              Accepted Offer
            </Badge>
          </div>
          {offer?.expiresAt && (
            <p className="text-sm text-green-700 dark:text-green-400 mt-1 flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Payment due by{" "}
              {new Date(offer.expiresAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
                timeZoneName: "short",
              })}
            </p>
          )}
          <div className="mt-2 text-sm text-green-700 dark:text-green-400">
            Price: {formatCurrency(pricePerSqFt)}/sq ft | Quantity:{" "}
            {formatSqFt(quantitySqFt)} | Merchandise subtotal: {formatCurrency(subtotal)}
          </div>
        </div>
      )}

      {/* Keep each step readable at narrow widths and enlarged text sizes. */}
      <ol aria-label="Checkout progress" className="mb-8 grid grid-cols-3 gap-2">
        {STEPS.map((step, i) => (
          <li key={step.key} aria-current={i === stepIndex ? "step" : undefined} className="flex min-w-0 flex-col items-center gap-2 text-center sm:flex-row sm:justify-center">
            <span aria-hidden="true" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium ${i <= stepIndex ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {i < stepIndex ? <Check className="h-4 w-4" /> : i + 1}
            </span>
            <span className={`text-sm ${i <= stepIndex ? "font-medium" : "text-muted-foreground"}`}>{step.label}</span>
            {i < stepIndex && <span className="sr-only">Complete</span>}
          </li>
        ))}
      </ol>

      <div className="grid md:grid-cols-5 gap-8">
        {/* Left - Steps */}
        <div className="md:col-span-3 space-y-6">
          {/* Step 1: Address & Quantity */}
          {currentStep === "address" && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Order Quantity</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    {!isOfferCheckout && purchaseIntent.quantitySqFt && <p className="text-sm text-muted-foreground">Search requirement: {formatSqFt(purchaseIntent.quantitySqFt)}. Your order uses the quantity below; confirm it against this lot’s full-lot, minimum-order and box terms.</p>}
                    <PurchaseQuantityPreview preview={quantityPreview} showPrice={false} />
                    {unresolvedJobQuantity && <Link href={detailHref} className="inline-block text-sm font-medium underline">Return to the listing to confirm order terms</Link>}
                    <Label htmlFor="quantitySqFt">Quantity (sq ft)</Label>
                    {(() => {
                      const moqUnit = listing.moqUnit;
                      const moqSqFt = knownMinimumSqFt ?? 1;
                      const moqDisplay =
                        moqUnit === "pallets" && listing.moq
                          ? `${listing.moq} pallet${listing.moq !== 1 ? "s" : ""} (${knownMinimumSqFt === null ? "square footage to confirm" : formatSqFt(knownMinimumSqFt)})`
                          : listing.moq
                            ? formatSqFt(listing.moq)
                            : null;
                      const boxSize = listing.sqFtPerBox;
                      const boxCount =
                        boxSize && quantitySqFt > 0
                          ? Math.round(quantitySqFt / boxSize)
                          : null;
                      return (
                        <>
                          <Input
                            id="quantitySqFt"
                            type="number"
                            step={boxSize || "0.01"}
                            min={moqSqFt}
                            max={listing.totalSqFt}
                            disabled={isOfferCheckout}
                            readOnly={
                              !isOfferCheckout && purchaseConfig.fullLotOnly
                            }
                            {...register("quantitySqFt", {
                              valueAsNumber: true,
                            })}
                            onBlur={(e) => {
                              if (isOfferCheckout || purchaseConfig.fullLotOnly)
                                return;
                              if (quantityListing) {
                                const raw = parseFloat(e.target.value);
                                if (!isNaN(raw) && raw > 0) {
                                  const suggestion = getPurchaseQuantityPreview(quantityListing, raw);
                                  if (suggestion?.status === "ready" && suggestion.quantitySqFt !== raw)
                                    setValue("quantitySqFt", suggestion.quantitySqFt, { shouldDirty: true, shouldValidate: true });
                                }
                              }
                            }}
                            aria-describedby={
                              errors.quantitySqFt
                                ? "quantitySqFt-error"
                                : isOfferCheckout
                                  ? "quantitySqFt-locked"
                                  : purchaseConfig.fullLotOnly
                                    ? "quantitySqFt-full-lot"
                                    : undefined
                            }
                            aria-invalid={!!errors.quantitySqFt}
                          />
                          {errors.quantitySqFt && (
                            <p
                              id="quantitySqFt-error"
                              className="text-sm text-destructive"
                            >
                              {errors.quantitySqFt.message}
                            </p>
                          )}
                          {isOfferCheckout ? (
                            <p
                              id="quantitySqFt-locked"
                              className="text-xs text-muted-foreground"
                            >
                              Quantity is locked to accepted offer amount:{" "}
                              {formatSqFt(offerQuantity ?? 0)}
                            </p>
                          ) : purchaseConfig.fullLotOnly ? (
                            <p
                              id="quantitySqFt-full-lot"
                              className="text-xs text-muted-foreground"
                            >
                              {quantitySqFt > 0
                                ? `This listing is sold as one full lot. Quantity is fixed at ${formatSqFt(listing.totalSqFt)}.`
                                : "This full lot’s order terms need confirmation before a quantity can be selected."}
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              Available: {formatSqFt(listing.totalSqFt)}
                              {moqDisplay && ` | Min order: ${moqDisplay}`}
                              {boxSize && boxCount !== null && (
                                <>
                                  {" "}
                                  | Sold in boxes of {boxSize} sq ft. {boxCount}{" "}
                                  box{boxCount !== 1 ? "es" : ""} (
                                  {formatSqFt(quantitySqFt)})
                                </>
                              )}
                            </p>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Shipping Address</CardTitle>
                  <CardDescription>
                    Where should this order be delivered?
                  </CardDescription>
                </CardHeader>
                <CardContent
                  className="space-y-4"
                  onInputCapture={() => {
                    addressInteractionRef.current = attemptKey;
                  }}
                >
                  {!isOfferCheckout && purchaseIntent.zip && selectedAddressId === "new" && <p className="text-sm text-muted-foreground">Search ZIP: {purchaseIntent.zip}. Your order uses the receiving address below. Confirm the full address, or choose a saved address.</p>}
                  {savedAddressesQuery.isError && (
                    <div
                      role="alert"
                      className="space-y-2 rounded-md border p-3 text-sm"
                    >
                      <p>
                        We couldn&apos;t load your saved addresses. Enter a
                        delivery address below or retry; your current entries
                        will stay in place.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={savedAddressesQuery.isFetching}
                        onClick={() => void savedAddressesQuery.refetch()}
                      >
                        Retry saved addresses
                      </Button>
                    </div>
                  )}
                  {savedAddresses && savedAddresses.length > 0 && (
                    <div className="space-y-2">
                      <Label htmlFor="savedAddress">Saved Addresses</Label>
                      <select
                        id="savedAddress"
                        value={selectedAddressId}
                        onChange={(e) =>
                          handleAddressSelect(
                            e.target.value as SavedAddressOption,
                          )
                        }
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {savedAddresses.map((addr) => (
                          <option key={addr.id} value={addr.id}>
                            {addr.label} — {addr.name}, {addr.city},{" "}
                            {addr.state} {addr.zip}
                          </option>
                        ))}
                        <option value="new">Enter new address</option>
                      </select>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="shippingName">Full Name / Business</Label>
                    <Input
                      id="shippingName"
                      placeholder="Acme Flooring Co."
                      {...register("shippingName")}
                      aria-describedby={
                        errors.shippingName ? "shippingName-error" : undefined
                      }
                      aria-invalid={!!errors.shippingName}
                    />
                    {errors.shippingName && (
                      <p
                        id="shippingName-error"
                        className="text-sm text-destructive"
                      >
                        {errors.shippingName.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="shippingAddress">Street Address</Label>
                    <Input
                      id="shippingAddress"
                      placeholder="123 Main St, Suite 100"
                      {...register("shippingAddress")}
                      aria-describedby={
                        errors.shippingAddress
                          ? "shippingAddress-error"
                          : undefined
                      }
                      aria-invalid={!!errors.shippingAddress}
                    />
                    {errors.shippingAddress && (
                      <p
                        id="shippingAddress-error"
                        className="text-sm text-destructive"
                      >
                        {errors.shippingAddress.message}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="shippingCity">City</Label>
                      <Input
                        id="shippingCity"
                        placeholder="Dallas"
                        {...register("shippingCity")}
                        aria-describedby={
                          errors.shippingCity ? "shippingCity-error" : undefined
                        }
                        aria-invalid={!!errors.shippingCity}
                      />
                      {errors.shippingCity && (
                        <p
                          id="shippingCity-error"
                          className="text-sm text-destructive"
                        >
                          {errors.shippingCity.message}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="shippingState">State</Label>
                      <Input
                        id="shippingState"
                        placeholder="TX"
                        maxLength={2}
                        {...register("shippingState")}
                        aria-describedby={
                          errors.shippingState
                            ? "shippingState-error"
                            : undefined
                        }
                        aria-invalid={!!errors.shippingState}
                      />
                      {errors.shippingState && (
                        <p
                          id="shippingState-error"
                          className="text-sm text-destructive"
                        >
                          {errors.shippingState.message}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="shippingZip">ZIP</Label>
                      <Input
                        id="shippingZip"
                        placeholder="75001"
                        {...register("shippingZip")}
                        aria-describedby={
                          errors.shippingZip ? "shippingZip-error" : undefined
                        }
                        aria-invalid={!!errors.shippingZip}
                      />
                      {errors.shippingZip && (
                        <p
                          id="shippingZip-error"
                          className="text-sm text-destructive"
                        >
                          {errors.shippingZip.message}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="shippingPhone">Phone (optional)</Label>
                    <Input
                      id="shippingPhone"
                      type="tel"
                      placeholder="(555) 123-4567"
                      {...register("shippingPhone")}
                    />
                  </div>
                </CardContent>
              </Card>

              <Button
                type="button"
                className="w-full"
                size="lg"
                onClick={handleContinueToShipping}
                disabled={!canEstimateQuantity}
              >
                <Truck className="mr-2 h-4 w-4" />
                Continue to Shipping
              </Button>
            </>
          )}

          {/* Step 2: Shipping Quote Selection */}
          {currentStep === "shipping" && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Delivery requirements
                  </CardTitle>
                  <CardDescription>
                    Include any delivery requirements so your freight quotes
                    stay accurate.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
                    <div className="space-y-1">
                      <Label
                        htmlFor="liftgate-delivery"
                        className="text-sm font-medium"
                      >
                        Liftgate delivery
                      </Label>
                      <p
                        id="liftgate-delivery-description"
                        className="text-sm text-muted-foreground"
                      >
                        Add this when the delivery site needs a powered tail
                        lift to unload.
                      </p>
                    </div>
                    <Switch
                      id="liftgate-delivery"
                      checked={liftgateDelivery}
                      onCheckedChange={(checked) =>
                        handleAccessorialToggle(setLiftgateDelivery, checked)
                      }
                      aria-describedby="liftgate-delivery-description"
                      aria-label="Liftgate delivery"
                    />
                  </div>

                  <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
                    <div className="space-y-1">
                      <Label
                        htmlFor="residential-delivery"
                        className="text-sm font-medium"
                      >
                        Residential delivery
                      </Label>
                      <p
                        id="residential-delivery-description"
                        className="text-sm text-muted-foreground"
                      >
                        Use this when freight is going to a home or other
                        non-commercial address.
                      </p>
                    </div>
                    <Switch
                      id="residential-delivery"
                      checked={residentialDelivery}
                      onCheckedChange={(checked) =>
                        handleAccessorialToggle(setResidentialDelivery, checked)
                      }
                      aria-describedby="residential-delivery-description"
                      aria-label="Residential delivery"
                    />
                  </div>

                  <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
                    <div className="space-y-1">
                      <Label
                        htmlFor="appointment-delivery"
                        className="text-sm font-medium"
                      >
                        Delivery appointment required
                      </Label>
                      <p
                        id="appointment-delivery-description"
                        className="text-sm text-muted-foreground"
                      >
                        Add this when the receiving site requires a scheduled
                        delivery window.
                      </p>
                    </div>
                    <Switch
                      id="appointment-delivery"
                      checked={appointmentDelivery}
                      onCheckedChange={(checked) =>
                        handleAccessorialToggle(setAppointmentDelivery, checked)
                      }
                      aria-describedby="appointment-delivery-description"
                      aria-label="Delivery appointment required"
                    />
                  </div>
                </CardContent>
              </Card>

              <ResaleCheckout
                state={shippingState}
                purpose={watch("purchasePurpose")}
                onChange={(purpose) => setValue("purchasePurpose", purpose)}
                disabled={!!attempt || isSubmitting}
              />

              <ShippingQuoteSelector
                listingId={listingId}
                destinationZip={shippingZip}
                quantitySqFt={quantitySqFt}
                liftgateDelivery={liftgateDelivery}
                residentialDelivery={residentialDelivery}
                appointmentDelivery={appointmentDelivery}
                selectedQuote={selectedQuote}
                onSelectQuote={setSelectedQuote}
                onClearQuote={() => setSelectedQuote(null)}
              />

              <Button
                type="button"
                className="w-full"
                size="lg"
                disabled={
                  !selectedQuote ||
                  isSubmitting ||
                  createOrderFromOffer.isPending
                }
                onClick={handleContinueToPayment}
              >
                {isSubmitting ? (
                  <Loader2
                    className="mr-2 h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <ShieldCheck className="mr-2 h-4 w-4" />
                )}
                Continue to Payment
              </Button>
            </>
          )}

          {/* Step 3: Payment */}
          {currentStep === "payment" && clientSecret && (
            <StripeProvider clientSecret={clientSecret}>
              <StripePaymentForm listingId={listingId} orderId={orderId!} />
            </StripeProvider>
          )}
        </div>

        {/* Right - Order Summary */}
        <div className="md:col-span-2">
          <Card className="lg:sticky lg:top-20">
            <CardHeader>
              <CardTitle className="text-lg">Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Product */}
              <div className="flex gap-3">
                <div className="h-16 w-16 rounded-md bg-muted flex items-center justify-center overflow-hidden shrink-0 relative">
                  {listing.media?.[0] ? (
                    <Image
                      src={listing.media[0].url}
                      alt={listing.title}
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                  ) : (
                    <Package
                      className="h-6 w-6 text-muted-foreground"
                      aria-hidden="true"
                    />
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-medium line-clamp-2">
                    {listing.title}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {listing.seller?.displayName ??
                      "Seller information unavailable"}
                  </p>
                </div>
              </div>

              {isOfferCheckout && (
                <Badge
                  variant="secondary"
                  className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
                >
                  Accepted Offer Price
                </Badge>
              )}

              <Separator />

              {/* Pricing breakdown */}
              {canEstimateQuantity ? <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {formatSqFt(quantitySqFt)} x {formatCurrency(pricePerSqFt)}
                    /sq ft
                  </span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                {directPurchasePricing?.partialQuantity.applied && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Full-lot unit price
                      </span>
                      <span>
                        {formatCurrency(
                          directPurchasePricing.currentBaseUnitPrice ?? 0,
                        )}
                        /sq ft
                      </span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">
                        Partial-order adjustment
                      </span>
                      <span className="text-right">
                        +{directPurchasePricing.partialQuantity.markupPercent}%
                        {" · "}
                        {formatCurrency(pricePerSqFt)}/sq ft
                      </span>
                    </div>
                  </>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Buyer fee ({BUYER_MARKETPLACE_FEE_PERCENT}% on inventory
                    only)
                  </span>
                  <span>{formatCurrency(buyerFee)}</span>
                </div>
                {authoritativeTax ? (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {authoritativeTax.resaleApplied
                        ? "Tax (resale exemption applied)"
                        : "Sales tax"}
                    </span>
                    <span>{formatCurrency(authoritativeTax.amount)}</span>
                  </div>
                ) : (
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Sales tax</span>
                    <span className="text-right text-muted-foreground">
                      Calculated before payment
                    </span>
                  </div>
                )}
                {selectedQuote &&
                  (selectedQuote.sellerFreightContribution > 0 ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Full freight charge
                        </span>
                        <span>
                          {formatCurrency(selectedQuote.shippingPrice)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-4 text-green-700 dark:text-green-400">
                        <span>Seller shipping credit</span>
                        <span>
                          -
                          {formatCurrency(
                            selectedQuote.sellerFreightContribution,
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between font-medium">
                        <span>
                          Buyer shipping ({selectedQuote.carrierName})
                        </span>
                        <span>
                          {formatCurrency(selectedQuote.buyerFreightCharge)}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Buyer shipping ({selectedQuote.carrierName})
                      </span>
                      <span>
                        {formatCurrency(selectedQuote.buyerFreightCharge)}
                      </span>
                    </div>
                  ))}
                <Separator />
                <div className="flex justify-between font-semibold text-base">
                  <span>{authoritativeTax ? "Total" : "Estimated total"}</span>
                  <span className="text-primary">
                    {formatCurrency(displayedTotal)}
                  </span>
                </div>
              </div>

              : <p role="status" className="text-sm text-muted-foreground">Select a valid quantity under this lot’s order terms to see an estimate.</p>}

              {canEstimateQuantity && !authoritativeTax && <p className="text-xs text-muted-foreground">Shipping and tax confirmed before payment.</p>}

              {authoritativeTax?.status === "calculated" && (
                <p className="text-xs text-muted-foreground">
                  Tax was calculated from the delivery address and the
                  listing&apos;s verified product category. The amount above is
                  included in the PaymentIntent total.
                </p>
              )}
              {authoritativeTax?.status === "disabled" && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Tax calculation is disabled in this non-production
                  environment. Production checkout cannot run in this mode.
                </p>
              )}

              {selectedQuote && (
                <p className="text-xs text-muted-foreground">
                  Est. delivery: {selectedQuote.transitDays} business days via{" "}
                  {selectedQuote.carrierName}
                </p>
              )}

              {purchaseConfig?.sellingTerritoryMode === "allowed_states" &&
                purchaseConfig.allowedDestinationStates.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Seller territory:{" "}
                    {purchaseConfig.allowedDestinationStates.join(", ")}
                  </p>
                )}

              <p className="text-xs text-center text-muted-foreground">
                By placing this order, you agree to our Terms of Service. Seller
                fees are handled separately from the buyer checkout total.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
