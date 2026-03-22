import type { MetadataRoute } from "next";
import { createServerCaller } from "@/lib/trpc/server";
import { getAllContent } from "@/lib/blog";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.plankmarket.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Static marketing pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}`, lastModified: new Date(), changeFrequency: "daily", priority: 1.0 },
    { url: `${BASE_URL}/listings`, lastModified: new Date(), changeFrequency: "hourly", priority: 0.9 },
    { url: `${BASE_URL}/blog`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE_URL}/about`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE_URL}/how-it-works`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE_URL}/pricing`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE_URL}/seller-guide`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE_URL}/tools/carrying-cost-calculator`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/contact`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.2 },
    { url: `${BASE_URL}/terms`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.1 },
    { url: `${BASE_URL}/privacy`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.1 },
  ];

  // Blog pages
  let blogPages: MetadataRoute.Sitemap = [];
  try {
    blogPages = getAllContent().map((post) => ({
      url: `${BASE_URL}/blog/${post.slug}`,
      lastModified: new Date(post.publishDate),
      changeFrequency: "monthly" as const,
      priority: post.type === "pillar" ? 0.7 : 0.6,
    }));
  } catch {
    // Blog content loading should not fail the sitemap
  }

  // Dynamic listing pages
  let listingPages: MetadataRoute.Sitemap = [];
  try {
    const caller = await createServerCaller();
    const data = await caller.listing.list({ page: 1, limit: 1000 });
    listingPages = data.items.map((listing) => ({
      url: `${BASE_URL}/listings/${listing.id}`,
      lastModified: new Date(listing.updatedAt ?? listing.createdAt),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));
  } catch {
    // Sitemap generation should not fail the build
  }

  return [...staticPages, ...blogPages, ...listingPages];
}
