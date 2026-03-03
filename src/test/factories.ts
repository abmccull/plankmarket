/**
 * Test data factories for PlankMarket domain objects.
 * Each factory returns a complete valid object with sensible defaults.
 * Spread `overrides` last for easy customization.
 */

import { randomUUID } from "crypto";

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------
export function createMockUser(overrides: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    email: "testuser@example.com",
    name: "Test User",
    role: "buyer" as const,
    businessName: "Test Co",
    verified: true,
    phone: null,
    avatarUrl: null,
    createdAt: new Date("2025-01-01"),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------
export function createMockListing(overrides: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    sellerId: randomUUID(),
    title: "Premium Red Oak Hardwood Flooring",
    description: "High quality overstock flooring",
    materialType: "hardwood" as const,
    species: "Red Oak",
    finish: "matte" as const,
    grade: "select" as const,
    color: "Natural",
    colorFamily: "Brown",
    thickness: 0.75,
    width: 3.25,
    length: 48,
    wearLayer: null,
    brand: "TestBrand",
    modelNumber: "TB-100",
    sqFtPerBox: 20,
    boxesPerPallet: 30,
    totalSqFt: 5000,
    totalPallets: 8,
    moq: 1,
    moqUnit: "pallets" as const,
    palletWeight: 1500,
    palletLength: 48,
    palletWidth: 40,
    palletHeight: 48,
    nmfcCode: null,
    freightClass: null,
    locationCity: "Portland",
    locationState: "OR",
    locationZip: "97201",
    askPricePerSqFt: 2.5,
    buyNowPrice: 12500,
    allowOffers: true,
    floorPrice: null,
    condition: "new_overstock" as const,
    reasonCode: null,
    certifications: [],
    status: "active" as const,
    viewsCount: 42,
    watchlistCount: 5,
    createdAt: new Date("2025-01-15"),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Order
// ---------------------------------------------------------------------------
export function createMockOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    orderNumber: "PM-ABC12345",
    buyerId: randomUUID(),
    sellerId: randomUUID(),
    listingId: randomUUID(),
    quantitySqFt: 2000,
    subtotal: 5000,
    shippingPrice: 350,
    buyerFee: 160.5,
    sellerFee: 100,
    sellerStripeFee: 145.3,
    totalStripeFee: 150.47,
    platformStripeFee: 5.17,
    totalCharge: 5510.5,
    sellerPayout: 4754.7,
    status: "pending" as const,
    paymentStatus: "succeeded" as const,
    escrowStatus: "held" as const,
    shippingName: "John Doe",
    shippingAddress: "123 Main St",
    shippingCity: "Portland",
    shippingState: "OR",
    shippingZip: "97201",
    shippingPhone: null,
    trackingNumber: null,
    carrier: null,
    notes: null,
    confirmedAt: null,
    shippedAt: null,
    deliveredAt: null,
    cancelledAt: null,
    createdAt: new Date("2025-02-01"),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Offer
// ---------------------------------------------------------------------------
export function createMockOffer(overrides: Record<string, unknown> = {}) {
  const buyerId = randomUUID();
  return {
    id: randomUUID(),
    listingId: randomUUID(),
    buyerId,
    sellerId: randomUUID(),
    offerPricePerSqFt: 2.0,
    counterPricePerSqFt: null,
    quantitySqFt: 2000,
    totalPrice: 4000,
    status: "pending" as const,
    message: null,
    lastActorId: buyerId,
    currentRound: 1,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    orderId: null,
    createdAt: new Date("2025-02-01"),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Shipping Address
// ---------------------------------------------------------------------------
export function createMockShippingAddress(
  overrides: Record<string, unknown> = {},
) {
  return {
    id: randomUUID(),
    userId: randomUUID(),
    label: "Warehouse",
    name: "John Doe",
    address: "123 Main Street",
    city: "Portland",
    state: "OR",
    zip: "97201",
    phone: null,
    isDefault: true,
    createdAt: new Date("2025-01-01"),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Buyer Preferences
// ---------------------------------------------------------------------------
export function createMockPreferences(overrides: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    userId: randomUUID(),
    preferredZip: "97201",
    preferredRadiusMiles: 500,
    preferredMaterialTypes: ["hardwood", "engineered"],
    preferredSpecies: ["Red Oak", "White Oak"],
    preferredUseCase: "residential" as const,
    minLotSizeSqFt: 500,
    maxLotSizeSqFt: 50000,
    priceMinPerSqFt: 0.5,
    priceMaxPerSqFt: 5.0,
    preferredShippingMode: "both" as const,
    urgency: "flexible" as const,
    ...overrides,
  };
}
