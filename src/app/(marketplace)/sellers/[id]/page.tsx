import { Suspense } from "react";
import { notFound } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StarRating } from "@/components/shared/star-rating";
import { CheckCircle2, MapPin, Calendar, Mail } from "lucide-react";
import { ListingCard } from "@/components/search/listing-card";
import { cn } from "@/lib/utils";

interface SellerProfilePageProps {
  params: Promise<{
    id: string;
  }>;
}

// Mock data - in production, fetch from tRPC
async function getSellerData(sellerId: string) {
  // Simulate API call
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Mock seller data
  return {
    id: sellerId,
    businessName: "Premium Flooring Wholesale",
    isVerified: true,
    memberSince: new Date("2023-01-15"),
    location: "Dallas, TX",
    bio: "We are a wholesale flooring distributor specializing in high-quality hardwood, engineered, and luxury vinyl flooring. With over 20 years in the industry, we offer premium overstock and closeout inventory at competitive prices.",
    rating: {
      average: 4.8,
      count: 127,
    },
    activeListings: [
      {
        id: "1",
        title: "Premium White Oak Hardwood - 2,500 sq ft Overstock",
        materialType: "hardwood" as const,
        species: "White Oak",
        askPricePerSqFt: 2.5,
        totalSqFt: 2500,
        buyNowPrice: null,
        condition: "new_overstock" as const,
        coverImageUrl: null,
        locationCity: "Dallas",
        locationState: "TX",
        viewsCount: 0,
        watchlistCount: 0,
        createdAt: new Date(),
      },
      {
        id: "2",
        title: "Luxury Vinyl Plank - Natural Oak - 5,000 sq ft",
        materialType: "vinyl_lvp" as const,
        species: null,
        askPricePerSqFt: 1.75,
        totalSqFt: 5000,
        buyNowPrice: null,
        condition: "discontinued" as const,
        coverImageUrl: null,
        locationCity: "Dallas",
        locationState: "TX",
        viewsCount: 0,
        watchlistCount: 0,
        createdAt: new Date(),
      },
    ],
  };
}

function SellerProfileSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-32 w-full" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}

async function SellerProfileContent({ sellerId }: { sellerId: string }) {
  const seller = await getSellerData(sellerId);

  if (!seller) {
    notFound();
  }

  const memberSinceFormatted = seller.memberSince.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      {/* Header Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <CardTitle className="text-3xl">
                  {seller.businessName}
                </CardTitle>
                {seller.isVerified && (
                  <Badge className="bg-green-50 text-green-700 border-green-200">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Verified
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                <div className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  {seller.location}
                </div>
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  Member since {memberSinceFormatted}
                </div>
              </div>
              {seller.bio && (
                <CardDescription className="text-base leading-relaxed max-w-3xl">
                  {seller.bio}
                </CardDescription>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <StarRating value={seller.rating.average} readonly size="md" />
                <span className="font-semibold">{seller.rating.average}</span>
                <span className="text-sm text-muted-foreground">
                  ({seller.rating.count} reviews)
                </span>
              </div>
            </div>
            <Button>
              <Mail className="h-4 w-4 mr-2" />
              Contact Seller
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-primary">
                {seller.activeListings.length}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Active Listings
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-primary">
                {seller.rating.count}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Total Reviews
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-primary">
                {seller.rating.average}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Average Rating
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Listings Section */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">Active Listings</h2>
            <p className="text-muted-foreground mt-1">
              Browse available inventory from this seller
            </p>
          </div>
        </div>

        {seller.activeListings.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                This seller currently has no active listings.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {seller.activeListings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}
      </div>

      {/* Reviews Section */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">Reviews</h2>
            <p className="text-muted-foreground mt-1">
              What buyers are saying about this seller
            </p>
          </div>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              Reviews component will be displayed here.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default async function SellerProfilePage({
  params,
}: SellerProfilePageProps) {
  const { id } = await params;

  return (
    <Suspense fallback={<SellerProfileSkeleton />}>
      <SellerProfileContent sellerId={id} />
    </Suspense>
  );
}
