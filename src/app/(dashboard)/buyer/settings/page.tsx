"use client";

import Link from "next/link";
import { ProfileSettingsForm } from "@/components/dashboard/profile-settings-form";
import { StartSellingEntry } from "@/components/seller-activation/start-selling-entry";
import { QueryErrorState } from "@/components/ui/state-panel";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createShippingAddressSchema,
  type CreateShippingAddressInput,
} from "@/lib/validators/shipping-address";
import { trpc } from "@/lib/trpc/client";
import { useAuthStore } from "@/lib/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Star } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export default function BuyerSettingsPage() {
  const accountId = useAuthStore((state) => state.user?.id);
  if (!accountId) return <p role="status">Loading your account settings…</p>;
  return <BuyerSettingsAccount key={accountId} accountId={accountId} />;
}

function BuyerSettingsAccount({ accountId }: { accountId: string }) {
  const active = useRef(true);
  const addressWorking = useRef(false);
  const [addressBusy, setAddressBusy] = useState(false);
  const [createNeedsReview, setCreateNeedsReview] = useState(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const current = () => active.current && useAuthStore.getState().user?.id === accountId;
  const { user } = useAuthStore();
  const [showAddForm, setShowAddForm] = useState(false);
  const utils = trpc.useUtils();

  const addressesQuery = trpc.shippingAddress.list.useQuery();
  const { data: addresses, isLoading: addressesLoading } = addressesQuery;
  const createAddress = trpc.shippingAddress.create.useMutation({
    onSuccess: () => {
      if (!current()) return;
      void utils.shippingAddress.list.invalidate().catch(() => {});
      setShowAddForm(false);
      toast.success("Address saved");
    },
    onError: () => { if (current()) { setCreateNeedsReview(true); toast.error("Could not confirm the address save"); } },
  });
  const deleteAddress = trpc.shippingAddress.delete.useMutation({
    onSuccess: () => {
      if (!current()) return;
      void utils.shippingAddress.list.invalidate().catch(() => {});
      toast.success("Address deleted");
    },
    onError: () => { if (current()) toast.error("Failed to delete address"); },
  });
  const setDefaultAddress = trpc.shippingAddress.setDefault.useMutation({
    onSuccess: () => {
      if (!current()) return;
      void utils.shippingAddress.list.invalidate().catch(() => {});
      toast.success("Default address updated");
    },
    onError: () => { if (current()) toast.error("Failed to update default"); },
  });

  const {
    register: registerAddr,
    handleSubmit: handleSubmitAddr,
    reset: resetAddr,
    formState: { errors: addrErrors },
  } = useForm<CreateShippingAddressInput>({
    resolver: zodResolver(createShippingAddressSchema),
  });

  const onAddAddress = async (data: CreateShippingAddressInput) => {
    if (!current() || addressesQuery.isError || addressesLoading || !addresses || addresses.some(address => address.userId !== accountId) || addressWorking.current || createNeedsReview) return;
    addressWorking.current = true; setAddressBusy(true);
    try { await createAddress.mutateAsync(data); if (current()) resetAddr(); } catch { /* Keep the draft; require a saved-list review before another create. */ }
    finally { addressWorking.current = false; if (current()) setAddressBusy(false); }
  };

  async function changeAddress(kind: "delete" | "default", id: string) {
    if (!current() || addressWorking.current || addressesQuery.isError || !addresses?.some(address => address.id === id && address.userId === accountId)) return;
    addressWorking.current = true; setAddressBusy(true);
    try { if (kind === "delete") await deleteAddress.mutateAsync({ id }); else await setDefaultAddress.mutateAsync({ id }); }
    catch { /* Mutation callbacks present scoped feedback. */ }
    finally { addressWorking.current = false; if (current()) setAddressBusy(false); }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your buyer profile and business information
        </p>
      </div>

      <StartSellingEntry />
      <ProfileSettingsForm />

      <Card><CardHeader><CardTitle>Buyer Verification</CardTitle><CardDescription>View your business verification status and saved details.</CardDescription></CardHeader><CardContent><Link href="/buyer/verification" className="underline">View business verification</Link></CardContent></Card>

      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
          <CardDescription>
            Use an authenticator app for extra protection on sensitive account actions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Authenticator status</span>
            <span>
              {user?.assurance ? (user.assurance.hasVerifiedTotp ? "Configured" : "Not configured") : "Not checked"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Session security</span>
            <span className="text-right">
              {user?.assurance ? (user.assurance.currentLevel === "aal2" ? "Extra verification complete" : "Standard sign-in") : "Not checked"}
            </span>
          </div>
          <Button asChild variant="outline">
            <Link href="/mfa?intent=manage&next=/buyer/settings">
              Manage authenticator
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* Shipping Addresses */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Shipping Addresses</CardTitle>
              <CardDescription>
                Manage your saved shipping addresses for faster checkout
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowAddForm(!showAddForm);
              }}
            >
              <Plus className="mr-1 h-4 w-4" />
              Add Address
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {createNeedsReview && <div role="alert" className="space-y-2 text-sm"><p>We couldn’t confirm the address save. Check your saved addresses for this entry before trying again.</p><Button type="button" variant="outline" disabled={addressesQuery.isFetching || addressBusy} onClick={() => { void addressesQuery.refetch().then(result => { if (current() && !result.error && result.data?.every(address => address.userId === accountId)) setCreateNeedsReview(false); }); }}>Check saved addresses</Button></div>}
          {/* Add address form */}
          {showAddForm && (
            <form onSubmit={handleSubmitAddr(onAddAddress)} className="p-4 border rounded-lg bg-muted/30"><fieldset disabled={addressBusy} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="addr-label" className="text-xs">Label</Label>
                  <Input id="addr-label" placeholder="Home, Office, etc." {...registerAddr("label")} />
                  {addrErrors.label && <p className="text-xs text-destructive">{addrErrors.label.message}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="addr-name" className="text-xs">Full Name / Business</Label>
                  <Input id="addr-name" placeholder="Acme Flooring Co." {...registerAddr("name")} />
                  {addrErrors.name && <p className="text-xs text-destructive">{addrErrors.name.message}</p>}
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="addr-address" className="text-xs">Street Address</Label>
                <Input id="addr-address" placeholder="123 Main St" {...registerAddr("address")} />
                {addrErrors.address && <p className="text-xs text-destructive">{addrErrors.address.message}</p>}
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor="addr-city" className="text-xs">City</Label>
                  <Input id="addr-city" placeholder="Dallas" {...registerAddr("city")} />
                  {addrErrors.city && <p className="text-xs text-destructive">{addrErrors.city.message}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="addr-state" className="text-xs">State</Label>
                  <Input id="addr-state" placeholder="TX" maxLength={2} {...registerAddr("state")} />
                  {addrErrors.state && <p className="text-xs text-destructive">{addrErrors.state.message}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="addr-zip" className="text-xs">ZIP</Label>
                  <Input id="addr-zip" placeholder="75001" {...registerAddr("zip")} />
                  {addrErrors.zip && <p className="text-xs text-destructive">{addrErrors.zip.message}</p>}
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="addr-phone" className="text-xs">Phone (optional)</Label>
                <Input id="addr-phone" type="tel" placeholder="(555) 123-4567" {...registerAddr("phone")} />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="addr-default" {...registerAddr("isDefault")} className="rounded border-gray-300" />
                <Label htmlFor="addr-default" className="text-xs cursor-pointer">Set as default</Label>
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={addressBusy || createNeedsReview || addressesQuery.isError || addressesLoading || !addresses || addresses.some(address => address.userId !== accountId)}>
                  {createAddress.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                  Save Address
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddForm(false)}>
                  Cancel
                </Button>
              </div>
            </fieldset></form>
          )}

          {/* Address list */}
          {addressesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : addressesQuery.isError || !addresses || addresses.some(address => address.userId !== accountId) ? (
            <QueryErrorState title="Saved addresses unavailable" description="We couldn’t check your saved addresses. Your entered address is kept on this page." onRetry={() => void addressesQuery.refetch()} isRetrying={addressesQuery.isFetching} />
          ) : addresses.length > 0 ? (
            <div className="space-y-3">
              {addresses.map((addr) => (
                <div key={addr.id} className="flex items-start justify-between p-3 border rounded-lg">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{addr.label}</span>
                      {addr.isDefault && (
                        <Badge variant="secondary" className="text-xs">Default</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{addr.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {addr.address}, {addr.city}, {addr.state} {addr.zip}
                    </p>
                    {addr.phone && (
                      <p className="text-xs text-muted-foreground">{addr.phone}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {!addr.isDefault && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11"
                        onClick={() => void changeAddress("default", addr.id)}
                        aria-label={`Set ${addr.label} as default`}
                        disabled={addressBusy}
                        title="Set as default"
                      >
                        <Star className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11 text-destructive hover:text-destructive"
                      onClick={() => void changeAddress("delete", addr.id)}
                      aria-label={`Delete ${addr.label} address`}
                      disabled={addressBusy}
                      title="Delete address"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : !showAddForm ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No saved addresses yet. Addresses are automatically saved when you complete a checkout.
            </p>
          ) : null}
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
