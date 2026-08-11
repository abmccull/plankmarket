import type { Listing, Media, Review, User } from "@/server/db/schema";
import { getRoleLabel } from "@/lib/identity/display-name";
import { getListingFreshnessStatus } from "@/lib/listing-freshness";

/**
 * Public listing data is intentionally allowlisted. Keep private negotiation,
 * seller-location, and inventory-history fields out of every public response.
 */
export const publicListingColumns = {
  id: true,
  sellerId: true,
  title: true,
  slug: true,
  description: true,
  status: true,
  materialType: true,
  species: true,
  finish: true,
  grade: true,
  color: true,
  colorFamily: true,
  thickness: true,
  width: true,
  length: true,
  wearLayer: true,
  brand: true,
  modelNumber: true,
  sqFtPerBox: true,
  boxesPerPallet: true,
  totalSqFt: true,
  totalPallets: true,
  moq: true,
  moqUnit: true,
  palletWeight: true,
  palletLength: true,
  palletWidth: true,
  palletHeight: true,
  nmfcCode: true,
  freightClass: true,
  locationCity: true,
  locationState: true,
  // Selected only to derive freight-quote readiness. The exact ZIP is never
  // included in the public DTO returned below.
  locationZip: true,
  askPricePerSqFt: true,
  buyNowPrice: true,
  allowOffers: true,
  // Selected only for the server-side territory visibility decision. These
  // fields are deliberately omitted by toPublicListing().
  territoryMode: true,
  allowedDestinationStates: true,
  condition: true,
  reasonCode: true,
  certifications: true,
  viewsCount: true,
  watchlistCount: true,
  offerCount: true,
  promotionTier: true,
  promotionExpiresAt: true,
  qualityScore: true,
  shipReady: true,
  lastConfirmedAt: true,
  confirmationDueAt: true,
  createdAt: true,
  updatedAt: true,
  expiresAt: true,
} as const;

// Browse cards deliberately avoid description, specification, certification,
// and document-sized fields. Keep this projection aligned with ListingCard.
export const publicListingCardColumns = {
  id: true,
  sellerId: true,
  title: true,
  slug: true,
  status: true,
  materialType: true,
  species: true,
  sqFtPerBox: true,
  boxesPerPallet: true,
  totalSqFt: true,
  totalPallets: true,
  moq: true,
  moqUnit: true,
  palletWeight: true,
  palletLength: true,
  palletWidth: true,
  palletHeight: true,
  freightClass: true,
  locationCity: true,
  locationState: true,
  locationZip: true,
  askPricePerSqFt: true,
  buyNowPrice: true,
  condition: true,
  viewsCount: true,
  watchlistCount: true,
  promotionTier: true,
  promotionExpiresAt: true,
  lastConfirmedAt: true,
  confirmationDueAt: true,
  createdAt: true,
} as const;

export const publicMediaColumns = {
  id: true,
  url: true,
  altText: true,
  sortOrder: true,
} as const;

export const publicSellerColumns = {
  id: true,
  role: true,
  verificationStatus: true,
  createdAt: true,
  stripeOnboardingComplete: true,
  // Selected only to derive freight-quote readiness. These private contact
  // fields are deliberately omitted by toPublicSeller().
  businessAddress: true,
  phone: true,
} as const;

export const publicReviewColumns = {
  id: true,
  direction: true,
  rating: true,
  title: true,
  comment: true,
  communicationRating: true,
  accuracyRating: true,
  shippingRating: true,
  sellerResponse: true,
  sellerRespondedAt: true,
  createdAt: true,
} as const;

type PublicListingKey = keyof typeof publicListingColumns;
type PublicListingCardKey = keyof typeof publicListingCardColumns;
type PublicMediaKey = keyof typeof publicMediaColumns;
type PublicSellerKey = keyof typeof publicSellerColumns;
type PublicReviewKey = keyof typeof publicReviewColumns;

export type PublicSellerSource = Pick<User, PublicSellerKey>;
export type PublicReviewSource = Pick<Review, PublicReviewKey>;

export type PublicListingSource = Pick<Listing, PublicListingKey> & {
  media?: Array<Pick<Media, PublicMediaKey>>;
  seller?: PublicSellerSource | null;
};

export type PublicListingCardSource = Pick<Listing, PublicListingCardKey> & {
  media?: Array<Pick<Media, PublicMediaKey>>;
  seller?: PublicSellerSource | null;
};

export function getMaskedDisplayName(user: {
  id: string;
  role: User["role"];
  verificationStatus?: string;
}): string {
  if (user.role === "admin") return "PlankMarket Support";

  const roleLabel = getRoleLabel(user.role, user.id);
  const verificationPrefix =
    user.verificationStatus === "verified" ? "Verified " : "";
  return `${verificationPrefix}${roleLabel}`;
}

export function toPublicSeller(user: PublicSellerSource) {
  return {
    id: user.id,
    role: user.role,
    verified: user.verificationStatus === "verified",
    createdAt: user.createdAt,
    stripeOnboardingComplete: user.stripeOnboardingComplete,
    displayName: getMaskedDisplayName(user),
  };
}

/**
 * A second explicit projection protects the API even if a future query is
 * accidentally widened. Do not replace this with a row spread.
 */
export function toPublicListing(listing: PublicListingSource) {
  const freightEstimateStatus =
    listing.palletWeight &&
    listing.palletLength &&
    listing.palletWidth &&
    listing.palletHeight &&
    listing.locationZip &&
    listing.locationCity &&
    listing.locationState &&
    listing.freightClass &&
    listing.totalPallets &&
    listing.sqFtPerBox &&
    listing.boxesPerPallet &&
    listing.seller?.businessAddress &&
    listing.seller.phone
      ? ("quote_request_ready" as const)
      : ("seller_setup_required" as const);
  const freshnessStatus = getListingFreshnessStatus({
    lastConfirmedAt: listing.lastConfirmedAt,
    confirmationDueAt: listing.confirmationDueAt,
  });

  return {
    id: listing.id,
    sellerId: listing.sellerId,
    title: listing.title,
    slug: listing.slug,
    description: listing.description,
    status: listing.status,
    materialType: listing.materialType,
    species: listing.species,
    finish: listing.finish,
    grade: listing.grade,
    color: listing.color,
    colorFamily: listing.colorFamily,
    thickness: listing.thickness,
    width: listing.width,
    length: listing.length,
    wearLayer: listing.wearLayer,
    brand: listing.brand,
    modelNumber: listing.modelNumber,
    sqFtPerBox: listing.sqFtPerBox,
    boxesPerPallet: listing.boxesPerPallet,
    totalSqFt: listing.totalSqFt,
    totalPallets: listing.totalPallets,
    moq: listing.moq,
    moqUnit: listing.moqUnit,
    palletWeight: listing.palletWeight,
    palletLength: listing.palletLength,
    palletWidth: listing.palletWidth,
    palletHeight: listing.palletHeight,
    nmfcCode: listing.nmfcCode,
    freightClass: listing.freightClass,
    // Public inventory is state-level only. The real origin city remains
    // server-side for carrier quotes and order operations.
    locationCity: null,
    locationState: listing.locationState,
    freightEstimateStatus,
    askPricePerSqFt: listing.askPricePerSqFt,
    buyNowPrice: listing.buyNowPrice,
    allowOffers: listing.allowOffers,
    condition: listing.condition,
    reasonCode: listing.reasonCode,
    certifications: listing.certifications,
    viewsCount: listing.viewsCount,
    watchlistCount: listing.watchlistCount,
    offerCount: listing.offerCount,
    promotionTier: listing.promotionTier,
    promotionExpiresAt: listing.promotionExpiresAt,
    qualityScore: listing.qualityScore,
    shipReady: listing.shipReady,
    lastConfirmedAt: listing.lastConfirmedAt,
    confirmationDueAt: listing.confirmationDueAt,
    freshnessStatus,
    createdAt: listing.createdAt,
    updatedAt: listing.updatedAt,
    expiresAt: listing.expiresAt,
    media: listing.media?.map((item) => ({
      id: item.id,
      url: item.url,
      altText: item.altText,
      sortOrder: item.sortOrder,
    })) ?? [],
    seller: listing.seller ? toPublicSeller(listing.seller) : null,
  };
}

export type ConversationPartySource = Pick<
  User,
  | "id"
  | "name"
  | "role"
  | "businessCity"
  | "businessState"
  | "verificationStatus"
>;

export function toConversationParty(
  user: ConversationPartySource,
  revealIdentity: boolean,
) {
  const maskedDisplayName = getMaskedDisplayName(user);
  const revealedName = revealIdentity ? user.name : null;

  return {
    id: user.id,
    role: user.role,
    verified: user.verificationStatus === "verified",
    identityRevealed: revealIdentity,
    name: revealedName,
    displayName: revealedName || maskedDisplayName,
    ...(revealIdentity
      ? {
          businessCity: user.businessCity,
          businessState: user.businessState,
        }
      : {}),
  };
}

export function toPublicListingCard(listing: PublicListingCardSource) {
  const freightEstimateStatus =
    listing.palletWeight &&
    listing.palletLength &&
    listing.palletWidth &&
    listing.palletHeight &&
    listing.locationZip &&
    listing.locationCity &&
    listing.locationState &&
    listing.freightClass &&
    listing.totalPallets &&
    listing.sqFtPerBox &&
    listing.boxesPerPallet &&
    listing.seller?.businessAddress &&
    listing.seller.phone
      ? ("quote_request_ready" as const)
      : ("seller_setup_required" as const);

  return {
    id: listing.id,
    sellerId: listing.sellerId,
    title: listing.title,
    slug: listing.slug,
    status: listing.status,
    materialType: listing.materialType,
    species: listing.species,
    totalSqFt: listing.totalSqFt,
    moq: listing.moq,
    moqUnit: listing.moqUnit,
    locationCity: null,
    locationState: listing.locationState,
    freightEstimateStatus,
    askPricePerSqFt: listing.askPricePerSqFt,
    buyNowPrice: listing.buyNowPrice,
    condition: listing.condition,
    viewsCount: listing.viewsCount,
    watchlistCount: listing.watchlistCount,
    promotionTier: listing.promotionTier,
    promotionExpiresAt: listing.promotionExpiresAt,
    lastConfirmedAt: listing.lastConfirmedAt,
    confirmationDueAt: listing.confirmationDueAt,
    freshnessStatus: getListingFreshnessStatus({
      lastConfirmedAt: listing.lastConfirmedAt,
      confirmationDueAt: listing.confirmationDueAt,
    }),
    createdAt: listing.createdAt,
    media:
      listing.media?.map((item) => ({
        id: item.id,
        url: item.url,
        altText: item.altText,
        sortOrder: item.sortOrder,
      })) ?? [],
    seller: listing.seller ? toPublicSeller(listing.seller) : null,
  };
}

/**
 * Public reputation data never exposes the order or relationship UUIDs behind
 * a review. Those identifiers remain available through the protected
 * order-scoped review endpoint.
 */
export function toPublicReview(review: PublicReviewSource) {
  return {
    id: review.id,
    direction: review.direction,
    rating: review.rating,
    title: review.title,
    comment: review.comment,
    communicationRating: review.communicationRating,
    accuracyRating: review.accuracyRating,
    shippingRating: review.shippingRating,
    sellerResponse: review.sellerResponse,
    sellerRespondedAt: review.sellerRespondedAt,
    createdAt: review.createdAt,
  };
}
