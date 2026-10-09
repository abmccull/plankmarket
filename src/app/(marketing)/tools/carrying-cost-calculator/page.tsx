import type { Metadata } from "next";
import Link from "next/link";
import { CarryingCostCalculator } from "@/components/marketing/carrying-cost-calculator";
import { carryingCostInputsFromQuery } from "@/lib/carrying-cost";

export const metadata: Metadata = {
  title: "Inventory Carrying Cost Calculator | PlankMarket",
  description:
    "Compare illustrative holding and selling scenarios for surplus flooring. Set your own storage, insurance, capital and value-loss assumptions and review estimated seller fees.",
  alternates: { canonical: "/tools/carrying-cost-calculator" },
};

export default async function CarryingCostCalculatorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const inputs = carryingCostInputsFromQuery(await searchParams);
  return (
    <>
      <section className="border-b bg-muted/20 py-8 sm:py-12">
        <div className="container mx-auto max-w-5xl px-4">
          <p className="text-sm font-medium text-secondary">
            Seller decision tool
          </p>
          <h1 className="mt-2 font-display text-3xl tracking-tight sm:text-4xl">
            Inventory carrying-cost calculator
          </h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Compare selling a lot now with holding it for longer. Your
            assumptions drive the estimate; actual prices, costs and sale timing
            can differ.
          </p>
        </div>
      </section>
      <section className="py-8 sm:py-10" aria-label="Carrying-cost calculator">
        <div className="container mx-auto max-w-5xl px-4">
          <CarryingCostCalculator
            key={JSON.stringify(inputs)}
            initialInputs={inputs}
          />
        </div>
      </section>
      <section className="border-t py-8 sm:py-10">
        <div className="container mx-auto max-w-5xl px-4">
          <h2 className="font-display text-2xl">
            Choose assumptions you can explain
          </h2>
          <dl className="mt-5 grid gap-6 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-semibold">Storage and insurance</dt>
              <dd className="mt-1 leading-relaxed text-muted-foreground">
                Use the monthly costs you allocate to this lot. Warehouse rent
                depends on occupied space and your own allocation, not the
                number of square feet of flooring in the lot.
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Capital or opportunity cost</dt>
              <dd className="mt-1 leading-relaxed text-muted-foreground">
                Use a relevant annual financing rate or your chosen
                opportunity-cost assumption. The model lists it separately from
                storage and insurance cash costs.
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Estimated value loss</dt>
              <dd className="mt-1 leading-relaxed text-muted-foreground">
                Enter a monthly decline only if it fits your scenario. Zero
                means no assumed decline. This is not a market valuation or an
                expected return.
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Sale discount and fees</dt>
              <dd className="mt-1 leading-relaxed text-muted-foreground">
                The same discount is applied to each sale-date value. Published
                seller and processing fees are included for one hypothetical
                sale. Other costs are excluded;{" "}
                <Link
                  href="/pricing"
                  className="font-medium text-primary underline underline-offset-4"
                >
                  review the fee details
                </Link>
                .
              </dd>
            </div>
          </dl>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 border-t pt-5 text-sm font-medium">
            <Link
              href="/seller-guide"
              className="inline-flex min-h-11 items-center text-primary underline underline-offset-4"
            >
              Prepare a listing
            </Link>
            <Link
              href="/listings"
              className="inline-flex min-h-11 items-center text-primary underline underline-offset-4"
            >
              Browse available flooring
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
