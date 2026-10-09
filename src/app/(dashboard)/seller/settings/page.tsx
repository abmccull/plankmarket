"use client";

import Link from "next/link";
import { ProfileSettingsForm } from "@/components/dashboard/profile-settings-form";
import { useAuthStore } from "@/lib/stores/auth-store";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function SellerSettingsPage() {
  const { user } = useAuthStore();


  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your seller profile and business information
        </p>
      </div>

      <ProfileSettingsForm />

      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
          <CardDescription>
            Protect payout and Stripe account-management actions with an authenticator app.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap justify-between gap-3">
            <span className="text-muted-foreground">Authenticator status</span>
            <span>
              {user?.assurance ? (user.assurance.hasVerifiedTotp ? "Configured" : "Not configured") : "Not checked"}
            </span>
          </div>
          <div className="flex flex-wrap justify-between gap-3">
            <span className="text-muted-foreground">Session security</span>
            <span className="text-right">
              {user?.assurance ? (user.assurance.currentLevel === "aal2" ? "Extra verification complete" : "Standard sign-in") : "Not checked"}
            </span>
          </div>
          <Button asChild variant="outline">
            <Link href="/mfa?intent=manage&next=/seller/settings">
              Manage authenticator
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex flex-wrap justify-between gap-3">
            <span className="text-muted-foreground">Email</span>
            <span className="min-w-0 break-all text-right">{user?.email}</span>
          </div>
          <div className="flex flex-wrap justify-between gap-3">
            <span className="text-muted-foreground">Role</span>
            <span className="capitalize">{user?.role}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
