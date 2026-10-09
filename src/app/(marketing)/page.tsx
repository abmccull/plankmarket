import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, Search, ShieldCheck, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  HomeInventory,
  HomeInventorySkeleton,
} from "@/components/marketing/home-inventory";
import { PUBLIC_COMMERCIAL_COPY } from "@/lib/public-commercial-copy";
import { FREE_LIMITS } from "@/lib/pro";

export const metadata: Metadata = {
  title: "PlankMarket — B2B Closeout Flooring Marketplace",
  description:
    "Buy and sell surplus, overstock and closeout flooring. Compare available lots, review seller verification, and see order fees and freight before payment.",
};

// Inventory uses the current viewer's existing public eligibility rules.
export const dynamic = "force-dynamic";

const materialOptions = [
  ["engineered", "Engineered hardwood"],
  ["hardwood", "Hardwood"],
  ["vinyl_lvp", "Vinyl / LVP"],
  ["laminate", "Laminate"],
  ["tile", "Tile"],
  ["bamboo", "Bamboo"],
  ["other", "Other flooring"],
] as const;

const buyerSteps = [
  [
    "Find a lot that fits",
    "Compare material, condition, available quantity and minimum order before you make a decision.",
  ],
  [
    "Review the delivered cost",
    "Buy at the listed price or make an offer. Review fees, freight and applicable tax before payment.",
  ],
  [
    "Keep the order together",
    "Track the order and freight, inspect the delivery, and report any issue from the order record.",
  ],
] as const;

const sellerSteps = [
  [
    "Show buyers what you have",
    "Add the lot's specifications, condition, quantity and clear photos. Your draft is saved to your account so you can continue on another device.",
  ],
  [
    "Agree on the sale",
    "Review offers and your expected proceeds. Keep buyer questions and order details in one place.",
  ],
  [
    "Ship and track your payment",
    "Prepare the freight for pickup. Follow the seller transfer status and any required action in your order.",
  ],
] as const;

export default function HomePage() {
  return (
    <div id="marketplace-home">
      <section
        className="border-b bg-muted/25 py-5 sm:py-12 lg:py-14"
        aria-labelledby="home-title"
      >
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-4xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">
              B2B flooring marketplace
            </p>
            <h1
              id="home-title"
              className="mt-2 font-display text-4xl tracking-tight sm:mt-3 sm:text-5xl lg:text-6xl"
            >
              Buy closeout flooring.
              <br className="hidden sm:block" />{" "}
              <span className="text-secondary">Sell your surplus.</span>
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground sm:mt-4 sm:text-lg">
              Source flooring for your next job. Sell surplus stock. Keep offers,
              orders and freight in one place.
            </p>
          </div>

          <form
            id="home-search"
            action="/listings"
            method="get"
            role="search"
            aria-label="Search available flooring"
            className="mx-auto mt-5 grid max-w-5xl grid-cols-2 items-end gap-3 text-left sm:mt-6 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(7rem,0.55fr)_auto]"
          >
            <div className="col-span-2 min-w-0 md:col-span-1">
              <label
                htmlFor="home-query"
                className="mb-1.5 block text-sm font-medium"
              >
                What flooring do you need?
              </label>
              <Input
                id="home-query"
                name="query"
                type="search"
                maxLength={200}
                placeholder="Material, brand or style"
                className="h-12 bg-background text-base"
              />
            </div>
            <div className="min-w-0">
              <label
                htmlFor="home-material"
                className="mb-1.5 block text-sm font-medium"
              >
                Material
              </label>
              <select
                id="home-material"
                name="materialType"
                defaultValue=""
                className="h-12 w-full rounded-md border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">All flooring</option>
                {materialOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-0">
              <label
                htmlFor="home-zip"
                className="mb-1.5 block text-sm font-medium"
              >
                ZIP{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </label>
              <Input
                id="home-zip"
                name="buyerZip"
                inputMode="numeric"
                autoComplete="postal-code"
                pattern="[0-9]{5}"
                maxLength={5}
                title="Enter a five-digit US ZIP code"
                placeholder="Delivery ZIP"
                className="h-12 bg-background text-base"
              />
            </div>
            <Button
              type="submit"
              size="xl"
              className="col-span-2 w-full px-6 md:col-span-1"
            >
              <Search aria-hidden="true" /> Find flooring
            </Button>
          </form>
          <div className="mx-auto mt-2 flex max-w-5xl flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm sm:mt-4">
            <Link
              href="/listings"
              className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4"
            >
              Browse all flooring
            </Link>
            <Link
              href="/register?role=seller"
              className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4"
            >
              Sell surplus flooring
            </Link>
          </div>
        </div>
      </section>

      <section
        id="available-flooring"
        aria-labelledby="available-flooring-title"
        className="scroll-mt-24 py-8 sm:py-12"
      >
        <div className="container mx-auto px-4">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2
                id="available-flooring-title"
                className="font-display text-2xl sm:text-3xl"
              >
                Available flooring lots
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Review each lot&apos;s quantity, condition and freight
                readiness.
              </p>
            </div>
            <Link
              href="/listings"
              className="inline-flex min-h-11 items-center gap-2 font-semibold text-primary underline underline-offset-4"
            >
              View all flooring{" "}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <Suspense fallback={<HomeInventorySkeleton />}>
            <HomeInventory />
          </Suspense>
          <p className="mt-4 text-sm text-muted-foreground">
            {PUBLIC_COMMERCIAL_COPY.supportedMarketAvailability}
          </p>
          <nav
            aria-label="Browse flooring by material"
            className="mt-5 flex flex-wrap gap-2"
          >
            {materialOptions.slice(0, 6).map(([value, label]) => (
              <Link
                key={value}
                href={`/listings?materialType=${value}`}
                className="inline-flex min-h-11 items-center rounded-md border px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </section>

      <section
        aria-labelledby="trade-confidence-title"
        className="border-y bg-muted/25 py-8 sm:py-10"
      >
        <div className="container mx-auto px-4">
          <h2
            id="trade-confidence-title"
            className="mb-6 font-display text-2xl sm:text-3xl"
          >
            Know the lot. Know the next step.
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            <div>
              <ShieldCheck
                className="mb-3 h-6 w-6 text-secondary"
                aria-hidden="true"
              />
              <h3 className="font-semibold">Visible seller verification</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Review seller verification and the lot&apos;s evidence before
                you decide. Business verification is required before buying or
                publishing.
              </p>
            </div>
            <div>
              <Search
                className="mb-3 h-6 w-6 text-secondary"
                aria-hidden="true"
              />
              <h3 className="font-semibold">Fees you can review</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {PUBLIC_COMMERCIAL_COPY.buyerMarketplaceFeeLabel} and{" "}
                {PUBLIC_COMMERCIAL_COPY.sellerMarketplaceFeeLabel} on inventory.
                Sellers also pay {PUBLIC_COMMERCIAL_COPY.sellerProcessingLabel}{" "}
                in payment processing.
              </p>
              <Link
                href="/pricing"
                className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-4"
              >
                See fees and an order example
              </Link>
            </div>
            <div>
              <Truck
                className="mb-3 h-6 w-6 text-secondary"
                aria-hidden="true"
              />
              <h3 className="font-semibold">Freight with the order</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Review freight options for your delivery address before payment.
                Keep pickup, tracking and delivery information with the order.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section
        aria-label="Buyer and seller journeys"
        className="py-10 sm:py-14"
      >
        <div className="container mx-auto grid gap-10 px-4 md:grid-cols-2 md:gap-12">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-secondary">
              For buyers
            </p>
            <h2 className="mt-2 font-display text-2xl sm:text-3xl">
              From a useful find to a delivered lot
            </h2>
            <ol className="mt-6 space-y-5">
              {buyerSteps.map(([title, description], index) => (
                <li key={title} className="flex gap-3">
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary/10 text-sm font-semibold text-secondary"
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="font-semibold">{title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {description}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            <Link
              href="/for-buyers"
              className="mt-5 inline-flex min-h-11 items-center gap-2 font-semibold text-primary underline underline-offset-4"
            >
              See how buying works{" "}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">
              For sellers
            </p>
            <h2 className="mt-2 font-display text-2xl sm:text-3xl">
              Put your surplus in front of buyers
            </h2>
            <ol className="mt-6 space-y-5">
              {sellerSteps.map(([title, description], index) => (
                <li key={title} className="flex gap-3">
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="font-semibold">{title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {description}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            <Link
              href="/for-sellers"
              className="mt-5 inline-flex min-h-11 items-center gap-2 font-semibold text-primary underline underline-offset-4"
            >
              See how selling works{" "}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="home-questions-title"
        className="border-t py-10 sm:py-12"
      >
        <div className="container mx-auto grid gap-6 px-4 md:grid-cols-[1fr_2fr] md:gap-12">
          <div>
            <h2
              id="home-questions-title"
              className="font-display text-2xl sm:text-3xl"
            >
              Before you get started
            </h2>
            <Link
              href="/faq"
              className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-4"
            >
              View all questions
            </Link>
          </div>
          <div className="divide-y border-y">
            <details className="group py-4">
              <summary className="cursor-pointer py-1 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                Do I need an account to browse?
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                No. Browse available lots first. Create a business account when
                you&apos;re ready to save, message or trade. Business
                verification is required before buying or publishing.
              </p>
            </details>
            <details className="group py-4">
              <summary className="cursor-pointer py-1 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                What does the Free plan include?
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Free includes {FREE_LIMITS.activeListings} active listings and{" "}
                {FREE_LIMITS.savedSearches} saved searches. Marketplace
                transaction fees still apply. Pro is optional if you need more
                tools.
              </p>
            </details>
            <details className="group py-4">
              <summary className="cursor-pointer py-1 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                How much will freight cost?
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Freight depends on the lot, pickup and delivery details. Review
                the quote before payment. The displayed charge may include
                carrier charges plus PlankMarket shipping service margin.
              </p>
            </details>
            <details className="group py-4">
              <summary className="cursor-pointer py-1 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                When does the seller receive payment?
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Seller transfers are scheduled after confirmed carrier pickup
                and the payment release period, subject to order checks. Bank
                arrival depends on Stripe and the seller&apos;s payout schedule.{" "}
                <Link
                  href="/pricing"
                  className="font-medium text-primary underline underline-offset-4"
                >
                  Review payment details.
                </Link>
              </p>
            </details>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="home-seller-title"
        className="border-t bg-primary/5 py-8 sm:py-10"
      >
        <div className="container mx-auto flex flex-col gap-5 px-4 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            <h2
              id="home-seller-title"
              className="font-display text-2xl sm:text-3xl"
            >
              Make room for your next order.
            </h2>
            <p className="mt-2 text-muted-foreground">
              Create a listing with your lot&apos;s specifications, condition,
              quantity and photos. Start with up to {FREE_LIMITS.activeListings}{" "}
              active listings on Free.
            </p>
          </div>
          <Button asChild size="xl" className="shrink-0 px-6">
            <Link href="/register?role=seller">
              Create a seller account <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
