import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BlogFilters } from "@/components/blog/blog-filters";
import { getAllPosts, getPillarPages } from "@/lib/blog";

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

export default function BlogPage() {
  const posts = getAllPosts();
  const pillars = getPillarPages();

  return (
    <div className="container mx-auto px-4 py-16 sm:py-20">
      {/* Hero */}
      <section className="text-center mb-16">
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

      {/* Pillar Guides */}
      {pillars.length > 0 && (
        <section className="mb-16">
          <h2 className="font-display text-2xl mb-6">Complete Guides</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {pillars.map((pillar) => (
              <Link
                key={pillar.slug}
                href={`/blog/${pillar.slug}`}
                className="group"
              >
                <Card elevation="interactive" className="h-full">
                  <CardContent className="p-8">
                    <div className="flex items-center gap-2 mb-3">
                      <Badge variant="gold">Guide</Badge>
                      <span className="text-xs text-muted-foreground">
                        {pillar.readingTime} min read
                      </span>
                    </div>
                    <h3 className="font-display text-xl sm:text-2xl mb-2 group-hover:text-primary transition-colors">
                      {pillar.title}
                    </h3>
                    <p className="text-muted-foreground mb-4">
                      {pillar.description}
                    </p>
                    <span className="inline-flex items-center gap-1 text-sm text-primary font-medium">
                      Read guide{" "}
                      <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* All Posts */}
      <section className="mb-16">
        <h2 className="font-display text-2xl mb-6">All Articles</h2>
        <BlogFilters posts={posts} />
      </section>

      {/* Bottom CTA */}
      <section className="rounded-2xl bg-gradient-to-br from-primary/5 via-secondary/5 to-accent/10 border border-border p-8 md:p-12 text-center">
        <h2 className="font-display text-2xl sm:text-3xl mb-3">
          Ready to trade surplus flooring?
        </h2>
        <p className="text-muted-foreground max-w-lg mx-auto mb-6">
          Join the B2B marketplace built for flooring professionals.
        </p>
        <Link href="/register">
          <Button size="lg" className="gap-2">
            Get Started Free
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </section>
    </div>
  );
}
