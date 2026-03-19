"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PostCard } from "@/components/blog/post-card";
import type { BlogPostMeta } from "@/lib/blog";

const FILTERS = [
  { label: "All", value: "all" },
  { label: "For Sellers", value: "Sellers" },
  { label: "For Buyers", value: "Buyers" },
] as const;

export function BlogFilters({ posts }: { posts: BlogPostMeta[] }) {
  const [active, setActive] = useState<string>("all");

  const filtered =
    active === "all"
      ? posts
      : posts.filter((p) => p.audience === active || p.audience === "Both");

  return (
    <>
      <div className="flex items-center gap-2 mb-8">
        {FILTERS.map((f) => (
          <Button
            key={f.value}
            variant={active === f.value ? "default" : "outline"}
            size="sm"
            onClick={() => setActive(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 stagger-grid">
        {filtered.map((post) => (
          <PostCard key={post.slug} post={post} />
        ))}
      </div>
    </>
  );
}
