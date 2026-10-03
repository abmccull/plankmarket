"use client";

import type { Warehouse } from "@/server/db/schema/warehouses";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function ListingPickupWarehouse({ warehouses, selectedId, selected, issue, changed, loading, unavailable, approved, onSelect, onRefresh, onManage }: {
  warehouses: Warehouse[];
  selectedId?: string;
  selected?: Warehouse;
  issue: string | null;
  changed: boolean;
  loading: boolean;
  unavailable: boolean;
  approved: boolean;
  onSelect: (id: string) => void;
  onRefresh: () => void;
  onManage: () => void;
}) {
  return <section className="space-y-3" aria-label="Pickup location">
    <div className="space-y-1">
      <Label htmlFor="listing-warehouse">Pickup warehouse</Label>
      <p id="listing-warehouse-help" className="text-sm text-muted-foreground">Reuse a saved address, pickup contact and hours for this lot.</p>
    </div>
    <select id="listing-warehouse" data-listing-field="warehouseId"
      className="min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      value={selectedId ?? "manual"} onChange={event => onSelect(event.target.value)}
      aria-invalid={Boolean(issue)} aria-describedby={`listing-warehouse-help${issue ? " listing-warehouse-status" : ""}`}>
      <option value="manual">Enter a location manually</option>
      {selectedId && !selected && <option value={selectedId}>Saved pickup warehouse — confirmation needed</option>}
      {warehouses.map(warehouse => <option key={warehouse.id} value={warehouse.id}>
        {warehouse.label}{warehouse.isDefault ? " (default suggestion)" : ""} — {warehouse.city}, {warehouse.state}
      </option>)}
    </select>
    {loading && <p role="status" className="text-sm text-muted-foreground">Checking your pickup warehouses…</p>}
    {issue && <p id="listing-warehouse-status" role="alert" className="text-sm text-destructive">{issue}</p>}
    {changed && selected && <Button type="button" variant="outline" onClick={() => onSelect(selected.id)}>Use updated warehouse details</Button>}
    {unavailable && approved && <div className="space-y-2">
      {!selectedId && <p role="status" className="text-sm text-muted-foreground">Saved warehouses could not be loaded. Your manual location is unchanged.</p>}
      <Button type="button" variant="outline" disabled={loading} onClick={onRefresh}>Refresh pickup warehouses</Button>
    </div>}
    {selected && <div className="space-y-1 border-l-2 border-primary/30 pl-3 text-sm">
      <p className="font-medium">{selected.label}{changed ? " · Current saved details" : ""}</p>
      <p>{selected.address}</p>
      <p>{selected.city}, {selected.state} {selected.zip}</p>
      <p>{selected.contactName} · {selected.phone}</p>
      <p>Pickup {selected.pickupStart}–{selected.pickupEnd} · Local warehouse time</p>
      <p className="text-muted-foreground">{selected.hasLoadingDock ? "Loading dock" : "No loading dock"} · {selected.hasForklift ? "Forklift available" : "No forklift"}</p>
    </div>}
    {!selectedId && <p className="text-sm text-muted-foreground">
      {approved
        ? "For freight checkout, this location must match your complete business pickup address. If it differs, choose a saved warehouse or assign one after publication."
        : "You can prepare the location now. Saved pickup warehouses become available after business approval."}
    </p>}
    {approved && <Button type="button" variant="link" className="h-auto min-h-11 whitespace-normal px-0 text-left" onClick={onManage}>Save draft and manage warehouses</Button>}
  </section>;
}
