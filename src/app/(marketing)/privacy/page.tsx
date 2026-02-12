import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPolicyPage() {
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
        <h1>Privacy Policy</h1>
        <p className="text-muted-foreground">
          Last Updated: January 1, 2025
        </p>

        <p>
          At PlankMarket, we take your privacy seriously. This Privacy Policy
          explains how we collect, use, disclose, and safeguard your information
          when you use our platform.
        </p>

        <h2>1. Information We Collect</h2>

        <h3>Information You Provide</h3>
        <p>
          We collect information that you voluntarily provide when you:
        </p>
        <ul>
          <li>Register for an account (name, email, business information, phone number)</li>
          <li>Create listings (product details, images, location)</li>
          <li>Make purchases or sales (billing information, shipping address)</li>
          <li>Communicate with us or other users (messages, support requests)</li>
          <li>Complete your profile (business details, preferences)</li>
        </ul>

        <h3>Automatically Collected Information</h3>
        <p>
          When you access PlankMarket, we automatically collect certain
          information, including:
        </p>
        <ul>
          <li>Device information (IP address, browser type, operating system)</li>
          <li>Usage data (pages viewed, time spent, click patterns)</li>
          <li>Location data (approximate geographic location based on IP address)</li>
          <li>Cookies and similar tracking technologies</li>
        </ul>

        <h3>Payment Information</h3>
        <p>
          Payment information is processed by our third-party payment processor.
          We do not store complete credit card numbers or sensitive payment data
          on our servers. We may store limited payment information such as the
          last four digits of your card and expiration date for reference
          purposes.
        </p>

        <h2>2. How We Use Your Information</h2>
        <p>
          We use the information we collect to:
        </p>
        <ul>
          <li>Provide, maintain, and improve our platform services</li>
          <li>Process transactions and send related information</li>
          <li>Send administrative information, updates, and security alerts</li>
          <li>Respond to your comments, questions, and support requests</li>
          <li>Monitor and analyze usage patterns and trends</li>
          <li>Detect, prevent, and address fraud and security issues</li>
          <li>Personalize your experience and show relevant listings</li>
          <li>Send marketing communications (with your consent)</li>
          <li>Comply with legal obligations and enforce our terms</li>
        </ul>

        <h2>3. Information Sharing and Disclosure</h2>
        <p>
          We may share your information in the following circumstances:
        </p>

        <h3>With Other Users</h3>
        <p>
          When you create a listing or make a purchase, certain information
          (such as your business name and location) may be visible to other
          users to facilitate transactions.
        </p>

        <h3>With Service Providers</h3>
        <p>
          We share information with third-party service providers who perform
          services on our behalf, including:
        </p>
        <ul>
          <li>Payment processing and fraud detection</li>
          <li>Cloud hosting and data storage</li>
          <li>Email delivery and communication services</li>
          <li>Analytics and performance monitoring</li>
          <li>Customer support tools</li>
        </ul>

        <h3>For Legal Reasons</h3>
        <p>
          We may disclose your information if required by law or if we believe
          such action is necessary to:
        </p>
        <ul>
          <li>Comply with legal obligations or respond to lawful requests</li>
          <li>Protect the rights, property, or safety of PlankMarket or others</li>
          <li>Investigate and prevent fraud or security issues</li>
          <li>Enforce our Terms of Service</li>
        </ul>

        <h3>Business Transfers</h3>
        <p>
          In the event of a merger, acquisition, or sale of assets, your
          information may be transferred to the acquiring entity. We will notify
          you of any such change in ownership or control of your information.
        </p>

        <h2>4. Data Security</h2>
        <p>
          We implement appropriate technical and organizational security measures
          to protect your information against unauthorized access, alteration,
          disclosure, or destruction. These measures include:
        </p>
        <ul>
          <li>Encryption of data in transit and at rest</li>
          <li>Regular security assessments and updates</li>
          <li>Access controls and authentication mechanisms</li>
          <li>Employee training on data protection practices</li>
        </ul>
        <p>
          However, no method of transmission over the internet or electronic
          storage is completely secure. While we strive to protect your
          information, we cannot guarantee absolute security.
        </p>

        <h2>5. Your Rights and Choices</h2>
        <p>
          You have certain rights regarding your personal information:
        </p>

        <h3>Access and Update</h3>
        <p>
          You can access and update your account information at any time through
          your account settings.
        </p>

        <h3>Data Portability</h3>
        <p>
          You have the right to request a copy of your personal information in a
          structured, machine-readable format.
        </p>

        <h3>Deletion</h3>
        <p>
          You may request deletion of your account and associated data. Note that
          we may retain certain information as required by law or for legitimate
          business purposes.
        </p>

        <h3>Marketing Communications</h3>
        <p>
          You can opt out of marketing emails by clicking the unsubscribe link in
          any marketing message or by updating your account preferences.
        </p>

        <h3>Do Not Track</h3>
        <p>
          Some browsers include a Do Not Track feature. Our platform does not
          currently respond to Do Not Track signals.
        </p>

        <h2>6. Cookies and Tracking Technologies</h2>
        <p>
          We use cookies and similar tracking technologies to:
        </p>
        <ul>
          <li>Keep you logged in to your account</li>
          <li>Remember your preferences and settings</li>
          <li>Analyze usage patterns and improve our platform</li>
          <li>Provide personalized content and advertising</li>
        </ul>
        <p>
          You can control cookies through your browser settings. Disabling
          cookies may affect the functionality of certain features on our
          platform.
        </p>

        <h2>7. Data Retention</h2>
        <p>
          We retain your information for as long as your account is active or as
          needed to provide services. After account deletion, we may retain
          certain information for:
        </p>
        <ul>
          <li>Legal and regulatory compliance</li>
          <li>Dispute resolution and fraud prevention</li>
          <li>Enforcing our agreements</li>
          <li>Backup and disaster recovery purposes</li>
        </ul>

        <h2>8. Children&apos;s Privacy</h2>
        <p>
          PlankMarket is not intended for users under the age of 18. We do not
          knowingly collect personal information from children. If we become
          aware that we have collected information from a child, we will take
          steps to delete such information promptly.
        </p>

        <h2>9. International Data Transfers</h2>
        <p>
          Your information may be transferred to and processed in countries other
          than your country of residence. These countries may have different data
          protection laws. By using PlankMarket, you consent to the transfer of
          your information to these countries.
        </p>

        <h2>10. Changes to This Privacy Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. We will notify you
          of any material changes by posting the new policy on this page and
          updating the &quot;Last Updated&quot; date. Your continued use of PlankMarket
          after changes are posted constitutes acceptance of the updated policy.
        </p>

        <h2>11. Contact Us</h2>
        <p>
          If you have questions or concerns about this Privacy Policy or our data
          practices, please contact us at:
        </p>
        <p>
          Email: <a href="mailto:privacy@plankmarket.com">privacy@plankmarket.com</a>
          <br />
          Address: PlankMarket Privacy Team
        </p>

        <h2>12. Additional Rights for California Residents</h2>
        <p>
          If you are a California resident, you have additional rights under the
          California Consumer Privacy Act (CCPA), including:
        </p>
        <ul>
          <li>The right to know what personal information we collect</li>
          <li>The right to delete your personal information</li>
          <li>The right to opt-out of the sale of personal information (we do not sell personal information)</li>
          <li>The right to non-discrimination for exercising your rights</li>
        </ul>
        <p>
          To exercise these rights, please contact us at the email address above.
        </p>
      </article>
    </div>
  );
}
