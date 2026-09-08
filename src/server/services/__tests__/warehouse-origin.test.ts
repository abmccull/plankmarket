import { describe, it, expect } from "vitest";
import { resolveWarehouseOrigin, requireCurrentWarehouseOrigin } from "../warehouse-origin";
import type { Warehouse } from "@/server/db/schema";
import type { ShippingBookingSnapshot } from "../shipping-workflow";
const seller = {id:"seller-1",name:"Seller",email:"owner@example.test",phone:"5555550123",businessName:"Supplier",businessAddress:"100 Office Rd",businessCity:"Denver",businessState:"CO",businessZip:"80202"};
const listing = {sellerId:seller.id,warehouseId:"warehouse-1",locationZip:"77002",locationCity:"Houston",locationState:"TX"};
const warehouse = {id:"warehouse-1",sellerId:seller.id,label:"Houston",address:"200 Warehouse Rd",city:"Houston",state:"TX",zip:"77002",contactName:"Dock Lead",phone:"5555550124",pickupStart:"09:00",pickupEnd:"15:00",hasLoadingDock:true,hasForklift:false,latitude:29.75,longitude:-95.36,coordinateSource:"zip_centroid",active:true,isDefault:true,revision:1,createdAt:new Date(),updatedAt:new Date()} satisfies Warehouse;
describe("warehouse pickup origin",()=>{
 it("uses actual warehouse across states instead of legal address",()=>{
  const origin=resolveWarehouseOrigin(listing,seller,warehouse);
  expect(origin.location.address).toMatchObject({addressLine1:"200 Warehouse Rd",postalCode:"77002",state:"TX"});
  expect(origin).toMatchObject({pickupStart:"09:00",pickupEnd:"15:00",hasLoadingDock:true,coordinateSource:"zip_centroid"});
  expect(origin.location.contact.contactName).toBe("Dock Lead");
 });
 it.each([null,{...warehouse,sellerId:"other"},{...warehouse,active:false},{...warehouse,id:"other"}])("rejects missing, foreign or inactive warehouse",w=>{
  expect(()=>resolveWarehouseOrigin(listing,seller,w)).toThrow("active pickup warehouse");
 });
 it("allows only unambiguous legacy matching legal origin",()=>{
  const legacy={...listing,warehouseId:null,locationZip:"80202",locationCity:"Denver",locationState:"CO"};
  expect(resolveWarehouseOrigin(legacy,seller,null).identity).toBe("legacy:seller-1");
  expect(()=>resolveWarehouseOrigin({...legacy,locationZip:"77002"},seller,null)).toThrow();
  expect(()=>resolveWarehouseOrigin(legacy,{...seller,businessAddress:null},null)).toThrow();
  expect(()=>resolveWarehouseOrigin({...legacy,locationCity:"Aurora"},seller,null)).toThrow();
 });
 it("rejects edited origin, legacy missing revision and different assignment",()=>{
  const origin=resolveWarehouseOrigin(listing,seller,warehouse);
  const snapshot={originIdentity:origin.identity,originRevision:origin.revision,originLocation:origin.location} as ShippingBookingSnapshot;
  expect(()=>requireCurrentWarehouseOrigin(snapshot,origin)).not.toThrow();
  expect(()=>requireCurrentWarehouseOrigin({...snapshot,originRevision:undefined},origin)).toThrow("Pickup information changed");
  const updated=resolveWarehouseOrigin(listing,seller,{...warehouse,revision:2,address:"201 Warehouse Rd"});
  expect(()=>requireCurrentWarehouseOrigin(snapshot,updated)).toThrow();
  expect(()=>requireCurrentWarehouseOrigin(snapshot,{...origin,identity:"warehouse:other"})).toThrow();
 });
 it.each([{pickupEnd:"16:00"},{hasForklift:true}])("invalidates hours or equipment edits",change=>{
  expect(resolveWarehouseOrigin(listing,seller,warehouse).revision).not.toBe(resolveWarehouseOrigin(listing,seller,{...warehouse,...change}).revision);
 });
 it("invalidates contact edits without relying solely on revision",()=>{
  expect(resolveWarehouseOrigin(listing,seller,warehouse).revision).not.toBe(resolveWarehouseOrigin(listing,{...seller,email:"new@example.test"},warehouse).revision);
 });
});
