import { z } from "zod";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import zipcodes from "zipcodes";
import { createTRPCRouter, sellerProcedure, strictSellerProcedure } from "../trpc";
import { users, warehouses, listings, orders } from "../db/schema";
import { requireShippingStateMatchesZip } from "../services/shipping-workflow";
const inputSchema = z.object({ label: z.string().trim().min(1).max(100), address: z.string().trim().min(3).max(500), city: z.string().trim().min(1).max(100), state: z.string().trim().toUpperCase().length(2), zip: z.string().regex(/^\d{5}$/), contactName: z.string().trim().min(1).max(255), phone: z.string().trim().min(7).max(30), pickupStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), pickupEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), hasLoadingDock: z.boolean(), hasForklift: z.boolean(), active: z.boolean().default(true), isDefault: z.boolean().default(false) }).refine(x => x.pickupStart < x.pickupEnd, "Pickup closing time must follow opening time").refine(x => !x.isDefault || x.active, "A default warehouse must be active");
export const warehouseRouter = createTRPCRouter({
 list: sellerProcedure.query(async ({ctx}) => ({
   warehouses: await ctx.db.select().from(warehouses).where(eq(warehouses.sellerId, ctx.user.id)).orderBy(asc(warehouses.label)),
   listings: await ctx.db.select({ id: listings.id, title: listings.title, warehouseId: listings.warehouseId }).from(listings).where(eq(listings.sellerId, ctx.user.id)).orderBy(asc(listings.title)),
 })),
 save: strictSellerProcedure.input(z.object({ id: z.string().uuid().optional(), data: inputSchema })).mutation(async ({ctx,input}) => {
   requireShippingStateMatchesZip({shippingState:input.data.state,shippingZip:input.data.zip});
   const coordinates = zipcodes.lookup(input.data.zip);
   if (!coordinates) throw new TRPCError({code:"BAD_REQUEST",message:"Enter a recognized US ZIP code"});
   const geoFields = {latitude:coordinates.latitude,longitude:coordinates.longitude,coordinateSource:"zip_centroid"};
   return ctx.db.transaction(async tx => {
     await tx.select({id:users.id}).from(users).where(eq(users.id,ctx.user.id)).for("update");
     // Match checkout's listing -> warehouse lock order to avoid reassignment races.
     const attached = input.id ? await tx.select({id:listings.id}).from(listings).where(and(eq(listings.warehouseId,input.id),eq(listings.sellerId,ctx.user.id))).orderBy(asc(listings.id)).for("update") : [];
     const [existing] = input.id ? await tx.select().from(warehouses).where(and(eq(warehouses.id,input.id),eq(warehouses.sellerId,ctx.user.id))).for("update") : [];
     if(input.id && !existing) throw new TRPCError({code:"NOT_FOUND",message:"Warehouse not found"});
     const originChanged = existing && ["address","city","state","zip","contactName","phone","active","pickupStart","pickupEnd","hasLoadingDock","hasForklift"].some(k => existing[k as keyof typeof existing] !== input.data[k as keyof typeof input.data]);
     if(originChanged && attached.length) {
       const [reserved] = await tx.select({id:orders.id}).from(orders).where(and(inArray(orders.listingId,attached.map(x=>x.id)),isNull(orders.inventoryReleasedAt),inArray(orders.status,["pending","confirmed","processing","shipped","cancelled"]))).limit(1);
       if(reserved) throw new TRPCError({code:"CONFLICT",message:"Complete or cancel reserved orders before changing this pickup location."});
     }
     if(input.data.isDefault) await tx.update(warehouses).set({isDefault:false,updatedAt:new Date()}).where(eq(warehouses.sellerId,ctx.user.id));
     const [saved] = existing ? await tx.update(warehouses).set({...input.data,...geoFields,revision:originChanged ? existing.revision+1 : existing.revision,updatedAt:new Date()}).where(eq(warehouses.id,existing.id)).returning() : await tx.insert(warehouses).values({...input.data,...geoFields,sellerId:ctx.user.id}).returning();
     if(originChanged && attached.length) {
       const geo=zipcodes.lookup(input.data.zip);
       await tx.update(listings).set({locationCity:input.data.city,locationState:input.data.state,locationZip:input.data.zip,locationLat:geo?.latitude ?? null,locationLng:geo?.longitude ?? null,updatedAt:new Date()}).where(inArray(listings.id,attached.map(x=>x.id)));
     }
     return saved;
   });
 }),
 assignListing: strictSellerProcedure.input(z.object({listingId:z.string().uuid(),warehouseId:z.string().uuid()})).mutation(async({ctx,input})=>ctx.db.transaction(async tx=>{
   await tx.select({id:users.id}).from(users).where(eq(users.id,ctx.user.id)).for("update");
   const [listing]=await tx.select().from(listings).where(and(eq(listings.id,input.listingId),eq(listings.sellerId,ctx.user.id))).for("update");
   if(!listing) throw new TRPCError({code:"NOT_FOUND",message:"Listing not found"});
   const [warehouse]=await tx.select().from(warehouses).where(and(eq(warehouses.id,input.warehouseId),eq(warehouses.sellerId,ctx.user.id),eq(warehouses.active,true))).for("share");
   if(!warehouse) throw new TRPCError({code:"NOT_FOUND",message:"Active warehouse not found"});
   if(listing.warehouseId===warehouse.id) return listing;
   const [reserved]=await tx.select({id:orders.id}).from(orders).where(and(eq(orders.listingId,listing.id),isNull(orders.inventoryReleasedAt),inArray(orders.status,["pending","confirmed","processing","shipped","cancelled"]))).limit(1);
   if(reserved) throw new TRPCError({code:"CONFLICT",message:"Complete or cancel reserved orders before reassigning this listing."});
   const geo=zipcodes.lookup(warehouse.zip);
   const [updated]=await tx.update(listings).set({warehouseId:warehouse.id,locationCity:warehouse.city,locationState:warehouse.state,locationZip:warehouse.zip,locationLat:geo?.latitude??null,locationLng:geo?.longitude??null,updatedAt:new Date()}).where(eq(listings.id,listing.id)).returning();
   return updated;
 })),
});
