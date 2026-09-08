"use client";
import type { UseFormRegister } from "react-hook-form";
import type { ListingFormInput } from "@/lib/validators/listing";
import { packagingTypes, installationMethods, waterResistanceValues, specificationLabel } from "@/lib/product-specifications";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ProductSpecificationFields({ register }: { register: UseFormRegister<ListingFormInput> }) {
  return <fieldset className="space-y-4"><legend className="font-medium">Packaging and performance</legend>
    <p className="text-sm text-muted-foreground">Enter only specifications shown on the product or manufacturer&apos;s documentation. Unknown values are welcome. Claims remain seller-declared until reviewed.</p>
    <div className="grid gap-4 sm:grid-cols-2">
      {([ ["packagingType", "Packaging", packagingTypes], ["installationMethod", "Installation method", installationMethods], ["waterResistance", "Water performance", waterResistanceValues] ] as const).map(([key,label,values]) => <div key={key} className="space-y-2"><Label htmlFor={key}>{label}</Label><select id={key} {...register(key)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">{values.map(v => <option key={v} value={v}>{specificationLabel(v)}</option>)}</select></div>)}
      <div className="space-y-2"><Label htmlFor="lotNumber">Manufacturer lot / batch number</Label><Input id="lotNumber" maxLength={100} {...register("lotNumber")} placeholder="Leave blank if unknown" /></div>
    </div>
  </fieldset>;
}
