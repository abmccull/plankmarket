import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
} from "lucide-react";

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
          You must be at least 18 years old and have the legal capacity to enter into contracts to use PlankMarket. By registering an account, you represent and warrant that you meet these eligibility requirements. You also represent that you are acting on behalf of a legitimate business entity with authority to bind that entity to these terms.
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
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Provide accurate and complete registration information</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Keep your account information up to date</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Notify us immediately of any unauthorized use of your account</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Not share your account credentials with others</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Not create multiple accounts for fraudulent purposes</li>
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
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>They have legal ownership or authorization to sell listed items</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>All product information is accurate and not misleading</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Listed products comply with all applicable laws and regulations</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Product images accurately represent the actual items for sale</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>They will honor the terms and pricing stated in their listings</li>
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
          All transactions on PlankMarket are contracts between buyers and sellers. PlankMarket acts as a marketplace platform and is not a party to these transactions. Payment processing is handled through our secure third-party payment processor. By making a purchase, you authorize us to charge the total amount including applicable fees.
        </p>
      ),
    },
    {
      icon: DollarSign,
      number: "6",
      title: "Fees and Pricing",
      content: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">PlankMarket charges the following fees:</p>
          <ul className="space-y-1.5 text-sm text-muted-foreground ml-4">
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Buyer fee: 3% of the transaction value</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Seller fee: As stated in the seller agreement</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Payment processing fees as applicable</li>
          </ul>
          <p className="text-sm text-muted-foreground">
            All fees are subject to change with 30 days notice. Fees are non-refundable except as required by law or as explicitly stated in our refund policy.
          </p>
        </div>
      ),
    },
    {
      icon: Ban,
      number: "7",
      title: "Prohibited Items and Conduct",
      content: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">The following items and activities are strictly prohibited:</p>
          <ul className="space-y-1.5 text-sm text-muted-foreground ml-4">
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Counterfeit or illegally obtained goods</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Products that violate intellectual property rights</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Hazardous materials not properly classified and documented</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Stolen property or property obtained through fraud</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Items that violate local, state, or federal laws</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Fraudulent listings or deceptive practices</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Harassment, threats, or abusive behavior toward other users</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Attempts to circumvent platform fees or payment systems</li>
          </ul>
        </div>
      ),
    },
    {
      icon: Scale,
      number: "8",
      title: "Disputes and Resolution",
      content: (
        <p className="text-sm text-muted-foreground">
          In the event of a dispute between buyers and sellers, parties should first attempt to resolve the issue directly. If resolution cannot be reached, either party may contact PlankMarket support for assistance. We reserve the right to mediate disputes and make final decisions regarding refunds, cancellations, and account actions.
        </p>
      ),
    },
    {
      icon: AlertTriangle,
      number: "9",
      title: "Limitation of Liability",
      content: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            PlankMarket provides the platform on an &quot;as is&quot; and &quot;as available&quot; basis. We make no warranties, express or implied, regarding the quality, accuracy, or availability of products listed. To the fullest extent permitted by law, PlankMarket shall not be liable for:
          </p>
          <ul className="space-y-1.5 text-sm text-muted-foreground ml-4">
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Any indirect, incidental, special, or consequential damages</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Loss of profits, revenue, data, or business opportunities</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Product quality, delivery, or post-sale issues</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Actions or omissions of buyers or sellers on the platform</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Unauthorized access to or alteration of your data</li>
          </ul>
          <p className="text-sm text-muted-foreground">
            Our total liability shall not exceed the fees paid by you to PlankMarket in the 12 months preceding the claim.
          </p>
        </div>
      ),
    },
    {
      icon: BookOpen,
      number: "10",
      title: "Intellectual Property",
      content: (
        <p className="text-sm text-muted-foreground">
          All content on PlankMarket, including logos, trademarks, text, graphics, and software, is the property of PlankMarket or its licensors and is protected by copyright and intellectual property laws. You may not copy, modify, distribute, or create derivative works without our express written permission.
        </p>
      ),
    },
    {
      icon: Ban,
      number: "11",
      title: "Termination",
      content: (
        <p className="text-sm text-muted-foreground">
          We reserve the right to suspend or terminate your account at any time for violations of these Terms of Service or for any other reason at our sole discretion. Upon termination, your right to use the platform will immediately cease, and we may delete your account and associated data.
        </p>
      ),
    },
    {
      icon: RefreshCw,
      number: "12",
      title: "Changes to Terms",
      content: (
        <p className="text-sm text-muted-foreground">
          We reserve the right to modify these Terms of Service at any time. Changes will be effective immediately upon posting. Your continued use of PlankMarket after changes are posted constitutes acceptance of the modified terms. We encourage you to review these terms periodically.
        </p>
      ),
    },
    {
      icon: MapPin,
      number: "13",
      title: "Governing Law",
      content: (
        <p className="text-sm text-muted-foreground">
          These Terms of Service shall be governed by and construed in accordance with the laws of the State of Delaware, without regard to its conflict of law provisions. Any disputes arising from these terms shall be subject to the exclusive jurisdiction of the courts located in Delaware.
        </p>
      ),
    },
    {
      icon: Mail,
      number: "14",
      title: "Contact Information",
      content: (
        <p className="text-sm text-muted-foreground">
          If you have questions about these Terms of Service, please contact us at{" "}
          <a href="mailto:legal@plankmarket.com" className="text-primary hover:underline font-medium">
            legal@plankmarket.com
          </a>
        </p>
      ),
    },
  ];

  return (
    <>
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary/5 to-background py-20">
        <div className="absolute top-20 left-10 w-72 h-72 bg-accent/10 rounded-full blur-3xl" />
        <div className="absolute bottom-10 right-10 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />

        <div className="container mx-auto px-4 relative z-10">
          <div className="mx-auto max-w-3xl text-center">
            <Badge className="mb-4 border-transparent bg-amber-100 text-amber-800">
              Legal
            </Badge>
            <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
              Terms of Service
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
              Please read these terms carefully before using PlankMarket. By accessing our platform, you agree to be bound by these terms.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              Last Updated: January 1, 2025
            </p>
          </div>
        </div>
      </section>

      {/* Sections */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto space-y-4">
            {sections.map((section) => (
              <Card key={section.number}>
                <CardHeader className="flex-row items-start gap-4 pb-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center shrink-0">
                    <section.icon className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle className="text-lg font-display pt-1.5">
                    {section.number}. {section.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pl-[4.5rem]">
                  {section.content}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <Separator className="mb-8" />
            <div className="flex items-center justify-center gap-2 mb-4">
              <Gavel className="h-5 w-5 text-primary" />
              <h2 className="font-display text-xl font-bold">Related Policies</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              Please also review our other policies that govern your use of PlankMarket.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/privacy">
                <Button variant="outline">
                  Privacy Policy <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link href="/contact">
                <Button variant="outline">
                  Contact Us <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
