import { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "How It Works",
};

export default function HowItWorksPage() {
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
        <h1>How It Works</h1>
        <p className="text-muted-foreground">
          PlankMarket connects buyers and sellers of surplus flooring materials through a simple, transparent process.
        </p>

        <h2>For Buyers</h2>
        <p>
          Finding the flooring inventory you need has never been easier. Our platform simplifies the entire purchasing process from discovery to delivery.
        </p>

        <h3>1. Browse Surplus & Closeout Flooring</h3>
        <p>
          Search through thousands of listings featuring hardwood, engineered wood, vinyl plank (LVP), laminate, bamboo, and tile. Use our advanced filters to narrow down by material type, color, finish, lot size, price per square foot, and location.
        </p>

        <h3>2. Get Instant Quotes</h3>
        <p>
          Every listing displays clear pricing with no hidden fees. View price per square foot, total lot size, and available quantity. All sellers on PlankMarket are verified businesses, so you can purchase with confidence.
        </p>

        <h3>3. Purchase & Arrange Freight</h3>
        <p>
          Complete your purchase securely through our platform using Stripe payment processing. Coordinate shipping and freight details directly with the seller through our built-in messaging system. For large orders, many sellers offer freight assistance or delivery options.
        </p>

        <h3>4. Receive Your Inventory</h3>
        <p>
          Track your order status through your dashboard. Once delivered, confirm receipt to release payment to the seller. If there are any issues with your order, our support team is here to help resolve disputes quickly.
        </p>

        <h2>For Sellers</h2>
        <p>
          Turn your surplus flooring inventory into revenue. PlankMarket provides everything you need to list, manage, and sell your overstock, closeouts, and discontinued materials.
        </p>

        <h3>1. List Your Surplus Inventory</h3>
        <p>
          Create detailed listings in minutes. Upload high-quality photos, specify material type, color, finish, dimensions, and quantity available. Provide accurate descriptions to help buyers make informed decisions. The more detailed your listing, the faster it will sell.
        </p>

        <h3>2. Set Your Pricing</h3>
        <p>
          You control the price. Set competitive rates based on market conditions, material quality, and lot size. Update pricing anytime to respond to demand. Our platform provides pricing insights to help you optimize your listings.
        </p>

        <h3>3. Receive Orders</h3>
        <p>
          Get notified immediately when a buyer places an order. Review order details and coordinate shipping through our messaging system. Buyers pay upfront through our secure payment system, so you never have to worry about payment collection.
        </p>

        <h3>4. Ship & Get Paid</h3>
        <p>
          Arrange freight and ship the materials to the buyer. Mark the order as shipped in your dashboard and provide tracking information. Once the buyer confirms receipt, payment is released to your connected Stripe account, typically within 3-5 business days.
        </p>

        <h2>Key Benefits</h2>

        <h3>Verified Sellers</h3>
        <p>
          All sellers go through a verification process to ensure they are legitimate businesses. Buyers can review seller ratings and transaction history before making a purchase.
        </p>

        <h3>Transparent Pricing</h3>
        <p>
          No surprises. All prices are displayed clearly with price per square foot and total lot cost. Our platform fee structure is straightforward with no hidden charges.
        </p>

        <h3>Secure Payments via Stripe</h3>
        <p>
          All transactions are processed through Stripe, one of the most trusted payment platforms in the world. Buyers are protected, and sellers receive guaranteed payment upon successful delivery.
        </p>

        <h3>Nationwide Shipping</h3>
        <p>
          Buy and sell flooring materials across the country. Our platform supports transactions nationwide, with sellers often able to assist with freight arrangements for larger orders.
        </p>

        <h2>Ready to Get Started?</h2>
        <p>
          Whether you are looking to source surplus flooring or clear out excess inventory, PlankMarket makes it easy. Join thousands of flooring professionals who trust our platform for B2B transactions.
        </p>
        <p>
          <Link href="/register?role=buyer">Create a buyer account</Link> to start browsing, or <Link href="/register?role=seller">register as a seller</Link> to begin listing your inventory today.
        </p>
      </article>
    </div>
  );
}
