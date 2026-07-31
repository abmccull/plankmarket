import type { Listing } from "@/server/db/schema/listings";
import { computeListingQuality } from "@/lib/listing-quality";
import { getNextListingConfirmationDueAt } from "@/lib/listing-freshness";

type ListingTrustInput = Partial<Listing> & {
  photoCount?: number;
};

export function deriveListingTrustFields(
  listing: ListingTrustInput,
  confirmedAt = new Date(),
) {
  const quality = computeListingQuality(listing);

  return {
    qualityScore: quality.score,
    shipReady: quality.shipReady,
    lastConfirmedAt: confirmedAt,
    confirmationDueAt: getNextListingConfirmationDueAt(confirmedAt),
  };
}
