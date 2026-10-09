import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Boxes,
  Calculator,
  CheckCircle2,
  CircleDollarSign,
  FileCheck2,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CarryingCostCalculatorCompact } from "@/components/marketing/carrying-cost-calculator-compact";
import { PUBLIC_COMMERCIAL_COPY } from "@/lib/public-commercial-copy";

export const metadata: Metadata = {
  title: "For Sellers - Sell Surplus Flooring",
  description: `List closeout and surplus flooring with no listing fee. Sell to verified businesses with integrated offers, freight tracking, and a disclosed ${PUBLIC_COMMERCIAL_COPY.sellerMarketplaceFeeLabel} plus inventory payment processing.`,
  alternates: {
    canonical: "/for-sellers",
  },
  openGraph: {
    title: "Turn surplus flooring into working capital",
    description:
      "Publish detailed inventory, reach verified buyers, and keep the order and freight trail in one marketplace.",
    url: "/for-sellers",
  },
};

export const revalidate = 3600;

const BENEFITS = [
  {
    icon: BadgeCheck,
    title: "Transact with verified businesses",
    description: "Buyers complete business verification before checkout.",
  },
  {
    icon: Boxes,
    title: "Help buyers assess the lot",
    description:
      "Publish structured specifications, quantity, condition, pallet details, and photos so a buyer can qualify the opportunity.",
  },
  {
    icon: Truck,
    title: "Keep fulfillment connected",
    description:
      "Keep offers, freight pickup, tracking and order updates together.",
  },
] as const;

const STEPS = [
  {
    title: "Create your account",
    description:
      "Registration asks only for account and contact details. EIN and supporting documents are not collected during signup.",
  },
  {
    title: "Verify your business",
    description:
      "Add your business details and supporting document. You can prepare a listing draft on this browser before approval. Approval unlocks product photo uploads and publication.",
  },
  {
    title: "Publish the inventory",
    description:
      "Prepare the lot specifications in your local draft. After approval, upload product photos, review the details and choose when to publish.",
  },
  {
    title: "Sell and prepare pickup",
    description:
      "The buyer pays through Stripe. Prepare the lot for pickup and follow the order for shipping and seller-transfer status.",
  },
] as const;

const FAQS = [
  {
    question: "Does it cost anything to list?",
    answer: `There is no listing or insertion fee and no required subscription. PlankMarket charges a ${PUBLIC_COMMERCIAL_COPY.sellerMarketplaceFeeLabel} on completed inventory sales. The seller's Stripe processing fee also applies to the inventory subtotal.`,
  },
  {
    question: "What is required for business verification?",
    answer:
      "Provide your business website, legal address, EIN and a supporting business document through the secure upload. You can save each step before submitting it for review.",
  },
  {
    question: "When does the seller transfer begin?",
    answer:
      "Stripe processes the buyer's payment at checkout. After actual carrier pickup, the release waiting period and required payment, shipment, refund and dispute checks, PlankMarket initiates a separate transfer to your connected Stripe account. Refunded or disputed payments and open marketplace disputes can prevent transfer. Bank availability then depends on Stripe and your bank.",
  },
  {
    question: "What happens if the buyer reports a problem?",
    answer:
      "The buyer can report damage or shortages through the order with supporting evidence. The platform retains the order, communication, payment, and freight history for support review.",
  },
] as const;

export default function ForSellersPage() {
  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-b from-secondary/10 to-background py-12 md:py-20">
        <div className="container mx-auto px-4">
          <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1.05fr_.95fr]">
            <div className="text-center lg:text-left">
              <Badge className="border-transparent bg-amber-100 text-amber-900">
                Built for flooring inventory owners
              </Badge>
              <h1 className="mt-4 font-display text-4xl tracking-tight sm:text-5xl lg:text-6xl">
                Put surplus inventory in front of qualified buyers.
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground lg:mx-0">
                Show the flooring, quantity and condition clearly. Manage offers
                and shipping in one place. Review the published fees and track
                your seller-transfer status on the order.
              </p>
              <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
                <Button asChild size="xl" variant="gold">
                  <Link href="/register?role=seller">
                    Create seller account{" "}
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
                <Button asChild size="xl" variant="outline">
                  <Link href="#seller-process">See the seller workflow</Link>
                </Button>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                Free to register. Prepare a draft on this browser before approval.
                Approval is required to upload product photos and publish.
              </p>
            </div>
            <aside
              className="hidden border-l border-border pl-8 lg:block"
              aria-label="Listing preparation"
            >
              <h2 className="font-display text-2xl">
                A lot buyers can evaluate
              </h2>
              <ul className="mt-5 space-y-4 text-muted-foreground">
                <li>
                  Photos of the flooring, labels, packaging and any damage
                </li>
                <li>
                  Available quantity, minimum order and accurate condition
                </li>
                <li>Pickup location, pallet dimensions and freight weight</li>
              </ul>
              <Link
                href="/seller-guide#publish"
                className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-4"
              >
                See listing preparation guidance
              </Link>
            </aside>
          </div>
        </div>
      </section>

      <section
        className="border-y bg-muted/20"
        aria-label="Seller marketplace terms"
      >
        <div className="container mx-auto grid gap-4 px-4 py-6 text-sm sm:grid-cols-3">
          {[
            "No listing or insertion fee",
            `${PUBLIC_COMMERCIAL_COPY.sellerMarketplaceFeeLabel} on completed inventory sales`,
            "Seller transfer follows pickup and required checks",
          ].map((item) => (
            <div
              key={item}
              className="flex items-center gap-2 sm:justify-center"
            >
              <CheckCircle2
                className="h-4 w-4 shrink-0 text-green-700"
                aria-hidden="true"
              />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="py-12 md:py-16">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="font-display text-3xl sm:text-4xl">
              Give buyers what they need to decide.
            </h2>
            <p className="mt-3 text-muted-foreground">
              A structured marketplace helps the buyer evaluate the lot while
              giving the seller a durable record of what was offered and
              fulfilled.
            </p>
          </div>
          <div className="mx-auto mt-9 grid max-w-5xl gap-5 md:grid-cols-3">
            {BENEFITS.map(({ icon: Icon, title, description }) => (
              <Card key={title}>
                <CardHeader>
                  <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-secondary/15">
                    <Icon
                      className="h-5 w-5 text-secondary"
                      aria-hidden="true"
                    />
                  </div>
                  <CardTitle className="font-display text-xl">
                    {title}
                  </CardTitle>
                  <CardDescription className="text-base leading-relaxed">
                    {description}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section
        id="seller-process"
        className="scroll-mt-20 bg-muted/30 py-12 md:py-16"
      >
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="outline">Account-first onboarding</Badge>
            <h2 className="mt-4 font-display text-3xl sm:text-4xl">
              Register now. Verify when you are ready.
            </h2>
            <p className="mt-3 text-muted-foreground">
              Account creation is deliberately separate from verification, and
              every verification step can be saved before submission.
            </p>
          </div>
          <ol className="mx-auto mt-9 grid max-w-5xl gap-4 md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((item, index) => (
              <li
                key={item.title}
                className="rounded-xl border bg-background p-5"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-sm font-bold text-secondary-foreground">
                  {index + 1}
                </span>
                <h3 className="mt-4 font-display text-lg">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {item.description}
                </p>
              </li>
            ))}
          </ol>
          <div className="mx-auto mt-6 flex max-w-3xl items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <ShieldCheck
              className="mt-0.5 h-5 w-5 shrink-0"
              aria-hidden="true"
            />
            <p>
              After approval, changes to the verified business name or address
              require another review. Buying and selling remain unavailable
              until the updated identity is approved.
            </p>
          </div>
        </div>
      </section>

      <section
        className="border-y bg-muted/20 py-10 sm:py-12"
        aria-label="Optional carrying-cost scenario"
      >
        <div className="container mx-auto max-w-5xl px-4">
          <div className="mb-5 flex items-start gap-3">
            <Calculator
              className="mt-1 h-5 w-5 shrink-0 text-primary"
              aria-hidden="true"
            />
            <div>
              <p className="font-semibold">Deciding when to sell?</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Compare your own holding assumptions with a hypothetical sale.
                The estimate does not predict demand or guarantee a sale.
              </p>
            </div>
          </div>
          <CarryingCostCalculatorCompact />
        </div>
      </section>

      <section className="py-12 md:py-16">
        <div className="container mx-auto grid max-w-5xl gap-8 px-4 lg:grid-cols-[.85fr_1.15fr]">
          <Card className="h-fit border-secondary/30">
            <CardHeader>
              <Badge className="w-fit" variant="outline">
                Pay when it sells
              </Badge>
              <CardTitle className="font-display text-3xl">
                Understand your seller deductions
              </CardTitle>
              <CardDescription className="text-base">
                No listing fee. A{" "}
                {PUBLIC_COMMERCIAL_COPY.sellerMarketplaceFeeLabel} and
                inventory-only Stripe processing apply on completed sales.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="space-y-2 rounded-lg bg-muted/40 p-4 text-sm">
                <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
                  <dt>Illustrative inventory sale</dt>
                  <dd>
                    {PUBLIC_COMMERCIAL_COPY.exampleOrder.inventorySubtotal}
                  </dd>
                </div>
                <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
                  <dt>{PUBLIC_COMMERCIAL_COPY.sellerMarketplaceFeeLabel}</dt>
                  <dd>-{PUBLIC_COMMERCIAL_COPY.exampleOrder.sellerFee}</dd>
                </div>
                <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
                  <dt>Seller Stripe fee</dt>
                  <dd>
                    -{PUBLIC_COMMERCIAL_COPY.exampleOrder.sellerStripeFee}
                  </dd>
                </div>
                <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-t pt-2 font-semibold">
                  <dt>Projected seller transfer</dt>
                  <dd>
                    {
                      PUBLIC_COMMERCIAL_COPY.exampleOrder
                        .projectedSellerTransfer
                    }
                  </dd>
                </div>
              </dl>
              <p className="text-sm text-muted-foreground">
                Example uses the current{" "}
                {PUBLIC_COMMERCIAL_COPY.sellerProcessingLabel} seller Stripe fee
                on the inventory subtotal. Freight is shown separately to the
                buyer and the displayed freight charge may include carrier
                charges plus PlankMarket shipping service margin.
              </p>
              <Button asChild variant="outline" className="w-full">
                <Link href="/pricing">Review all pricing</Link>
              </Button>
            </CardContent>
          </Card>

          <div>
            <div className="flex items-center gap-3">
              <FileCheck2
                className="h-7 w-7 text-secondary"
                aria-hidden="true"
              />
              <h2 className="font-display text-3xl">Seller questions</h2>
            </div>
            <div className="mt-5 divide-y rounded-xl border">
              {FAQS.map((faq) => (
                <details key={faq.question} className="group p-5">
                  <summary className="cursor-pointer list-none pr-6 font-semibold marker:content-none">
                    {faq.question}
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    {faq.answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-secondary py-12 text-secondary-foreground md:py-16">
        <div className="container mx-auto px-4 text-center">
          <CircleDollarSign className="mx-auto h-7 w-7" aria-hidden="true" />
          <h2 className="mt-3 font-display text-3xl sm:text-4xl">
            Prepare your next lot for the market.
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-secondary-foreground/80">
            Create the account first, then save and resume verification when
            your documents are ready.
          </p>
          <Button asChild size="xl" variant="gold" className="mt-7">
            <Link href="/register?role=seller">
              Create seller account <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </Button>
        </div>
      </section>
    </>
  );
}
