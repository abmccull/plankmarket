"use client";

import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { useAuthStore } from "@/lib/stores/auth-store";
import { createSampleRequestSchema } from "@/lib/validators/sample-request";
import { SAMPLE_REQUEST_TERMINAL_STATUSES } from "@/lib/sample-requests";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  QueryErrorState,
  StatePanel,
  StatePanelLoading,
} from "@/components/ui/state-panel";
import { CheckCircle, Package, Loader2 } from "lucide-react";

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
type TextField = Exclude<
  keyof typeof EMPTY_FORM,
  "buyerMessage" | "consentToShareAddress"
>;

export default function NewSampleRequestPage() {
  const { user } = useAuthStore();
  const listingId = useSearchParams().get("listingId");
  return (
    <SampleRequestForm
      key={`${user?.id ?? "anonymous"}:${listingId ?? "missing"}`}
      actorId={user?.id ?? null}
      listingId={listingId}
    />
  );
}

function SampleRequestForm({
  actorId,
  listingId,
}: {
  actorId: string | null;
  listingId: string | null;
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [outcome, setOutcome] = useState<"unknown" | "rejected" | null>(null);
  const [checking, setChecking] = useState(false),
    [checkFailed, setCheckFailed] = useState(false);
  const [notice, setNotice] = useState("");
  const [receipt, setReceipt] = useState<{
    id: string;
    created: boolean;
    status: string;
  } | null>(null);
  const mountedRef = useRef(true),
    pendingRef = useRef(false),
    formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const isCurrent = () =>
    mountedRef.current && useAuthStore.getState().user?.id === actorId;
  const validId =
    createSampleRequestSchema.shape.listingId.safeParse(listingId).success;
  const utils = trpc.useUtils();
  const listingQuery = trpc.listing.getById.useQuery(
    { id: listingId ?? "" },
    { enabled: validId && !!actorId },
  );
  const configQuery = trpc.listing.getPurchaseConfig.useQuery(
    { listingId: listingId ?? "" },
    { enabled: validId && !!actorId },
  );
  const createRequest = trpc.sampleRequest.create.useMutation();
  const missing =
    listingQuery.error?.data?.code === "NOT_FOUND" ||
    configQuery.error?.data?.code === "NOT_FOUND";
  const readError = listingQuery.isError || configQuery.isError;
  const loading = listingQuery.isLoading || configQuery.isLoading;
  const fetching = listingQuery.isFetching || configQuery.isFetching;
  const eligible =
    validId &&
    !!listingQuery.data &&
    configQuery.data?.allowSampleRequests === true &&
    !readError;
  const hasDraft = Object.entries(form).some(
    ([key, value]) => key !== "consentToShareAddress" && Boolean(value),
  );
  const submitDisabled =
    !eligible ||
    fetching ||
    createRequest.isPending ||
    checking ||
    !!outcome ||
    !!receipt ||
    !form.consentToShareAddress;
  const updateField = (field: keyof typeof form, value: string | boolean) =>
    setForm((current) => ({ ...current, [field]: value }));
  const refreshEligibility = async () => {
    const results = await Promise.all([
      listingQuery.refetch(),
      configQuery.refetch(),
    ]);
    return results.every((result) => !result.error);
  };
  const reconcile = async () => {
    if (pendingRef.current || checking || !isCurrent()) return;
    setChecking(true);
    setCheckFailed(false);
    try {
      await utils.sampleRequest.getMyRequests.cancel();
      if (!isCurrent()) return;
      // Reconciliation is local to this actor; do not populate shared cache.
      const requests = await utils.client.sampleRequest.getMyRequests.query();
      if (!isCurrent()) return;
      const existing = requests.find(
        (request) =>
          request.listingId === listingId &&
          !SAMPLE_REQUEST_TERMINAL_STATUSES.includes(request.status),
      );
      if (existing) {
        setReceipt({
          id: existing.id,
          status: existing.status,
          created: false,
        });
        return;
      }
      const refreshed = await refreshEligibility();
      if (!isCurrent()) return;
      if (!refreshed) {
        setCheckFailed(true);
        return;
      }
      setOutcome(null);
      setNotice(
        "No active request was found for this lot. Review your details before submitting again.",
      );
    } catch {
      if (isCurrent()) setCheckFailed(true);
    } finally {
      if (isCurrent()) setChecking(false);
    }
  };
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitDisabled || pendingRef.current || !isCurrent()) return;
    const parsed = createSampleRequestSchema.safeParse({
      ...form,
      listingId,
      shippingAddress2: form.shippingAddress2 || undefined,
      shippingPhone: form.shippingPhone || undefined,
    });
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0]);
        errors[field] ??= issue.message;
      }
      setFieldErrors(errors);
      const first = Object.keys(errors)[0];
      formRef.current?.querySelector<HTMLElement>(`[id="${first}"]`)?.focus();
      return;
    }
    pendingRef.current = true;
    setFieldErrors({});
    setOutcome(null);
    setNotice("");
    try {
      const result = await createRequest.mutateAsync(parsed.data);
      if (!isCurrent()) return;
      setReceipt({
        id: result.request.id,
        status: result.request.status,
        created: result.created,
      });
      // A confirmed request stays confirmed even if its history cannot refresh.
      void utils.sampleRequest.getMyRequests.invalidate().catch(() => {});
    } catch (error) {
      if (!isCurrent()) return;
      const code = (error as { data?: { code?: string } })?.data?.code;
      setOutcome(
        code === "BAD_REQUEST" || code === "FORBIDDEN" || code === "NOT_FOUND"
          ? "rejected"
          : "unknown",
      );
    } finally {
      pendingRef.current = false;
    }
  };
  const textField = (
    field: TextField,
    label: string,
    props: InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={field}>{label}</Label>
      <Input
        {...props}
        id={field}
        value={form[field]}
        onChange={(event) =>
          updateField(
            field,
            field === "shippingState"
              ? event.target.value.toUpperCase()
              : event.target.value,
          )
        }
        aria-invalid={!!fieldErrors[field]}
        aria-describedby={fieldErrors[field] ? `${field}-error` : undefined}
      />
      {fieldErrors[field] && (
        <p id={`${field}-error`} className="text-sm text-destructive">
          {fieldErrors[field]}
        </p>
      )}
    </div>
  );

  return (
    <div className="min-w-0 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Request a Sample</h1>
        <p className="mt-1 text-muted-foreground">
          Samples ship directly from the seller to you. This is separate from
          checkout and freight booking. The seller must confirm availability and
          any sample or parcel-shipping cost before fulfillment.
        </p>
      </div>
      <div
        className="grid gap-3 md:grid-cols-3"
        aria-label="Sample request steps"
      >
        {[
          {
            step: "1",
            title: "Send your request",
            description:
              "Tell the seller what you need and where it would ship.",
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
          <div
            key={item.step}
            className="min-w-0 rounded-xl border bg-muted/20 p-[min(1rem,16px)]"
          >
            <div className="mb-2 flex items-start gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
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
      {receipt ? (
        <div data-sample-request-id={receipt.id}>
          <StatePanel
            icon={CheckCircle}
            title={
              receipt.created
                ? "Sample request submitted"
                : "Active sample request found"
            }
            description={
              receipt.created
                ? "Your request is saved. The seller will confirm availability and any sample or parcel cost before fulfillment."
                : "You already have an active request for this lot. View sample requests for its current status and tracking."
            }
            detail={
              <p>
                Status: <span className="capitalize">{receipt.status}</span>
              </p>
            }
            primaryAction={{
              label: "View sample requests",
              href: "/buyer/samples",
            }}
            secondaryAction={{
              label: "Return to listing",
              href: `/listings/${listingId}`,
            }}
          />
        </div>
      ) : !validId ? (
        <StatePanel
          icon={Package}
          title="Choose a listing first"
          description="Open a flooring lot to check whether its seller accepts sample requests."
          primaryAction={{ label: "Browse listings", href: "/listings" }}
          secondaryAction={{
            label: "View sample requests",
            href: "/buyer/samples",
          }}
        />
      ) : (
        <>
          {missing ? (
            <StatePanel
              icon={Package}
              title="This listing is unavailable"
              description="Choose another lot or review your existing sample requests."
              primaryAction={{ label: "Browse listings", href: "/listings" }}
              secondaryAction={{
                label: "View sample requests",
                href: "/buyer/samples",
              }}
            />
          ) : readError ? (
            <QueryErrorState
              title="We couldn't check sample availability"
              description="Your receiving details are kept. Refresh the listing and sample settings before submitting."
              onRetry={() => void refreshEligibility()}
              isRetrying={fetching}
            />
          ) : loading ? (
            <StatePanelLoading label="Checking sample availability" rows={2} />
          ) : configQuery.data && !configQuery.data.allowSampleRequests ? (
            <StatePanel
              icon={Package}
              title="Samples are unavailable for this lot"
              description="This seller is not currently accepting sample requests for this listing."
              primaryAction={{
                label: "Return to listing",
                href: `/listings/${listingId}`,
              }}
              secondaryAction={{ label: "Browse listings", href: "/listings" }}
            />
          ) : null}
          {(eligible || hasDraft) && (
            <Card>
              <CardHeader className="p-[min(1.5rem,24px)]">
                <CardTitle className="break-words">
                  {listingQuery.data?.title ?? "Your receiving details"}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-[min(1.5rem,24px)] pt-0">
                {notice && (
                  <p role="status" className="mb-4 text-sm">
                    {notice}
                  </p>
                )}
                {outcome && (
                  <div
                    role="alert"
                    className="mb-4 space-y-2 rounded-md border p-3"
                  >
                    <p className="font-semibold">
                      {outcome === "unknown"
                        ? "Submission not confirmed"
                        : "Sample request needs review"}
                    </p>
                    <p className="text-sm">
                      Your receiving details are kept. Check existing requests
                      and current availability before submitting again.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-auto min-h-11 whitespace-normal"
                      disabled={checking || createRequest.isPending}
                      onClick={() => void reconcile()}
                    >
                      {checking
                        ? "Checking sample requests..."
                        : "Check sample request status"}
                    </Button>
                    {checkFailed && (
                      <p className="text-sm">
                        Current status could not be checked. Your draft is still
                        here.
                      </p>
                    )}
                  </div>
                )}
                <form
                  ref={formRef}
                  className="space-y-4"
                  onSubmit={handleSubmit}
                  noValidate
                >
                  {Object.keys(fieldErrors).length > 0 && (
                    <p role="alert" className="text-sm text-destructive">
                      Check the highlighted receiving details.
                    </p>
                  )}
                  <fieldset
                    disabled={createRequest.isPending || checking}
                    className="min-w-0 space-y-4"
                  >
                    <legend className="sr-only">
                      Sample receiving details
                    </legend>
                    <div className="grid gap-4 md:grid-cols-2">
                      {textField("shippingName", "Recipient Name", {
                        autoComplete: "shipping name",
                        maxLength: 255,
                        required: true,
                      })}
                      {textField("shippingPhone", "Phone", {
                        autoComplete: "shipping tel",
                        type: "tel",
                        placeholder: "Optional",
                      })}
                    </div>
                    {textField("shippingAddress1", "Address", {
                      autoComplete: "shipping address-line1",
                      maxLength: 255,
                      required: true,
                    })}
                    {textField("shippingAddress2", "Address Line 2", {
                      autoComplete: "shipping address-line2",
                      maxLength: 255,
                      placeholder: "Optional",
                    })}
                    <div className="grid gap-4 md:grid-cols-3">
                      {textField("shippingCity", "City", {
                        autoComplete: "shipping address-level2",
                        maxLength: 100,
                        required: true,
                      })}
                      {textField("shippingState", "State", {
                        autoComplete: "shipping address-level1",
                        maxLength: 2,
                        required: true,
                      })}
                      {textField("shippingZip", "ZIP", {
                        autoComplete: "shipping postal-code",
                        inputMode: "numeric",
                        maxLength: 10,
                        required: true,
                      })}
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
                        maxLength={1000}
                        aria-invalid={!!fieldErrors.buyerMessage}
                        aria-describedby={
                          fieldErrors.buyerMessage
                            ? "buyerMessage-error"
                            : undefined
                        }
                      />
                      {fieldErrors.buyerMessage && (
                        <p
                          id="buyerMessage-error"
                          className="text-sm text-destructive"
                        >
                          {fieldErrors.buyerMessage}
                        </p>
                      )}
                    </div>
                    <label className="flex items-start gap-3 rounded-lg border p-3">
                      <input
                        id="consentToShareAddress"
                        type="checkbox"
                        checked={form.consentToShareAddress}
                        onChange={(event) =>
                          updateField(
                            "consentToShareAddress",
                            event.target.checked,
                          )
                        }
                        className="mt-1 h-4 w-4 shrink-0"
                      />
                      <span className="text-sm text-muted-foreground">
                        If the seller approves this request, I authorize
                        PlankMarket to reveal this shipping address to the
                        seller so they can ship the sample directly to me.
                      </span>
                    </label>
                  </fieldset>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      type="submit"
                      className="h-auto min-h-11 whitespace-normal"
                      disabled={submitDisabled}
                    >
                      {createRequest.isPending ? (
                        <>
                          <Loader2
                            className="mr-2 h-4 w-4 shrink-0 animate-spin"
                            aria-hidden="true"
                          />
                          Submitting...
                        </>
                      ) : (
                        "Submit Sample Request"
                      )}
                    </Button>
                    <Button
                      asChild
                      variant="outline"
                      className="h-auto min-h-11 whitespace-normal"
                    >
                      <Link href="/buyer/samples">View sample requests</Link>
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
