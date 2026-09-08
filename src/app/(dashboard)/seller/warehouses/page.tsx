"use client";
import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
const empty = { label:"",address:"",city:"",state:"",zip:"",contactName:"",phone:"",pickupStart:"08:00",pickupEnd:"17:00",hasLoadingDock:false,hasForklift:false,active:true,isDefault:false };
type Form = typeof empty;
export default function WarehousesPage() {
 const query=trpc.warehouse.list.useQuery();
 const [editing,setEditing]=useState<string|undefined>();
 const [form,setForm]=useState<Form>({...empty});
 const save=trpc.warehouse.save.useMutation({onSuccess:()=>{void query.refetch();setEditing(undefined);setForm({...empty});toast.success("Warehouse saved");},onError:e=>toast.error(e.message)});
 return <main className="mx-auto max-w-5xl space-y-8 px-4 py-6">
  <header><h1 className="text-2xl font-semibold">Pickup warehouses</h1><p className="mt-2 text-muted-foreground">Manage your freight pickup locations and choose one for each listing.</p></header>
  {query.isLoading && <p role="status">Loading warehouses…</p>}
  {query.isError && <div role="alert">Warehouses could not load. <Button variant="outline" onClick={()=>void query.refetch()}>Try again</Button></div>}
  <div className="grid gap-8 lg:grid-cols-2"><section aria-label="Saved warehouses" className="space-y-4">
   {query.data?.warehouses.length===0 && <p>Add your first warehouse, then assign your inventory below.</p>}
   {query.data?.warehouses.map(w=><article className="border-b pb-4" key={w.id}>
    <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold">{w.label}{w.isDefault?" · Default":""}{!w.active?" · Inactive":""}</h2><p>{w.address}</p><p>{w.city}, {w.state} {w.zip}</p><p className="text-sm">Pickup {w.pickupStart}–{w.pickupEnd} local time · {w.hasLoadingDock?"Loading dock":"No dock"} · {w.hasForklift?"Forklift":"No forklift"}</p><p className="text-xs text-muted-foreground">Map coordinates are estimated from ZIP code, not the street address.</p><p className="text-sm text-muted-foreground">{w.contactName} · {w.phone}</p></div><Button variant="outline" onClick={()=>{setEditing(w.id);setForm({label:w.label,address:w.address,city:w.city,state:w.state,zip:w.zip,contactName:w.contactName,phone:w.phone,pickupStart:w.pickupStart,pickupEnd:w.pickupEnd,hasLoadingDock:w.hasLoadingDock,hasForklift:w.hasForklift,active:w.active,isDefault:w.isDefault});}}>Edit</Button></div>
   </article>)}
  </section><form className="space-y-4" onSubmit={e=>{e.preventDefault();save.mutate({id:editing,data:form});}}>
   <h2 className="text-lg font-semibold">{editing?"Edit warehouse":"Add warehouse"}</h2>
   {([ ["label","Warehouse name"],["address","Street address"],["city","City"],["state","State (two letters)"],["zip","ZIP code"],["contactName","Pickup contact"],["phone","Pickup phone"] ] as const).map(([key,label])=><div key={key}><Label htmlFor={`warehouse-${key}`}>{label}</Label><Input id={`warehouse-${key}`} required value={form[key]} maxLength={key==="state"?2:key==="zip"?5:undefined} onChange={e=>setForm({...form,[key]:e.target.value})}/></div>)}
   <div className="grid grid-cols-2 gap-3">{(["pickupStart","pickupEnd"] as const).map(key=><div key={key}><Label htmlFor={key}>{key==="pickupStart"?"Pickup opens":"Pickup closes"} (local time)</Label><Input id={key} type="time" required value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})}/></div>)}</div>
   {([ ["hasLoadingDock","Loading dock available"],["hasForklift","Forklift available for loading"] ] as const).map(([key,label])=><label key={key} className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={form[key]} onChange={e=>setForm({...form,[key]:e.target.checked})}/>{label}</label>)}
   <p className="text-sm text-muted-foreground">If neither loading option is available, freight quotes include a pickup liftgate. Hours apply Monday through Friday, excluding freight holidays.</p>
   <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={form.active} onChange={e=>setForm({...form,active:e.target.checked,isDefault:e.target.checked?form.isDefault:false})}/>Active for new orders</label>
   <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={form.isDefault} disabled={!form.active} onChange={e=>setForm({...form,isDefault:e.target.checked})}/>Default warehouse</label>
   <p className="text-sm text-muted-foreground">Changing pickup details requires any reserved orders to be completed or cancelled. Existing shipment records keep their original address.</p>
   <div className="flex gap-2"><Button disabled={save.isPending}>{save.isPending?"Saving…":"Save warehouse"}</Button>{editing&&<Button type="button" variant="outline" onClick={()=>{setEditing(undefined);setForm({...empty});}}>Cancel edit</Button>}</div>
  </form></div>
  <section className="space-y-3"><h2 className="text-lg font-semibold">Assign listing pickup locations</h2>
   {query.data?.listings.length===0 && <p>Your listings will appear here.</p>}
   {query.data?.listings.map(l=><ListingWarehouse key={`${l.id}:${l.warehouseId}`} listing={l} warehouses={query.data!.warehouses} onSaved={()=>void query.refetch()}/>)}
  </section>
 </main>;
}
function ListingWarehouse({listing,warehouses,onSaved}:{listing:{id:string;title:string;warehouseId:string|null};warehouses:{id:string;label:string;active:boolean;isDefault:boolean}[];onSaved:()=>void}) {
 const [selected,setSelected]=useState(listing.warehouseId??warehouses.find(w=>w.active&&w.isDefault)?.id??"");
 const assign=trpc.warehouse.assignListing.useMutation({onSuccess:()=>{toast.success("Pickup location assigned");onSaved();},onError:e=>toast.error(e.message)});
 return <form className="flex flex-col gap-2 border-b py-3 sm:flex-row sm:items-center" onSubmit={e=>{e.preventDefault();if(selected)assign.mutate({listingId:listing.id,warehouseId:selected});}}>
  <Label htmlFor={`pickup-${listing.id}`} className="flex-1">{listing.title}</Label><select id={`pickup-${listing.id}`} className="min-h-11 rounded-md border bg-background px-3" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Choose pickup warehouse</option>{warehouses.filter(w=>w.active||w.id===listing.warehouseId).map(w=><option key={w.id} value={w.id} disabled={!w.active}>{w.label}{w.active?"":" (inactive)"}</option>)}</select><Button disabled={!selected||selected===listing.warehouseId||assign.isPending}>Assign</Button>
 </form>;
}
