"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers/_app";
import { trpc } from "@/lib/trpc/client";
import { useAuthStore } from "@/lib/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  QueryErrorState,
  StatePanelLoading,
} from "@/components/ui/state-panel";

const empty = {
  label: "",
  address: "",
  city: "",
  state: "",
  zip: "",
  contactName: "",
  phone: "",
  pickupStart: "08:00",
  pickupEnd: "17:00",
  hasLoadingDock: false,
  hasForklift: false,
  active: true,
  isDefault: false,
};
type Form = typeof empty;
type WarehouseList = inferRouterOutputs<AppRouter>["warehouse"]["list"];
type Warehouse = WarehouseList["warehouses"][number];
type Listing = WarehouseList["listings"][number];
type UncertainWrite = {
  kind: "save" | "assign";
  message: string;
  reviewed: boolean;
  data?: Form;
  id?: string;
  previousWarehouseIds?: string[];
  matchingWarehouseId?: string;
};
const actionClass = "h-auto min-h-11 whitespace-normal";

function warehouseForm(warehouse: Warehouse): Form {
  return {
    label: warehouse.label,
    address: warehouse.address,
    city: warehouse.city,
    state: warehouse.state,
    zip: warehouse.zip,
    contactName: warehouse.contactName,
    phone: warehouse.phone,
    pickupStart: warehouse.pickupStart,
    pickupEnd: warehouse.pickupEnd,
    hasLoadingDock: warehouse.hasLoadingDock,
    hasForklift: warehouse.hasForklift,
    active: warehouse.active,
    isDefault: warehouse.isDefault,
  };
}

function matchesForm(warehouse: Warehouse, form: Form) {
  return (Object.keys(form) as (keyof Form)[]).every((key) => {
    const value = form[key];
    return (
      warehouse[key] ===
      (typeof value === "string"
        ? key === "state"
          ? value.trim().toUpperCase()
          : value.trim()
        : value)
    );
  });
}

function knownRejection(error: unknown) {
  if (!error || typeof error !== "object" || !("data" in error)) return false;
  const data = error.data;
  if (!data || typeof data !== "object" || !("code" in data)) return false;
  return [
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "PRECONDITION_FAILED",
    "TOO_MANY_REQUESTS",
  ].includes(String(data.code));
}

export default function WarehousesPage() {
  const { user, isLoading, isAuthenticated } = useAuthStore();
  if (isLoading || !isAuthenticated || !user)
    return <StatePanelLoading label="Checking warehouse access" />;
  if (
    (user.role !== "seller" && user.role !== "admin") ||
    (user.role !== "admin" && user.verificationStatus !== "verified")
  ) {
    return (
      <main className="mx-auto max-w-5xl space-y-4">
        <h1 className="text-2xl font-semibold">Pickup warehouses</h1>
        <p>Business approval is required to manage pickup warehouses.</p>
        <Button asChild variant="outline" className={actionClass}>
          <Link href="/seller/verification">View business verification</Link>
        </Button>
      </main>
    );
  }
  return <WarehouseWorkspace key={user.id} actorId={user.id} />;
}

function WarehouseWorkspace({ actorId }: { actorId: string }) {
  const utils = trpc.useUtils();
  const query = trpc.warehouse.list.useQuery();
  const save = trpc.warehouse.save.useMutation({ retry: false });
  const assign = trpc.warehouse.assignListing.useMutation({ retry: false });
  const [editing, setEditing] = useState<string>();
  const [form, setForm] = useState<Form>({ ...empty });
  const [busy, setBusy] = useState<"save" | "assign" | "read" | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [readFailed, setReadFailed] = useState(false);
  const [needsRead, setNeedsRead] = useState(false);
  const [uncertain, setUncertain] = useState<UncertainWrite | null>(null);
  const working = useRef(false);
  const mounted = useRef(true);
  const acceptedSaveAwaitingRead = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const current = () => {
    const auth = useAuthStore.getState();
    return (
      mounted.current &&
      !auth.isLoading &&
      auth.isAuthenticated &&
      auth.user?.id === actorId &&
      (auth.user.role === "admin" ||
        (auth.user.role === "seller" &&
          auth.user.verificationStatus === "verified"))
    );
  };
  const controlsDisabled = Boolean(
    busy ||
    needsRead ||
    uncertain ||
    query.isLoading ||
    query.isFetching ||
    query.isError ||
    !query.data,
  );

  const readLatest = async () => {
    if (!current()) return null;
    try {
      await utils.warehouse.list.cancel();
      if (!current()) return null;
      const result = await utils.client.warehouse.list.query();
      if (!current()) return null;
      await utils.warehouse.list.cancel();
      if (!current()) return null;
      utils.warehouse.list.setData(undefined, result);
      setReadFailed(false);
      setNeedsRead(false);
      if (acceptedSaveAwaitingRead.current) {
        acceptedSaveAwaitingRead.current = false;
        setEditing(undefined);
        setForm({ ...empty });
      }
      return result;
    } catch {
      if (current()) setReadFailed(true);
      return null;
    }
  };

  const refresh = async () => {
    if (!current() || working.current) return;
    working.current = true;
    setBusy("read");
    try {
      const result = await readLatest();
      if (!current() || !result || !uncertain) return;
      const matches =
        uncertain.kind === "save" && uncertain.data && !uncertain.id
          ? result.warehouses.filter(
              (warehouse) =>
                !uncertain.previousWarehouseIds?.includes(warehouse.id) &&
                matchesForm(warehouse, uncertain.data!),
            )
          : [];
      setUncertain({
        ...uncertain,
        reviewed: true,
        matchingWarehouseId: matches.length === 1 ? matches[0].id : undefined,
      });
    } finally {
      if (current()) {
        working.current = false;
        setBusy(null);
      }
    }
  };

  const saveWarehouse = async () => {
    if (!current() || working.current || controlsDisabled) return;
    working.current = true;
    setBusy("save");
    setActionError(null);
    setReceipt(null);
    const submitted = { ...form };
    const submittedId = editing;
    const previousWarehouseIds =
      query.data?.warehouses.map((warehouse) => warehouse.id) ?? [];
    try {
      let saved: Warehouse;
      try {
        saved = await save.mutateAsync({ id: submittedId, data: submitted });
      } catch (error) {
        if (!current()) return;
        const message =
          error instanceof Error
            ? error.message
            : "The save could not be confirmed.";
        if (knownRejection(error)) setActionError(message);
        else
          setUncertain({
            kind: "save",
            message,
            reviewed: false,
            data: submitted,
            id: submittedId,
            previousWarehouseIds,
          });
        return;
      }
      if (!current()) return;
      setReceipt(
        'Warehouse saved: "' +
          saved.label +
          '". Choose Assign below to apply a pickup location to a listing.',
      );
      setEditing(saved.id);
      setForm(warehouseForm(saved));
      setNeedsRead(true);
      acceptedSaveAwaitingRead.current = true;
      await readLatest();
    } finally {
      if (current()) {
        working.current = false;
        setBusy(null);
      }
    }
  };

  const assignWarehouse = async (listing: Listing, warehouseId: string) => {
    if (
      !current() ||
      working.current ||
      controlsDisabled ||
      !query.data?.warehouses.some(
        (warehouse) => warehouse.id === warehouseId && warehouse.active,
      )
    )
      return;
    working.current = true;
    setBusy("assign");
    setActionError(null);
    setReceipt(null);
    try {
      try {
        await assign.mutateAsync({ listingId: listing.id, warehouseId });
      } catch (error) {
        if (!current()) return;
        const message =
          error instanceof Error
            ? error.message
            : "The assignment could not be confirmed.";
        if (knownRejection(error)) setActionError(message);
        else setUncertain({ kind: "assign", message, reviewed: false });
        return;
      }
      if (!current()) return;
      setReceipt('Pickup location assigned to "' + listing.title + '".');
      setNeedsRead(true);
      await readLatest();
    } finally {
      if (current()) {
        working.current = false;
        setBusy(null);
      }
    }
  };

  const finishReview = () => {
    if (
      !current() ||
      working.current ||
      !uncertain?.reviewed ||
      query.isError ||
      query.isFetching ||
      readFailed
    )
      return;
    if (uncertain.matchingWarehouseId) {
      setEditing(uncertain.matchingWarehouseId);
      setReceipt(
        "A matching warehouse appears in the latest list. This form will edit that saved location.",
      );
    }
    setUncertain(null);
    setActionError(null);
  };

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-0 py-6 sm:px-4">
      <header>
        <h1 className="text-2xl font-semibold">Pickup warehouses</h1>
        <p className="mt-2 text-muted-foreground">
          Manage your freight pickup locations and choose one for each listing.
        </p>
      </header>
      {receipt && (
        <section
          role="status"
          aria-live="polite"
          className="space-y-2 rounded-md border p-4"
        >
          <p className="break-words font-medium">{receipt}</p>
          {needsRead && (
            <p className="text-sm">
              The change was saved. Refresh the list before making another
              change.
            </p>
          )}
        </section>
      )}
      {actionError && (
        <p role="alert" className="break-words text-sm text-destructive">
          {actionError}
        </p>
      )}
      {uncertain && (
        <section
          role="alert"
          className="space-y-3 rounded-md border border-amber-300 p-4"
        >
          <h2 className="font-semibold">
            Check the saved state before trying again
          </h2>
          <p className="break-words text-sm">{uncertain.message}</p>
          <p className="text-sm">
            The response did not confirm whether the change was saved. Your
            draft is still here. Refresh the list and review the current
            locations and assignments before continuing.
          </p>
          {uncertain.kind === "save" && !uncertain.id && (
            <p className="text-sm">
              A new warehouse may already exist. Creating it again could make a
              duplicate. A matching new location will open for editing when you
              continue.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className={actionClass}
              disabled={Boolean(busy || query.isFetching)}
              onClick={() => void refresh()}
            >
              {busy === "read" ? "Checking saved state…" : "Check saved state"}
            </Button>
            {uncertain.reviewed && (
              <Button
                type="button"
                className={actionClass}
                disabled={Boolean(
                  busy || query.isFetching || query.isError || readFailed,
                )}
                onClick={finishReview}
              >
                I reviewed the list — continue
              </Button>
            )}
          </div>
          {uncertain.reviewed && (
            <p className="text-sm">
              The latest list is shown below. Check it before continuing; the
              refresh did not send another save.
            </p>
          )}
        </section>
      )}
      {query.isLoading && (
        <StatePanelLoading label="Loading pickup warehouses" rows={2} />
      )}
      {(query.isError || readFailed) && (
        <QueryErrorState
          title="Warehouse list could not refresh"
          description={
            receipt
              ? "Your confirmed change remains saved. Your draft and last known locations are kept here. Retry only refreshes the list."
              : "Your draft is kept here. Refresh the list before changing a warehouse or listing assignment."
          }
          onRetry={() => void refresh()}
          isRetrying={Boolean(busy || query.isFetching)}
        />
      )}
      <div className="grid min-w-0 gap-8 lg:grid-cols-2">
        <section aria-label="Saved warehouses" className="min-w-0 space-y-4">
          <h2 className="text-lg font-semibold">Saved warehouses</h2>
          {query.data?.warehouses.length === 0 &&
            !query.isError &&
            !readFailed &&
            !needsRead && (
              <p>
                Add your first warehouse, then assign it to a listing below.
              </p>
            )}
          {query.data?.warehouses.map((warehouse) => (
            <article
              className="min-w-0 border-b pb-4"
              key={warehouse.id}
              data-warehouse-id={warehouse.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 break-words">
                  <h3 className="font-semibold">
                    {warehouse.label}
                    {warehouse.isDefault ? " · Default suggestion" : ""}
                    {!warehouse.active ? " · Inactive" : ""}
                  </h3>
                  <p>{warehouse.address}</p>
                  <p>
                    {warehouse.city}, {warehouse.state} {warehouse.zip}
                  </p>
                  <p className="text-sm">
                    Pickup {warehouse.pickupStart}–{warehouse.pickupEnd} local
                    time ·{" "}
                    {warehouse.hasLoadingDock ? "Loading dock" : "No dock"} ·{" "}
                    {warehouse.hasForklift ? "Forklift" : "No forklift"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Map coordinates are estimated from ZIP code, not the street
                    address.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {warehouse.contactName} · {warehouse.phone}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className={actionClass + " shrink-0"}
                  disabled={controlsDisabled}
                  aria-label={"Edit " + warehouse.label}
                  onClick={() => {
                    if (!current() || working.current || controlsDisabled)
                      return;
                    setEditing(warehouse.id);
                    setForm(warehouseForm(warehouse));
                    setActionError(null);
                  }}
                >
                  Edit
                </Button>
              </div>
            </article>
          ))}
        </section>
        <form
          className="min-w-0"
          onSubmit={(event) => {
            event.preventDefault();
            void saveWarehouse();
          }}
        >
          <fieldset className="min-w-0 space-y-4" disabled={controlsDisabled}>
            <legend className="mb-4 text-lg font-semibold">
              {editing ? "Edit warehouse" : "Add warehouse"}
            </legend>
            {(
              [
                ["label", "Warehouse name"],
                ["address", "Street address"],
                ["city", "City"],
                ["state", "State (two letters)"],
                ["zip", "ZIP code"],
                ["contactName", "Pickup contact"],
                ["phone", "Pickup phone"],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <Label htmlFor={"warehouse-" + key}>{label}</Label>
                <Input
                  id={"warehouse-" + key}
                  required
                  value={form[key]}
                  maxLength={
                    key === "state" ? 2 : key === "zip" ? 5 : undefined
                  }
                  onChange={(event) =>
                    setForm({ ...form, [key]: event.target.value })
                  }
                />
              </div>
            ))}
            <div className="grid grid-cols-2 gap-3">
              {(["pickupStart", "pickupEnd"] as const).map((key) => (
                <div key={key}>
                  <Label htmlFor={key}>
                    {key === "pickupStart" ? "Pickup opens" : "Pickup closes"}{" "}
                    (local time)
                  </Label>
                  <Input
                    id={key}
                    type="time"
                    required
                    value={form[key]}
                    onChange={(event) =>
                      setForm({ ...form, [key]: event.target.value })
                    }
                  />
                </div>
              ))}
            </div>
            {(
              [
                ["hasLoadingDock", "Loading dock available"],
                ["hasForklift", "Forklift available for loading"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  checked={form[key]}
                  onChange={(event) =>
                    setForm({ ...form, [key]: event.target.checked })
                  }
                />
                {label}
              </label>
            ))}
            <p className="text-sm text-muted-foreground">
              If neither loading option is available, freight quotes include a
              pickup liftgate. Hours apply Monday through Friday, excluding
              freight holidays.
            </p>
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(event) =>
                  setForm({
                    ...form,
                    active: event.target.checked,
                    isDefault: event.target.checked ? form.isDefault : false,
                  })
                }
              />
              Active for new orders
            </label>
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                checked={form.isDefault}
                disabled={!form.active}
                onChange={(event) =>
                  setForm({ ...form, isDefault: event.target.checked })
                }
              />
              Default warehouse suggestion
            </label>
            <p className="text-sm text-muted-foreground">
              The default is suggested for unassigned listings on this page.
              Save the warehouse, then choose Assign for each listing. Changing
              the default does not move existing inventory.
            </p>
            <p className="text-sm text-muted-foreground">
              Changing pickup details requires any reserved orders to be
              completed or cancelled. Existing shipment records keep their
              original address.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" className={actionClass}>
                {busy === "save" ? "Saving…" : "Save warehouse"}
              </Button>
              {editing && (
                <Button
                  type="button"
                  variant="outline"
                  className={actionClass}
                  onClick={() => {
                    if (!current() || working.current || controlsDisabled)
                      return;
                    setEditing(undefined);
                    setForm({ ...empty });
                    setActionError(null);
                  }}
                >
                  Cancel edit
                </Button>
              )}
            </div>
          </fieldset>
        </form>
      </div>
      <section className="min-w-0 space-y-3">
        <h2 className="text-lg font-semibold">
          Assign listing pickup locations
        </h2>
        <p className="text-sm text-muted-foreground">
          A suggested warehouse is not assigned until you choose Assign.
        </p>
        {query.data?.listings.length === 0 &&
          !query.isError &&
          !readFailed &&
          !needsRead && <p>Your listings will appear here.</p>}
        {query.data?.listings.map((listing) => (
          <ListingWarehouse
            key={listing.id + ":" + listing.warehouseId}
            listing={listing}
            warehouses={query.data.warehouses}
            disabled={controlsDisabled}
            onAssign={(warehouseId) =>
              void assignWarehouse(listing, warehouseId)
            }
          />
        ))}
      </section>
    </main>
  );
}

function ListingWarehouse({
  listing,
  warehouses,
  disabled,
  onAssign,
}: {
  listing: Listing;
  warehouses: Warehouse[];
  disabled: boolean;
  onAssign: (warehouseId: string) => void;
}) {
  const [choice, setChoice] = useState<string | null>(null);
  const selected =
    choice ??
    listing.warehouseId ??
    warehouses.find((warehouse) => warehouse.active && warehouse.isDefault)
      ?.id ??
    "";
  const activeSelection = warehouses.some(
    (warehouse) => warehouse.id === selected && warehouse.active,
  );
  const options = warehouses.filter(
    (warehouse) =>
      warehouse.active ||
      warehouse.id === listing.warehouseId ||
      warehouse.id === selected,
  );
  return (
    <form
      className="flex min-w-0 flex-col gap-2 border-b py-3 sm:flex-row sm:items-center"
      data-listing-id={listing.id}
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled && activeSelection && selected !== listing.warehouseId)
          onAssign(selected);
      }}
    >
      <Label
        htmlFor={"pickup-" + listing.id}
        className="min-w-0 flex-1 break-words"
      >
        {listing.title}
      </Label>
      <select
        id={"pickup-" + listing.id}
        className="min-h-11 w-full min-w-0 max-w-full rounded-md border bg-background px-3 sm:w-64"
        value={selected}
        disabled={disabled}
        onChange={(event) => setChoice(event.target.value)}
      >
        <option value="">Choose pickup warehouse</option>
        {selected &&
          !options.some((warehouse) => warehouse.id === selected) && (
            <option value={selected} disabled>
              Previously selected warehouse unavailable
            </option>
          )}
        {options.map((warehouse) => (
          <option
            key={warehouse.id}
            value={warehouse.id}
            disabled={!warehouse.active}
          >
            {warehouse.label}
            {warehouse.active ? "" : " (inactive)"}
          </option>
        ))}
      </select>
      <Button
        type="submit"
        className={actionClass + " shrink-0"}
        disabled={
          disabled || !activeSelection || selected === listing.warehouseId
        }
      >
        Assign
      </Button>
    </form>
  );
}
