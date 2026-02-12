"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  DollarSign,
  CreditCard,
  Mail,
  Globe,
  Shield,
  Clock,
  Server,
  FileText,
} from "lucide-react";

export default function AdminSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Platform Settings</h1>
        <p className="text-muted-foreground mt-1">
          Platform configuration and fee structure
        </p>
      </div>

      {/* Fee Structure */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            <CardTitle>Fee Structure</CardTitle>
          </div>
          <CardDescription>
            Commission and transaction fee configuration
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Buyer Fee</p>
              <p className="text-2xl font-bold">3%</p>
              <p className="text-xs text-muted-foreground mt-1">
                Applied to transaction value
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Seller Fee</p>
              <p className="text-2xl font-bold">2%</p>
              <p className="text-xs text-muted-foreground mt-1">
                Deducted from seller payout
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Stripe Processing</p>
              <p className="text-2xl font-bold">2.9% + $0.30</p>
              <p className="text-xs text-muted-foreground mt-1">
                Standard card processing fee
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment Configuration */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            <CardTitle>Payment Configuration</CardTitle>
          </div>
          <CardDescription>
            Stripe Connect and payout settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium">Payment Processor</p>
              <p className="text-xs text-muted-foreground">Primary payment gateway</p>
            </div>
            <Badge variant="success">Stripe Connect</Badge>
          </div>
          <Separator />
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium">Payout Schedule</p>
              <p className="text-xs text-muted-foreground">After buyer confirms receipt</p>
            </div>
            <span className="text-sm font-medium">3-5 business days</span>
          </div>
          <Separator />
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium">Escrow Protection</p>
              <p className="text-xs text-muted-foreground">Funds held until delivery confirmation</p>
            </div>
            <Badge variant="success">Enabled</Badge>
          </div>
          <Separator />
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium">Accepted Payment Methods</p>
              <p className="text-xs text-muted-foreground">Cards and bank transfers</p>
            </div>
            <span className="text-sm font-medium">Credit/Debit, ACH</span>
          </div>
        </CardContent>
      </Card>

      {/* Platform Contacts */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            <CardTitle>Contact Addresses</CardTitle>
          </div>
          <CardDescription>
            Platform email addresses displayed to users
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { label: "General Support", email: "support@plankmarket.com" },
            { label: "Partnerships", email: "partnerships@plankmarket.com" },
            { label: "Privacy Inquiries", email: "privacy@plankmarket.com" },
            { label: "Legal", email: "legal@plankmarket.com" },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between py-2">
              <p className="text-sm font-medium">{item.label}</p>
              <a
                href={`mailto:${item.email}`}
                className="text-sm text-primary hover:underline"
              >
                {item.email}
              </a>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Verification Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Seller Verification</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between py-1">
              <p className="text-sm">Verification Required</p>
              <Badge variant="success">Yes</Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between py-1">
              <p className="text-sm">Review Time SLA</p>
              <span className="text-sm font-medium">1-3 business days</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between py-1">
              <p className="text-sm">Required Documents</p>
              <span className="text-sm font-medium">Business license, EIN</span>
            </div>
          </CardContent>
        </Card>

        {/* Listing Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Listing Configuration</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between py-1">
              <p className="text-sm">Max Photos per Listing</p>
              <span className="text-sm font-medium">20</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between py-1">
              <p className="text-sm">Listing Expiry</p>
              <span className="text-sm font-medium">90 days</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between py-1">
              <p className="text-sm">Material Categories</p>
              <span className="text-sm font-medium">6 types</span>
            </div>
          </CardContent>
        </Card>

        {/* Support Hours */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Support Hours</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between py-1">
              <p className="text-sm">Monday - Friday</p>
              <span className="text-sm font-medium">9:00 AM - 6:00 PM ET</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between py-1">
              <p className="text-sm">Response SLA</p>
              <span className="text-sm font-medium">24 hours</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between py-1">
              <p className="text-sm">Weekend Support</p>
              <Badge variant="outline">Closed</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Platform Info */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Server className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Platform Info</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between py-1">
              <p className="text-sm">Coverage</p>
              <span className="text-sm font-medium">All 50 US States</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between py-1">
              <p className="text-sm">Governing Law</p>
              <span className="text-sm font-medium">State of Delaware</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between py-1">
              <p className="text-sm">Marketplace Type</p>
              <Badge>
                <Globe className="h-3 w-3 mr-1" />
                B2B
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
