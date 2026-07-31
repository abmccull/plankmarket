"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const EMPTY_FORM = {
  shippingName: "",
  shippingAddress1: "",
  shippingAddress2: "",
  shippingCity: "",
  shippingState: "",
  shippingZip: "",
  shippingPhone: "",
  buyerMessage: "",
  consentToShareAddress: true,
};

export default function NewSampleRequestPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const listingId = searchParams.get("listingId");
  const [form, setForm] = useState(EMPTY_FORM);

  const utils = trpc.useUtils();
  const { data: listing } = trpc.listing.getById.useQuery(
    { id: listingId ?? "" },
    { enabled: !!listingId },
  );
  const { data: purchaseConfig } = trpc.listing.getPurchaseConfig.useQuery(
    { listingId: listingId ?? "" },
    { enabled: !!listingId },
  );

  const createSampleRequest = trpc.sampleRequest.create.useMutation({
    onSuccess: async () => {
      await utils.sampleRequest.getMyRequests.invalidate();
    },
  });

  const submitDisabled = useMemo(() => {
    return (
      !listingId ||
      createSampleRequest.isPending ||
      !purchaseConfig?.allowSampleRequests ||
      !form.consentToShareAddress
    );
  }, [
    createSampleRequest.isPending,
    form.consentToShareAddress,
    listingId,
    purchaseConfig?.allowSampleRequests,
  ]);

  const updateField = (field: keyof typeof form, value: string | boolean) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!listingId) {
      toast.error("Listing is missing");
      return;
    }

    try {
      const result = await createSampleRequest.mutateAsync({
        listingId,
        buyerMessage: form.buyerMessage,
        shippingName: form.shippingName,
        shippingAddress1: form.shippingAddress1,
        shippingAddress2: form.shippingAddress2 || undefined,
        shippingCity: form.shippingCity,
        shippingState: form.shippingState.toUpperCase(),
        shippingZip: form.shippingZip,
        shippingPhone: form.shippingPhone || undefined,
        consentToShareAddress: true,
      });

      toast.success(
        result.created
          ? "Sample request submitted"
          : "You already have an active sample request for this listing",
      );
      router.push("/buyer/samples");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create sample request",
      );
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Request a Sample</h1>
        <p className="mt-1 text-muted-foreground">
          Samples ship directly from the seller to you. This is separate from
          checkout and freight booking. The seller must confirm availability
          and any sample or parcel-shipping cost before fulfillment.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3" aria-label="Sample request steps">
        {[
          {
            step: "1",
            title: "Send your request",
            description: "Tell the seller what you need and where it would ship.",
          },
          {
            step: "2",
            title: "Seller confirms",
            description:
              "The seller confirms availability and any sample or parcel cost.",
          },
          {
            step: "3",
            title: "Track delivery",
            description:
              "If approved, the seller receives your address and adds parcel tracking.",
          },
        ].map((item) => (
          <div key={item.step} className="rounded-xl border bg-muted/20 p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {item.step}
              </span>
              <p className="text-sm font-semibold">{item.title}</p>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {item.description}
            </p>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{listing?.title ?? "Sample Request"}</CardTitle>
        </CardHeader>
        <CardContent>
          {!listingId ? (
            <p className="text-sm text-destructive">A listing ID is required.</p>
          ) : purchaseConfig && !purchaseConfig.allowSampleRequests ? (
            <p className="text-sm text-muted-foreground">
              This listing is not currently accepting sample requests.
            </p>
          ) : (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="shippingName">Recipient Name</Label>
                  <Input
                    id="shippingName"
                    value={form.shippingName}
                    onChange={(event) =>
                      updateField("shippingName", event.target.value)
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shippingPhone">Phone</Label>
                  <Input
                    id="shippingPhone"
                    value={form.shippingPhone}
                    onChange={(event) =>
                      updateField("shippingPhone", event.target.value)
                    }
                    placeholder="Optional"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="shippingAddress1">Address</Label>
                <Input
                  id="shippingAddress1"
                  value={form.shippingAddress1}
                  onChange={(event) =>
                    updateField("shippingAddress1", event.target.value)
                  }
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="shippingAddress2">Address Line 2</Label>
                <Input
                  id="shippingAddress2"
                  value={form.shippingAddress2}
                  onChange={(event) =>
                    updateField("shippingAddress2", event.target.value)
                  }
                  placeholder="Optional"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="shippingCity">City</Label>
                  <Input
                    id="shippingCity"
                    value={form.shippingCity}
                    onChange={(event) =>
                      updateField("shippingCity", event.target.value)
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shippingState">State</Label>
                <Input
                  id="shippingState"
                  maxLength={2}
                  value={form.shippingState}
                    onChange={(event) =>
                      updateField("shippingState", event.target.value.toUpperCase())
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shippingZip">ZIP</Label>
                  <Input
                    id="shippingZip"
                    value={form.shippingZip}
                    onChange={(event) =>
                      updateField("shippingZip", event.target.value)
                    }
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="buyerMessage">Notes for Seller</Label>
                <Textarea
                  id="buyerMessage"
                  value={form.buyerMessage}
                  onChange={(event) =>
                    updateField("buyerMessage", event.target.value)
                  }
                  placeholder="Tell the seller what you need to evaluate."
                  rows={4}
                />
              </div>

              <label className="flex items-start gap-3 rounded-lg border p-3">
                <input
                  type="checkbox"
                  checked={form.consentToShareAddress}
                  onChange={(event) =>
                    updateField("consentToShareAddress", event.target.checked)
                  }
                  className="mt-1 h-4 w-4"
                />
                <span className="text-sm text-muted-foreground">
                  If the seller approves this request, I authorize PlankMarket to
                  reveal this shipping address to the seller so they can ship the
                  sample directly to me.
                </span>
              </label>

              <div className="flex gap-3">
                <Button type="submit" disabled={submitDisabled}>
                  {createSampleRequest.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    "Submit Sample Request"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push("/buyer/samples")}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
