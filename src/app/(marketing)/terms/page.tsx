import { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ArrowRight,
  FileText,
  UserCheck,
  ShieldCheck,
  ShoppingCart,
  DollarSign,
  Ban,
  Scale,
  AlertTriangle,
  BookOpen,
  Gavel,
  RefreshCw,
  MapPin,
  Mail,
  CreditCard,
  Truck,
  Clock,
  Package,
  FileCheck,
  ShieldAlert,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "PlankMarket Terms of Service governing the use of the B2B flooring liquidation marketplace.",
  robots: { index: false, follow: true },
};

export const revalidate = 3600;

export default function TermsOfServicePage() {
  const sections = [
    {
      icon: FileText,
      number: "1",
      title: "Acceptance of Terms",
      content: (
        <p className="text-sm text-muted-foreground">
          By accessing or using PlankMarket, you agree to be bound by these Terms of Service and all applicable laws and regulations. If you do not agree with any of these terms, you are prohibited from using or accessing this site.
        </p>
      ),
    },
    {
      icon: UserCheck,
      number: "2",
      title: "Eligibility",
      content: (
        <p className="text-sm text-muted-foreground">
          You must be at least 18 years old and have the legal capacity to enter into contracts to use PlankMarket. By registering an account, you represent and warrant that you meet these eligibility requirements. You also represent that you are acting on behalf of a legitimate business entity with authority to bind that entity to these terms. Buyers may register and browse before verification, but must be approved before placing orders. Sellers may register, explore and prepare one listing draft in their browser before verification. Approval is required before uploading product photos or publishing listings.
        </p>
      ),
    },
    {
      icon: ShieldCheck,
      number: "3",
      title: "User Accounts",
      content: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You must:
          </p>
          <ul className="space-y-1.5 text-sm text-muted-foreground ml-4">
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span><span className="min-w-0 flex-1">Provide accurate and complete registration information</span></li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span><span className="min-w-0 flex-1">Keep your account information up to date</span></li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span><span className="min-w-0 flex-1">Notify us immediately of any unauthorized use of your account</span></li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span><span className="min-w-0 flex-1">Not share your account credentials with others</span></li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span><span className="min-w-0 flex-1">Not create multiple accounts for fraudulent purposes</span></li>
          </ul>
        </div>
      ),
    },
    {
      icon: ShoppingCart,
      number: "4",
      title: "Listings and Product Information",
      content: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Sellers are responsible for the accuracy and completeness of all listing information. Sellers warrant that:
          </p>
          <ul className="space-y-1.5 text-sm text-muted-foreground ml-4">
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span><span className="min-w-0 flex-1">They have legal ownership or authorization to sell listed items</span></li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span><span className="min-w-0 flex-1">All product information is accurate and not misleading</span></li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span><span className="min-w-0 flex-1">Listed products comply with all applicable laws and regulations</span></li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span><span className="min-w-0 flex-1">Product images accurately represent the actual items for sale</span></li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span><span className="min-w-0 flex-1">They will honor the terms and pricing stated in their listings</span></li>
          </ul>
        </div>
      ),
    },
    {
      icon: DollarSign,
      number: "5",
      title: "Transactions and Payment",
      content: (
        <p className="text-sm text-muted-foreground">
          All transactions on PlankMarket are contracts between buyers and sellers. PlankMarket acts as a marketplace platform and is not a party to these transactions. Payment processing is handled through our secure third-party payment processor (Stripe). By making a purchase, you authorize us to charge the total amount including applicable fees.
        </p>
      ),
    },
    {
      icon: DollarSign,
      number: "6",
      title: "Transaction Fees",
      content: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">PlankMarket charges the following fees:</p>
          <ul className="space-y-1.5 text-sm text-muted-foreground ml-4">
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span><span className="min-w-0 flex-1"><strong>Buyer Fee:</strong> 5% of the inventory subtotal only, added to the buyer&apos;s total at checkout</span></li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span><span className="min-w-0 flex-1"><strong>Seller Fee:</strong> 5% of the inventory subtotal, deducted from seller payout</span></li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span><span className="min-w-0 flex-1"><strong>Seller Processing Fee:</strong> 2.9% + $0.30 calculated on inventory subtotal only and deducted from seller payout</span></li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span><span className="min-w-0 flex-1"><strong>Platform Processing Share:</strong> PlankMarket absorbs processing costs attributable to shipping and any remaining processor share not assigned to seller</span></li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span><span className="min-w-0 flex-1"><strong>Shipping Charge:</strong> Shipping is quoted separately at checkout. The quoted amount may include carrier charges plus PlankMarket shipping margin and is charged to the buyer unless otherwise agreed</span></li>
          </ul>
          <p className="text-sm text-muted-foreground">
            All fees are subject to change with 30 days notice. Fees are non-refundable except as required by law or as explicitly stated in our refund policy.
          </p>
        </div>
      ),
    },
    {
      icon: CreditCard,
      number: "7",
      title: "Payment Hold and Release",
      content: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            When a buyer completes a purchase, Stripe processes a platform
            charge. After live carrier pickup is confirmed and the configured
            release delay passes, PlankMarket initiates a separate transfer to
            the seller&apos;s connected Stripe account if payment, shipment,
            refund, and dispute checks still pass. The transfer is withheld when
            live pickup evidence is missing, the shipment is a dry-run, the
            charge is refunded or disputed, or a marketplace dispute is open.
            Bank availability depends on Stripe and the connected
            account&apos;s payout schedule.
          </p>
          <p className="text-sm text-muted-foreground">
            PlankMarket uses Stripe payment processing followed by a seller
            Connect transfer. By using the platform, you acknowledge that
            PlankMarket is not a regulated escrow service and is not acting as a
            trustee, fiduciary, or regulated funds custodian.
          </p>
        </div>
      ),
    },
    {
      icon: Package,
      number: "8",
      title: "Condition and Grading",
      content: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Surplus flooring materials are sold in the condition described in the listing. Common condition grades include:
          </p>
          <ul className="space-y-1.5 text-sm text-muted-foreground ml-4">
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span><span className="min-w-0 flex-1"><strong>New Overstock:</strong> Unused, first-quality materials from excess production or canceled orders</span></li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span><span className="min-w-0 flex-1"><strong>Discontinued:</strong> First-quality materials no longer in active production</span></li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span><span className="min-w-0 flex-1"><strong>Closeout:</strong> End-of-line inventory being cleared at reduced prices</span></li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span><span className="min-w-0 flex-1"><strong>Seconds:</strong> Materials with minor cosmetic imperfections that do not affect performance</span></li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span><span className="min-w-0 flex-1"><strong>Slight Damage:</strong> Materials with visible defects; extent described in listing</span></li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span><span className="min-w-0 flex-1"><strong>Returns:</strong> Previously sold materials returned by end customers; condition varies</span></li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span><span className="min-w-0 flex-1"><strong>Remnants:</strong> Partial lots or leftover quantities from larger orders</span></li>
          </ul>
          <p className="text-sm text-muted-foreground">
            Sellers must accurately describe the condition of materials. Buyers acknowledge that surplus materials may have minor variations and should review all listing photos and descriptions carefully before purchase.
          </p>
        </div>
      ),
    },
    {
      icon: Truck,
      number: "9",
      title: "Freight and Shipping",
      content: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            <strong>Shipping Responsibility:</strong> Unless otherwise agreed between buyer and seller, the buyer is responsible for carrier shipping charges. PlankMarket may facilitate shipping quotes and booking through integrated freight carriers. The displayed shipping charge may include carrier charges plus PlankMarket shipping service margin.
          </p>
          <p className="text-sm text-muted-foreground">
            <strong>Packaging Requirements:</strong> Sellers must ensure all materials are properly palletized, banded, and stretch-wrapped for LTL freight shipment. Inadequate packaging that results in damage during transit is the seller&apos;s responsibility.
          </p>
          <p className="text-sm text-muted-foreground">
            <strong>Required Shipment Information:</strong> Sellers must provide accurate weight, dimensions, pallet count, and material classification for freight quotes.
          </p>
          <p className="text-sm text-muted-foreground">
            <strong>Risk of Loss:</strong> Title and risk of loss transfer from seller to buyer upon carrier pickup. Freight damage claims should be filed with the carrier, with PlankMarket assisting in documentation.
          </p>
          <p className="text-sm text-muted-foreground">
            <strong>Delivery Receipt:</strong> Both parties acknowledge that the signed delivery receipt (Bill of Lading) serves as the primary evidence of shipment condition at delivery.
          </p>
        </div>
      ),
    },
    {
      icon: Clock,
      number: "10",
      title: "Inspection and Acceptance",
      content: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Buyers must inspect all shipments upon delivery and note any visible damage, shortage, or discrepancy on the delivery receipt (Bill of Lading) at the time of delivery.
          </p>
          <p className="text-sm text-muted-foreground">
            Buyers have 48 hours after delivery to report damage, shortage, or material discrepancy to PlankMarket with supporting evidence including:
          </p>
          <ul className="space-y-1.5 text-sm text-muted-foreground ml-4">
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span><span className="min-w-0 flex-1">Photographs of damaged or incorrect materials</span></li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span><span className="min-w-0 flex-1">Copy of the signed delivery receipt with noted exceptions</span></li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span><span className="min-w-0 flex-1">Description of the issue</span></li>
          </ul>
          <p className="text-sm text-muted-foreground">
            Claims submitted after the 48-hour reporting window are accepted
            only through an explicit administrative exception with a documented
            reason. Seller-transfer timing is governed separately by confirmed
            live pickup, the configured release delay, and the withhold
            conditions in Payment Hold and Release. The 48-hour inspection
            window does not by itself release or delay the seller transfer.
          </p>
        </div>
      ),
    },
    {
      icon: Scale,
      number: "11",
      title: "Dispute Resolution",
      content: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            In the event of a dispute between buyer and seller, PlankMarket will mediate in good faith. Both parties agree to:
          </p>
          <ul className="space-y-1.5 text-sm text-muted-foreground ml-4">
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span><span className="min-w-0 flex-1">Provide requested evidence within 3 business days</span></li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span><span className="min-w-0 flex-1">Cooperate with PlankMarket&apos;s investigation</span></li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span><span className="min-w-0 flex-1">Accept PlankMarket&apos;s resolution as binding for transactions under $5,000</span></li>
          </ul>
          <p className="text-sm text-muted-foreground">
            For disputes exceeding $5,000, either party may pursue resolution through binding arbitration administered by the American Arbitration Association under its Commercial Arbitration Rules, conducted in the State of Wyoming.
          </p>
          <p className="text-sm text-muted-foreground">
            <strong>CLASS ACTION WAIVER:</strong> You agree that any dispute resolution proceedings will be conducted only on an individual basis and not in a class, consolidated, or representative action.
          </p>
        </div>
      ),
    },
    {
      icon: ShieldAlert,
      number: "12",
      title: "Chargebacks and Payment Reversals",
      content: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            If a buyer initiates a chargeback or payment reversal through their payment provider, PlankMarket reserves the right to:
          </p>
          <ul className="space-y-1.5 text-sm text-muted-foreground ml-4">
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span><span className="min-w-0 flex-1">Suspend the buyer&apos;s account pending investigation</span></li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span><span className="min-w-0 flex-1">Provide transaction evidence to the payment processor</span></li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span><span className="min-w-0 flex-1">Deduct disputed amounts from the buyer&apos;s future transactions</span></li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span><span className="min-w-0 flex-1">Pursue recovery of funds if the chargeback is determined to be fraudulent</span></li>
          </ul>
          <p className="text-sm text-muted-foreground">
            PlankMarket retains delivery confirmation and dispute records for chargeback review. Chargeback outcomes are determined by Stripe and the applicable payment networks and are not guaranteed.
          </p>
        </div>
      ),
    },
    {
      icon: FileCheck,
      number: "13",
      title: "Seller Representations and Indemnity",
      content: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            By listing materials on PlankMarket, sellers represent and warrant that:
          </p>
          <ul className="space-y-1.5 text-sm text-muted-foreground ml-4">
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span><span className="min-w-0 flex-1">They have clear title and authority to sell the listed materials</span></li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span><span className="min-w-0 flex-1">Material descriptions, photos, and condition reports are accurate</span></li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span><span className="min-w-0 flex-1">Materials comply with applicable safety standards (CARB2, FloorScore, etc. where claimed)</span></li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span><span className="min-w-0 flex-1">Materials do not infringe on any third-party intellectual property rights</span></li>
          </ul>
          <p className="text-sm text-muted-foreground">
            Sellers agree to indemnify and hold harmless PlankMarket from any claims arising from misrepresentation, intellectual property infringement, product defects, or regulatory non-compliance related to their listings.
          </p>
        </div>
      ),
    },
    {
      icon: Ban,
      number: "14",
      title: "Prohibited Items and Conduct",
      content: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">The following items and activities are strictly prohibited:</p>
          <ul className="space-y-1.5 text-sm text-muted-foreground ml-4">
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span><span className="min-w-0 flex-1">Counterfeit or illegally obtained goods</span></li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span><span className="min-w-0 flex-1">Products that violate intellectual property rights</span></li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span><span className="min-w-0 flex-1">Hazardous materials not properly classified and documented</span></li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span><span className="min-w-0 flex-1">Stolen property or property obtained through fraud</span></li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span><span className="min-w-0 flex-1">Items that violate local, state, or federal laws</span></li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span><span className="min-w-0 flex-1">Fraudulent listings or deceptive practices</span></li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span><span className="min-w-0 flex-1">Harassment, threats, or abusive behavior toward other users</span></li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span><span className="min-w-0 flex-1">Attempts to circumvent platform fees or payment systems</span></li>
          </ul>
        </div>
      ),
    },
    {
      icon: AlertTriangle,
      number: "15",
      title: "Limitation of Liability",
      content: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            PlankMarket provides the platform on an &quot;as is&quot; and &quot;as available&quot; basis. We make no warranties, express or implied, regarding the quality, accuracy, or availability of products listed. To the fullest extent permitted by law, PlankMarket shall not be liable for:
          </p>
          <ul className="space-y-1.5 text-sm text-muted-foreground ml-4">
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span><span className="min-w-0 flex-1">Any indirect, incidental, special, or consequential damages</span></li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span><span className="min-w-0 flex-1">Loss of profits, revenue, data, or business opportunities</span></li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span><span className="min-w-0 flex-1">Product quality, delivery, or post-sale issues</span></li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span><span className="min-w-0 flex-1">Actions or omissions of buyers or sellers on the platform</span></li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span><span className="min-w-0 flex-1">Unauthorized access to or alteration of your data</span></li>
          </ul>
          <p className="text-sm text-muted-foreground">
            Our total liability shall not exceed the fees paid by you to PlankMarket in the 12 months preceding the claim.
          </p>
        </div>
      ),
    },
    {
      icon: BookOpen,
      number: "16",
      title: "Intellectual Property",
      content: (
        <p className="text-sm text-muted-foreground">
          All content on PlankMarket, including logos, trademarks, text, graphics, and software, is the property of PlankMarket or its licensors and is protected by copyright and intellectual property laws. You may not copy, modify, distribute, or create derivative works without our express written permission.
        </p>
      ),
    },
    {
      icon: Ban,
      number: "17",
      title: "Termination",
      content: (
        <p className="text-sm text-muted-foreground">
          We reserve the right to suspend or terminate your account at any time for violations of these Terms of Service or for any other reason at our sole discretion. Upon termination, your right to use the platform will immediately cease, and we may delete your account and associated data.
        </p>
      ),
    },
    {
      icon: RefreshCw,
      number: "18",
      title: "Changes to Terms",
      content: (
        <p className="text-sm text-muted-foreground">
          We reserve the right to modify these Terms of Service at any time. Changes will be effective immediately upon posting. Your continued use of PlankMarket after changes are posted constitutes acceptance of the modified terms. We encourage you to review these terms periodically.
        </p>
      ),
    },
    {
      icon: MapPin,
      number: "19",
      title: "Governing Law",
      content: (
        <p className="text-sm text-muted-foreground">
          These Terms of Service shall be governed by and construed in accordance with the laws of the State of Wyoming, without regard to its conflict of law provisions. Any disputes arising from these terms shall be subject to the exclusive jurisdiction of the courts located in Wyoming.
        </p>
      ),
    },
    {
      icon: Mail,
      number: "20",
      title: "Contact Information",
      content: (
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            PlankMarket is operated by ABM Studios LLC, a Wyoming limited liability company.
          </p>
          <p>
            If you have questions about these Terms of Service, please contact us at{" "}
            <a href="mailto:legal@plankmarket.com" className="text-primary hover:underline font-medium">
              legal@plankmarket.com
            </a>
            .
          </p>
        </div>
      ),
    },
  ];

  return (
    <>
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary/5 to-background py-[40px] sm:py-16">
        <div className="absolute top-20 left-10 w-72 h-72 bg-accent/10 rounded-full blur-3xl" />
        <div className="absolute bottom-10 right-10 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />

        <div className="container mx-auto px-[16px] relative z-10">
          <div className="mx-auto max-w-3xl text-center">
            <Badge className="mb-4 border-transparent bg-amber-100 text-amber-800">
              Legal
            </Badge>
            <h1 className="font-display text-4xl tracking-tight sm:text-5xl">
              Terms of Service
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
              Please read these terms carefully before using PlankMarket. By accessing our platform, you agree to be bound by these terms.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              Last Updated: March 1, 2026
            </p>
          </div>
        </div>
      </section>

      {/* Sections */}
      <section className="py-10 sm:py-16">
        <div className="container mx-auto px-[16px]">
          <div className="max-w-3xl mx-auto space-y-4">
            <details className="mb-6 border-y border-border py-2">
              <summary id="terms-contents" className="min-h-11 cursor-pointer scroll-mt-28 py-3 font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
                On this page
              </summary>
              <nav aria-label="Terms of service sections">
                <ol className="grid gap-x-4 pb-3 sm:grid-cols-2">
                  {sections.map((section) => (
                    <li key={section.number} className="min-w-0">
                      <a href={"#terms-section-" + section.number} className="block min-h-11 py-3 text-sm text-primary underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
                        {section.number}. {section.title}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            </details>
            {sections.map((section) => (
              <Card key={section.number}>
                <CardHeader className="flex-row items-start gap-[12px] space-y-0 p-[16px] pb-[12px]">
                  <div aria-hidden="true" className="hidden h-[32px] w-[32px] shrink-0 items-center justify-center rounded-full bg-primary/10 sm:flex">
                    <section.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h2 id={"terms-section-" + section.number} tabIndex={-1} className="min-w-0 scroll-mt-28 font-display text-lg leading-snug">
                    {section.number}. {section.title}
                  </h2>
                </CardHeader>
                <CardContent className="px-[16px] pb-[16px] pt-0">
                  {section.content}
                  <a href="#terms-contents" className="mt-4 inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
                    Return to contents
                  </a>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-[16px]">
          <div className="max-w-3xl mx-auto text-center">
            <Separator className="mb-8" />
            <div className="flex items-center justify-center gap-2 mb-4">
              <Gavel className="h-5 w-5 text-primary" />
              <h2 className="font-display text-xl">Related Policies</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              Please also review our other policies that govern your use of PlankMarket.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button asChild variant="outline" className="h-auto min-h-11 whitespace-normal">
                <Link href="/privacy">
                  Privacy Policy <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-auto min-h-11 whitespace-normal">
                <Link href="/contact">
                  Contact Us <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
