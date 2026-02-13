#!/usr/bin/env tsx
/**
 * PlankMarket Database Seed Script
 *
 * Populates the database with realistic test data:
 * 8 users, 16 listings, orders, reviews, watchlist, notifications, saved searches.
 *
 * Usage: npm run db:seed
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";
import zipcodes from "zipcodes";

import {
  users,
  listings,
  media,
  orders,
  reviews,
  watchlist,
  notifications,
  savedSearches,
  offers,
  offerEvents,
  conversations,
  messages,
  disputes,
  disputeMessages,
  feedback,
  listingPromotions,
} from "@/server/db/schema";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DATABASE_URL = process.env.DATABASE_URL;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!DATABASE_URL || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing required environment variables:");
  if (!DATABASE_URL) console.error("  - DATABASE_URL");
  if (!SUPABASE_URL) console.error("  - NEXT_PUBLIC_SUPABASE_URL");
  if (!SERVICE_ROLE_KEY) console.error("  - SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const queryClient = postgres(DATABASE_URL, { max: 1 });
const db = drizzle(queryClient);

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASSWORD = "Password123!";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function geoFromZip(zip: string) {
  const data = zipcodes.lookup(zip);
  if (!data) return { city: undefined, state: undefined, lat: undefined, lng: undefined };
  return { city: data.city, state: data.state, lat: data.latitude, lng: data.longitude };
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Data definitions
// ---------------------------------------------------------------------------

const USERS_DATA = [
  {
    email: "admin@plankmarket.com",
    name: "Admin User",
    role: "admin" as const,
    businessName: "PlankMarket",
    zip: "75201",
    verified: true,
    verificationStatus: "verified",
  },
  {
    email: "sarah@mitchellflooring.com",
    name: "Sarah Mitchell",
    role: "seller" as const,
    businessName: "Mitchell Flooring Supply",
    zip: "78701",
    verified: true,
    verificationStatus: "verified",
    phone: "+15125551234",
    einTaxId: "74-1234567",
    businessWebsite: "https://mitchellflooring.com",
    verificationDocUrl: "https://placehold.co/800x600/EEE/999?text=Business+License",
    businessAddress: "1400 S Congress Ave",
    aiVerificationScore: 95,
    aiVerificationNotes: JSON.stringify({ score: 95, approved: true, reasoning: "Legitimate flooring supply business with verified EIN and professional website.", checks: { einFormat: { pass: true, note: "Valid EIN format" }, websiteAnalysis: { pass: true, note: "Professional flooring supply website" }, documentAnalysis: { pass: true, note: "Valid business license" }, crossReference: { pass: true, note: "Business name matches across all documents" }, redFlags: { found: false, note: "No red flags detected" } } }),
  },
  {
    email: "james@chenfloors.com",
    name: "James Chen",
    role: "seller" as const,
    businessName: "Chen Floors & More",
    zip: "77002",
    verified: true,
    verificationStatus: "verified",
    phone: "+17135552345",
    einTaxId: "77-2345678",
    businessWebsite: "https://chenfloors.com",
    verificationDocUrl: "https://placehold.co/800x600/EEE/999?text=Business+License",
    businessAddress: "2200 Travis St",
    aiVerificationScore: 92,
    aiVerificationNotes: JSON.stringify({ score: 92, approved: true, reasoning: "Verified flooring retailer with consistent business information.", checks: { einFormat: { pass: true, note: "Valid EIN format" }, websiteAnalysis: { pass: true, note: "Active flooring business website" }, documentAnalysis: { pass: true, note: "Valid business license" }, crossReference: { pass: true, note: "All information consistent" }, redFlags: { found: false, note: "No red flags" } } }),
  },
  {
    email: "maria@garciahardwoods.com",
    name: "Maria Garcia",
    role: "seller" as const,
    businessName: "Garcia Hardwoods",
    zip: "78205",
    verified: false,
    verificationStatus: "pending",
    phone: "+12105553456",
    einTaxId: "78-3456789",
    businessWebsite: "https://garciahardwoods.com",
    verificationDocUrl: "https://placehold.co/800x600/EEE/999?text=Business+License",
    businessAddress: "500 E Market St",
    aiVerificationScore: 72,
    aiVerificationNotes: JSON.stringify({ score: 72, approved: false, reasoning: "Business appears legitimate but website is under construction and document quality is low.", checks: { einFormat: { pass: true, note: "Valid EIN format" }, websiteAnalysis: { pass: false, note: "Website appears to be under construction" }, documentAnalysis: { pass: false, note: "Document image is low resolution, hard to verify" }, crossReference: { pass: true, note: "Business name matches across submissions" }, redFlags: { found: false, note: "No major red flags, but website needs verification" } } }),
  },
  {
    email: "robert@thompsonlumber.com",
    name: "Robert Thompson",
    role: "seller" as const,
    businessName: "Thompson Lumber Co",
    zip: "76102",
    verified: false,
    verificationStatus: "pending",
    phone: "+18175554567",
    einTaxId: "76-4567890",
    businessWebsite: "https://thompsonlumber.com",
    verificationDocUrl: "https://placehold.co/800x600/EEE/999?text=Resale+Certificate",
    businessAddress: "800 Main St",
    aiVerificationScore: 58,
    aiVerificationNotes: JSON.stringify({ score: 58, approved: false, reasoning: "Several inconsistencies found that require manual review.", checks: { einFormat: { pass: true, note: "Valid EIN format" }, websiteAnalysis: { pass: false, note: "Website domain registered recently, minimal content" }, documentAnalysis: { pass: false, note: "Resale certificate appears to be for a different business name" }, crossReference: { pass: false, note: "Business name on certificate does not match registration" }, redFlags: { found: true, note: "Document business name mismatch requires investigation" } } }),
  },
  {
    email: "emily@davisflooring.com",
    name: "Emily Davis",
    role: "buyer" as const,
    businessName: "Davis Interior Design",
    zip: "75201",
    verified: true,
    verificationStatus: "verified",
    phone: "+12145555678",
    einTaxId: "75-5678901",
    businessWebsite: "https://davisinteriordesign.com",
    verificationDocUrl: "https://placehold.co/800x600/EEE/999?text=Business+License",
    businessAddress: "1200 Main St, Suite 400",
    aiVerificationScore: 96,
    aiVerificationNotes: JSON.stringify({ score: 96, approved: true, reasoning: "Well-established interior design business with strong online presence.", checks: { einFormat: { pass: true, note: "Valid EIN format" }, websiteAnalysis: { pass: true, note: "Professional interior design portfolio website" }, documentAnalysis: { pass: true, note: "Valid Texas business license" }, crossReference: { pass: true, note: "All business information is consistent" }, redFlags: { found: false, note: "No red flags detected" } } }),
  },
  {
    email: "michael@browncontracting.com",
    name: "Michael Brown",
    role: "buyer" as const,
    businessName: "Brown Contracting LLC",
    zip: "75024",
    verified: true,
    verificationStatus: "verified",
    phone: "+19725556789",
    einTaxId: "75-6789012",
    businessWebsite: "https://browncontracting.com",
    verificationDocUrl: "https://placehold.co/800x600/EEE/999?text=Business+License",
    businessAddress: "5600 Legacy Dr",
    aiVerificationScore: 91,
    aiVerificationNotes: JSON.stringify({ score: 91, approved: true, reasoning: "Licensed contracting business with verified credentials.", checks: { einFormat: { pass: true, note: "Valid EIN format" }, websiteAnalysis: { pass: true, note: "Active contracting company website" }, documentAnalysis: { pass: true, note: "Valid business license" }, crossReference: { pass: true, note: "Information consistent" }, redFlags: { found: false, note: "No red flags" } } }),
  },
  {
    email: "lisa@wilsonrenovations.com",
    name: "Lisa Wilson",
    role: "buyer" as const,
    businessName: "Wilson Renovations",
    zip: "75034",
    verified: false,
    verificationStatus: "pending",
    phone: "+14695557890",
    einTaxId: "75-7890123",
    businessWebsite: "https://wilsonrenovations.com",
    verificationDocUrl: "https://placehold.co/800x600/EEE/999?text=Resale+Certificate",
    businessAddress: "9100 Warren Pkwy",
    aiVerificationScore: 78,
    aiVerificationNotes: JSON.stringify({ score: 78, approved: false, reasoning: "Business likely legitimate but website has limited content and document needs closer review.", checks: { einFormat: { pass: true, note: "Valid EIN format" }, websiteAnalysis: { pass: false, note: "Website is a single-page site with limited info" }, documentAnalysis: { pass: true, note: "Resale certificate appears valid" }, crossReference: { pass: true, note: "Business name matches" }, redFlags: { found: false, note: "No major red flags" } } }),
  },
];

// Listing data keyed by seller email
type ListingSeed = {
  title: string;
  description: string;
  materialType: "hardwood" | "engineered" | "laminate" | "vinyl_lvp" | "bamboo";
  species: string | null;
  finish: "matte" | "semi_gloss" | "gloss" | "wire_brushed" | "hand_scraped" | "distressed" | "smooth" | "textured" | "oiled" | "unfinished";
  grade: "select" | "1_common" | "2_common" | "cabin" | "character" | "rustic" | "premium" | "standard" | "economy";
  color: string;
  colorFamily: string;
  thickness: number;
  width: number;
  length: number | null;
  wearLayer: number | null;
  brand: string | null;
  totalSqFt: number;
  sqFtPerBox: number;
  boxesPerPallet: number | null;
  totalPallets: number | null;
  moq: number | null;
  askPricePerSqFt: number;
  buyNowPrice: number | null;
  floorPrice: number | null;
  allowOffers: boolean;
  condition: "new_overstock" | "discontinued" | "closeout" | "remnants" | "slight_damage";
  reasonCode: "overproduction" | "color_change" | "line_discontinuation" | "warehouse_clearance" | "customer_return" | "slight_defect" | "packaging_damage" | "end_of_season" | null;
  certifications: string[];
  daysOld: number;
};

const LISTINGS_BY_SELLER: Record<string, ListingSeed[]> = {
  "sarah@mitchellflooring.com": [
    {
      title: "Premium White Oak Hardwood - Select Grade",
      description: "Beautiful select-grade white oak hardwood flooring with wire-brushed finish. Perfect for residential or light commercial installations. Full pallets available from warehouse overstock.",
      materialType: "hardwood",
      species: "oak",
      finish: "wire_brushed",
      grade: "select",
      color: "Natural White Oak",
      colorFamily: "natural",
      thickness: 0.75,
      width: 5,
      length: 48,
      wearLayer: null,
      brand: "Shaw",
      totalSqFt: 2000,
      sqFtPerBox: 25,
      boxesPerPallet: 40,
      totalPallets: 2,
      moq: 200,
      askPricePerSqFt: 4.50,
      buyNowPrice: 4.25,
      floorPrice: 3.80,
      allowOffers: true,
      condition: "new_overstock",
      reasonCode: "overproduction",
      certifications: ["fsc", "carb2"],
      daysOld: 14,
    },
    {
      title: "Engineered Maple Flooring - Wide Plank",
      description: "Wide plank engineered maple with a smooth premium finish. Discontinued line — excellent quality at clearance pricing. European birch plywood core for stability.",
      materialType: "engineered",
      species: "maple",
      finish: "smooth",
      grade: "premium",
      color: "Light Maple",
      colorFamily: "light",
      thickness: 0.5,
      width: 7,
      length: 72,
      wearLayer: 3,
      brand: "Mohawk",
      totalSqFt: 1500,
      sqFtPerBox: 30,
      boxesPerPallet: 25,
      totalPallets: 2,
      moq: 300,
      askPricePerSqFt: 5.25,
      buyNowPrice: 5.00,
      floorPrice: 4.50,
      allowOffers: true,
      condition: "discontinued",
      reasonCode: "line_discontinuation",
      certifications: ["floorscore", "greenguard"],
      daysOld: 21,
    },
    {
      title: "Luxury Vinyl Plank - Waterproof Oak Look",
      description: "High-quality waterproof LVP with realistic oak wood grain texture. 20mil commercial-grade wear layer. Great for kitchens, bathrooms, and basements. Closeout pricing on remaining inventory.",
      materialType: "vinyl_lvp",
      species: null,
      finish: "textured",
      grade: "standard",
      color: "Honey Oak",
      colorFamily: "medium",
      thickness: 0.31,
      width: 6,
      length: 48,
      wearLayer: 0.51,
      brand: "COREtec",
      totalSqFt: 3000,
      sqFtPerBox: 20,
      boxesPerPallet: 50,
      totalPallets: 3,
      moq: 200,
      askPricePerSqFt: 2.50,
      buyNowPrice: 2.25,
      floorPrice: 2.00,
      allowOffers: true,
      condition: "closeout",
      reasonCode: "color_change",
      certifications: ["floorscore", "greenguard_gold"],
      daysOld: 7,
    },
    {
      title: "Hickory Hardwood - Rustic Grade Hand Scraped",
      description: "Gorgeous hand-scraped hickory with dramatic color variation. Rustic grade adds character with natural knots and mineral streaks. Warehouse overstock from a builder project.",
      materialType: "hardwood",
      species: "hickory",
      finish: "hand_scraped",
      grade: "rustic",
      color: "Natural Hickory",
      colorFamily: "brown",
      thickness: 0.75,
      width: 5,
      length: 48,
      wearLayer: null,
      brand: "Bruce",
      totalSqFt: 1800,
      sqFtPerBox: 20,
      boxesPerPallet: 36,
      totalPallets: 2,
      moq: null,
      askPricePerSqFt: 3.75,
      buyNowPrice: null,
      floorPrice: 3.25,
      allowOffers: true,
      condition: "new_overstock",
      reasonCode: "warehouse_clearance",
      certifications: ["carb2"],
      daysOld: 30,
    },
    {
      title: "Natural Strand Bamboo Flooring",
      description: "Eco-friendly strand-woven bamboo flooring with impressive hardness rating. Smooth finish in a warm natural tone. Perfect for environmentally conscious projects.",
      materialType: "bamboo",
      species: "bamboo",
      finish: "smooth",
      grade: "standard",
      color: "Natural Bamboo",
      colorFamily: "blonde",
      thickness: 0.625,
      width: 4,
      length: 36,
      wearLayer: null,
      brand: "Cali Bamboo",
      totalSqFt: 1000,
      sqFtPerBox: 22,
      boxesPerPallet: 30,
      totalPallets: 1,
      moq: null,
      askPricePerSqFt: 3.00,
      buyNowPrice: 2.85,
      floorPrice: 2.50,
      allowOffers: true,
      condition: "new_overstock",
      reasonCode: "overproduction",
      certifications: ["fsc", "floorscore", "greenguard"],
      daysOld: 10,
    },
  ],
  "james@chenfloors.com": [
    {
      title: "Black Walnut Hardwood - Premium Grade",
      description: "Stunning premium-grade American black walnut. Rich chocolate tones with a refined matte finish. Limited availability — sourced from a high-end residential project overrun.",
      materialType: "hardwood",
      species: "walnut",
      finish: "matte",
      grade: "premium",
      color: "Dark Walnut",
      colorFamily: "dark",
      thickness: 0.75,
      width: 6,
      length: 72,
      wearLayer: null,
      brand: "Lauzon",
      totalSqFt: 800,
      sqFtPerBox: 20,
      boxesPerPallet: 40,
      totalPallets: 1,
      moq: 200,
      askPricePerSqFt: 7.50,
      buyNowPrice: null,
      floorPrice: 6.50,
      allowOffers: true,
      condition: "new_overstock",
      reasonCode: "overproduction",
      certifications: ["fsc", "carb2"],
      daysOld: 5,
    },
    {
      title: "Engineered Acacia - Wide Plank Handscraped",
      description: "Exotic acacia engineered flooring with dramatic grain patterns and hand-scraped texture. Discontinued pattern with plenty of stock remaining. Multi-ply construction for dimensional stability.",
      materialType: "engineered",
      species: "acacia",
      finish: "hand_scraped",
      grade: "character",
      color: "Toffee Acacia",
      colorFamily: "brown",
      thickness: 0.5,
      width: 7,
      length: 48,
      wearLayer: 2,
      brand: null,
      totalSqFt: 2500,
      sqFtPerBox: 25,
      boxesPerPallet: 40,
      totalPallets: 2,
      moq: 500,
      askPricePerSqFt: 4.00,
      buyNowPrice: 3.75,
      floorPrice: 3.25,
      allowOffers: true,
      condition: "discontinued",
      reasonCode: "line_discontinuation",
      certifications: ["carb2"],
      daysOld: 18,
    },
    {
      title: "Commercial LVP - 28mil Wear Layer",
      description: "Heavy-duty commercial luxury vinyl plank with 28mil wear layer. Ideal for retail, office, and high-traffic residential. Rigid SPC core with attached underlayment. Closeout on discontinued color.",
      materialType: "vinyl_lvp",
      species: null,
      finish: "textured",
      grade: "premium",
      color: "Weathered Grey",
      colorFamily: "gray",
      thickness: 0.31,
      width: 7,
      length: 48,
      wearLayer: 0.71,
      brand: "Mannington",
      totalSqFt: 5000,
      sqFtPerBox: 24,
      boxesPerPallet: 48,
      totalPallets: 4,
      moq: 500,
      askPricePerSqFt: 3.25,
      buyNowPrice: 3.00,
      floorPrice: 2.75,
      allowOffers: true,
      condition: "closeout",
      reasonCode: "color_change",
      certifications: ["floorscore", "greenguard_gold"],
      daysOld: 12,
    },
    {
      title: "Red Oak Hardwood - #1 Common Grade",
      description: "Classic red oak hardwood in #1 common grade. Traditional semi-gloss finish. Remnant lot from a completed commercial install — priced to move.",
      materialType: "hardwood",
      species: "oak",
      finish: "semi_gloss",
      grade: "1_common",
      color: "Red Oak Natural",
      colorFamily: "red",
      thickness: 0.75,
      width: 3.25,
      length: 36,
      wearLayer: null,
      brand: "Somerset",
      totalSqFt: 500,
      sqFtPerBox: 20,
      boxesPerPallet: 25,
      totalPallets: 1,
      moq: null,
      askPricePerSqFt: 2.75,
      buyNowPrice: 2.50,
      floorPrice: 2.25,
      allowOffers: true,
      condition: "remnants",
      reasonCode: "warehouse_clearance",
      certifications: [],
      daysOld: 25,
    },
    {
      title: "Laminate Flooring - AC5 Commercial Grade",
      description: "High-performance AC5 commercial-grade laminate. Wide plank format with realistic wood-grain texture. Excellent for commercial spaces and rental properties. Bulk lot available.",
      materialType: "laminate",
      species: null,
      finish: "textured",
      grade: "standard",
      color: "Warm Chestnut",
      colorFamily: "medium",
      thickness: 0.47,
      width: 8,
      length: 48,
      wearLayer: 0.5,
      brand: "Pergo",
      totalSqFt: 4000,
      sqFtPerBox: 25,
      boxesPerPallet: 40,
      totalPallets: 4,
      moq: 400,
      askPricePerSqFt: 1.75,
      buyNowPrice: 1.60,
      floorPrice: 1.40,
      allowOffers: true,
      condition: "new_overstock",
      reasonCode: "overproduction",
      certifications: ["floorscore"],
      daysOld: 8,
    },
  ],
  "maria@garciahardwoods.com": [
    {
      title: "Brazilian Cherry Engineered - Gloss Finish",
      description: "Exotic Brazilian cherry (Jatoba) engineered flooring with a stunning high-gloss finish. Discontinued from manufacturer — extremely limited availability. Rich red-brown tones deepen with light exposure.",
      materialType: "engineered",
      species: "brazilian_cherry",
      finish: "gloss",
      grade: "select",
      color: "Brazilian Cherry",
      colorFamily: "red",
      thickness: 0.625,
      width: 5,
      length: 48,
      wearLayer: 4,
      brand: "IndusParquet",
      totalSqFt: 600,
      sqFtPerBox: 20,
      boxesPerPallet: 30,
      totalPallets: 1,
      moq: null,
      askPricePerSqFt: 6.50,
      buyNowPrice: null,
      floorPrice: 5.50,
      allowOffers: true,
      condition: "discontinued",
      reasonCode: "line_discontinuation",
      certifications: ["fsc"],
      daysOld: 16,
    },
    {
      title: "White Oak Wide Plank - Unfinished",
      description: "Premium unfinished white oak in an extra-wide 8\" plank. Ideal for custom staining and finishing on site. Select grade with minimal character marks. New overstock from a cancelled project.",
      materialType: "hardwood",
      species: "oak",
      finish: "unfinished",
      grade: "select",
      color: "Unfinished Oak",
      colorFamily: "natural",
      thickness: 0.75,
      width: 8,
      length: 72,
      wearLayer: null,
      brand: null,
      totalSqFt: 1200,
      sqFtPerBox: 24,
      boxesPerPallet: 30,
      totalPallets: 1,
      moq: 240,
      askPricePerSqFt: 5.00,
      buyNowPrice: null,
      floorPrice: 4.25,
      allowOffers: true,
      condition: "new_overstock",
      reasonCode: "warehouse_clearance",
      certifications: ["fsc", "carb2"],
      daysOld: 22,
    },
    {
      title: "Vinyl Plank - Grey Oak Look Budget LVP",
      description: "Budget-friendly grey-toned vinyl plank with a realistic oak-look texture. Great option for rental properties, basement finishes, and budget renovations. Closeout pricing — large lot.",
      materialType: "vinyl_lvp",
      species: null,
      finish: "textured",
      grade: "standard",
      color: "Grey Oak",
      colorFamily: "gray",
      thickness: 0.28,
      width: 6,
      length: 36,
      wearLayer: 0.3,
      brand: "TrafficMaster",
      totalSqFt: 3500,
      sqFtPerBox: 24,
      boxesPerPallet: 48,
      totalPallets: 3,
      moq: 240,
      askPricePerSqFt: 1.50,
      buyNowPrice: 1.35,
      floorPrice: 1.10,
      allowOffers: true,
      condition: "closeout",
      reasonCode: "end_of_season",
      certifications: ["carb2"],
      daysOld: 4,
    },
  ],
  "robert@thompsonlumber.com": [
    {
      title: "Hickory Engineered - Wire Brushed Character",
      description: "Character-grade hickory engineered flooring with a wire-brushed finish that highlights the natural grain. Tongue and groove profile for easy installation. Overstock from a multi-unit project.",
      materialType: "engineered",
      species: "hickory",
      finish: "wire_brushed",
      grade: "character",
      color: "Provincial Hickory",
      colorFamily: "brown",
      thickness: 0.5,
      width: 6,
      length: 48,
      wearLayer: 2,
      brand: "Anderson Tuftex",
      totalSqFt: 2000,
      sqFtPerBox: 24,
      boxesPerPallet: 36,
      totalPallets: 2,
      moq: 240,
      askPricePerSqFt: 4.25,
      buyNowPrice: 4.00,
      floorPrice: 3.50,
      allowOffers: true,
      condition: "new_overstock",
      reasonCode: "overproduction",
      certifications: ["floorscore", "carb2"],
      daysOld: 9,
    },
    {
      title: "Oak Laminate - Economy Grade Cottage",
      description: "Economy-grade oak-look laminate flooring. AC3 rated for residential use. Cottage-style planks with a light textured surface. Remnant lot — great for quick budget projects.",
      materialType: "laminate",
      species: null,
      finish: "textured",
      grade: "economy",
      color: "Cottage Oak",
      colorFamily: "light",
      thickness: 0.39,
      width: 7,
      length: 48,
      wearLayer: 0.2,
      brand: "Dream Home",
      totalSqFt: 1500,
      sqFtPerBox: 24,
      boxesPerPallet: 40,
      totalPallets: 1,
      moq: null,
      askPricePerSqFt: 1.50,
      buyNowPrice: 1.35,
      floorPrice: 1.10,
      allowOffers: true,
      condition: "remnants",
      reasonCode: "warehouse_clearance",
      certifications: [],
      daysOld: 20,
    },
    {
      title: "Walnut Hardwood - Character Grade Oiled",
      description: "Beautiful character-grade American walnut with a natural oil finish that enhances the grain. Closeout lot from a specialty retailer. Sapwood accents add visual interest.",
      materialType: "hardwood",
      species: "walnut",
      finish: "oiled",
      grade: "character",
      color: "Natural Walnut",
      colorFamily: "dark",
      thickness: 0.75,
      width: 5,
      length: 48,
      wearLayer: null,
      brand: "Riva",
      totalSqFt: 750,
      sqFtPerBox: 18,
      boxesPerPallet: 30,
      totalPallets: 1,
      moq: null,
      askPricePerSqFt: 6.00,
      buyNowPrice: null,
      floorPrice: 5.00,
      allowOffers: true,
      condition: "closeout",
      reasonCode: "end_of_season",
      certifications: ["fsc"],
      daysOld: 15,
    },
  ],
};

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------

async function seed() {
  console.log("Starting PlankMarket database seed...\n");

  // -----------------------------------------------------------------------
  // 1. Clear existing data (reverse FK dependency order)
  // -----------------------------------------------------------------------
  console.log("Clearing existing data...");

  // Some tables may not be migrated yet — skip gracefully
  const tables = [
    messages, conversations, offerEvents,
    disputeMessages, disputes, feedback, savedSearches,
    notifications, watchlist, reviews, listingPromotions,
    offers, orders, media, listings, users,
  ];
  for (const table of tables) {
    try { await db.delete(table); } catch { /* table may not exist */ }
  }

  // Delete all Supabase auth users
  const { data: existingAuthUsers } = await supabase.auth.admin.listUsers();
  if (existingAuthUsers?.users) {
    for (const u of existingAuthUsers.users) {
      await supabase.auth.admin.deleteUser(u.id);
    }
  }
  console.log("  Done — all tables and auth users cleared\n");

  // -----------------------------------------------------------------------
  // 2. Create users (auth + public table)
  // -----------------------------------------------------------------------
  console.log("Creating users...");
  const userMap: Record<string, string> = {}; // email → users.id

  for (const u of USERS_DATA) {
    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email: u.email,
        password: PASSWORD,
        email_confirm: true,
      });

    if (authError || !authData.user) {
      console.error(`  FAILED auth user ${u.email}: ${authError?.message}`);
      continue;
    }

    const geo = geoFromZip(u.zip);

    const [row] = await db
      .insert(users)
      .values({
        authId: authData.user.id,
        email: u.email,
        name: u.name,
        phone: u.phone,
        role: u.role,
        businessName: u.businessName,
        businessCity: geo.city,
        businessState: geo.state,
        businessZip: u.zip,
        verified: u.verified,
        verificationStatus: u.verificationStatus,
        stripeOnboardingComplete: u.role === "seller" && u.verified,
        zipCode: u.zip,
        lat: geo.lat,
        lng: geo.lng,
        // Verification fields
        einTaxId: "einTaxId" in u ? (u as Record<string, unknown>).einTaxId as string : undefined,
        businessWebsite: "businessWebsite" in u ? (u as Record<string, unknown>).businessWebsite as string : undefined,
        verificationDocUrl: "verificationDocUrl" in u ? (u as Record<string, unknown>).verificationDocUrl as string : undefined,
        businessAddress: "businessAddress" in u ? (u as Record<string, unknown>).businessAddress as string : undefined,
        aiVerificationScore: "aiVerificationScore" in u ? (u as Record<string, unknown>).aiVerificationScore as number : undefined,
        aiVerificationNotes: "aiVerificationNotes" in u ? (u as Record<string, unknown>).aiVerificationNotes as string : undefined,
        verificationRequestedAt: u.verificationStatus !== "unverified" ? daysAgo(30) : undefined,
      })
      .returning();

    userMap[u.email] = row!.id;
    console.log(`  + ${u.name} (${u.role}) — ${u.email}`);
  }
  console.log();

  // -----------------------------------------------------------------------
  // 3. Create listings + media
  // -----------------------------------------------------------------------
  console.log("Creating listings...");
  const listingIds: string[] = []; // ordered array for later reference
  const listingSellerMap: Record<string, string> = {}; // listingId → seller email

  for (const [sellerEmail, seedListings] of Object.entries(LISTINGS_BY_SELLER)) {
    const sellerId = userMap[sellerEmail];
    if (!sellerId) {
      console.error(`  No user found for seller ${sellerEmail}, skipping listings`);
      continue;
    }

    const sellerData = USERS_DATA.find((u) => u.email === sellerEmail)!;
    const sellerGeo = geoFromZip(sellerData.zip);

    for (const l of seedListings) {
      const [row] = await db
        .insert(listings)
        .values({
          sellerId,
          title: l.title,
          description: l.description,
          status: "active",
          materialType: l.materialType,
          species: l.species,
          finish: l.finish,
          grade: l.grade,
          color: l.color,
          colorFamily: l.colorFamily,
          thickness: l.thickness,
          width: l.width,
          length: l.length,
          wearLayer: l.wearLayer,
          brand: l.brand,
          totalSqFt: l.totalSqFt,
          originalTotalSqFt: l.totalSqFt,
          sqFtPerBox: l.sqFtPerBox,
          boxesPerPallet: l.boxesPerPallet,
          totalPallets: l.totalPallets,
          moq: l.moq,
          locationCity: sellerGeo.city,
          locationState: sellerGeo.state,
          locationZip: sellerData.zip,
          locationLat: sellerGeo.lat,
          locationLng: sellerGeo.lng,
          askPricePerSqFt: l.askPricePerSqFt,
          buyNowPrice: l.buyNowPrice,
          floorPrice: l.floorPrice,
          allowOffers: l.allowOffers,
          condition: l.condition,
          reasonCode: l.reasonCode,
          certifications: l.certifications,
          viewsCount: Math.floor(Math.random() * 150) + 10,
          watchlistCount: Math.floor(Math.random() * 12),
          offerCount: Math.floor(Math.random() * 5),
          createdAt: daysAgo(l.daysOld),
          updatedAt: daysAgo(Math.max(0, l.daysOld - 2)),
          expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days from now
        })
        .returning();

      const listingId = row!.id;
      listingIds.push(listingId);
      listingSellerMap[listingId] = sellerEmail;

      // Insert 1–2 placeholder media per listing
      const matLabel = l.materialType.replace("_", "+");
      const specLabel = l.species ?? l.materialType;

      await db.insert(media).values({
        listingId,
        url: `https://placehold.co/800x600/EEE/999?text=${encodeURIComponent(specLabel + " flooring")}`,
        fileName: `${specLabel}-flooring-1.jpg`,
        mimeType: "image/jpeg",
        altText: l.title,
        sortOrder: 0,
      });

      // ~60% of listings get a second image
      if (l.daysOld % 3 !== 0) {
        await db.insert(media).values({
          listingId,
          url: `https://placehold.co/800x600/DDD/888?text=${encodeURIComponent(matLabel + " detail")}`,
          fileName: `${specLabel}-flooring-2.jpg`,
          mimeType: "image/jpeg",
          altText: `${l.title} — detail`,
          sortOrder: 1,
        });
      }

      console.log(`  + [${l.materialType}] ${l.title}`);
    }
  }
  console.log();

  // -----------------------------------------------------------------------
  // 4. Create orders
  // -----------------------------------------------------------------------
  console.log("Creating orders...");

  // Helper to compute order financials
  function orderFinancials(qty: number, price: number) {
    const subtotal = +(qty * price).toFixed(4);
    const buyerFee = +(subtotal * 0.03).toFixed(4);
    const sellerFee = +(subtotal * 0.02).toFixed(4);
    return {
      quantitySqFt: qty,
      pricePerSqFt: price,
      subtotal,
      buyerFee,
      sellerFee,
      totalPrice: +(subtotal + buyerFee).toFixed(4),
      sellerPayout: +(subtotal - sellerFee).toFixed(4),
    };
  }

  // Listing indices (0-based from listingIds array):
  // 0: Sarah - White Oak Hardwood
  // 1: Sarah - Engineered Maple
  // 2: Sarah - LVP
  // 3: Sarah - Hickory
  // 4: Sarah - Bamboo
  // 5: James - Black Walnut
  // 6: James - Acacia
  // 7: James - Commercial LVP
  // 8: James - Red Oak
  // 9: James - Laminate
  // 10: Maria - Brazilian Cherry
  // 11: Maria - White Oak Unfinished
  // 12: Maria - Vinyl Plank Grey
  // 13: Robert - Hickory Eng
  // 14: Robert - Oak Laminate
  // 15: Robert - Walnut Character

  const ordersData = [
    {
      orderNumber: "PM-100001",
      buyerEmail: "emily@davisflooring.com",
      sellerEmail: "sarah@mitchellflooring.com",
      listingIdx: 0,
      qty: 500,
      price: 4.50,
      status: "delivered" as const,
      paymentStatus: "paid",
      escrowStatus: "released",
      shippingName: "Emily Davis",
      shippingAddress: "1200 Main St, Suite 400",
      shippingCity: "Dallas",
      shippingState: "TX",
      shippingZip: "75201",
      trackingNumber: "1Z999AA10123456784",
      carrier: "UPS Freight",
      createdAt: daysAgo(28),
      confirmedAt: daysAgo(27),
      shippedAt: daysAgo(25),
      deliveredAt: daysAgo(22),
    },
    {
      orderNumber: "PM-100002",
      buyerEmail: "michael@browncontracting.com",
      sellerEmail: "james@chenfloors.com",
      listingIdx: 9,
      qty: 1000,
      price: 1.75,
      status: "delivered" as const,
      paymentStatus: "paid",
      escrowStatus: "released",
      shippingName: "Michael Brown",
      shippingAddress: "5600 Legacy Dr",
      shippingCity: "Plano",
      shippingState: "TX",
      shippingZip: "75024",
      trackingNumber: "1Z999AA10123456785",
      carrier: "FedEx Freight",
      createdAt: daysAgo(20),
      confirmedAt: daysAgo(19),
      shippedAt: daysAgo(17),
      deliveredAt: daysAgo(14),
    },
    {
      orderNumber: "PM-100003",
      buyerEmail: "emily@davisflooring.com",
      sellerEmail: "james@chenfloors.com",
      listingIdx: 7,
      qty: 2000,
      price: 3.25,
      status: "shipped" as const,
      paymentStatus: "paid",
      escrowStatus: "held",
      shippingName: "Emily Davis",
      shippingAddress: "1200 Main St, Suite 400",
      shippingCity: "Dallas",
      shippingState: "TX",
      shippingZip: "75201",
      trackingNumber: "PRO-87654321",
      carrier: "Old Dominion",
      createdAt: daysAgo(10),
      confirmedAt: daysAgo(9),
      shippedAt: daysAgo(7),
      deliveredAt: null,
    },
    {
      orderNumber: "PM-100004",
      buyerEmail: "lisa@wilsonrenovations.com",
      sellerEmail: "sarah@mitchellflooring.com",
      listingIdx: 2,
      qty: 800,
      price: 2.50,
      status: "confirmed" as const,
      paymentStatus: "paid",
      escrowStatus: "held",
      shippingName: "Lisa Wilson",
      shippingAddress: "9100 Warren Pkwy",
      shippingCity: "Frisco",
      shippingState: "TX",
      shippingZip: "75034",
      trackingNumber: null,
      carrier: null,
      createdAt: daysAgo(3),
      confirmedAt: daysAgo(2),
      shippedAt: null,
      deliveredAt: null,
    },
  ];

  const orderIds: string[] = [];
  for (const o of ordersData) {
    const fin = orderFinancials(o.qty, o.price);
    const [row] = await db
      .insert(orders)
      .values({
        orderNumber: o.orderNumber,
        buyerId: userMap[o.buyerEmail]!,
        sellerId: userMap[o.sellerEmail]!,
        listingId: listingIds[o.listingIdx]!,
        ...fin,
        stripePaymentIntentId: `pi_seed_${o.orderNumber}`,
        paymentStatus: o.paymentStatus,
        status: o.status,
        escrowStatus: o.escrowStatus,
        shippingName: o.shippingName,
        shippingAddress: o.shippingAddress,
        shippingCity: o.shippingCity,
        shippingState: o.shippingState,
        shippingZip: o.shippingZip,
        trackingNumber: o.trackingNumber,
        carrier: o.carrier,
        createdAt: o.createdAt,
        updatedAt: o.confirmedAt ?? o.createdAt,
        confirmedAt: o.confirmedAt,
        shippedAt: o.shippedAt,
        deliveredAt: o.deliveredAt,
      })
      .returning();

    orderIds.push(row!.id);
    console.log(`  + ${o.orderNumber} — ${o.status} (${o.buyerEmail} -> ${o.sellerEmail})`);
  }
  console.log();

  // -----------------------------------------------------------------------
  // 5. Create reviews (on delivered orders)
  // -----------------------------------------------------------------------
  console.log("Creating reviews...");

  const reviewsData = [
    {
      orderIdx: 0,
      reviewerEmail: "emily@davisflooring.com",
      sellerEmail: "sarah@mitchellflooring.com",
      rating: 5,
      title: "Excellent quality oak flooring!",
      comment:
        "The white oak planks were in perfect condition, exactly as described. Sarah was responsive and shipping was fast. Would absolutely buy from Mitchell Flooring Supply again.",
      communicationRating: 5,
      accuracyRating: 5,
      shippingRating: 5,
      sellerResponse: "Thank you Emily! It was a pleasure working with you. Let us know if you need anything for your next project!",
      sellerRespondedAt: daysAgo(20),
    },
    {
      orderIdx: 1,
      reviewerEmail: "michael@browncontracting.com",
      sellerEmail: "james@chenfloors.com",
      rating: 4,
      title: "Great laminate at a good price",
      comment:
        "The laminate flooring was exactly what we needed for a commercial project. Good quality for the price. One pallet had a few damaged boxes but James sent replacements promptly.",
      communicationRating: 5,
      accuracyRating: 4,
      shippingRating: 3,
      sellerResponse: null,
      sellerRespondedAt: null,
    },
  ];

  for (const r of reviewsData) {
    await db.insert(reviews).values({
      orderId: orderIds[r.orderIdx]!,
      reviewerId: userMap[r.reviewerEmail]!,
      sellerId: userMap[r.sellerEmail]!,
      rating: r.rating,
      title: r.title,
      comment: r.comment,
      communicationRating: r.communicationRating,
      accuracyRating: r.accuracyRating,
      shippingRating: r.shippingRating,
      sellerResponse: r.sellerResponse,
      sellerRespondedAt: r.sellerRespondedAt,
      createdAt: daysAgo(r.orderIdx === 0 ? 21 : 13),
    });
    console.log(`  + ${r.reviewerEmail} reviewed order ${ordersData[r.orderIdx]!.orderNumber} — ${r.rating}/5`);
  }
  console.log();

  // -----------------------------------------------------------------------
  // 6. Create watchlist entries
  // -----------------------------------------------------------------------
  console.log("Creating watchlist entries...");

  const watchlistData = [
    { userEmail: "emily@davisflooring.com", listingIdx: 5 },   // Black Walnut
    { userEmail: "emily@davisflooring.com", listingIdx: 10 },  // Brazilian Cherry
    { userEmail: "emily@davisflooring.com", listingIdx: 13 },  // Hickory Engineered
    { userEmail: "michael@browncontracting.com", listingIdx: 1 },  // Engineered Maple
    { userEmail: "michael@browncontracting.com", listingIdx: 11 }, // White Oak Unfinished
    { userEmail: "lisa@wilsonrenovations.com", listingIdx: 6 },    // Acacia
  ];

  for (const w of watchlistData) {
    await db.insert(watchlist).values({
      userId: userMap[w.userEmail]!,
      listingId: listingIds[w.listingIdx]!,
    });
  }
  console.log(`  + ${watchlistData.length} watchlist entries\n`);

  // -----------------------------------------------------------------------
  // 7. Create notifications
  // -----------------------------------------------------------------------
  console.log("Creating notifications...");

  const notificationsData = [
    {
      userEmail: "emily@davisflooring.com",
      type: "order_delivered" as const,
      title: "Order Delivered",
      message: "Your order PM-100001 has been delivered. Please inspect and confirm.",
      read: true,
      createdAt: daysAgo(22),
    },
    {
      userEmail: "emily@davisflooring.com",
      type: "order_shipped" as const,
      title: "Order Shipped",
      message: "Your order PM-100003 has shipped via Old Dominion. Tracking: PRO-87654321",
      read: true,
      createdAt: daysAgo(7),
    },
    {
      userEmail: "emily@davisflooring.com",
      type: "listing_match" as const,
      title: "New Listing Match",
      message: "A new listing matching your saved search 'Hardwood Oak' has been posted.",
      read: false,
      createdAt: hoursAgo(6),
    },
    {
      userEmail: "michael@browncontracting.com",
      type: "order_delivered" as const,
      title: "Order Delivered",
      message: "Your order PM-100002 has been delivered. Please inspect and confirm.",
      read: true,
      createdAt: daysAgo(14),
    },
    {
      userEmail: "michael@browncontracting.com",
      type: "listing_match" as const,
      title: "New Listing Match",
      message: "A new listing matching your saved search 'Commercial LVP' has been posted.",
      read: false,
      createdAt: hoursAgo(2),
    },
    {
      userEmail: "sarah@mitchellflooring.com",
      type: "payment_received" as const,
      title: "Payment Received",
      message: "Payment of $2,317.50 for order PM-100001 has been released to your account.",
      read: true,
      createdAt: daysAgo(22),
    },
    {
      userEmail: "sarah@mitchellflooring.com",
      type: "review_received" as const,
      title: "New Review",
      message: "Emily Davis left a 5-star review on order PM-100001.",
      read: true,
      createdAt: daysAgo(21),
    },
    {
      userEmail: "sarah@mitchellflooring.com",
      type: "new_offer" as const,
      title: "New Offer Received",
      message: "You received a new offer on 'Hickory Hardwood - Rustic Grade Hand Scraped'.",
      read: false,
      createdAt: hoursAgo(12),
    },
    {
      userEmail: "james@chenfloors.com",
      type: "payment_received" as const,
      title: "Payment Received",
      message: "Payment of $1,715.00 for order PM-100002 has been released to your account.",
      read: true,
      createdAt: daysAgo(14),
    },
    {
      userEmail: "james@chenfloors.com",
      type: "listing_expiring" as const,
      title: "Listing Expiring Soon",
      message: "Your listing 'Red Oak Hardwood - #1 Common Grade' will expire in 7 days.",
      read: false,
      createdAt: daysAgo(1),
    },
    {
      userEmail: "lisa@wilsonrenovations.com",
      type: "order_confirmed" as const,
      title: "Order Confirmed",
      message: "Your order PM-100004 has been confirmed by the seller and is being prepared for shipment.",
      read: true,
      createdAt: daysAgo(2),
    },
    {
      userEmail: "lisa@wilsonrenovations.com",
      type: "listing_match" as const,
      title: "New Listing Match",
      message: "New waterproof vinyl planks were listed that match your interests.",
      read: false,
      createdAt: hoursAgo(8),
    },
  ];

  for (const n of notificationsData) {
    await db.insert(notifications).values({
      userId: userMap[n.userEmail]!,
      type: n.type,
      title: n.title,
      message: n.message,
      read: n.read,
      createdAt: n.createdAt,
    });
  }
  console.log(`  + ${notificationsData.length} notifications\n`);

  // -----------------------------------------------------------------------
  // 8. Create saved searches
  // -----------------------------------------------------------------------
  console.log("Creating saved searches...");

  await db.insert(savedSearches).values({
    userId: userMap["emily@davisflooring.com"]!,
    name: "Hardwood Oak",
    filters: {
      materialType: ["hardwood"],
      species: ["oak"],
      priceMax: 6,
      condition: ["new_overstock", "discontinued"],
    },
    alertEnabled: true,
  });

  await db.insert(savedSearches).values({
    userId: userMap["michael@browncontracting.com"]!,
    name: "Commercial LVP",
    filters: {
      materialType: ["vinyl_lvp"],
      priceMax: 4,
      minLotSize: 1000,
    },
    alertEnabled: true,
  });

  console.log("  + 2 saved searches\n");

  // -----------------------------------------------------------------------
  // 9. Create listing promotions
  // -----------------------------------------------------------------------
  console.log("Creating promotions...");

  // Listing indices reference (from listingIds array):
  // 0: Sarah - White Oak Hardwood       5: James - Black Walnut
  // 1: Sarah - Engineered Maple         6: James - Acacia
  // 2: Sarah - LVP                      7: James - Commercial LVP
  // 3: Sarah - Hickory                  8: James - Red Oak
  // 4: Sarah - Bamboo                   9: James - Laminate
  // 10: Maria - Brazilian Cherry        13: Robert - Hickory Eng
  // 11: Maria - White Oak Unfinished    14: Robert - Oak Laminate
  // 12: Maria - Vinyl Grey              15: Robert - Walnut Character

  const now = new Date();

  const promotionsData = [
    {
      // Premium — Sarah's White Oak (her best listing, high-visibility)
      listingIdx: 0,
      sellerEmail: "sarah@mitchellflooring.com",
      tier: "premium" as const,
      durationDays: 30,
      pricePaid: 599,
      daysActive: 8, // started 8 days ago, 22 days remaining
      isActive: true,
      paymentStatus: "succeeded",
    },
    {
      // Featured — James's Commercial LVP (large lot, commercial appeal)
      listingIdx: 7,
      sellerEmail: "james@chenfloors.com",
      tier: "featured" as const,
      durationDays: 14,
      pricePaid: 139,
      daysActive: 5, // started 5 days ago, 9 days remaining
      isActive: true,
      paymentStatus: "succeeded",
    },
    {
      // Spotlight — Sarah's Hickory Hardwood
      listingIdx: 3,
      sellerEmail: "sarah@mitchellflooring.com",
      tier: "spotlight" as const,
      durationDays: 14,
      pricePaid: 49,
      daysActive: 10, // started 10 days ago, 4 days remaining
      isActive: true,
      paymentStatus: "succeeded",
    },
    {
      // Featured — James's Black Walnut (premium product)
      listingIdx: 5,
      sellerEmail: "james@chenfloors.com",
      tier: "featured" as const,
      durationDays: 7,
      pricePaid: 79,
      daysActive: 3, // started 3 days ago, 4 days remaining
      isActive: true,
      paymentStatus: "succeeded",
    },
    {
      // Expired — Sarah's Engineered Maple (was spotlight, expired 2 days ago)
      listingIdx: 1,
      sellerEmail: "sarah@mitchellflooring.com",
      tier: "spotlight" as const,
      durationDays: 7,
      pricePaid: 29,
      daysActive: 9, // started 9 days ago (7-day duration = expired 2 days ago)
      isActive: false,
      paymentStatus: "succeeded",
    },
  ];

  for (const p of promotionsData) {
    const startsAt = new Date(now.getTime() - p.daysActive * 24 * 60 * 60 * 1000);
    const expiresAt = new Date(startsAt.getTime() + p.durationDays * 24 * 60 * 60 * 1000);

    await db.insert(listingPromotions).values({
      listingId: listingIds[p.listingIdx]!,
      sellerId: userMap[p.sellerEmail]!,
      tier: p.tier,
      durationDays: p.durationDays,
      pricePaid: p.pricePaid,
      startsAt,
      expiresAt,
      isActive: p.isActive,
      stripePaymentIntentId: `pi_seed_promo_${p.listingIdx}_${p.tier}`,
      paymentStatus: p.paymentStatus,
    });

    // Update denormalized fields on the listing for active promotions
    if (p.isActive) {
      await db
        .update(listings)
        .set({
          promotionTier: p.tier,
          promotionExpiresAt: expiresAt,
        })
        .where(eq(listings.id, listingIds[p.listingIdx]!));
    }

    const status = p.isActive ? `active (${p.durationDays - p.daysActive}d left)` : "expired";
    console.log(`  + [${p.tier}] listing #${p.listingIdx} — ${status}`);
  }
  console.log();

  // -----------------------------------------------------------------------
  // 10. Create conversations & messages
  // -----------------------------------------------------------------------
  console.log("Creating conversations & messages...");

  // Conversation 1: Emily asking Sarah about White Oak (listing 0)
  const [conv1] = await db
    .insert(conversations)
    .values({
      listingId: listingIds[0]!,
      buyerId: userMap["emily@davisflooring.com"]!,
      sellerId: userMap["sarah@mitchellflooring.com"]!,
      lastMessageAt: hoursAgo(3),
      buyerLastReadAt: hoursAgo(3),
      sellerLastReadAt: hoursAgo(5),
    })
    .returning();

  const conv1Messages = [
    {
      senderId: userMap["emily@davisflooring.com"]!,
      body: "Hi Sarah! I'm interested in the White Oak Hardwood. Is the full 2,000 sq ft still available? I have a residential project in Dallas that would be perfect for this.",
      createdAt: daysAgo(2),
    },
    {
      senderId: userMap["sarah@mitchellflooring.com"]!,
      body: "Hi Emily! Yes, the full lot is still available. We have 2 full pallets in our Austin warehouse. Are you looking for the full quantity or would a partial order work?",
      createdAt: hoursAgo(46),
    },
    {
      senderId: userMap["emily@davisflooring.com"]!,
      body: "I'd probably need about 500 sq ft for this project. Is that possible? Also, could you share any close-up photos of the wire-brushed finish?",
      createdAt: daysAgo(1),
    },
    {
      senderId: userMap["sarah@mitchellflooring.com"]!,
      body: "Absolutely, 500 sq ft works fine — that's 20 boxes. I'll take some detail shots tomorrow and send them over. The wire-brushed texture is really beautiful in person, very natural feel.",
      createdAt: hoursAgo(18),
    },
    {
      senderId: userMap["emily@davisflooring.com"]!,
      body: "That would be great, thank you! One more question — do you offer freight shipping to Dallas or would I need to arrange my own pickup?",
      createdAt: hoursAgo(3),
    },
  ];

  for (const m of conv1Messages) {
    await db.insert(messages).values({
      conversationId: conv1!.id,
      senderId: m.senderId,
      body: m.body,
      createdAt: m.createdAt,
    });
  }

  // Conversation 2: Michael asking James about Laminate (listing 9)
  const [conv2] = await db
    .insert(conversations)
    .values({
      listingId: listingIds[9]!,
      buyerId: userMap["michael@browncontracting.com"]!,
      sellerId: userMap["james@chenfloors.com"]!,
      lastMessageAt: hoursAgo(1),
      buyerLastReadAt: hoursAgo(1),
      sellerLastReadAt: null,
    })
    .returning();

  const conv2Messages = [
    {
      senderId: userMap["michael@browncontracting.com"]!,
      body: "James, we just finished installing the laminate from the last order and it looks great. Do you have any more in stock? We've got another project coming up.",
      createdAt: hoursAgo(5),
    },
    {
      senderId: userMap["james@chenfloors.com"]!,
      body: "Hey Michael, glad to hear it turned out well! I still have about 3,000 sq ft left in the Warm Chestnut. Same AC5 commercial grade. Want me to hold some for you?",
      createdAt: hoursAgo(4),
    },
    {
      senderId: userMap["michael@browncontracting.com"]!,
      body: "Yes please! I'll need about 1,500 sq ft. Can we work out a volume discount since this is our second order?",
      createdAt: hoursAgo(1),
    },
  ];

  for (const m of conv2Messages) {
    await db.insert(messages).values({
      conversationId: conv2!.id,
      senderId: m.senderId,
      body: m.body,
      createdAt: m.createdAt,
    });
  }

  // Conversation 3: Lisa asking Robert about Walnut (listing 15)
  const [conv3] = await db
    .insert(conversations)
    .values({
      listingId: listingIds[15]!,
      buyerId: userMap["lisa@wilsonrenovations.com"]!,
      sellerId: userMap["robert@thompsonlumber.com"]!,
      lastMessageAt: daysAgo(1),
      buyerLastReadAt: daysAgo(1),
      sellerLastReadAt: daysAgo(1),
    })
    .returning();

  await db.insert(messages).values({
    conversationId: conv3!.id,
    senderId: userMap["lisa@wilsonrenovations.com"]!,
    body: "Hi Robert, I love the look of this walnut. Could you tell me more about the oil finish? Is it a hardwax oil or a penetrating oil? My client is particular about maintenance.",
    createdAt: daysAgo(1),
  });

  console.log("  + 3 conversations with 9 messages\n");

  // -----------------------------------------------------------------------
  // 11. Create offers with negotiation events
  // -----------------------------------------------------------------------
  console.log("Creating offers & negotiation events...");

  // Offer 1: Emily offers on James's Black Walnut (listing 5) — countered, awaiting buyer response
  const [offer1] = await db
    .insert(offers)
    .values({
      listingId: listingIds[5]!,
      buyerId: userMap["emily@davisflooring.com"]!,
      sellerId: userMap["james@chenfloors.com"]!,
      offerPricePerSqFt: 6.50,
      quantitySqFt: 400,
      totalPrice: 2600,
      status: "countered",
      message: "I'd love to buy 400 sq ft for a client's living room. Would you consider $6.50/sqft?",
      counterPricePerSqFt: 7.00,
      counterMessage: "I can come down a bit but $6.50 is below my cost. How about $7.00/sqft?",
      currentRound: 2,
      lastActorId: userMap["james@chenfloors.com"]!,
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      createdAt: daysAgo(2),
      updatedAt: daysAgo(1),
    })
    .returning();

  // Offer 1 events
  await db.insert(offerEvents).values([
    {
      offerId: offer1!.id,
      actorId: userMap["emily@davisflooring.com"]!,
      eventType: "initial_offer",
      pricePerSqFt: 6.50,
      quantitySqFt: 400,
      totalPrice: 2600,
      message: "I'd love to buy 400 sq ft for a client's living room. Would you consider $6.50/sqft?",
      createdAt: daysAgo(2),
    },
    {
      offerId: offer1!.id,
      actorId: userMap["james@chenfloors.com"]!,
      eventType: "counter",
      pricePerSqFt: 7.00,
      quantitySqFt: 400,
      totalPrice: 2800,
      message: "I can come down a bit but $6.50 is below my cost. How about $7.00/sqft?",
      createdAt: daysAgo(1),
    },
  ]);
  console.log("  + Offer 1: Emily ↔ James (Black Walnut) — countered, Emily's turn");

  // Offer 2: Michael offers on Maria's Brazilian Cherry (listing 10) — accepted
  const [offer2] = await db
    .insert(offers)
    .values({
      listingId: listingIds[10]!,
      buyerId: userMap["michael@browncontracting.com"]!,
      sellerId: userMap["maria@garciahardwoods.com"]!,
      offerPricePerSqFt: 5.75,
      quantitySqFt: 300,
      totalPrice: 1725,
      status: "accepted",
      message: "Beautiful material! Would you take $5.75/sqft for 300 sq ft?",
      currentRound: 1,
      lastActorId: userMap["maria@garciahardwoods.com"]!,
      expiresAt: daysAgo(3),
      createdAt: daysAgo(6),
      updatedAt: daysAgo(5),
    })
    .returning();

  await db.insert(offerEvents).values([
    {
      offerId: offer2!.id,
      actorId: userMap["michael@browncontracting.com"]!,
      eventType: "initial_offer",
      pricePerSqFt: 5.75,
      quantitySqFt: 300,
      totalPrice: 1725,
      message: "Beautiful material! Would you take $5.75/sqft for 300 sq ft?",
      createdAt: daysAgo(6),
    },
    {
      offerId: offer2!.id,
      actorId: userMap["maria@garciahardwoods.com"]!,
      eventType: "accept",
      pricePerSqFt: 5.75,
      quantitySqFt: 300,
      totalPrice: 1725,
      createdAt: daysAgo(5),
    },
  ]);
  console.log("  + Offer 2: Michael ↔ Maria (Brazilian Cherry) — accepted");

  // Offer 3: Lisa offers on Sarah's Hickory (listing 3) — multi-round, pending (Lisa's latest counter)
  const [offer3] = await db
    .insert(offers)
    .values({
      listingId: listingIds[3]!,
      buyerId: userMap["lisa@wilsonrenovations.com"]!,
      sellerId: userMap["sarah@mitchellflooring.com"]!,
      offerPricePerSqFt: 3.00,
      quantitySqFt: 600,
      totalPrice: 1800,
      status: "countered",
      message: "Love the hand-scraped finish! Would $3.00/sqft work for 600 sq ft?",
      counterPricePerSqFt: 3.40,
      counterMessage: "Let's meet in the middle at $3.40?",
      currentRound: 3,
      lastActorId: userMap["lisa@wilsonrenovations.com"]!,
      expiresAt: new Date(Date.now() + 36 * 60 * 60 * 1000),
      createdAt: daysAgo(4),
      updatedAt: hoursAgo(12),
    })
    .returning();

  await db.insert(offerEvents).values([
    {
      offerId: offer3!.id,
      actorId: userMap["lisa@wilsonrenovations.com"]!,
      eventType: "initial_offer",
      pricePerSqFt: 3.00,
      quantitySqFt: 600,
      totalPrice: 1800,
      message: "Love the hand-scraped finish! Would $3.00/sqft work for 600 sq ft?",
      createdAt: daysAgo(4),
    },
    {
      offerId: offer3!.id,
      actorId: userMap["sarah@mitchellflooring.com"]!,
      eventType: "counter",
      pricePerSqFt: 3.60,
      quantitySqFt: 600,
      totalPrice: 2160,
      message: "Thanks for your interest! The lowest I can go is $3.60 for this grade.",
      createdAt: daysAgo(3),
    },
    {
      offerId: offer3!.id,
      actorId: userMap["lisa@wilsonrenovations.com"]!,
      eventType: "counter",
      pricePerSqFt: 3.40,
      quantitySqFt: 600,
      totalPrice: 2040,
      message: "Let's meet in the middle at $3.40?",
      createdAt: hoursAgo(12),
    },
  ]);
  console.log("  + Offer 3: Lisa ↔ Sarah (Hickory) — Round 3, Sarah's turn");

  // Offer 4: Emily offers on Robert's Walnut Character (listing 15) — rejected
  const [offer4] = await db
    .insert(offers)
    .values({
      listingId: listingIds[15]!,
      buyerId: userMap["emily@davisflooring.com"]!,
      sellerId: userMap["robert@thompsonlumber.com"]!,
      offerPricePerSqFt: 4.00,
      quantitySqFt: 750,
      totalPrice: 3000,
      status: "rejected",
      message: "Would you take $4.00/sqft for the full lot?",
      currentRound: 1,
      lastActorId: userMap["robert@thompsonlumber.com"]!,
      expiresAt: daysAgo(5),
      createdAt: daysAgo(8),
      updatedAt: daysAgo(7),
    })
    .returning();

  await db.insert(offerEvents).values([
    {
      offerId: offer4!.id,
      actorId: userMap["emily@davisflooring.com"]!,
      eventType: "initial_offer",
      pricePerSqFt: 4.00,
      quantitySqFt: 750,
      totalPrice: 3000,
      message: "Would you take $4.00/sqft for the full lot?",
      createdAt: daysAgo(8),
    },
    {
      offerId: offer4!.id,
      actorId: userMap["robert@thompsonlumber.com"]!,
      eventType: "reject",
      message: "Sorry, $4.00 is too far below my floor price. I need at least $5.50 for this quality walnut.",
      createdAt: daysAgo(7),
    },
  ]);
  console.log("  + Offer 4: Emily ↔ Robert (Walnut Character) — rejected");

  // Offer 5: Michael offers on Sarah's Bamboo (listing 4) — pending, awaiting seller
  const [offer5] = await db
    .insert(offers)
    .values({
      listingId: listingIds[4]!,
      buyerId: userMap["michael@browncontracting.com"]!,
      sellerId: userMap["sarah@mitchellflooring.com"]!,
      offerPricePerSqFt: 2.65,
      quantitySqFt: 500,
      totalPrice: 1325,
      status: "pending",
      message: "I'm interested in the bamboo for an eco-friendly office build. Any flexibility on price for 500 sq ft?",
      currentRound: 1,
      lastActorId: userMap["michael@browncontracting.com"]!,
      expiresAt: new Date(Date.now() + 40 * 60 * 60 * 1000),
      createdAt: hoursAgo(8),
      updatedAt: hoursAgo(8),
    })
    .returning();

  await db.insert(offerEvents).values({
    offerId: offer5!.id,
    actorId: userMap["michael@browncontracting.com"]!,
    eventType: "initial_offer",
    pricePerSqFt: 2.65,
    quantitySqFt: 500,
    totalPrice: 1325,
    message: "I'm interested in the bamboo for an eco-friendly office build. Any flexibility on price for 500 sq ft?",
    createdAt: hoursAgo(8),
  });
  console.log("  + Offer 5: Michael ↔ Sarah (Bamboo) — pending, Sarah's turn");
  console.log();

  // -----------------------------------------------------------------------
  // Done — close connection
  // -----------------------------------------------------------------------
  await queryClient.end();
}

seed()
  .then(() => {
    console.log("Seed completed successfully!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("\nSeed failed:", err);
    process.exit(1);
  });
