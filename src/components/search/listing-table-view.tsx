"use client";

import Link from "next/link";
import { withPurchaseIntent, type PurchaseIntent } from "@/lib/marketplace/purchase-intent";
import { ListingImage as Image } from "@/components/listings/listing-image";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatSqFt } from "@/lib/utils";
import { Package } from "lucide-react";
import {
  ListingEvidence,
  type FreightEstimateStatus,
} from "@/components/listings/listing-evidence";
import type { ListingFreshnessStatus } from "@/lib/listing-freshness";
import { getDirectPurchaseUnitPrice } from "@/lib/listing-pricing";
import { getPurchaseQuantityPreview, type PublicPurchaseTerms } from "@/lib/marketplace/purchase-quantity-preview";
import { PurchaseQuantityPreview } from "@/components/listings/purchase-quantity-preview";
import { SellerPaymentSetup, type SellerPaymentSetupStatus } from "@/components/listings/seller-payment-setup";

const materialLabels: Record<string, string> = {
  hardwood: "Hardwood",
  engineered: "Engineered",
  laminate: "Laminate",
  vinyl_lvp: "Vinyl/LVP",
  bamboo: "Bamboo",
  tile: "Tile",
  other: "Other",
};

const conditionLabels: Record<string, string> = {
  new_overstock: "New Overstock",
  discontinued: "Discontinued",
  slight_damage: "Slight Damage",
  returns: "Returns",
  seconds: "Seconds",
  remnants: "Remnants",
  closeout: "Closeout",
  other: "Other",
};

interface ListingItem {
  id: string;
  slug?: string | null;
  title: string;
  materialType: string;
  condition: string;
  totalSqFt: number;
  askPricePerSqFt: number;
  buyNowPrice?: number | null;
  moq?: number | null;
  moqUnit?: "pallets" | "sqft" | null;
  purchaseTerms?: PublicPurchaseTerms;
  locationCity: string | null;
  locationState: string | null;
  freightEstimateStatus?: FreightEstimateStatus;
  freshnessStatus?: ListingFreshnessStatus;
  lastConfirmedAt?: Date | string | null;
  media?: { url: string }[];
  seller?: { verified: boolean; paymentSetupStatus?: SellerPaymentSetupStatus } | null;
}

interface ListingTableViewProps {
  items: ListingItem[];
  purchaseIntent?: PurchaseIntent;
}

export function ListingTableView({ items, purchaseIntent }: ListingTableViewProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[60px]">Image</TableHead>
          <TableHead>Title</TableHead>
          <TableHead className="hidden lg:table-cell w-[100px]">
            Material
          </TableHead>
          <TableHead className="hidden lg:table-cell w-[120px]">
            Condition
          </TableHead>
          <TableHead className="hidden sm:table-cell w-[90px] text-right">Sq Ft</TableHead>
          <TableHead className="hidden sm:table-cell w-[90px] text-right">Listed $/sq ft</TableHead>
          {!purchaseIntent?.quantitySqFt && <TableHead className="hidden lg:table-cell w-[100px] text-right">
            Lot Value
          </TableHead>}
          <TableHead className="hidden xl:table-cell min-w-[260px]">
            Evidence
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((listing) => {
          const directPurchaseUnitPrice = getDirectPurchaseUnitPrice(listing);
          const lotValue = directPurchaseUnitPrice * listing.totalSqFt;
          const quantityPreview = getPurchaseQuantityPreview(listing, purchaseIntent?.quantitySqFt);
          const href = withPurchaseIntent(`/listings/${listing.slug || listing.id}`, purchaseIntent);

          return (
            <TableRow key={listing.id} className="cursor-pointer">
              <TableCell className="p-1.5">
                <Link
                  href={href}
                  className="block"
                  aria-label={`View ${listing.title}`}
                >
                  {listing.media?.[0] ? (
                    <Image
                      src={listing.media[0].url}
                      alt={listing.title}
                      width={48}
                      height={48}
                      className="rounded object-cover w-12 h-12"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded bg-muted flex items-center justify-center">
                      <Package className="h-5 w-5 text-muted-foreground/30" />
                    </div>
                  )}
                </Link>
              </TableCell>
              <TableCell className="min-w-[220px] max-w-md whitespace-normal">
                <Link
                  href={href}
                  className="hover:text-primary transition-colors font-medium text-sm line-clamp-2"
                >
                  {listing.title}
                </Link>
                <p className="mt-1 text-xs text-muted-foreground sm:hidden">{formatSqFt(listing.totalSqFt)} available · {formatCurrency(directPurchaseUnitPrice)}/sq ft listed</p>
                {quantityPreview && <div className="mt-2"><PurchaseQuantityPreview preview={quantityPreview} /></div>}
                <SellerPaymentSetup status={listing.seller?.paymentSetupStatus} className="mt-2" />
              </TableCell>
              <TableCell className="hidden lg:table-cell py-3">
                {materialLabels[listing.materialType] || listing.materialType}
              </TableCell>
              <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                {conditionLabels[listing.condition] || listing.condition}
              </TableCell>
              <TableCell className="hidden sm:table-cell text-right text-sm tabular-nums">
                {formatSqFt(listing.totalSqFt)}
              </TableCell>
              <TableCell className="hidden sm:table-cell text-right text-sm font-bold text-primary tabular-nums">
                {formatCurrency(directPurchaseUnitPrice)}
              </TableCell>
              {!purchaseIntent?.quantitySqFt && <TableCell className="hidden lg:table-cell text-right text-sm text-muted-foreground tabular-nums">
                {formatCurrency(lotValue)}
              </TableCell>}
              <TableCell className="hidden xl:table-cell text-sm text-muted-foreground">
                <ListingEvidence
                  variant="compact"
                  listing={{
                    totalSqFt: listing.totalSqFt,
                    moq: listing.moq ?? null,
                    moqUnit: listing.moqUnit ?? null,
                    condition: listing.condition,
                    locationCity: listing.locationCity,
                    locationState: listing.locationState,
                    freightEstimateStatus:
                      listing.freightEstimateStatus ?? "seller_setup_required",
                    freshnessStatus: listing.freshnessStatus,
                    lastConfirmedAt: listing.lastConfirmedAt,
                    media: listing.media,
                    seller: listing.seller,
                  }}
                />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
