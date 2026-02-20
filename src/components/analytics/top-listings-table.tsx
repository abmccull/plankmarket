"use client";

import Link from "next/link";
import { Eye, Heart } from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/utils";

interface ListingRow {
  id: string;
  title: string;
  slug: string | null;
  viewsCount: number;
  watchlistCount: number;
  status: string;
  materialType: string;
  askPricePerSqFt: number;
  totalSqFt: number;
  createdAt: Date;
}

interface TopListingsTableProps {
  listings: ListingRow[];
}

export function TopListingsTable({ listings }: TopListingsTableProps) {
  if (!listings.length) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
        No listings yet
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="pb-2 font-medium text-muted-foreground">Listing</th>
            <th className="pb-2 font-medium text-muted-foreground text-right">Price/sqft</th>
            <th className="pb-2 font-medium text-muted-foreground text-right">Sqft</th>
            <th className="pb-2 font-medium text-muted-foreground text-right">Views</th>
            <th className="pb-2 font-medium text-muted-foreground text-right">Saves</th>
          </tr>
        </thead>
        <tbody>
          {listings.map((listing) => (
            <tr key={listing.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
              <td className="py-2.5 pr-4">
                <Link
                  href={`/listings/${listing.slug ?? listing.id}`}
                  className="font-medium text-foreground hover:text-primary transition-colors truncate block max-w-[200px]"
                >
                  {listing.title}
                </Link>
                <span className="text-xs text-muted-foreground capitalize">
                  {listing.materialType.replace("_", " ")} &middot; {listing.status}
                </span>
              </td>
              <td className="py-2.5 text-right">
                {formatCurrency(listing.askPricePerSqFt)}
              </td>
              <td className="py-2.5 text-right">
                {formatNumber(listing.totalSqFt)}
              </td>
              <td className="py-2.5 text-right">
                <span className="inline-flex items-center gap-1">
                  <Eye className="h-3 w-3 text-muted-foreground" />
                  {formatNumber(listing.viewsCount)}
                </span>
              </td>
              <td className="py-2.5 text-right">
                <span className="inline-flex items-center gap-1">
                  <Heart className="h-3 w-3 text-muted-foreground" />
                  {formatNumber(listing.watchlistCount)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
