"use client";

import { useReducer } from "react";
import { trpc } from "@/lib/trpc/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";
import {
  DollarSign,
  CreditCard,
  Globe,
  Shield,
  Clock,
  Server,
  FileText,
  Loader2,
  Save,
} from "lucide-react";

interface SettingsForm {
  buyerFeePercent: number;
  sellerFeePercent: number;
  listingExpiryDays: number;
  maxPhotosPerListing: number;
  platformName: string;
  supportEmail: string;
  escrowReleaseDays: number;
}

type FormAction =
  | { type: "SET_FIELD"; key: keyof SettingsForm; value: string | number }
  | { type: "RESET" };

function formReducer(state: { form: SettingsForm; isDirty: boolean }, action: FormAction) {
  switch (action.type) {
    case "SET_FIELD":
      return {
        form: { ...state.form, [action.key]: action.value },
        isDirty: true,
      };
    case "RESET":
      return { form: state.form, isDirty: false };
    default:
      return state;
  }
}

function deriveFormFromSettings(settings: Record<string, unknown> | undefined): SettingsForm {
  return {
    buyerFeePercent: (settings?.buyerFeePercent as number) ?? 3,
    sellerFeePercent: (settings?.sellerFeePercent as number) ?? 2,
    listingExpiryDays: (settings?.listingExpiryDays as number) ?? 90,
    maxPhotosPerListing: (settings?.maxPhotosPerListing as number) ?? 20,
    platformName: (settings?.platformName as string) ?? "PlankMarket",
    supportEmail: (settings?.supportEmail as string) ?? "support@plankmarket.com",
    escrowReleaseDays: (settings?.escrowReleaseDays as number) ?? 3,
  };
}

export default function AdminSettingsPage() {
  const { data: settings, isLoading } = trpc.admin.getSettings.useQuery();
  const utils = trpc.useUtils();

  const initialForm = deriveFormFromSettings(settings);
  const [state, dispatch] = useReducer(formReducer, {
    form: initialForm,
    isDirty: false,
  });

  // Derive the effective form values: use edited values if dirty, otherwise use server data
  const form = state.isDirty ? state.form : deriveFormFromSettings(settings);
  const isDirty = state.isDirty;

  const updateMutation = trpc.admin.updateSettings.useMutation({
    onSuccess: () => {
      toast.success("Settings saved successfully");
      dispatch({ type: "RESET" });
      utils.admin.getSettings.invalidate();
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
    },
  });

  const handleChange = (key: keyof SettingsForm, value: string | number) => {
    dispatch({ type: "SET_FIELD", key, value });
  };

  const handleSave = () => {
    const settingsArray = Object.entries(form).map(([key, value]) => ({
      key,
      value,
    }));
    updateMutation.mutate(settingsArray);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-6 w-72" />
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-40" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Platform Settings</h1>
          <p className="text-muted-foreground mt-1">
            Platform configuration and fee structure
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={!isDirty || updateMutation.isPending}
        >
          {updateMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save Changes
        </Button>
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
            <div className="space-y-2">
              <Label htmlFor="buyerFeePercent">Buyer Fee (%)</Label>
              <Input
                id="buyerFeePercent"
                type="number"
                step="0.1"
                min="0"
                max="50"
                value={form.buyerFeePercent}
                onChange={(e) =>
                  handleChange("buyerFeePercent", parseFloat(e.target.value) || 0)
                }
              />
              <p className="text-xs text-muted-foreground">
                Applied to transaction value, paid by buyer
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sellerFeePercent">Seller Fee (%)</Label>
              <Input
                id="sellerFeePercent"
                type="number"
                step="0.1"
                min="0"
                max="50"
                value={form.sellerFeePercent}
                onChange={(e) =>
                  handleChange("sellerFeePercent", parseFloat(e.target.value) || 0)
                }
              />
              <p className="text-xs text-muted-foreground">
                Deducted from seller payout
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Stripe Processing</p>
              <p className="text-2xl font-bold">2.9% + $0.30</p>
              <p className="text-xs text-muted-foreground mt-1">
                Standard card processing fee (not configurable)
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
            <div className="flex-1">
              <Label htmlFor="escrowReleaseDays">Escrow Release (days after delivery)</Label>
              <p className="text-xs text-muted-foreground">
                Wait time before auto-releasing escrow funds
              </p>
            </div>
            <Input
              id="escrowReleaseDays"
              type="number"
              min="1"
              max="30"
              className="w-24"
              value={form.escrowReleaseDays}
              onChange={(e) =>
                handleChange("escrowReleaseDays", parseInt(e.target.value) || 3)
              }
            />
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

      {/* Platform Info */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            <CardTitle>Platform Information</CardTitle>
          </div>
          <CardDescription>
            Platform name and contact configuration
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="platformName">Platform Name</Label>
              <Input
                id="platformName"
                value={form.platformName}
                onChange={(e) => handleChange("platformName", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supportEmail">Support Email</Label>
              <Input
                id="supportEmail"
                type="email"
                value={form.supportEmail}
                onChange={(e) => handleChange("supportEmail", e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
              <Label htmlFor="maxPhotosPerListing" className="text-sm">Max Photos per Listing</Label>
              <Input
                id="maxPhotosPerListing"
                type="number"
                min="1"
                max="50"
                className="w-20"
                value={form.maxPhotosPerListing}
                onChange={(e) =>
                  handleChange("maxPhotosPerListing", parseInt(e.target.value) || 20)
                }
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between py-1">
              <Label htmlFor="listingExpiryDays" className="text-sm">Listing Expiry (days)</Label>
              <Input
                id="listingExpiryDays"
                type="number"
                min="1"
                max="365"
                className="w-20"
                value={form.listingExpiryDays}
                onChange={(e) =>
                  handleChange("listingExpiryDays", parseInt(e.target.value) || 90)
                }
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between py-1">
              <p className="text-sm">Material Categories</p>
              <span className="text-sm font-medium">6 types</span>
            </div>
          </CardContent>
        </Card>

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
