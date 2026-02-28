import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "FAQ | PlankMarket",
  description:
    "Answers to common buyer and seller questions about PlankMarket, verification, fees, freight, and payouts.",
};

const BUYER_FAQS = [
  {
    question: "Who can buy on PlankMarket?",
    answer:
      "PlankMarket is built for flooring professionals. Buyers can create an account and browse listings immediately. Verification and approval are required before checkout.",
  },
  {
    question: "How are buyer fees calculated?",
    answer:
      "Buyers pay a 3% platform fee on the inventory subtotal only. Shipping is quoted and added separately at checkout. The buyer fee is shown before payment confirmation.",
  },
  {
    question: "How is shipping handled?",
    answer:
      "Checkout includes integrated freight quotes. You select a quote during checkout and that shipping amount is included in the order total.",
  },
  {
    question: "Can I make offers before verification?",
    answer:
      "Yes. Buyers can browse, message, and negotiate while unverified. Verification is required to complete payment and place an order.",
  },
  {
    question: "Can I buy part of a lot or does it have to be full-lot?",
    answer:
      "It depends on the listing. Sellers specify whether a lot must be purchased in full or if they are willing to split. Some listings include a minimum order quantity. These terms are clearly shown on each listing before you make an offer.",
  },
  {
    question: "What happens if my order arrives damaged or short?",
    answer:
      "Note any visible damage on the delivery receipt (BOL) at the time of delivery. Then open a dispute in your buyer dashboard within 48 hours with photo evidence. Our support team mediates the claim. If no dispute is filed within 5 business days of delivery, the transaction closes automatically.",
  },
];

const SELLER_FAQS = [
  {
    question: "When do sellers need verification?",
    answer:
      "Sellers can create an account and explore the platform right away, but verification approval is required before creating listings.",
  },
  {
    question: "How are seller fees calculated?",
    answer:
      "Sellers pay a 2% platform fee on inventory subtotal and a 2.9% + $0.30 Stripe processing fee on inventory subtotal only.",
  },
  {
    question: "Who covers shipping-related processing costs?",
    answer:
      "PlankMarket absorbs the processing cost on the shipping portion and any non-seller share of processor costs.",
  },
  {
    question: "When do payouts happen?",
    answer:
      "Seller payouts release when the carrier picks up the shipment. Funds are typically available in your bank within 3-5 business days. Buyers have a 48-hour post-delivery window to report damage or shortages. Your seller dashboard shows real-time payout status and history.",
  },
];

function FaqSection({
  title,
  items,
}: {
  title: string;
  items: { question: string; answer: string }[];
}) {
  return (
    <section>
      <h2 className="font-display text-2xl sm:text-3xl mb-6">{title}</h2>
      <div className="space-y-3">
        {items.map((item) => (
          <details
            key={item.question}
            className="group rounded-xl border border-border bg-card shadow-elevation-xs open:shadow-elevation-sm transition-shadow"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 font-semibold text-sm select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl">
              <span>{item.question}</span>
              <span
                className="shrink-0 w-5 h-5 rounded-full border border-border flex items-center justify-center text-muted-foreground group-open:rotate-180 transition-transform duration-200"
                aria-hidden="true"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M2 4l4 4 4-4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </summary>
            <div className="px-6 pb-5 text-sm text-muted-foreground leading-relaxed border-t border-border pt-4">
              {item.answer}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

export default function FaqPage() {
  return (
    <div className="py-16 sm:py-20 bg-muted/20">
      <div className="container mx-auto px-4 max-w-5xl space-y-12">
        <div className="text-center max-w-3xl mx-auto">
          <Badge variant="outline" className="mb-4">
            Help Center
          </Badge>
          <h1 className="font-display text-4xl sm:text-5xl tracking-tight">
            Frequently Asked Questions
          </h1>
          <p className="mt-4 text-muted-foreground text-lg">
            Quick answers for buyers and sellers using PlankMarket.
          </p>
        </div>

        <div className="grid gap-12">
          <FaqSection title="Buyer FAQs" items={BUYER_FAQS} />
          <FaqSection title="Seller FAQs" items={SELLER_FAQS} />
        </div>

        <div className="rounded-2xl border bg-card p-8 text-center">
          <h2 className="font-display text-2xl">Still have a question?</h2>
          <p className="mt-2 text-muted-foreground">
            Contact our team and we will help you get unstuck quickly.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link href="/contact">
              <Button>Contact Support</Button>
            </Link>
            <Link href="/listings">
              <Button variant="outline">
                Browse Listings
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
