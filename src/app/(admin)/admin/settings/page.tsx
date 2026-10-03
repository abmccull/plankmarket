"use client";

import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/lib/stores/auth-store";
import { QueryErrorState } from "@/components/ui/state-panel";
import { trpc } from "@/lib/trpc/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
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
  ReceiptText,
  AlertTriangle,
} from "lucide-react";
import {
  basisPointsToPercent,
  CURRENT_COMMERCIAL_POLICY,
} from "@/lib/commercial-policy";

interface SettingsForm {
  buyerFeePercent: number;
  sellerFeePercent: number;
  listingExpiryDays: number;
  maxPhotosPerListing: number;
  platformName: string;
  supportEmail: string;
  escrowReleaseDays: number;
}

function deriveFormFromSettings(
  settings: Record<string, unknown> | undefined,
): SettingsForm {
  return {
    buyerFeePercent: (settings?.buyerFeePercent as number) ?? 5,
    sellerFeePercent: (settings?.sellerFeePercent as number) ?? 5,
    listingExpiryDays: (settings?.listingExpiryDays as number) ?? 90,
    maxPhotosPerListing: (settings?.maxPhotosPerListing as number) ?? 20,
    platformName: (settings?.platformName as string) ?? "PlankMarket",
    supportEmail:
      (settings?.supportEmail as string) ?? "support@plankmarket.com",
    escrowReleaseDays: (settings?.escrowReleaseDays as number) ?? 3,
  };
}

type MutableSettingKey = Exclude<
  keyof SettingsForm,
  "buyerFeePercent" | "sellerFeePercent"
>;
type SettingsDraft = Partial<Pick<SettingsForm, MutableSettingKey>>;

export default function AdminSettingsPage() {
  const { user } = useAuthStore();
  if (!user?.id) return <p role="status">Loading administrator account…</p>;
  return <AdminSettingsWorkspace key={user.id} ownerId={user.id} />;
}

function AdminSettingsWorkspace({ ownerId }: { ownerId: string }) {
  const settingsQuery = trpc.admin.getSettings.useQuery();
  const taxQuery = trpc.admin.getTaxReadiness.useQuery();
  const settings = settingsQuery.data;
  const taxReadiness = taxQuery.data;
  const utils = trpc.useUtils();
  const updateMutation = trpc.admin.updateSettings.useMutation();
  const [draft, setDraft] = useState<SettingsDraft>({});
  const [busy, setBusy] = useState(false);
  const [readFailed, setReadFailed] = useState(false);
  const [requiresReview, setRequiresReview] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const pending = useRef(false);
  const acceptedKeys = useRef<MutableSettingKey[]>([]);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const isCurrent = () =>
    mounted.current && useAuthStore.getState().user?.id === ownerId;
  const form = settings
    ? { ...deriveFormFromSettings(settings), ...draft }
    : null;
  const isDirty = Object.keys(draft).length > 0;
  const canEdit =
    !!form &&
    !busy &&
    !settingsQuery.isFetching &&
    !settingsQuery.isError &&
    !readFailed &&
    !requiresReview;

  const handleChange = (key: MutableSettingKey, value: string | number) => {
    if (!canEdit || !isCurrent()) return;
    setDraft((current) => ({ ...current, [key]: value }));
  };

  // A current, explicit read reconciles the patch without discarding unsaved fields.
  const readSavedSettings = async () => {
    await utils.admin.getSettings.cancel();
    if (!isCurrent()) return;
    const fresh = await utils.client.admin.getSettings.query();
    if (!isCurrent()) return;
    await utils.admin.getSettings.cancel();
    if (!isCurrent()) return;
    utils.admin.getSettings.setData(undefined, fresh);
    const saved = deriveFormFromSettings(fresh);
    const confirmed = acceptedKeys.current;
    acceptedKeys.current = [];
    setDraft(
      (current) =>
        Object.fromEntries(
          Object.entries(current).filter(
            ([key, value]) =>
              !confirmed.includes(key as MutableSettingKey) &&
              saved[key as MutableSettingKey] !== value,
          ),
        ) as SettingsDraft,
    );
    setReadFailed(false);
    setRequiresReview(false);
    setProblem(null);
  };

  const handleRefresh = async () => {
    if (pending.current || !isCurrent()) return;
    pending.current = true;
    setBusy(true);
    try {
      await readSavedSettings();
    } catch {
      if (isCurrent()) setReadFailed(true);
    } finally {
      pending.current = false;
      if (isCurrent()) setBusy(false);
    }
  };

  const handleSave = async () => {
    if (pending.current || !canEdit || !isDirty || !isCurrent()) return;
    const submitted = Object.entries(draft).map(([key, value]) => ({
      key: key as MutableSettingKey,
      value,
    }));
    pending.current = true;
    setBusy(true);
    setNotice(null);
    setProblem(null);
    let accepted = false;
    try {
      await utils.admin.getSettings.cancel();
      if (!isCurrent()) return;
      await updateMutation.mutateAsync(submitted);
      if (!isCurrent()) return;
      accepted = true;
      acceptedKeys.current = submitted.map((item) => item.key);
      setNotice("Settings saved.");
      setRequiresReview(true);
      await readSavedSettings();
    } catch (error) {
      if (!isCurrent()) return;
      if (accepted) {
        setReadFailed(true);
      } else {
        const code = (error as { data?: { code?: string } } | null)?.data?.code;
        const rejected =
          code === "BAD_REQUEST" ||
          code === "FORBIDDEN" ||
          code === "UNAUTHORIZED";
        setRequiresReview(!rejected);
        setProblem(
          rejected
            ? getErrorMessage(error)
            : "Save result unconfirmed. Refresh saved settings before trying again.",
        );
      }
    } finally {
      pending.current = false;
      if (isCurrent()) setBusy(false);
    }
  };

  if (settingsQuery.isLoading) {
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

  if (!form)
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Platform Settings</h1>
        <QueryErrorState
          title="Settings unavailable"
          description="Saved settings are unknown. Load them before making changes."
          onRetry={() => void handleRefresh()}
          isRetrying={busy || settingsQuery.isFetching}
        />
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Platform Settings</h1>
          <p className="text-muted-foreground mt-1">
            Platform configuration and fee structure
          </p>
        </div>
        <div className="flex max-w-full flex-wrap gap-2">
          <Button
            variant="outline"
            className="h-auto min-h-11 max-w-full whitespace-normal"
            onClick={() => void handleRefresh()}
            disabled={busy || settingsQuery.isFetching}
          >
            Refresh saved settings
          </Button>
          <Button
            className="h-auto min-h-11 max-w-full whitespace-normal"
            onClick={() => void handleSave()}
            disabled={!isDirty || !canEdit}
          >
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save Changes
          </Button>
        </div>
      </div>
      {notice && (
        <p role="status" className="rounded-md border p-3 text-sm">
          {notice}
        </p>
      )}
      {problem && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 p-3 text-sm"
        >
          {problem}
        </p>
      )}
      {(settingsQuery.isError || readFailed) && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 p-3 text-sm"
        >
          Saved settings could not be loaded.
        </p>
      )}

      {/* Fee Structure */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            <CardTitle>Fee Structure</CardTitle>
          </div>
          <CardDescription>
            Version {CURRENT_COMMERCIAL_POLICY.version} is immutable for every
            order that uses it. A pricing change requires a new policy version.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="buyerFeePercent">Buyer Fee (%)</Label>
              <Input
                id="buyerFeePercent"
                type="number"
                step="0.1"
                min="0"
                max="50"
                value={form.buyerFeePercent}
                disabled
                readOnly
              />
              <p className="text-xs text-muted-foreground">
                Fixed at{" "}
                {basisPointsToPercent(
                  CURRENT_COMMERCIAL_POLICY.buyerMarketplaceFeeBps,
                )}
                % of inventory subtotal only
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
                disabled
                readOnly
              />
              <p className="text-xs text-muted-foreground">
                Fixed at{" "}
                {basisPointsToPercent(
                  CURRENT_COMMERCIAL_POLICY.sellerMarketplaceFeeBps,
                )}
                % of inventory subtotal
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Stripe Processing</p>
              <p className="text-2xl font-bold">2.9% + $0.30</p>
              <p className="text-xs text-muted-foreground mt-1">
                Seller share applies to inventory subtotal only. Platform
                absorbs shipping-related processor cost.
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Freight markup</p>
              <p className="text-2xl font-bold">
                {basisPointsToPercent(
                  CURRENT_COMMERCIAL_POLICY.shippingMarkupBps,
                )}
                %
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Applied to the carrier rate and snapshotted with the order.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment Configuration */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ReceiptText className="h-5 w-5 text-primary" />
            <CardTitle>Sales-tax readiness</CardTitle>
          </div>
          <CardDescription>
            Configuration visibility only. The liability decision and approved
            tax codes are controlled deployment and review evidence, not
            editable fee settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {taxQuery.isLoading ? (
            <p role="status">Loading tax readiness…</p>
          ) : taxQuery.isError || !taxReadiness ? (
            <div role="alert" className="space-y-3">
              <p>Tax readiness unavailable</p>
              <p className="text-sm text-muted-foreground">
                Current policy acknowledgments and listing counts could not be
                checked.
              </p>
              <Button
                variant="outline"
                className="h-auto min-h-11 whitespace-normal"
                disabled={taxQuery.isFetching}
                onClick={() => void taxQuery.refetch()}
              >
                Retry tax readiness
              </Button>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground">
                    Liability mode
                  </p>
                  <p className="mt-1 font-medium">
                    {taxReadiness?.policy.mode ?? "Unavailable"}
                  </p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground">
                    Policy version
                  </p>
                  <p className="mt-1 font-medium">
                    {taxReadiness?.policy.version ?? "—"}
                  </p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground">
                    Legal decision acknowledged
                  </p>
                  <Badge
                    className="mt-1"
                    variant={
                      taxReadiness?.policy.legalDecisionAcknowledged
                        ? "success"
                        : "destructive"
                    }
                  >
                    {taxReadiness?.policy.legalDecisionAcknowledged
                      ? "Acknowledged"
                      : "Not acknowledged"}
                  </Badge>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground">
                    Active listing tax codes
                  </p>
                  <p className="mt-1 font-medium">
                    {taxReadiness?.listings.verifiedTaxCode ?? 0} verified /{" "}
                    {taxReadiness?.listings.active ?? 0} active
                  </p>
                </div>
              </div>
              {taxReadiness?.configurationIssues &&
                taxReadiness.configurationIssues.length > 0 && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                    <div className="flex items-center gap-2 font-medium">
                      <AlertTriangle className="h-4 w-4" />
                      Production tax gates remain
                    </div>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                      {taxReadiness.configurationIssues.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  </div>
                )}
            </>
          )}
          <p className="text-xs text-muted-foreground">
            Checkout verifies the listing code, buyer and ship-from addresses,
            and the active Stripe registration in the selected liability
            context. A zero-dollar tax result is accepted only as a persisted
            provider calculation with jurisdiction evidence.
          </p>
        </CardContent>
      </Card>

      {/* Payment Configuration */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            <CardTitle>Payment Configuration</CardTitle>
          </div>
          <CardDescription>Stripe Connect and payout settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium">Payment Processor</p>
              <p className="text-xs text-muted-foreground">
                Primary payment gateway
              </p>
            </div>
            <Badge variant="success">Stripe Connect</Badge>
          </div>
          <Separator />
          <div className="flex flex-wrap items-center justify-between gap-3 py-2">
            <div className="min-w-0 flex-1">
              <Label htmlFor="escrowReleaseDays">
                Payment release delay (days after carrier pickup)
              </Label>
              <p className="text-xs text-muted-foreground">
                Review window before transferring held payment funds to the
                seller
              </p>
            </div>
            <Input
              id="escrowReleaseDays"
              disabled={!canEdit}
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
              <p className="text-xs text-muted-foreground">
                Cards and bank transfers
              </p>
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
                disabled={!canEdit}
                value={form.platformName}
                onChange={(e) => handleChange("platformName", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supportEmail">Support Email</Label>
              <Input
                id="supportEmail"
                disabled={!canEdit}
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
            <div className="flex flex-wrap items-center justify-between gap-3 py-1">
              <Label htmlFor="maxPhotosPerListing" className="text-sm">
                Max Photos per Listing
              </Label>
              <Input
                id="maxPhotosPerListing"
                disabled={!canEdit}
                type="number"
                min="1"
                max="50"
                className="w-20"
                value={form.maxPhotosPerListing}
                onChange={(e) =>
                  handleChange(
                    "maxPhotosPerListing",
                    parseInt(e.target.value) || 20,
                  )
                }
              />
            </div>
            <Separator />
            <div className="flex flex-wrap items-center justify-between gap-3 py-1">
              <Label htmlFor="listingExpiryDays" className="text-sm">
                Listing Expiry (days)
              </Label>
              <Input
                id="listingExpiryDays"
                disabled={!canEdit}
                type="number"
                min="1"
                max="365"
                className="w-20"
                value={form.listingExpiryDays}
                onChange={(e) =>
                  handleChange(
                    "listingExpiryDays",
                    parseInt(e.target.value) || 90,
                  )
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
              <span className="text-sm font-medium">State of Wyoming</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between py-1">
              <p className="text-sm">Legal Entity</p>
              <span className="text-sm font-medium">
                ABM Studios LLC (Wyoming)
              </span>
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
