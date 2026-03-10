import type {
  DispatchRequest,
  P1ShipmentStatus,
  TrackingStatus,
} from "./priority1";
import type { TrackingEvent } from "@/server/db/schema";

type NullableString = string | null | undefined;
type NullableNumber = number | null | undefined;

export interface DispatchWorkflowContext {
  order: {
    orderNumber: string;
    selectedQuoteId: string | null;
    shippingAddress: NullableString;
    shippingCity: NullableString;
    shippingState: NullableString;
    shippingZip: NullableString;
    shippingName: NullableString;
    shippingPhone: NullableString;
    quantitySqFt: number | string;
  };
  listing: {
    title: string;
    sqFtPerBox: NullableNumber;
    boxesPerPallet: NullableNumber;
    totalPallets: NullableNumber;
    freightClass: NullableString;
    palletWeight: NullableNumber;
    palletLength: NullableNumber;
    palletWidth: NullableNumber;
    palletHeight: NullableNumber;
    nmfcCode: NullableString;
    locationCity: NullableString;
    locationState: NullableString;
    locationZip: NullableString;
  };
  seller: {
    businessAddress: NullableString;
    businessName: NullableString;
    name: string;
    phone: NullableString;
    email: string;
  };
  buyer: {
    businessName: NullableString;
    name: string;
    phone: NullableString;
    email: string;
  };
}

export interface ShipmentStatusUpdate {
  mappedStatus:
    | "pending"
    | "dispatched"
    | "in_transit"
    | "out_for_delivery"
    | "delivered"
    | "exception"
    | "cancelled";
  trackingEvents: TrackingEvent[];
  pickedUp: boolean;
  delivered: boolean;
}

export function getNextBusinessDay(from = new Date()): Date {
  const date = new Date(from);
  date.setDate(date.getDate() + 1);

  while (date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() + 1);
  }

  return date;
}

export function formatPickupDate(date: Date): string {
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(
    date.getDate(),
  ).padStart(2, "0")}/${date.getFullYear()}`;
}

export function computePalletsNeeded(params: {
  quantitySqFt: number | string;
  sqFtPerBox: NullableNumber;
  boxesPerPallet: NullableNumber;
  totalPallets: NullableNumber;
}): number {
  const quantitySqFtNum = parseFloat(String(params.quantitySqFt));
  const sqFtPerBox = params.sqFtPerBox ?? 20;
  const boxesPerPallet = params.boxesPerPallet ?? 30;
  const totalPallets = params.totalPallets ?? 1;

  return Math.max(
    1,
    Math.min(
      Math.ceil(quantitySqFtNum / (sqFtPerBox * boxesPerPallet)),
      totalPallets,
    ),
  );
}

export function buildDispatchRequestForOrder(
  context: DispatchWorkflowContext,
  now = new Date(),
): { pickupDate: Date; request: DispatchRequest } {
  if (!context.order.selectedQuoteId) {
    throw new Error("Order is missing selectedQuoteId");
  }

  const pickupDate = getNextBusinessDay(now);
  const pickupDateStr = formatPickupDate(pickupDate);
  const palletsNeeded = computePalletsNeeded({
    quantitySqFt: context.order.quantitySqFt,
    sqFtPerBox: context.listing.sqFtPerBox,
    boxesPerPallet: context.listing.boxesPerPallet,
    totalPallets: context.listing.totalPallets,
  });

  return {
    pickupDate,
    request: {
      originLocation: {
        address: {
          addressLine1: context.seller.businessAddress || "N/A",
          city: context.listing.locationCity || "N/A",
          state: context.listing.locationState || "N/A",
          postalCode: context.listing.locationZip || "N/A",
          country: "US",
        },
        contact: {
          companyName: context.seller.businessName || context.seller.name,
          contactName: context.seller.name,
          phoneNumber: context.seller.phone || "000-000-0000",
          email: context.seller.email,
        },
      },
      destinationLocation: {
        address: {
          addressLine1: context.order.shippingAddress || "N/A",
          city: context.order.shippingCity || "N/A",
          state: context.order.shippingState || "N/A",
          postalCode: context.order.shippingZip || "N/A",
          country: "US",
        },
        contact: {
          companyName: context.buyer.businessName || context.buyer.name,
          contactName: context.order.shippingName || context.buyer.name,
          phoneNumber:
            context.order.shippingPhone || context.buyer.phone || "000-000-0000",
          email: context.buyer.email,
        },
      },
      lineItems: [
        {
          freightClass: context.listing.freightClass || "125",
          packagingType: "Pallet",
          units: palletsNeeded,
          pieces: 1,
          totalWeight: (context.listing.palletWeight ?? 1200) * palletsNeeded,
          length: context.listing.palletLength ?? 48,
          width: context.listing.palletWidth ?? 40,
          height: context.listing.palletHeight ?? 48,
          description: `${context.listing.title} - Flooring`,
          isStackable: false,
          isHazardous: false,
          isUsed: false,
          ...(context.listing.nmfcCode
            ? { nmfcItemCode: context.listing.nmfcCode }
            : {}),
        },
      ],
      pickupWindow: {
        date: pickupDateStr,
        startTime: "08:00",
        endTime: "17:00",
      },
      shipmentIdentifiers: [
        {
          type: "CUSTOMER_REFERENCE",
          value: context.order.orderNumber,
          primaryForType: false,
        },
      ],
      quoteId: parseInt(context.order.selectedQuoteId, 10),
      insuranceAmount: 0,
      pickupNote: `PlankMarket Order ${context.order.orderNumber}`,
    },
  };
}

function mapTrackingStatusesToEvents(
  trackingStatuses: TrackingStatus[] | null | undefined,
): TrackingEvent[] {
  return (trackingStatuses || []).map((ts) => ({
    timestamp: ts.timeStamp,
    status: ts.status,
    location: [ts.city, ts.state].filter(Boolean).join(", "),
    description: ts.statusReason || ts.status,
  }));
}

export function mapPriority1ShipmentStatus(
  currentStatus:
    | "pending"
    | "dispatched"
    | "in_transit"
    | "out_for_delivery"
    | "delivered"
    | "exception"
    | "cancelled",
  p1Shipment: P1ShipmentStatus,
): ShipmentStatusUpdate {
  let mappedStatus = currentStatus;
  const p1Status = p1Shipment.status?.toLowerCase() || "";

  if (p1Status.includes("deliver") || p1Status === "completed") {
    mappedStatus = "delivered";
  } else if (p1Status.includes("out for delivery")) {
    mappedStatus = "out_for_delivery";
  } else if (
    p1Status.includes("transit") ||
    p1Status.includes("en-route") ||
    p1Status.includes("picked up")
  ) {
    mappedStatus = "in_transit";
  } else if (p1Status.includes("exception") || p1Status.includes("error")) {
    mappedStatus = "exception";
  }

  return {
    mappedStatus,
    trackingEvents: mapTrackingStatusesToEvents(p1Shipment.trackingStatuses),
    pickedUp: mappedStatus === "in_transit" && currentStatus === "dispatched",
    delivered: mappedStatus === "delivered",
  };
}
