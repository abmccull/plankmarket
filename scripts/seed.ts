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
  },
  {
    email: "robert@thompsonlumber.com",
    name: "Robert Thompson",
    role: "seller" as const,
    businessName: "Thompson Lumber Co",
    zip: "76102",
    verified: false,
    verificationStatus: "unverified",
    phone: "+18175554567",
  },
  {
    email: "emily@davisflooring.com",
    name: "Emily Davis",
    role: "buyer" as const,
    businessName: "Davis Interior Design",
    zip: "75201",
    verified: false,
    verificationStatus: "unverified",
    phone: "+12145555678",
  },
  {
    email: "michael@browncontracting.com",
    name: "Michael Brown",
    role: "buyer" as const,
    businessName: "Brown Contracting LLC",
    zip: "75024",
    verified: false,
    verificationStatus: "unverified",
    phone: "+19725556789",
  },
  {
    email: "lisa@wilsonrenovations.com",
    name: "Lisa Wilson",
    role: "buyer" as const,
    businessName: "Wilson Renovations",
    zip: "75034",
    verified: false,
    verificationStatus: "unverified",
    phone: "+14695557890",
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
