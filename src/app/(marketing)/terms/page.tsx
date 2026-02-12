import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function TermsOfServicePage() {
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
        <h1>Terms of Service</h1>
        <p className="text-muted-foreground">
          Last Updated: January 1, 2025
        </p>

        <h2>1. Acceptance of Terms</h2>
        <p>
          By accessing or using PlankMarket, you agree to be bound by these
          Terms of Service and all applicable laws and regulations. If you do
          not agree with any of these terms, you are prohibited from using or
          accessing this site.
        </p>

        <h2>2. Eligibility</h2>
        <p>
          You must be at least 18 years old and have the legal capacity to
          enter into contracts to use PlankMarket. By registering an account,
          you represent and warrant that you meet these eligibility
          requirements. You also represent that you are acting on behalf of a
          legitimate business entity with authority to bind that entity to
          these terms.
        </p>

        <h2>3. User Accounts</h2>
        <p>
          You are responsible for maintaining the confidentiality of your
          account credentials and for all activities that occur under your
          account. You must:
        </p>
        <ul>
          <li>Provide accurate and complete registration information</li>
          <li>Keep your account information up to date</li>
          <li>Notify us immediately of any unauthorized use of your account</li>
          <li>Not share your account credentials with others</li>
          <li>Not create multiple accounts for fraudulent purposes</li>
        </ul>

        <h2>4. Listings and Product Information</h2>
        <p>
          Sellers are responsible for the accuracy and completeness of all
          listing information, including product descriptions, specifications,
          quantities, condition, and pricing. Sellers warrant that:
        </p>
        <ul>
          <li>They have legal ownership or authorization to sell listed items</li>
          <li>All product information is accurate and not misleading</li>
          <li>Listed products comply with all applicable laws and regulations</li>
          <li>Product images accurately represent the actual items for sale</li>
          <li>They will honor the terms and pricing stated in their listings</li>
        </ul>

        <h2>5. Transactions and Payment</h2>
        <p>
          All transactions on PlankMarket are contracts between buyers and
          sellers. PlankMarket acts as a marketplace platform and is not a
          party to these transactions. Payment processing is handled through our
          secure third-party payment processor. By making a purchase, you
          authorize us to charge the total amount including applicable fees.
        </p>

        <h2>6. Fees and Pricing</h2>
        <p>
          PlankMarket charges the following fees:
        </p>
        <ul>
          <li>Buyer fee: 3% of the transaction value</li>
          <li>Seller fee: As stated in the seller agreement</li>
          <li>Payment processing fees as applicable</li>
        </ul>
        <p>
          All fees are subject to change with 30 days notice. Fees are
          non-refundable except as required by law or as explicitly stated in
          our refund policy.
        </p>

        <h2>7. Prohibited Items and Conduct</h2>
        <p>
          The following items and activities are strictly prohibited:
        </p>
        <ul>
          <li>Counterfeit or illegally obtained goods</li>
          <li>Products that violate intellectual property rights</li>
          <li>Hazardous materials not properly classified and documented</li>
          <li>Stolen property or property obtained through fraud</li>
          <li>Items that violate local, state, or federal laws</li>
          <li>Fraudulent listings or deceptive practices</li>
          <li>Harassment, threats, or abusive behavior toward other users</li>
          <li>Attempts to circumvent platform fees or payment systems</li>
        </ul>

        <h2>8. Disputes and Resolution</h2>
        <p>
          In the event of a dispute between buyers and sellers, parties should
          first attempt to resolve the issue directly. If resolution cannot be
          reached, either party may contact PlankMarket support for assistance.
          We reserve the right to mediate disputes and make final decisions
          regarding refunds, cancellations, and account actions.
        </p>

        <h2>9. Limitation of Liability</h2>
        <p>
          PlankMarket provides the platform on an "as is" and "as available"
          basis. We make no warranties, express or implied, regarding the
          quality, accuracy, or availability of products listed on our platform.
          To the fullest extent permitted by law, PlankMarket shall not be
          liable for:
        </p>
        <ul>
          <li>Any indirect, incidental, special, or consequential damages</li>
          <li>Loss of profits, revenue, data, or business opportunities</li>
          <li>Product quality, delivery, or post-sale issues</li>
          <li>Actions or omissions of buyers or sellers on the platform</li>
          <li>Unauthorized access to or alteration of your data</li>
        </ul>
        <p>
          Our total liability shall not exceed the fees paid by you to
          PlankMarket in the 12 months preceding the claim.
        </p>

        <h2>10. Intellectual Property</h2>
        <p>
          All content on PlankMarket, including logos, trademarks, text,
          graphics, and software, is the property of PlankMarket or its
          licensors and is protected by copyright and intellectual property
          laws. You may not copy, modify, distribute, or create derivative
          works without our express written permission.
        </p>

        <h2>11. Termination</h2>
        <p>
          We reserve the right to suspend or terminate your account at any time
          for violations of these Terms of Service or for any other reason at
          our sole discretion. Upon termination, your right to use the platform
          will immediately cease, and we may delete your account and associated
          data.
        </p>

        <h2>12. Changes to Terms</h2>
        <p>
          We reserve the right to modify these Terms of Service at any time.
          Changes will be effective immediately upon posting to the website. Your
          continued use of PlankMarket after changes are posted constitutes
          acceptance of the modified terms. We encourage you to review these
          terms periodically.
        </p>

        <h2>13. Governing Law</h2>
        <p>
          These Terms of Service shall be governed by and construed in
          accordance with the laws of the State of Delaware, without regard to
          its conflict of law provisions. Any disputes arising from these terms
          shall be subject to the exclusive jurisdiction of the courts located
          in Delaware.
        </p>

        <h2>14. Contact Information</h2>
        <p>
          If you have questions about these Terms of Service, please contact us
          at:
        </p>
        <p>
          Email: <a href="mailto:legal@plankmarket.com">legal@plankmarket.com</a>
          <br />
          Address: PlankMarket Legal Department
        </p>
      </article>
    </div>
  );
}
