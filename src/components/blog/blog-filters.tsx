import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PostCard } from "@/components/blog/post-card";
import type { BlogPostMeta } from "@/lib/blog";
import {
  BLOG_QUERY_LIMIT,
  blogIndexHref,
  selectBlogPage,
  type BlogBrowseState,
} from "@/lib/blog-navigation";

export function BlogFilters({
  posts,
  state,
}: {
  posts: BlogPostMeta[];
  state: BlogBrowseState;
}) {
  const result = selectBlogPage(posts, state);
  const active = result.state;
  return (
    <div className="min-w-0 space-y-6">
      <form
        key={`${active.query}:${active.audience}`}
        action="/blog#articles"
        method="get"
        role="search"
        aria-label="Search articles"
        className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,12rem)_auto]"
      >
        <div className="min-w-0 space-y-2">
          <Label htmlFor="blog-query">Search articles</Label>
          <Input
            id="blog-query"
            name="q"
            type="search"
            defaultValue={active.query}
            maxLength={BLOG_QUERY_LIMIT}
            placeholder="Try freight, pricing or overstock"
            className="h-auto min-h-11"
          />
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="blog-audience">Audience</Label>
          <select
            id="blog-audience"
            name="audience"
            defaultValue={active.audience}
            className="min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <option value="all">Everyone</option>
            <option value="Buyers">For buyers</option>
            <option value="Sellers">For sellers</option>
          </select>
        </div>
        <Button type="submit" className="h-auto min-h-11 whitespace-normal">
          Search
        </Button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-sm text-muted-foreground">
          {result.total > 0
            ? `Showing ${result.from}–${result.to} of ${result.total} articles`
            : "No articles match these filters."}
        </p>
        {(active.query || active.audience !== "all") && (
          <Link
            href="/blog#articles"
            className="inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Clear filters
          </Link>
        )}
      </div>

      {result.total === 0 ? (
        <p className="text-muted-foreground">
          Try fewer words or choose Everyone to search all articles and complete
          guides.
        </p>
      ) : (
        <div
          className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3"
          data-article-results
        >
          {result.posts.map((post) => (
            <PostCard key={post.slug} post={post} browseState={active} />
          ))}
        </div>
      )}

      {result.total > 0 && (
        <nav
          aria-label="Article pages"
          className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"
        >
          {active.page > 1 ? (
            <Button
              asChild
              variant="outline"
              className="h-auto min-h-11 whitespace-normal"
            >
              <Link href={blogIndexHref({ ...active, page: active.page - 1 })}>
                Previous articles
              </Link>
            </Button>
          ) : (
            <span />
          )}
          <p className="text-sm text-muted-foreground">
            Page {active.page} of {result.totalPages}
          </p>
          {active.page < result.totalPages ? (
            <Button
              asChild
              variant="outline"
              className="h-auto min-h-11 whitespace-normal"
            >
              <Link href={blogIndexHref({ ...active, page: active.page + 1 })}>
                Next articles
              </Link>
            </Button>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
