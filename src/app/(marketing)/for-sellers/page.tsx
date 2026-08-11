import type { Metadata } from "next";
import Image from "next/image";
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
import { CarryingCostCalculator } from "@/components/marketing/carrying-cost-calculator";
import { PUBLIC_COMMERCIAL_COPY } from "@/lib/public-commercial-copy";

export const metadata: Metadata = {
  title: "For Sellers - Sell Surplus Flooring",
  description:
    `List closeout and surplus flooring with no listing fee. Sell to verified businesses with integrated offers, freight milestones, and a clear ${PUBLIC_COMMERCIAL_COPY.sellerMarketplaceFeeLabel} with projected seller transfer before acceptance.`,
  openGraph: {
    title: "Turn surplus flooring into working capital",
    description:
      "Publish detailed inventory, reach verified buyers, and keep the order and freight trail in one marketplace.",
    url: "https://plankmarket.com/for-sellers",
  },
};

export const revalidate = 3600;

const BENEFITS = [
  {
    icon: BadgeCheck,
    title: "Transact with verified businesses",
    description:
      "Buyers must complete business verification before checkout and other protected transaction actions.",
  },
  {
    icon: Boxes,
    title: "Give the lot enough evidence",
    description:
      "Publish structured specifications, quantity, condition, pallet details, and photos so a buyer can qualify the opportunity.",
  },
  {
    icon: Truck,
    title: "Keep fulfillment connected",
    description:
      "Offers, order state, freight booking evidence, pickup, and delivery milestones stay attached to the transaction.",
  },
] as const;

const STEPS = [
  {
    title: "Create your account",
    description:
      "Registration asks only for account and contact details. EIN and supporting documents are not collected during signup.",
  },
  {
    title: "Save business verification",
    description:
      "Complete business, evidence, and review steps at your pace. The draft is saved server-side so you can safely resume.",
  },
  {
    title: "Publish the inventory",
    description:
      "After approval, add the lot specifications and photos, then choose when the listing becomes active.",
  },
  {
    title: "Sell and prepare pickup",
    description:
      "The buyer pays through Stripe. After confirmed carrier pickup and the configured delay, PlankMarket initiates the seller transfer through Stripe Connect.",
  },
] as const;

const FAQS = [
  {
    question: "Does it cost anything to list?",
    answer:
      `There is no listing or insertion fee and no required subscription. PlankMarket charges a ${PUBLIC_COMMERCIAL_COPY.sellerMarketplaceFeeLabel} on completed inventory sales. The seller's Stripe processing fee also applies to the inventory subtotal.`,
  },
  {
    question: "What is required for business verification?",
    answer:
      "The progressive verification flow asks for your business website and legal address, EIN, and an approved secure-upload link to a supporting business document. Each step can be saved and resumed before submission.",
  },
  {
    question: "When does the seller transfer begin?",
    answer:
      "Stripe processes the buyer's payment at checkout. PlankMarket initiates the separate Connect transfer after confirmed carrier pickup and the configured delay. Bank availability depends on the seller's Stripe payout schedule and financial institution.",
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
                Publish a complete lot record, handle offers in one place, keep
                payment and freight milestones connected through delivery, and
                see the projected seller transfer before you accept.
              </p>
              <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
                <Button asChild size="xl" variant="gold">
                  <Link href="/register?role=seller">
                    Create seller account <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
                <Button asChild size="xl" variant="outline">
                  <Link href="#seller-process">See the seller workflow</Link>
                </Button>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                Free to register and list. Approval is required before publishing.
              </p>
            </div>
            <div className="relative hidden h-[390px] overflow-hidden rounded-2xl shadow-elevation-lg lg:block">
              <Image
                src="https://images.unsplash.com/photo-1739204618173-3e89def7140f?w=1000&q=80&fit=crop"
                alt="Rows of palletized wood inventory stored in a warehouse"
                fill
                className="object-cover"
                priority
              />
              <div className="absolute inset-0 bg-gradient-to-t from-primary/35 to-transparent" aria-hidden="true" />
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-gradient-to-br from-destructive/5 via-background to-primary/5 py-12 md:py-16">
        <div className="container mx-auto px-4">
          <div className="mx-auto mb-9 max-w-3xl text-center">
            <Badge className="mb-4 border-transparent bg-red-50 text-red-700">
              <Calculator className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Free carrying-cost calculator
            </Badge>
            <h2 className="font-display text-3xl sm:text-4xl">
              How much is holding surplus inventory actually costing you?
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Enter your numbers to compare warehouse, insurance, depreciation,
              and opportunity costs with the projected value of selling today.
            </p>
          </div>
          <div className="mx-auto max-w-5xl">
            <CarryingCostCalculator />
          </div>
        </div>
      </section>

      <section className="border-y bg-muted/20" aria-label="Seller marketplace terms">
        <div className="container mx-auto grid gap-4 px-4 py-6 text-sm sm:grid-cols-3">
          {[
            "No listing or insertion fee",
            `${PUBLIC_COMMERCIAL_COPY.sellerMarketplaceFeeLabel} on completed inventory sales`,
            "Seller transfer initiated after confirmed pickup",
          ].map((item) => (
            <div key={item} className="flex items-center gap-2 sm:justify-center">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-green-700" aria-hidden="true" />
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
              giving the seller a durable record of what was offered and fulfilled.
            </p>
          </div>
          <div className="mx-auto mt-9 grid max-w-5xl gap-5 md:grid-cols-3">
            {BENEFITS.map(({ icon: Icon, title, description }) => (
              <Card key={title}>
                <CardHeader>
                  <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-secondary/15">
                    <Icon className="h-5 w-5 text-secondary" aria-hidden="true" />
                  </div>
                  <CardTitle className="font-display text-xl">{title}</CardTitle>
                  <CardDescription className="text-base leading-relaxed">
                    {description}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="seller-process" className="scroll-mt-20 bg-muted/30 py-12 md:py-16">
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
              <li key={item.title} className="rounded-xl border bg-background p-5">
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
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p>
              After approval, changes to the verified business name or address
              retrigger review. Protected marketplace actions stay locked until
              the updated identity is approved.
            </p>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16">
        <div className="container mx-auto grid max-w-5xl gap-8 px-4 lg:grid-cols-[.85fr_1.15fr]">
          <Card className="h-fit border-secondary/30">
            <CardHeader>
              <Badge className="w-fit" variant="outline">Pay when it sells</Badge>
              <CardTitle className="font-display text-3xl">Know what you keep before you accept</CardTitle>
              <CardDescription className="text-base">
                No listing fee. A {PUBLIC_COMMERCIAL_COPY.sellerMarketplaceFeeLabel} and inventory-only Stripe processing apply on completed sales.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="space-y-2 rounded-lg bg-muted/40 p-4 text-sm">
                <div className="flex justify-between gap-4">
                  <dt>Inventory sale</dt><dd>$10,000.00</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Platform fee (5%)</dt><dd>-$500.00</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Seller Stripe fee</dt><dd>-$290.30</dd>
                </div>
                <div className="flex justify-between gap-4 border-t pt-2 font-semibold">
                  <dt>Projected seller transfer</dt><dd>$9,209.70</dd>
                </div>
              </dl>
              <p className="text-sm text-muted-foreground">
                Example uses the current {PUBLIC_COMMERCIAL_COPY.sellerProcessingLabel} seller Stripe fee on the
                inventory subtotal. Freight is shown separately to the buyer and
                the displayed freight charge may include carrier charges plus
                PlankMarket shipping service margin.
              </p>
              <Button asChild variant="outline" className="w-full">
                <Link href="/pricing">Review all pricing</Link>
              </Button>
            </CardContent>
          </Card>

          <div>
            <div className="flex items-center gap-3">
              <FileCheck2 className="h-7 w-7 text-secondary" aria-hidden="true" />
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
            Create the account first, then save and resume verification when your documents are ready.
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
