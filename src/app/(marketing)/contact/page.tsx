import { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Contact Us",
};

export default function ContactPage() {
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
        <h1>Contact Us</h1>
        <p className="text-muted-foreground">
          We are here to help. Reach out to the PlankMarket team with questions, feedback, or partnership inquiries.
        </p>

        <h2>General Support</h2>
        <p>
          For questions about your account, listings, orders, or general platform support, please contact:
        </p>
        <p>
          <a href="mailto:support@plankmarket.com">support@plankmarket.com</a>
        </p>
        <p>
          Our support team typically responds within 24 hours during business days.
        </p>

        <h2>Business Inquiries</h2>
        <p>
          For partnership opportunities, volume seller arrangements, or business development inquiries, please contact:
        </p>
        <p>
          <a href="mailto:partnerships@plankmarket.com">partnerships@plankmarket.com</a>
        </p>

        <h2>Platform Messaging</h2>
        <p>
          Once you have registered for an account, you can also reach our support team through the built-in messaging system in your dashboard. This is often the fastest way to get help with account-specific questions or order issues.
        </p>

        <h2>Frequently Asked Questions</h2>
        <p>
          Before reaching out, you may find answers to common questions in our help resources:
        </p>
        <ul>
          <li><Link href="/how-it-works">How It Works</Link> - Learn about the buying and selling process</li>
          <li><Link href="/seller-guide">Seller Guide</Link> - Detailed information for sellers</li>
          <li><Link href="/pricing">Pricing & Fees</Link> - Understand our fee structure</li>
          <li><Link href="/privacy">Privacy Policy</Link> - How we handle your data</li>
          <li><Link href="/terms">Terms of Service</Link> - Platform rules and policies</li>
        </ul>

        <h2>Seller Verification</h2>
        <p>
          If you have questions about the seller verification process or need assistance with your verification documents, please email <a href="mailto:support@plankmarket.com">support@plankmarket.com</a> with &quot;Seller Verification&quot; in the subject line.
        </p>

        <h2>Payment & Billing</h2>
        <p>
          For questions about payments, payouts, or billing issues, contact <a href="mailto:support@plankmarket.com">support@plankmarket.com</a>. Please include your account email and any relevant order or transaction numbers.
        </p>

        <h2>Technical Issues</h2>
        <p>
          If you are experiencing technical difficulties with the platform, please report the issue to <a href="mailto:support@plankmarket.com">support@plankmarket.com</a> and include:
        </p>
        <ul>
          <li>A description of the issue</li>
          <li>What you were trying to do when the error occurred</li>
          <li>Your browser and operating system</li>
          <li>Screenshots if applicable</li>
        </ul>

        <h2>Feedback & Suggestions</h2>
        <p>
          We are always looking to improve PlankMarket. If you have feedback, feature requests, or suggestions for how we can serve you better, we want to hear from you. Send your ideas to <a href="mailto:support@plankmarket.com">support@plankmarket.com</a>.
        </p>

        <h2>Media Inquiries</h2>
        <p>
          For press inquiries or media requests, please contact <a href="mailto:partnerships@plankmarket.com">partnerships@plankmarket.com</a>.
        </p>

        <h2>Office Hours</h2>
        <p>
          Our support team is available Monday through Friday, 9:00 AM to 6:00 PM Eastern Time. While we strive to respond to all inquiries within 24 hours, response times may be longer during weekends and holidays.
        </p>

        <p>
          Thank you for choosing PlankMarket. We look forward to hearing from you.
        </p>
      </article>
    </div>
  );
}
