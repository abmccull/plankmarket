import { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Seller Guide",
};

export default function SellerGuidePage() {
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
        <h1>Seller Guide</h1>
        <p className="text-muted-foreground">
          Everything you need to know to successfully sell surplus flooring materials on PlankMarket.
        </p>

        <h2>Getting Started as a Seller</h2>

        <h3>Registration & Account Setup</h3>
        <p>
          To begin selling on PlankMarket, you will need to create a seller account and complete our verification process. Here is what you will need:
        </p>
        <ul>
          <li>Business name and contact information</li>
          <li>Business address and phone number</li>
          <li>Tax identification number (EIN or equivalent)</li>
          <li>Business verification documents (business license, certificate of incorporation, or similar)</li>
          <li>Banking information for payment processing (via Stripe Connect)</li>
        </ul>
        <p>
          Once you submit your application, our team will review your information. Verification typically takes 1-3 business days. You will receive an email notification when your account is approved and ready to start listing.
        </p>

        <h3>Setting Up Your Seller Profile</h3>
        <p>
          A complete and professional seller profile builds trust with buyers. Include:
        </p>
        <ul>
          <li>Your company logo and business description</li>
          <li>Location and service areas</li>
          <li>Business hours and contact preferences</li>
          <li>Shipping and freight capabilities</li>
          <li>Return and refund policies</li>
        </ul>

        <h2>Creating Effective Listings</h2>
        <p>
          The quality of your listings directly impacts how quickly your inventory sells. Follow these best practices to create listings that attract buyers.
        </p>

        <h3>High-Quality Photos</h3>
        <p>
          Photos are the most important element of your listing. Include:
        </p>
        <ul>
          <li>Multiple angles showing the flooring material clearly</li>
          <li>Close-up shots highlighting texture, grain, and finish</li>
          <li>Photos of packaging and quantity to show lot size</li>
          <li>Any imperfections or defects (be transparent to avoid returns)</li>
          <li>Well-lit images with neutral backgrounds</li>
        </ul>
        <p>
          Aim for at least 5-8 high-resolution photos per listing. Mobile photos are acceptable if they are clear and well-lit.
        </p>

        <h3>Detailed Descriptions</h3>
        <p>
          Write clear, accurate descriptions that answer buyer questions upfront:
        </p>
        <ul>
          <li>Brand and product line (if applicable)</li>
          <li>Material type and species (e.g., red oak, white oak, Brazilian cherry)</li>
          <li>Dimensions (plank width, length, thickness)</li>
          <li>Total square footage available</li>
          <li>Color, finish, and sheen level</li>
          <li>Reason for surplus (overstock, discontinued, closeout, slight seconds)</li>
          <li>Installation type (nail-down, click-lock, glue-down)</li>
          <li>Condition and any defects</li>
        </ul>

        <h3>Competitive Pricing</h3>
        <p>
          Set prices that reflect market conditions and material quality:
        </p>
        <ul>
          <li>Research similar listings to understand market rates</li>
          <li>Price per square foot should be lower than retail for surplus/closeout inventory</li>
          <li>Offer volume discounts for larger lot purchases when possible</li>
          <li>Factor in material condition (A-grade vs. slight seconds)</li>
          <li>Update pricing based on demand and inventory age</li>
        </ul>

        <h3>Accurate Lot Sizes</h3>
        <p>
          Clearly specify the quantity available:
        </p>
        <ul>
          <li>Total square footage in the lot</li>
          <li>Number of boxes or pallets</li>
          <li>Whether you can split lots for smaller orders</li>
          <li>Minimum order quantity (if applicable)</li>
        </ul>

        <h2>Material Types Supported</h2>
        <p>
          PlankMarket supports all major flooring material categories:
        </p>

        <h3>Hardwood</h3>
        <p>
          Solid wood flooring in species such as oak, maple, hickory, walnut, cherry, and exotic hardwoods. Specify whether it is pre-finished or unfinished, plank width, and grade.
        </p>

        <h3>Engineered Wood</h3>
        <p>
          Engineered hardwood with real wood veneer over plywood core. Include wear layer thickness, core construction, and installation method.
        </p>

        <h3>Laminate</h3>
        <p>
          Laminate flooring with photographic wood or tile appearance. Specify AC rating, thickness, underlayment inclusion, and locking system type.
        </p>

        <h3>Vinyl & LVP (Luxury Vinyl Plank)</h3>
        <p>
          Vinyl flooring including LVT (luxury vinyl tile), LVP (luxury vinyl plank), WPC (wood-plastic composite), and SPC (stone-plastic composite). Include wear layer thickness, waterproof rating, and installation type.
        </p>

        <h3>Bamboo</h3>
        <p>
          Solid or engineered bamboo flooring. Specify strand-woven, horizontal, or vertical construction, and carbonization level (natural vs. carbonized).
        </p>

        <h3>Tile</h3>
        <p>
          Ceramic or porcelain tile suitable for flooring. Include dimensions, finish (matte, glossy, textured), slip rating, and intended use (indoor/outdoor, residential/commercial).
        </p>

        <h2>Managing Orders & Shipping</h2>

        <h3>Order Notifications</h3>
        <p>
          You will receive instant email and dashboard notifications when a buyer places an order. Review order details promptly and confirm your ability to fulfill the order.
        </p>

        <h3>Communication with Buyers</h3>
        <p>
          Use the built-in messaging system to coordinate shipping details:
        </p>
        <ul>
          <li>Confirm order details and shipping address</li>
          <li>Provide estimated ship date and freight options</li>
          <li>Offer freight quotes or assist with carrier selection</li>
          <li>Share tracking information once shipped</li>
        </ul>

        <h3>Packaging & Freight</h3>
        <p>
          Properly package materials to prevent damage during transit:
        </p>
        <ul>
          <li>Keep materials in original manufacturer packaging when possible</li>
          <li>Securely band or wrap pallets for freight shipment</li>
          <li>Clearly label shipments with buyer information</li>
          <li>Provide accurate weight and dimensions for freight quotes</li>
        </ul>
        <p>
          Most buyers arrange their own freight for larger orders. However, offering shipping assistance can increase your sales conversion rate.
        </p>

        <h2>Tips for Faster Sales</h2>

        <h3>Competitive Pricing</h3>
        <p>
          Price aggressively for surplus inventory. Buyers come to PlankMarket looking for deals on overstock and closeout materials. If your pricing is too close to retail, listings will sit unsold.
        </p>

        <h3>Detailed Photos</h3>
        <p>
          Listings with 8 or more photos sell significantly faster than those with fewer images. Show every angle and detail.
        </p>

        <h3>Accurate Descriptions</h3>
        <p>
          Transparency builds trust. Clearly describe condition, quantity, and any defects. Buyers appreciate honesty and are less likely to dispute orders when expectations are properly set.
        </p>

        <h3>Fast Response Times</h3>
        <p>
          Respond to buyer inquiries within 24 hours. Quick communication shows professionalism and increases the likelihood of completing a sale.
        </p>

        <h3>Flexible Shipping Options</h3>
        <p>
          Offering multiple shipping options (seller-arranged freight, buyer pickup, or assistance with carrier selection) makes your listings more attractive to a wider range of buyers.
        </p>

        <h2>Payment Processing</h2>
        <p>
          All payments are processed through Stripe Connect, ensuring secure and reliable transactions:
        </p>
        <ul>
          <li>Buyers pay upfront when placing an order</li>
          <li>Funds are held in escrow until the buyer confirms receipt</li>
          <li>Once confirmed, payment is released to your Stripe account</li>
          <li>Funds are typically available in your bank account within 3-5 business days</li>
          <li>You can view all transaction history and earnings in your seller dashboard</li>
        </ul>

        <h2>Fees & Pricing</h2>
        <p>
          PlankMarket charges a commission on each completed sale. For current fee structure, please see our <Link href="/pricing">Pricing & Fees</Link> page. There are no monthly fees or listing fees.
        </p>

        <h2>Need Help?</h2>
        <p>
          Our seller support team is here to assist you with any questions about listings, orders, or account management. Contact us at <a href="mailto:support@plankmarket.com">support@plankmarket.com</a> or through your dashboard messaging system.
        </p>

        <p>
          Ready to start selling? <Link href="/register?role=seller">Create your seller account</Link> today and turn your surplus flooring inventory into revenue.
        </p>
      </article>
    </div>
  );
}
