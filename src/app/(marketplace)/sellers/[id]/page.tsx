"use client";

import { use, useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  QueryErrorState,
  StatePanelLoading,
} from "@/components/ui/state-panel";
import { StarRating } from "@/components/shared/star-rating";
import { ReviewCard } from "@/components/shared/review-card";
import { CheckCircle2, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ProBadge } from "@/components/pro-badge";
import { formatDate } from "@/lib/utils";

interface SellerProfilePageProps {
  params: Promise<{ id: string }>;
}

function SellerProfileContent({ sellerId }: { sellerId: string }) {
  const [page, setPage] = useState(1);
  const profileQuery = trpc.auth.getPublicProfile.useQuery({
    userId: sellerId,
  });
  const reputationQuery = trpc.review.getUserReputation.useQuery({
    userId: sellerId,
  });
  const reviewsQuery = trpc.review.getByReviewee.useQuery({
    userId: sellerId,
    page,
    limit: 20,
  });
  const profile = profileQuery.data;
  const reputation = reputationQuery.data;
  const reviewsData = reviewsQuery.data;
  const pages = Math.max(1, reviewsData?.totalPages ?? 1);
  const recoveringPage =
    Boolean(reviewsData) && !reviewsQuery.isError && page > pages;

  // Adjust only this page's state when a successful read proves it no longer exists.
  // React retries this render immediately, before an out-of-range pager is committed.
  if (
    reviewsData &&
    !reviewsQuery.isError &&
    !reviewsQuery.isFetching &&
    page > pages
  ) {
    setPage(pages);
  }

  const reviewPager = (label: string) =>
    reviewsData && reviewsData.total > 0 ? (
      <nav
        aria-label={label}
        className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"
      >
        <p
          role="status"
          aria-live={label === "Review pages" ? "polite" : "off"}
          className="text-sm text-muted-foreground"
        >
          {reviewsData.reviews.length ? (page - 1) * 20 + 1 : 0}–
          {reviewsData.reviews.length
            ? (page - 1) * 20 + reviewsData.reviews.length
            : 0}{" "}
          of {reviewsData.total} reviews · Page {page} of {pages}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            className="h-auto min-h-11 whitespace-normal"
            variant="outline"
            disabled={page <= 1 || reviewsQuery.isFetching}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            Previous
          </Button>
          <Button
            className="h-auto min-h-11 whitespace-normal"
            variant="outline"
            disabled={page >= pages || reviewsQuery.isFetching}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </Button>
        </div>
      </nav>
    ) : null;

  return (
    <div className="min-w-0 max-w-7xl mx-auto px-[min(1rem,16px)] py-8 space-y-8 [overflow-wrap:anywhere]">
      <Link
        href="/listings"
        className="inline-flex min-h-11 items-center text-sm underline"
      >
        Browse flooring lots
      </Link>

      {profileQuery.isLoading ? (
        <StatePanelLoading label="Loading seller profile" rows={3} />
      ) : profileQuery.isError &&
        profileQuery.error.data?.code === "NOT_FOUND" ? (
        <section
          aria-labelledby="seller-not-found"
          className="space-y-2 rounded-xl border p-6"
        >
          <h1 id="seller-not-found" className="text-2xl font-bold">
            Seller profile not found
          </h1>
          <p className="text-muted-foreground">
            This profile is unavailable. Browse flooring lots to continue.
          </p>
        </section>
      ) : profileQuery.isError || !profile ? (
        <QueryErrorState
          title="Seller profile unavailable"
          description="We could not load this seller's profile. Try again to see their current details."
          onRetry={() => {
            void profileQuery.refetch();
          }}
          isRetrying={profileQuery.isFetching}
        />
      ) : (
        <>
          <Card>
            <CardHeader className="p-[min(1.5rem,24px)]">
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                <h1 className="min-w-0 text-3xl font-bold">
                  {profile.displayName}
                </h1>
                {(profile.proStatus === "active" ||
                  profile.proStatus === "trialing" ||
                  profile.proStatus === "past_due") && <ProBadge />}
                {profile.verified && (
                  <Badge className="bg-green-50 text-green-700 border-green-200">
                    <CheckCircle2
                      className="h-3 w-3 mr-1 shrink-0"
                      aria-hidden="true"
                    />
                    Verified
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Member since {formatDate(profile.createdAt)}</span>
              </div>
            </CardHeader>
          </Card>

          <section aria-labelledby="seller-reputation" className="space-y-4">
            <div>
              <h2 id="seller-reputation" className="text-2xl font-bold">
                Reputation and activity
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Delivered orders and feedback for this account, as a buyer or
                seller.
              </p>
            </div>
            {reputationQuery.isLoading ? (
              <StatePanelLoading label="Loading seller reputation" rows={2} />
            ) : reputationQuery.isError || !reputation ? (
              <QueryErrorState
                title="Seller reputation unavailable"
                description="Ratings and delivered-order counts could not be loaded. Try this section again."
                onRetry={() => {
                  void reputationQuery.refetch();
                }}
                isRetrying={reputationQuery.isFetching}
              />
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  {reputation.averageRating !== null ? (
                    <>
                      <StarRating
                        value={reputation.averageRating}
                        readonly
                        size="md"
                      />
                      <span className="font-semibold">
                        {reputation.averageRating} out of 5
                      </span>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No ratings yet.
                    </p>
                  )}
                  {reputation.completedTransactions === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No delivered orders recorded yet.
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Card role="group" aria-label="Delivered orders">
                    <CardContent className="pt-6 text-center">
                      <p className="text-3xl font-bold text-primary">
                        {reputation.completedTransactions}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Delivered orders
                      </p>
                    </CardContent>
                  </Card>
                  <Card role="group" aria-label="Total reviews">
                    <CardContent className="pt-6 text-center">
                      <p className="text-3xl font-bold text-primary">
                        {reputation.reviewCount}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Total reviews
                      </p>
                    </CardContent>
                  </Card>
                  <Card role="group" aria-label="Average rating">
                    <CardContent className="pt-6 text-center">
                      <p className="text-3xl font-bold text-primary">
                        {reputation.averageRating ?? "Not rated"}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Average rating
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </section>

          <section aria-labelledby="seller-reviews" className="space-y-4">
            <div>
              <h2 id="seller-reviews" className="text-2xl font-bold">
                Reviews
              </h2>
              <p className="text-muted-foreground mt-1">
                Feedback received by this account as a buyer or seller.
              </p>
            </div>
            {reviewsQuery.isLoading || recoveringPage ? (
              <StatePanelLoading label="Loading seller reviews" rows={2} />
            ) : reviewsQuery.isError || !reviewsData ? (
              <QueryErrorState
                title="Seller reviews unavailable"
                description="We could not load this review page. Try again; your selected page is kept."
                onRetry={() => {
                  void reviewsQuery.refetch();
                }}
                isRetrying={reviewsQuery.isFetching}
              />
            ) : (
              <>
                {reviewPager("Review pages at top")}
                {reviewsData.reviews.length ? (
                  <div className="space-y-4">
                    {reviewsData.reviews.map((review) => (
                      <ReviewCard
                        key={review.id}
                        className="min-w-0 [&_.justify-between]:flex-wrap [&_.justify-between]:gap-3"
                        reviewerName={
                          review.direction === "buyer_to_seller"
                            ? "Buyer"
                            : "Seller"
                        }
                        date={new Date(review.createdAt)}
                        rating={review.rating}
                        title={review.title ?? undefined}
                        comment={review.comment ?? ""}
                        subRatings={
                          review.communicationRating
                            ? {
                                communication:
                                  review.communicationRating ?? undefined,
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
                        No reviews yet for this account.
                      </p>
                    </CardContent>
                  </Card>
                )}
                {reviewPager("Review pages")}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default function SellerProfilePage({ params }: SellerProfilePageProps) {
  const { id } = use(params);
  return <SellerProfileContent key={id} sellerId={id} />;
}
