import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Bell,
  CheckCircle2,
  FileText,
  Search,
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
import { PUBLIC_COMMERCIAL_COPY } from "@/lib/public-commercial-copy";
import { FREE_LIMITS } from "@/lib/pro";

export const metadata: Metadata = {
  title: "For Buyers - Source Closeout Flooring",
  description: `Source closeout and surplus flooring with visible seller verification, detailed lot data, freight quotes, and a clear ${PUBLIC_COMMERCIAL_COPY.buyerMarketplaceFeeLabel} shown before payment.`,
  alternates: {
    canonical: "/for-buyers",
  },
  openGraph: {
    title: "Source closeout flooring with less guesswork",
    description:
      "Compare surplus flooring lots, review specifications and seller verification, then see the buyer fee and selected freight quote before payment.",
    url: "/for-buyers",
  },
};

export const revalidate = 3600;

const BENEFITS = [
  {
    icon: Search,
    title: "Find relevant lots faster",
    description:
      "Filter available inventory by product, condition, quantity, price, and location instead of rebuilding the same phone list for every job.",
  },
  {
    icon: FileText,
    title: "Evaluate before you commit",
    description:
      "Review structured specifications, condition details, pallet information, and seller-provided photos in one listing record.",
  },
  {
    icon: Truck,
    title: "Keep freight with the order",
    description:
      "Compare available LTL quotes at checkout and follow shipment milestones from your buyer dashboard.",
  },
] as const;

const STEPS = [
  {
    title: "Browse and compare",
    description:
      "No account needed to browse. Check the material, quantity, minimum order, condition and seller-provided photos.",
  },
  {
    title: "Save a lot or ask a question",
    description:
      "Create a buyer account to save searches, message the seller or send an offer. You can start these steps before business approval.",
  },
  {
    title: "Verify and check out",
    description: `Business approval is required before checkout. Review your quantity, the ${PUBLIC_COMMERCIAL_COPY.buyerMarketplaceFeeLabel}, selected freight and any applicable tax before payment.`,
  },
  {
    title: "Track delivery",
    description:
      "Follow shipment updates in your order. Inspect the delivery, note visible damage on the paperwork, and report damage or shortages within 48 hours with photos.",
  },
] as const;

const FAQS = [
  {
    question: "Can I browse before business verification?",
    answer:
      "Yes. Browse without an account. Create an account to save searches, message sellers or make offers; business approval is required before checkout.",
  },
  {
    question: "What does it cost to buy?",
    answer: `PlankMarket charges a ${PUBLIC_COMMERCIAL_COPY.buyerMarketplaceFeeLabel} on the inventory subtotal when a purchase is completed. Freight is quoted separately before payment, and the displayed freight charge may include carrier charges plus PlankMarket shipping service margin. Pro is optional and does not replace the transaction fee.`,
  },
  {
    question: "How is payment handled?",
    answer: PUBLIC_COMMERCIAL_COPY.paymentHoldModel,
  },
  {
    question: "What if freight arrives damaged or short?",
    answer:
      "Note visible damage on the delivery paperwork and report the issue through the order within 48 hours with supporting photos. The support team reviews the reported evidence and order history.",
  },
] as const;

export default function ForBuyersPage() {
  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-b from-primary/5 to-background py-12 md:py-20">
        <div className="container mx-auto px-4">
          <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1.05fr_.95fr]">
            <div className="text-center lg:text-left">
              <Badge className="border-transparent bg-amber-100 text-amber-900">
                Built for flooring buyers
              </Badge>
              <h1 className="mt-4 font-display text-4xl tracking-tight sm:text-5xl lg:text-6xl">
                Source closeout flooring with less guesswork.
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground lg:mx-0">
                Compare surplus lots with visible seller verification and
                product evidence, see the buyer fee before payment, and keep
                offers, payment, and freight in one order trail.
              </p>
              <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
                <Button asChild size="xl" variant="gold">
                  <Link href="/listings">
                    Browse inventory{" "}
                    <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
                  </Link>
                </Button>
                <Button asChild size="xl" variant="outline">
                  <Link href="/register?role=buyer">Create buyer account</Link>
                </Button>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                No account needed to browse. Business approval is required
                before checkout.
              </p>
            </div>
            <aside
              className="border-t pt-6 text-left lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0"
              aria-labelledby="lot-checklist-title"
            >
              <h2 id="lot-checklist-title" className="font-display text-2xl">
                Check the lot before you buy
              </h2>
              <ul className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
                <li>
                  Available quantity, minimum order and product specifications
                </li>
                <li>Actual flooring, labels, packaging and condition photos</li>
                <li>
                  Seller verification, pickup region and freight to your
                  destination
                </li>
              </ul>
              <Link
                href="/how-it-works#buyers"
                className="mt-5 inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-4"
              >
                See the buying steps
              </Link>
            </aside>
          </div>
        </div>
      </section>

      <section
        className="border-y bg-muted/20"
        aria-label="Marketplace safeguards"
      >
        <div className="container mx-auto grid gap-4 px-4 py-6 text-sm sm:grid-cols-3">
          {[
            "Business approval before checkout",
            "Structured lot details and photos",
            "Freight milestones in your dashboard",
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
              Make the lot easier to evaluate.
            </h2>
            <p className="mt-3 text-muted-foreground">
              PlankMarket organizes the evidence and transaction steps that are
              usually scattered across calls, texts, spreadsheets, and freight
              portals.
            </p>
          </div>
          <div className="mx-auto mt-9 grid max-w-5xl gap-5 md:grid-cols-3">
            {BENEFITS.map(({ icon: Icon, title, description }) => (
              <Card key={title}>
                <CardHeader>
                  <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
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

      <section className="bg-muted/30 py-12 md:py-16">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="outline">How it works</Badge>
            <h2 className="mt-4 font-display text-3xl sm:text-4xl">
              From search to shipment in four steps.
            </h2>
          </div>
          <ol className="mx-auto mt-9 grid max-w-5xl gap-4 md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((item, index) => (
              <li
                key={item.title}
                className="rounded-xl border bg-background p-5"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {index + 1}
                </span>
                <h3 className="mt-4 font-display text-lg">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {item.description}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="py-12 md:py-16">
        <div className="container mx-auto grid max-w-5xl gap-8 px-4 lg:grid-cols-[.85fr_1.15fr]">
          <Card className="h-fit border-primary/30">
            <CardHeader>
              <Badge className="w-fit" variant="outline">
                Transparent pricing
              </Badge>
              <CardTitle className="font-display text-3xl">
                Buyer total shown before payment
              </CardTitle>
              <CardDescription className="text-base">
                A {PUBLIC_COMMERCIAL_COPY.buyerMarketplaceFeeLabel} applies to
                the inventory subtotal only when a purchase is completed.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm font-semibold">Illustrative order</p>
              <dl className="space-y-2 rounded-lg bg-muted/40 p-4 text-sm">
                <div className="flex justify-between gap-4">
                  <dt>Inventory subtotal</dt>
                  <dd>
                    {PUBLIC_COMMERCIAL_COPY.exampleOrder.inventorySubtotal}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>
                    Buyer fee (
                    {PUBLIC_COMMERCIAL_COPY.buyerMarketplaceFeePercent}%)
                  </dt>
                  <dd>{PUBLIC_COMMERCIAL_COPY.exampleOrder.buyerFee}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Example quoted freight</dt>
                  <dd>{PUBLIC_COMMERCIAL_COPY.exampleOrder.quotedFreight}</dd>
                </div>
                <div className="flex justify-between gap-4 border-t pt-2 font-semibold">
                  <dt>Before applicable tax</dt>
                  <dd>{PUBLIC_COMMERCIAL_COPY.exampleOrder.buyerTotal}</dd>
                </div>
              </dl>
              <p className="text-sm text-muted-foreground">
                Your actual freight depends on the selected quote. The displayed
                freight charge may include carrier charges plus PlankMarket
                shipping service margin. Free includes{" "}
                {FREE_LIMITS.savedSearches} saved searches with email and in-app
                alerts. Pro adds unlimited saved searches; no subscription is
                required to buy.
              </p>
              <Button asChild variant="outline" className="w-full">
                <Link href="/pricing">Review all pricing</Link>
              </Button>
            </CardContent>
          </Card>

          <div>
            <div className="flex items-center gap-3">
              <ShieldCheck
                className="h-7 w-7 text-primary"
                aria-hidden="true"
              />
              <h2 className="font-display text-3xl">Buyer questions</h2>
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

      <section className="bg-primary py-12 text-primary-foreground md:py-16">
        <div className="container mx-auto px-4 text-center">
          <Bell className="mx-auto h-7 w-7" aria-hidden="true" />
          <h2 className="mt-3 font-display text-3xl sm:text-4xl">
            Find the next lot before the next round of calls.
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-primary-foreground/80">
            Browse first, then create a buyer account to save searches and
            prepare for verification.
          </p>
          <Button asChild size="xl" variant="gold" className="mt-7">
            <Link href="/listings">
              Browse inventory{" "}
              <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </section>
    </>
  );
}
