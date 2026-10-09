import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BlogFilters } from "@/components/blog/blog-filters";
import { getAllContent } from "@/lib/blog";
import { readBlogState, type BlogSearchParams } from "@/lib/blog-navigation";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Expert guides on closeout flooring, surplus inventory liquidation, and B2B flooring sourcing. Tips for distributors, contractors, and retailers.",
  openGraph: {
    title: "PlankMarket Blog — Closeout Flooring Insights",
    description:
      "Expert guides on closeout flooring, surplus inventory liquidation, and B2B flooring sourcing.",
    type: "website",
  },
};

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<BlogSearchParams>;
}) {
  const posts = getAllContent();
  const state = readBlogState(await searchParams);

  return (
    <div className="container mx-auto px-[16px] py-10 sm:py-16">
      {/* Hero */}
      <section className="text-center mb-10">
        <Badge variant="secondary" className="mb-4">
          PlankMarket Blog
        </Badge>
        <h1 className="font-display text-4xl sm:text-5xl mb-4">
          Closeout Flooring{" "}
          <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            Insights
          </span>
        </h1>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
          Strategies for buying and selling surplus flooring — from pricing
          guides to liquidation playbooks.
        </p>
      </section>

      {/* All Posts */}
      <section className="mb-16">
        <h2
          id="articles"
          tabIndex={-1}
          className="scroll-mt-28 font-display text-2xl mb-6"
        >
          Articles and complete guides
        </h2>
        <BlogFilters posts={posts} state={state} />
      </section>

      {/* Bottom CTA */}
      <section className="rounded-2xl bg-gradient-to-br from-primary/5 via-secondary/5 to-accent/10 border border-border p-[20px] md:p-12 text-center">
        <h2 className="font-display text-2xl sm:text-3xl mb-3">
          Ready to trade surplus flooring?
        </h2>
        <p className="text-muted-foreground max-w-lg mx-auto mb-6">
          Join the B2B marketplace built for flooring professionals.
        </p>
        <Button
          asChild
          size="lg"
          className="h-auto min-h-11 gap-2 whitespace-normal"
        >
          <Link href="/register">
            Get Started Free
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </section>
    </div>
  );
}
