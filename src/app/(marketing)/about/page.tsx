import { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "About Us",
};

export default function AboutPage() {
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
        <h1>About Us</h1>
        <p className="text-muted-foreground">
          PlankMarket is on a mission to reduce waste in the flooring industry by connecting surplus inventory with buyers who need it.
        </p>

        <h2>Our Mission</h2>
        <p>
          Every year, billions of dollars in flooring inventory sits unused in warehouses across the country. Overstock from builders, discontinued product lines from manufacturers, slight seconds from production runs, and closeout materials from retailers all represent perfectly usable flooring that deserves a second chance.
        </p>
        <p>
          At PlankMarket, we believe this waste is both an environmental problem and an economic opportunity. Our mission is to create a transparent, efficient marketplace that makes it easy to buy and sell surplus flooring materials, reducing waste while helping businesses recover value from excess inventory.
        </p>

        <h2>The Problem We Solve</h2>

        <h3>Waste in the Flooring Industry</h3>
        <p>
          The flooring industry generates massive amounts of surplus inventory for various reasons:
        </p>
        <ul>
          <li>Builders over-order materials to ensure they have enough for large projects</li>
          <li>Manufacturers discontinue product lines, leaving distributors with unsellable stock</li>
          <li>Retailers clear out showroom samples and previous season inventory</li>
          <li>Production runs create slight seconds that are cosmetically imperfect but structurally sound</li>
          <li>Project cancellations leave contractors with materials they cannot return</li>
        </ul>
        <p>
          Traditionally, this surplus inventory had limited options: deep discounting at local liquidation sales, donating to nonprofits, or disposal. Each of these options results in lost revenue for sellers and missed opportunities for buyers seeking affordable flooring materials.
        </p>

        <h3>Fragmented Marketplace</h3>
        <p>
          Before PlankMarket, buying and selling surplus flooring was inefficient and fragmented. Sellers relied on local networks, classified ads, or general liquidation sites that were not designed for B2B flooring transactions. Buyers had no centralized place to search for surplus inventory across multiple suppliers.
        </p>
        <p>
          This fragmentation meant:
        </p>
        <ul>
          <li>Sellers struggled to reach qualified buyers outside their immediate area</li>
          <li>Buyers had no visibility into available surplus inventory</li>
          <li>Transactions lacked standardization, transparency, and security</li>
          <li>Both parties spent excessive time and effort on coordination</li>
        </ul>

        <h2>Our Solution</h2>
        <p>
          PlankMarket is a purpose-built B2B marketplace designed specifically for surplus and closeout flooring materials. We provide:
        </p>

        <h3>For Sellers</h3>
        <ul>
          <li>A nationwide platform to reach thousands of qualified buyers</li>
          <li>Simple listing tools to showcase inventory with photos and detailed specs</li>
          <li>Secure payment processing through Stripe with escrow protection</li>
          <li>Built-in messaging and order management tools</li>
          <li>Fast, reliable payouts after successful delivery</li>
        </ul>

        <h3>For Buyers</h3>
        <ul>
          <li>A searchable database of surplus flooring across all major material types</li>
          <li>Advanced filters to find exactly what you need by material, color, finish, lot size, and location</li>
          <li>Transparent pricing with no hidden fees</li>
          <li>Verified sellers you can trust</li>
          <li>Secure transactions with buyer protection</li>
        </ul>

        <h2>Sustainability & Impact</h2>
        <p>
          Reducing waste is at the core of what we do. By creating an efficient marketplace for surplus flooring, PlankMarket helps:
        </p>
        <ul>
          <li>Divert usable materials from landfills</li>
          <li>Reduce demand for new flooring production</li>
          <li>Lower carbon emissions associated with manufacturing and disposal</li>
          <li>Extend the lifecycle of quality flooring materials</li>
          <li>Support businesses in recovering value from excess inventory</li>
        </ul>
        <p>
          Every transaction on PlankMarket represents materials that would have otherwise been wasted. We are proud to contribute to a more sustainable construction industry.
        </p>

        <h2>Who We Serve</h2>
        <p>
          PlankMarket is designed for flooring professionals across the supply chain:
        </p>
        <ul>
          <li><strong>Builders and Contractors:</strong> Source affordable materials for projects or liquidate surplus from completed jobs</li>
          <li><strong>Distributors and Wholesalers:</strong> Clear out discontinued inventory and overstock</li>
          <li><strong>Retailers and Showrooms:</strong> Sell floor models, samples, and previous season inventory</li>
          <li><strong>Manufacturers:</strong> Move closeout inventory and slight seconds</li>
          <li><strong>Property Managers and Developers:</strong> Find materials for renovations and repairs</li>
          <li><strong>Flooring Installers:</strong> Source materials for clients or sell leftover inventory</li>
        </ul>

        <h2>Our Commitment</h2>
        <p>
          We are committed to building a trusted, transparent marketplace where buyers and sellers can transact with confidence. Our values include:
        </p>
        <ul>
          <li><strong>Transparency:</strong> Clear pricing, honest descriptions, and straightforward policies</li>
          <li><strong>Security:</strong> Verified sellers, secure payments, and escrow protection</li>
          <li><strong>Efficiency:</strong> Simple tools that save time and reduce friction in transactions</li>
          <li><strong>Sustainability:</strong> Reducing waste and supporting a circular economy in flooring</li>
          <li><strong>Support:</strong> Responsive customer service to help resolve issues quickly</li>
        </ul>

        <h2>The Team</h2>
        <p>
          PlankMarket was founded by a team passionate about sustainability and reducing waste in construction materials. We saw firsthand how much perfectly good flooring was going to waste and knew there had to be a better way.
        </p>
        <p>
          Our team combines expertise in flooring, e-commerce, logistics, and technology. We understand the challenges of B2B transactions and have built a platform that addresses the real needs of flooring professionals.
        </p>

        <h2>Get Involved</h2>
        <p>
          Whether you have surplus flooring to sell or are looking for affordable materials for your next project, PlankMarket is here to help. Join our growing community of flooring professionals who are reducing waste and finding value in surplus inventory.
        </p>
        <p>
          <Link href="/register?role=seller">Start selling</Link> or <Link href="/register?role=buyer">browse listings</Link> today. Together, we can make the flooring industry more sustainable and efficient.
        </p>

        <h2>Contact Us</h2>
        <p>
          Have questions, feedback, or partnership inquiries? We would love to hear from you.
        </p>
        <ul>
          <li>General inquiries: <a href="mailto:support@plankmarket.com">support@plankmarket.com</a></li>
          <li>Business partnerships: <a href="mailto:partnerships@plankmarket.com">partnerships@plankmarket.com</a></li>
        </ul>
      </article>
    </div>
  );
}
