import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Clock, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PostContent } from "@/components/blog/post-content";
import { PostCard } from "@/components/blog/post-card";
import { BlogCta } from "@/components/blog/blog-cta";
import { TableOfContents } from "@/components/blog/table-of-contents";
import {
  getPostBySlug,
  getAllContent,
  getRelatedPosts,
  renderMarkdown,
  extractHeadings,
} from "@/lib/blog";

export const revalidate = 3600;

export async function generateStaticParams() {
  const all = getAllContent();
  return all.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return {};

  const keywords = [
    post.targetKeyword,
    ...(post.secondaryKeywords
      ? post.secondaryKeywords.split(",").map((k) => k.trim())
      : []),
  ].filter(Boolean);

  return {
    title: post.title,
    description: post.description,
    keywords,
    alternates: {
      canonical: `/blog/${post.slug}`,
    },
    openGraph: {
      title: post.title,
      description: post.description,
      type: "article",
      publishedTime: post.publishDate,
      authors: ["PlankMarket"],
    },
  };
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const html = await renderMarkdown(post.content);
  const related = getRelatedPosts(post, 3);
  const isPillar = post.type === "pillar";
  const headings = isPillar ? extractHeadings(post.content) : [];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.publishDate,
    author: {
      "@type": "Organization",
      name: "PlankMarket",
      url: "https://plankmarket.com",
    },
    publisher: {
      "@type": "Organization",
      name: "PlankMarket",
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `https://plankmarket.com/blog/${post.slug}`,
    },
  };

  const audienceBadge =
    post.audience === "Sellers"
      ? { variant: "warning" as const, label: "For Sellers" }
      : post.audience === "Buyers"
        ? { variant: "info" as const, label: "For Buyers" }
        : { variant: "secondary" as const, label: "Industry Guide" };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <article className="container mx-auto px-4 py-12 sm:py-16">
        {/* Breadcrumbs */}
        <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-8">
          <Link href="/" className="hover:text-foreground transition-colors">
            Home
          </Link>
          <ChevronRight className="h-3 w-3" />
          <Link
            href="/blog"
            className="hover:text-foreground transition-colors"
          >
            Blog
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground truncate max-w-[200px] sm:max-w-none">
            {post.title}
          </span>
        </nav>

        {/* Header */}
        <header className={`mb-10 ${isPillar ? "max-w-4xl" : "max-w-3xl"}`}>
          <div className="flex items-center gap-2 mb-4">
            <Badge variant={audienceBadge.variant}>{audienceBadge.label}</Badge>
            {isPillar && <Badge variant="gold">Complete Guide</Badge>}
          </div>
          <h1 className="font-display text-3xl sm:text-4xl md:text-5xl mb-4">
            {post.title}
          </h1>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              {formatDate(post.publishDate)}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              {post.readingTime} min read
            </span>
          </div>
        </header>

        {/* Content + optional TOC sidebar */}
        {isPillar ? (
          <div className="flex gap-12">
            <div className="max-w-4xl flex-1 min-w-0">
              <PostContent html={html} />
            </div>
            <aside className="hidden xl:block w-64 shrink-0">
              <TableOfContents headings={headings} />
            </aside>
          </div>
        ) : (
          <div className="max-w-3xl">
            <PostContent html={html} />
          </div>
        )}

        {/* CTA */}
        <div className={`mt-16 ${isPillar ? "max-w-4xl" : "max-w-3xl"}`}>
          <BlogCta audience={post.audience} />
        </div>

        {/* Related Posts */}
        {related.length > 0 && (
          <section className="mt-16">
            <h2 className="font-display text-2xl mb-6">Related Articles</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {related.map((r) => (
                <PostCard key={r.slug} post={r} />
              ))}
            </div>
          </section>
        )}
      </article>
    </>
  );
}
