import { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Pricing & Fees",
};

export default function PricingPage() {
  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <div className="mb-6">
        <Link href="/">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Button>
        </Link>
      </div>

      <article className="prose prose-slate dark:prose-invert max-w-none">
        <h1>Pricing & Fees</h1>
        <p className="text-muted-foreground">
          Transparent pricing with no hidden charges. PlankMarket keeps fees simple so you can focus on buying and selling flooring materials.
        </p>

        <h2>For Buyers</h2>

        <h3>Free to Browse & Register</h3>
        <p>
          Creating a buyer account on PlankMarket is completely free. Browse thousands of surplus flooring listings, save searches, and contact sellers at no cost.
        </p>

        <h3>No Buyer Fees</h3>
        <p>
          Buyers pay only the listed price for materials plus any applicable shipping costs. There are no platform fees, transaction fees, or membership charges for buyers.
        </p>

        <h3>Payment Processing</h3>
        <p>
          All payments are processed securely through Stripe. Standard payment processing fees apply and are included in the transaction, not added as a separate charge to buyers.
        </p>

        <h2>For Sellers</h2>

        <h3>Free to List</h3>
        <p>
          Listing your surplus flooring inventory on PlankMarket is free. Create as many listings as you need with no upfront costs or listing fees.
        </p>

        <h3>Commission Structure</h3>
        <p>
          PlankMarket charges a commission only when your materials sell. The platform takes a percentage of each completed transaction. Our commission structure is designed to be competitive with other B2B marketplaces while providing you with access to a nationwide network of buyers.
        </p>
        <p>
          <strong>Current Commission Rate:</strong> X% of the sale price
        </p>
        <p>
          The commission covers:
        </p>
        <ul>
          <li>Hosting and maintaining your listings</li>
          <li>Access to our buyer network</li>
          <li>Secure payment processing and escrow services</li>
          <li>Messaging and order management tools</li>
          <li>Customer support for you and your buyers</li>
          <li>Platform maintenance and improvements</li>
        </ul>

        <h3>Payment Processing Fees</h3>
        <p>
          In addition to the platform commission, standard Stripe payment processing fees apply to all transactions:
        </p>
        <ul>
          <li>Credit and debit card payments: approximately 2.9% + $0.30 per transaction</li>
          <li>ACH transfers: lower percentage fee (varies by transaction size)</li>
        </ul>
        <p>
          These fees are standard for online payment processing and are charged by Stripe, not PlankMarket. Payment processing fees are deducted automatically before funds are transferred to your account.
        </p>

        <h3>Payout Timeline</h3>
        <p>
          Once a buyer confirms receipt of materials, your payment is released and transferred to your connected Stripe account. Funds are typically available in your bank account within 3-5 business days, depending on your bank.
        </p>

        <h2>No Hidden Fees</h2>
        <p>
          We believe in transparent pricing. Unlike other marketplaces, PlankMarket does not charge:
        </p>
        <ul>
          <li>Monthly subscription fees</li>
          <li>Listing fees or insertion fees</li>
          <li>Featured listing charges</li>
          <li>Renewal fees for unsold listings</li>
          <li>Account maintenance fees</li>
          <li>Withdrawal or payout fees</li>
        </ul>

        <h2>Volume Sellers</h2>
        <p>
          High-volume sellers with large inventories or frequent transactions may be eligible for reduced commission rates. Contact our partnerships team at <a href="mailto:partnerships@plankmarket.com">partnerships@plankmarket.com</a> to discuss custom pricing.
        </p>

        <h2>Optional Premium Features (Future)</h2>
        <p>
          PlankMarket is continually developing new features to help sellers maximize their reach and sales. Future optional premium features may include:
        </p>
        <ul>
          <li>Featured listing placement for increased visibility</li>
          <li>Priority customer support</li>
          <li>Advanced analytics and sales reporting</li>
          <li>Enhanced seller profile customization</li>
          <li>Integration with inventory management systems</li>
        </ul>
        <p>
          All premium features will remain optional. You can continue to use PlankMarket with the standard commission structure and full access to core features at no additional cost.
        </p>

        <h2>Refunds & Disputes</h2>
        <p>
          In the event of a dispute or return, PlankMarket will work with both parties to reach a fair resolution. Our escrow system protects both buyers and sellers:
        </p>
        <ul>
          <li>Buyers are protected by escrow until they confirm receipt</li>
          <li>Sellers are protected by upfront payment before shipping</li>
          <li>Disputes are mediated by our support team</li>
          <li>Refunds are processed through the original payment method</li>
        </ul>
        <p>
          Commission and payment processing fees are refunded to sellers in the event of a full refund. Partial refunds result in proportional commission adjustments.
        </p>

        <h2>Tax Reporting</h2>
        <p>
          Sellers will receive tax documentation from Stripe Connect for all transactions processed through the platform. You are responsible for reporting income and paying applicable taxes in accordance with local, state, and federal regulations.
        </p>

        <h2>Questions About Pricing?</h2>
        <p>
          If you have questions about our pricing structure or need clarification on fees, please contact us at <a href="mailto:support@plankmarket.com">support@plankmarket.com</a>. We are happy to explain how our pricing works and help you understand your expected costs or earnings.
        </p>

        <p>
          Ready to get started? <Link href="/register?role=buyer">Create a buyer account</Link> or <Link href="/register?role=seller">register as a seller</Link> today.
        </p>
      </article>
    </div>
  );
}
