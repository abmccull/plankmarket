"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createOrderSchema, type CreateOrderInput } from "@/lib/validators/order";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  formatCurrency,
  formatSqFt,
  calculateBuyerFee,
} from "@/lib/utils";
import { toast } from "sonner";
import { ArrowLeft, Loader2, ShieldCheck, Package, Check, Truck } from "lucide-react";
import { StripeProvider } from "@/components/checkout/stripe-provider";
import { StripePaymentForm } from "@/components/checkout/stripe-payment-form";
import ShippingQuoteSelector, {
  type SelectedShippingQuote,
} from "@/components/checkout/shipping-quote-selector";
import Image from "next/image";
import { getAnonymousDisplayName } from "@/lib/identity/display-name";

type CheckoutStep = "address" | "shipping" | "payment";
type SavedAddressOption = "new" | string; // "new" or address id

const STEPS: { key: CheckoutStep; label: string }[] = [
  { key: "address", label: "Address" },
  { key: "shipping", label: "Shipping" },
  { key: "payment", label: "Payment" },
];

export default function CheckoutPage() {
  const params = useParams();
  const router = useRouter();
  const listingId = params.id as string;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState<CheckoutStep>("address");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [selectedQuote, setSelectedQuote] = useState<SelectedShippingQuote | null>(null);
  const [selectedAddressId, setSelectedAddressId] = useState<SavedAddressOption>("new");

  const { data: listing, isLoading } = trpc.listing.getById.useQuery({
    id: listingId,
  });

  // Check seller payment readiness
  useEffect(() => {
    if (listing?.seller && !listing.seller.stripeOnboardingComplete) {
      toast.error("This seller hasn't set up payment processing yet.");
      router.push(`/listings/${listingId}`);
    }
  }, [listing, listingId, router]);

  const createOrder = trpc.order.create.useMutation();
  const createPaymentIntent = trpc.payment.createPaymentIntent.useMutation();

  const {
    register,
    watch,
    reset,
    trigger,
    getValues,
    setValue,
    formState: { errors },
  } = useForm<CreateOrderInput>({
    resolver: zodResolver(createOrderSchema),
    defaultValues: {
      listingId,
      quantitySqFt: 0,
    },
  });

  // Reset form defaults when listing data loads
  useEffect(() => {
    if (listing) {
      reset({ listingId, quantitySqFt: listing.totalSqFt });
    }
  }, [listing, listingId, reset]);

  // Fetch saved addresses
  const { data: savedAddresses } = trpc.shippingAddress.list.useQuery();

  // Pre-select default address when addresses load
  useEffect(() => {
    if (savedAddresses && savedAddresses.length > 0) {
      const defaultAddr = savedAddresses.find((a) => a.isDefault) ?? savedAddresses[0];
      if (defaultAddr) {
        setSelectedAddressId(defaultAddr.id);
        setValue("shippingName", defaultAddr.name);
        setValue("shippingAddress", defaultAddr.address);
        setValue("shippingCity", defaultAddr.city);
        setValue("shippingState", defaultAddr.state);
        setValue("shippingZip", defaultAddr.zip);
        if (defaultAddr.phone) setValue("shippingPhone", defaultAddr.phone);
      }
    }
  }, [savedAddresses, setValue]);

  const handleAddressSelect = (addressId: SavedAddressOption) => {
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
      if (addr.phone) setValue("shippingPhone", addr.phone);
    }
  };

  const quantitySqFt = watch("quantitySqFt") || listing?.totalSqFt || 0;
  const shippingZip = watch("shippingZip") || "";

  // Handle "Continue to Shipping" — validate address fields
  const handleContinueToShipping = async () => {
    const isValid = await trigger([
      "quantitySqFt",
      "shippingName",
      "shippingAddress",
      "shippingCity",
      "shippingState",
      "shippingZip",
    ]);
    if (isValid) {
      setCurrentStep("shipping");
    }
  };

  // Handle "Continue to Payment" — create order with shipping quote
  const handleContinueToPayment = async () => {
    if (!selectedQuote) {
      toast.error("Please select a shipping option to continue.");
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = getValues();
      // Create the order with shipping fields
      const order = await createOrder.mutateAsync({
        ...formData,
        selectedQuoteId: String(selectedQuote.quoteId),
        selectedCarrier: selectedQuote.carrierName,
        carrierRate: selectedQuote.carrierRate,
        shippingPrice: selectedQuote.shippingPrice,
        estimatedTransitDays: selectedQuote.transitDays,
        quoteExpiresAt: selectedQuote.quoteExpiresAt,
      });
      setOrderId(order.id);

      // Create payment intent
      const paymentIntentData = await createPaymentIntent.mutateAsync({
        orderId: order.id,
      });

      if (!paymentIntentData.clientSecret) {
        throw new Error("Failed to create payment intent");
      }

      setClientSecret(paymentIntentData.clientSecret);
      setCurrentStep("payment");
      toast.success("Order created! Please complete payment.");
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to create order";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">Listing Not Found</h1>
      </div>
    );
  }

  const pricePerSqFt = listing.buyNowPrice ?? listing.askPricePerSqFt;
  const subtotal = Math.round(quantitySqFt * pricePerSqFt * 100) / 100;
  const buyerFee = calculateBuyerFee(subtotal);
  const shippingCost = selectedQuote?.shippingPrice ?? 0;
  const total = Math.round((subtotal + buyerFee + shippingCost) * 100) / 100;

  const stepIndex = STEPS.findIndex((s) => s.key === currentStep);

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          if (currentStep === "shipping") {
            setCurrentStep("address");
          } else {
            router.back();
          }
        }}
        className="mb-6"
      >
        <ArrowLeft className="mr-1 h-4 w-4" />
        {currentStep === "shipping" ? "Back to address" : "Back to listing"}
      </Button>

      <h1 className="text-2xl font-bold mb-4">Checkout</h1>

      {/* Progress indicator */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((step, i) => (
          <div key={step.key} className="flex items-center gap-2">
            <div
              className={`flex items-center justify-center h-8 w-8 rounded-full text-sm font-medium ${
                i < stepIndex
                  ? "bg-primary text-primary-foreground"
                  : i === stepIndex
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {i < stepIndex ? (
                <Check className="h-4 w-4" />
              ) : (
                i + 1
              )}
            </div>
            <span
              className={`text-sm ${
                i <= stepIndex ? "font-medium" : "text-muted-foreground"
              }`}
            >
              {step.label}
            </span>
            {i < STEPS.length - 1 && (
              <div
                className={`h-px w-8 ${
                  i < stepIndex ? "bg-primary" : "bg-muted"
                }`}
              />
            )}
          </div>
        ))}
      </div>

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
                    <Label htmlFor="quantitySqFt">Quantity (sq ft)</Label>
                    {(() => {
                      const moqUnit = listing.moqUnit;
                      const moqSqFt = moqUnit === "pallets" && listing.moq
                        ? listing.moq * (listing.sqFtPerBox ?? 20) * (listing.boxesPerPallet ?? 30)
                        : (listing.moq ?? 1);
                      const moqDisplay = moqUnit === "pallets" && listing.moq
                        ? `${listing.moq} pallet${listing.moq !== 1 ? "s" : ""} (~${formatSqFt(moqSqFt)})`
                        : listing.moq ? formatSqFt(listing.moq) : null;
                      const boxSize = listing.sqFtPerBox;
                      const boxCount = boxSize && quantitySqFt > 0
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
                            defaultValue={listing.totalSqFt}
                            {...register("quantitySqFt", { valueAsNumber: true })}
                            onBlur={(e) => {
                              if (boxSize && boxSize > 0) {
                                const raw = parseFloat(e.target.value);
                                if (!isNaN(raw) && raw > 0) {
                                  const snapped = Math.ceil(raw / boxSize) * boxSize;
                                  const clamped = Math.min(
                                    Math.max(snapped, moqSqFt),
                                    listing.totalSqFt
                                  );
                                  setValue("quantitySqFt", clamped);
                                }
                              }
                            }}
                            aria-describedby={errors.quantitySqFt ? "quantitySqFt-error" : undefined}
                            aria-invalid={!!errors.quantitySqFt}
                          />
                          {errors.quantitySqFt && (
                            <p id="quantitySqFt-error" className="text-sm text-destructive">
                              {errors.quantitySqFt.message}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            Available: {formatSqFt(listing.totalSqFt)}
                            {moqDisplay && ` | Min order: ${moqDisplay}`}
                            {boxSize && boxCount !== null && (
                              <> | Sold in boxes of {boxSize} sq ft. {boxCount} box{boxCount !== 1 ? "es" : ""} ({formatSqFt(quantitySqFt)})</>
                            )}
                          </p>
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
                <CardContent className="space-y-4">
                  {savedAddresses && savedAddresses.length > 0 && (
                    <div className="space-y-2">
                      <Label htmlFor="savedAddress">Saved Addresses</Label>
                      <select
                        id="savedAddress"
                        value={selectedAddressId}
                        onChange={(e) => handleAddressSelect(e.target.value as SavedAddressOption)}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {savedAddresses.map((addr) => (
                          <option key={addr.id} value={addr.id}>
                            {addr.label} — {addr.name}, {addr.city}, {addr.state} {addr.zip}
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
                      aria-describedby={errors.shippingName ? "shippingName-error" : undefined}
                      aria-invalid={!!errors.shippingName}
                    />
                    {errors.shippingName && (
                      <p id="shippingName-error" className="text-sm text-destructive">
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
                      aria-describedby={errors.shippingAddress ? "shippingAddress-error" : undefined}
                      aria-invalid={!!errors.shippingAddress}
                    />
                    {errors.shippingAddress && (
                      <p id="shippingAddress-error" className="text-sm text-destructive">
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
                        aria-describedby={errors.shippingCity ? "shippingCity-error" : undefined}
                        aria-invalid={!!errors.shippingCity}
                      />
                      {errors.shippingCity && (
                        <p id="shippingCity-error" className="text-sm text-destructive">
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
                        aria-describedby={errors.shippingState ? "shippingState-error" : undefined}
                        aria-invalid={!!errors.shippingState}
                      />
                      {errors.shippingState && (
                        <p id="shippingState-error" className="text-sm text-destructive">
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
                        aria-describedby={errors.shippingZip ? "shippingZip-error" : undefined}
                        aria-invalid={!!errors.shippingZip}
                      />
                      {errors.shippingZip && (
                        <p id="shippingZip-error" className="text-sm text-destructive">
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
              >
                <Truck className="mr-2 h-4 w-4" />
                Continue to Shipping
              </Button>
            </>
          )}

          {/* Step 2: Shipping Quote Selection */}
          {currentStep === "shipping" && (
            <>
              <ShippingQuoteSelector
                listingId={listingId}
                destinationZip={shippingZip}
                quantitySqFt={quantitySqFt}
                selectedQuote={selectedQuote}
                onSelectQuote={setSelectedQuote}
              />

              <Button
                type="button"
                className="w-full"
                size="lg"
                disabled={!selectedQuote || isSubmitting}
                onClick={handleContinueToPayment}
              >
                {isSubmitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
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
                    <Package className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-medium line-clamp-2">
                    {listing.title}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {listing.seller ? getAnonymousDisplayName({ role: listing.seller.role, businessState: listing.seller.businessState, name: listing.seller.name, businessCity: listing.seller.businessCity }) : "Verified Seller"}
                  </p>
                </div>
              </div>

              <Separator />

              {/* Pricing breakdown */}
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {formatSqFt(quantitySqFt)} x{" "}
                    {formatCurrency(pricePerSqFt)}/sq ft
                  </span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Buyer fee (3%)
                  </span>
                  <span>{formatCurrency(buyerFee)}</span>
                </div>
                {selectedQuote && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Shipping ({selectedQuote.carrierName})
                    </span>
                    <span>{formatCurrency(selectedQuote.shippingPrice)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-semibold text-base">
                  <span>Total</span>
                  <span className="text-primary">
                    {formatCurrency(total)}
                  </span>
                </div>
              </div>

              {selectedQuote && (
                <p className="text-xs text-muted-foreground">
                  Est. delivery: {selectedQuote.transitDays} business days via {selectedQuote.carrierName}
                </p>
              )}

              <p className="text-xs text-center text-muted-foreground">
                By placing this order, you agree to our Terms of Service.
                Seller fee (2%) will be deducted from seller payout.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
