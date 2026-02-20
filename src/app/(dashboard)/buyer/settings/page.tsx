"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { updateProfileSchema, type UpdateProfileInput } from "@/lib/validators/auth";
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
import { useState } from "react";

export default function BuyerSettingsPage() {
  const { user } = useAuthStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  const { data: profile } = trpc.auth.getProfile.useQuery();
  const updateProfile = trpc.auth.updateProfile.useMutation();

  const utils = trpc.useUtils();
  const { data: addresses, isLoading: addressesLoading } = trpc.shippingAddress.list.useQuery();
  const createAddress = trpc.shippingAddress.create.useMutation({
    onSuccess: () => {
      utils.shippingAddress.list.invalidate();
      setShowAddForm(false);
      toast.success("Address saved");
    },
    onError: () => toast.error("Failed to save address"),
  });
  const deleteAddress = trpc.shippingAddress.delete.useMutation({
    onSuccess: () => {
      utils.shippingAddress.list.invalidate();
      toast.success("Address deleted");
    },
    onError: () => toast.error("Failed to delete address"),
  });
  const setDefaultAddress = trpc.shippingAddress.setDefault.useMutation({
    onSuccess: () => {
      utils.shippingAddress.list.invalidate();
      toast.success("Default address updated");
    },
    onError: () => toast.error("Failed to update default"),
  });

  const {
    register,
    handleSubmit,
    formState: { },
  } = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    values: profile
      ? {
          name: profile.name,
          phone: profile.phone ?? undefined,
          businessName: profile.businessName ?? undefined,
          businessAddress: profile.businessAddress ?? undefined,
          businessCity: profile.businessCity ?? undefined,
          businessState: profile.businessState ?? undefined,
          businessZip: profile.businessZip ?? undefined,
        }
      : undefined,
  });

  const {
    register: registerAddr,
    handleSubmit: handleSubmitAddr,
    reset: resetAddr,
    formState: { errors: addrErrors },
  } = useForm<CreateShippingAddressInput>({
    resolver: zodResolver(createShippingAddressSchema),
  });

  const onSubmit = async (data: UpdateProfileInput) => {
    setIsSubmitting(true);
    try {
      await updateProfile.mutateAsync(data);
      toast.success("Profile updated");
    } catch {
      toast.error("Failed to update profile");
    } finally {
      setIsSubmitting(false);
    }
  };

  const onAddAddress = async (data: CreateShippingAddressInput) => {
    await createAddress.mutateAsync(data);
    resetAddr();
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your buyer profile and business information
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle>Profile Information</CardTitle>
            <CardDescription>
              Update your personal and business details
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input id="name" {...register("name")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" type="tel" {...register("phone")} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="businessName">Business Name</Label>
              <Input id="businessName" {...register("businessName")} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="businessAddress">Business Address</Label>
              <Input id="businessAddress" {...register("businessAddress")} />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="businessCity">City</Label>
                <Input id="businessCity" {...register("businessCity")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="businessState">State</Label>
                <Input
                  id="businessState"
                  maxLength={2}
                  {...register("businessState")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="businessZip">ZIP</Label>
                <Input id="businessZip" {...register("businessZip")} />
              </div>
            </div>

            <div className="pt-4">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Save Changes
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

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
                if (!showAddForm) resetAddr();
              }}
            >
              <Plus className="mr-1 h-4 w-4" />
              Add Address
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add address form */}
          {showAddForm && (
            <form onSubmit={handleSubmitAddr(onAddAddress)} className="space-y-3 p-4 border rounded-lg bg-muted/30">
              <div className="grid grid-cols-2 gap-3">
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
              <div className="grid grid-cols-3 gap-3">
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
                <Button type="submit" size="sm" disabled={createAddress.isPending}>
                  {createAddress.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                  Save Address
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {/* Address list */}
          {addressesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : addresses && addresses.length > 0 ? (
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
                        className="h-8 w-8"
                        onClick={() => setDefaultAddress.mutate({ id: addr.id })}
                        title="Set as default"
                      >
                        <Star className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => deleteAddress.mutate({ id: addr.id })}
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
          <div className="flex justify-between">
            <span className="text-muted-foreground">Email</span>
            <span>{user?.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Role</span>
            <span className="capitalize">{user?.role}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
