/** Safe, provider-free smoke test for quote -> snapshot -> dispatch -> tracking. */
export {};

process.env.SKIP_ENV_VALIDATION = "1";
process.env.PRIORITY1_DRY_RUN = "true";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const { priority1 } = await import("../src/server/services/priority1");
  const {
    addBusinessDays,
    buildDispatchRequestForOrder,
    formatPriority1Date,
    mapPriority1ShipmentStatus,
  } = await import("../src/server/services/shipping-workflow");

  const pickupDate = new Date("2026-03-11T12:00:00.000Z");
  const rates = await priority1.getRates({
    originZipCode: "84101",
    destinationZipCode: "97201",
    pickupDate: pickupDate.toISOString(),
    items: [
      {
        freightClass: "125",
        packagingType: "Pallet",
        units: 3,
        pieces: 1,
        totalWeight: 4200,
        length: 48,
        width: 40,
        height: 52,
        description: "Dry Run Oak Flooring - Flooring",
        isStackable: false,
        isHazardous: false,
        isUsed: false,
        isMachinery: false,
      },
    ],
  });
  const selectedQuote = rates.rateQuotes[0];
  assert(selectedQuote, "Expected a dry-run rate quote");
  assert(selectedQuote.carrierName, "Expected a carrier name");
  assert(selectedQuote.carrierCode, "Expected a carrier code");

  const { request } = buildDispatchRequestForOrder(
    {
      order: {
        orderNumber: "PM-SHIPTEST1",
        selectedQuoteId: String(selectedQuote.id),
        shippingAddress: "123 Buyer St",
        shippingCity: "Portland",
        shippingState: "OR",
        shippingZip: "97201",
        shippingName: "Buyer Receiving",
        shippingPhone: "555-111-2222",
      },
      buyer: {
        businessName: "Buyer LLC",
        name: "Buyer Contact",
        phone: "555-111-2222",
        email: "buyer@example.com",
      },
      snapshot: {
        version: 1,
        quoteId: selectedQuote.id,
        listingId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        buyerId: "b1b2c3d4-e5f6-7890-abcd-ef1234567890",
        quantitySqFt: 1800,
        destinationZip: "97201",
        carrierName: selectedQuote.carrierName,
        carrierScac: selectedQuote.carrierCode,
        carrierRate: selectedQuote.rateQuoteDetail.total,
        shippingPrice: selectedQuote.rateQuoteDetail.total * 1.25,
        transitDays: selectedQuote.transitDays,
        quoteExpiresAt:
          selectedQuote.expirationDate ?? "2026-03-11T23:59:59.000Z",
        originLocation: {
          address: {
            addressLine1: "500 Seller Ave",
            city: "Salt Lake City",
            state: "UT",
            postalCode: "84101",
            country: "US",
          },
          contact: {
            companyName: "Seller Supply Co",
            contactName: "Seller Contact",
            phoneNumber: "555-999-8888",
            email: "seller@example.com",
          },
        },
        lineItems: [
          {
            freightClass: "125",
            packagingType: "Pallet",
            units: 3,
            pieces: 1,
            totalWeight: 4200,
            length: 48,
            width: 40,
            height: 52,
            description: "Dry Run Oak Flooring - Flooring",
            isStackable: false,
            isHazardous: false,
            isUsed: false,
          },
        ],
        pickupWindow: {
          date: formatPriority1Date(pickupDate),
          startTime: "08:00",
          endTime: "17:00",
        },
        deliveryWindow: {
          date: formatPriority1Date(
            addBusinessDays(pickupDate, selectedQuote.transitDays),
          ),
          startTime: "08:00",
          endTime: "17:00",
        },
      },
    },
    new Date("2026-03-10T12:00:00.000Z"),
  );

  assert(request.pickupWindow.date === "2026-03-11", "Bad pickup date format");
  assert(request.deliveryWindow.date === "2026-03-18", "Missing delivery window");
  assert(request.lineItems[0]?.isStackable === false, "Snapshot freight changed");

  const dispatch = await priority1.dispatch(request);
  const proNumber = dispatch.shipmentIdentifiers.find(
    (identifier) => identifier.type === "PRO",
  )?.value;
  assert(dispatch.id, "Expected a dry-run shipment ID");
  assert(proNumber, "Expected a dry-run PRO identifier");

  for (const forcedStatus of ["Dispatched", "InTransit", "Delivered"]) {
    process.env.PRIORITY1_DRY_RUN_STATUS = forcedStatus;
    const statusResponse = await priority1.getStatus({
      identifierType: "PRO",
      identifierValue: proNumber,
    });
    const shipment = statusResponse.shipments[0];
    assert(shipment, `Expected ${forcedStatus} status`);
    const mapped = mapPriority1ShipmentStatus(
      forcedStatus === "Dispatched"
        ? "dispatched"
        : forcedStatus === "InTransit"
          ? "dispatched"
          : "in_transit",
      shipment,
    );
    if (forcedStatus === "InTransit") {
      assert(mapped.pickupConfirmed, "Expected provider-confirmed pickup");
    }
    if (forcedStatus === "Delivered") {
      assert(mapped.delivered, "Expected delivered mapping");
    }
  }

  const receipt = await priority1.getDocuments({
    shipmentImageTypeId: "DeliveryReceipt",
    imageFormatTypeId: "PDF",
    proNumber,
  });
  assert(receipt.imageUrl?.includes("dry-run.local"), "Expected dry-run receipt");
  console.log("Shipping dry-run smoke test passed.");
}

main().catch((error) => {
  console.error("Shipping dry-run smoke test failed.");
  console.error(error);
  process.exit(1);
});
