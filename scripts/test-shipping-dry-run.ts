/**
 * Dry-run shipping smoke test.
 *
 * Covers:
 *  1. Mock rate quotes
 *  2. Dispatch request construction
 *  3. Dry-run shipment dispatch
 *  4. Forced tracking status progression
 *  5. Dry-run delivery receipt fetch
 *
 * Usage:
 *   npx tsx scripts/test-shipping-dry-run.ts
 */

export {};

process.env.SKIP_ENV_VALIDATION = "1";
process.env.PRIORITY1_DRY_RUN = "true";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function logStep(message: string) {
  console.log(`\n=== ${message} ===`);
}

async function main() {
  const { priority1 } = await import("../src/server/services/priority1");
  const {
    buildDispatchRequestForOrder,
    mapPriority1ShipmentStatus,
  } = await import("../src/server/services/shipping-workflow");

  const listing = {
    title: "Dry Run Oak Flooring",
    sqFtPerBox: 20,
    boxesPerPallet: 30,
    totalPallets: 8,
    freightClass: "125",
    palletWeight: 1400,
    palletLength: 48,
    palletWidth: 40,
    palletHeight: 52,
    nmfcCode: "123456",
    locationCity: "Salt Lake City",
    locationState: "UT",
    locationZip: "84101",
  };

  const seller = {
    businessAddress: "500 Seller Ave",
    businessName: "Seller Supply Co",
    name: "Seller Contact",
    phone: "555-999-8888",
    email: "seller@example.com",
  };

  const buyer = {
    businessName: "Buyer LLC",
    name: "Buyer Contact",
    phone: "555-111-2222",
    email: "buyer@example.com",
  };

  const order = {
    orderNumber: "PM-SHIPTEST1",
    selectedQuoteId: null as string | null,
    shippingAddress: "123 Buyer St",
    shippingCity: "Portland",
    shippingState: "OR",
    shippingZip: "97201",
    shippingName: "Buyer Receiving",
    shippingPhone: "555-111-2222",
    quantitySqFt: 1800,
  };

  logStep("1. Fetching dry-run rate quotes");
  const rates = await priority1.getRates({
    originZipCode: listing.locationZip,
    destinationZipCode: order.shippingZip,
    pickupDate: new Date("2026-03-11T00:00:00.000Z").toISOString(),
    items: [
      {
        freightClass: listing.freightClass,
        packagingType: "Pallet",
        units: 3,
        pieces: 1,
        totalWeight: listing.palletWeight,
        length: listing.palletLength,
        width: listing.palletWidth,
        height: listing.palletHeight,
        isStackable: true,
        isHazardous: false,
        isUsed: false,
        isMachinery: false,
        nmfcItemCode: listing.nmfcCode,
      },
    ],
  });

  assert(rates.rateQuotes.length >= 3, "Expected at least 3 dry-run rate quotes");
  const selectedQuote = rates.rateQuotes[0];
  assert(selectedQuote, "Expected a selected dry-run quote");
  order.selectedQuoteId = String(selectedQuote.id);

  console.log(
    rates.rateQuotes.map((quote) => ({
      id: quote.id,
      carrier: quote.carrierName,
      total: quote.rateQuoteDetail.total,
      transitDays: quote.transitDays,
    })),
  );

  logStep("2. Building dispatch request");
  const { request } = buildDispatchRequestForOrder({
    order,
    listing,
    seller,
    buyer,
  });

  assert(request.quoteId === selectedQuote.id, "Dispatch request quote id mismatch");
  assert(request.lineItems[0]?.units === 3, "Expected 3 pallets in dispatch request");
  console.log({
    quoteId: request.quoteId,
    pallets: request.lineItems[0]?.units,
    originZip: request.originLocation.address.postalCode,
    destinationZip: request.destinationLocation.address.postalCode,
  });

  logStep("3. Dispatching dry-run shipment");
  const dispatch = await priority1.dispatch(request);
  const proNumber =
    dispatch.shipmentIdentifiers.find((id) => id.type === "PRO_NUMBER")?.value ??
    dispatch.shipmentIdentifiers[0]?.value;

  assert(dispatch.id, "Expected dry-run shipment id");
  assert(proNumber, "Expected dry-run PRO/BOL identifier");
  console.log({
    shipmentId: dispatch.id,
    proNumber,
    bolUrl: dispatch.capacityProviderBolUrl,
    labelUrl: dispatch.capacityProviderPalletLabelUrl,
  });

  logStep("4. Tracking progression");
  for (const forcedStatus of ["Dispatched", "InTransit", "Delivered"]) {
    process.env.PRIORITY1_DRY_RUN_STATUS = forcedStatus;

    const statusResponse = await priority1.getStatus({
      identifierType: "PRO_NUMBER",
      identifierValue: proNumber,
    });
    const shipment = statusResponse.shipments[0];
    assert(shipment, `Expected shipment status for ${forcedStatus}`);

    const mapped = mapPriority1ShipmentStatus(
      forcedStatus === "Dispatched"
        ? "dispatched"
        : forcedStatus === "InTransit"
          ? "dispatched"
          : "in_transit",
      shipment,
    );

    console.log({
      forcedStatus,
      providerStatus: shipment.status,
      mappedStatus: mapped.mappedStatus,
      trackingEvents: mapped.trackingEvents.length,
      pickedUp: mapped.pickedUp,
      delivered: mapped.delivered,
    });
  }

  logStep("5. Fetching dry-run delivery receipt");
  const receipt = await priority1.getDocuments({
    shipmentImageTypeId: "DeliveryReceipt",
    imageFormatTypeId: "PDF",
    proNumber,
  });

  assert(receipt.imageUrl.includes("dry-run.local"), "Expected dry-run receipt URL");
  console.log({ receiptUrl: receipt.imageUrl });

  console.log("\nShipping dry-run smoke test passed.");
}

main().catch((error) => {
  console.error("\nShipping dry-run smoke test failed.");
  console.error(error);
  process.exit(1);
});
