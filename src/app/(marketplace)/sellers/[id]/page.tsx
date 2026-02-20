"use client";

import { use } from "react";
import { trpc } from "@/lib/trpc/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StarRating } from "@/components/shared/star-rating";
import { ReviewCard } from "@/components/shared/review-card";
import { CheckCircle2, MapPin, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getAnonymousDisplayName } from "@/lib/identity/display-name";
import { formatDate } from "@/lib/utils";

interface SellerProfilePageProps {
  params: Promise<{
    id: string;
  }>;
}

function SellerProfileSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      <Skeleton className="h-32 w-full" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function SellerProfileContent({ sellerId }: { sellerId: string }) {
  const { data: reputation, isLoading: repLoading } =
    trpc.review.getUserReputation.useQuery({ userId: sellerId });

  const { data: reviewsData, isLoading: reviewsLoading } =
    trpc.review.getByReviewee.useQuery({
      userId: sellerId,
      page: 1,
      limit: 20,
    });

  if (repLoading) {
    return <SellerProfileSkeleton />;
  }

  const displayName = getAnonymousDisplayName({
    role: "seller",
    businessState: null,
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      {/* Header Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <CardTitle className="text-3xl">{displayName}</CardTitle>
                <Badge className="bg-green-50 text-green-700 border-green-200">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Verified
                </Badge>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                <div className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  Seller
                </div>
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  Plank Market Seller
                </div>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            {reputation?.averageRating !== null && reputation?.averageRating !== undefined ? (
              <div className="flex items-center gap-2">
                <StarRating
                  value={reputation.averageRating}
                  readonly
                  size="md"
                />
                <span className="font-semibold">{reputation.averageRating}</span>
                <span className="text-sm text-muted-foreground">
                  ({reputation.reviewCount} review
                  {reputation.reviewCount !== 1 ? "s" : ""})
                </span>
                <span className="text-sm text-muted-foreground">
                  &middot; {reputation.completedTransactions} completed
                  transaction
                  {reputation.completedTransactions !== 1 ? "s" : ""}
                </span>
              </div>
            ) : reputation && reputation.completedTransactions > 0 ? (
              <span className="text-sm text-muted-foreground">
                New seller &middot; {reputation.completedTransactions} completed
                transaction
                {reputation.completedTransactions !== 1 ? "s" : ""}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">
                New to Plank Market
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-primary">
                {reputation?.completedTransactions ?? 0}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Completed Transactions
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-primary">
                {reputation?.reviewCount ?? 0}
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
                {reputation?.averageRating ?? "N/A"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Average Rating
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Reviews Section */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">Reviews</h2>
            <p className="text-muted-foreground mt-1">
              What others are saying about this seller
            </p>
          </div>
        </div>
        {reviewsLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : reviewsData && reviewsData.reviews.length > 0 ? (
          <div className="space-y-4">
            {reviewsData.reviews.map((review) => (
              <ReviewCard
                key={review.id}
                reviewerName={
                  review.direction === "buyer_to_seller" ? "Buyer" : "Seller"
                }
                date={new Date(review.createdAt)}
                rating={review.rating}
                title={review.title ?? undefined}
                comment={review.comment ?? ""}
                subRatings={
                  review.communicationRating
                    ? {
                        communication: review.communicationRating ?? undefined,
                        accuracy: review.accuracyRating ?? undefined,
                        shipping: review.shippingRating ?? undefined,
                      }
                    : undefined
                }
                sellerResponse={
                  review.sellerResponse
                    ? {
                        message: review.sellerResponse,
                        date: new Date(review.sellerRespondedAt!),
                      }
                    : undefined
                }
              />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                No reviews yet for this seller.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export default function SellerProfilePage({
  params,
}: SellerProfilePageProps) {
  const { id } = use(params);

  return <SellerProfileContent sellerId={id} />;
}
