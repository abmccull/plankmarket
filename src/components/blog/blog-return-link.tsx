"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { blogIndexHref, readBlogState } from "@/lib/blog-navigation";

export function BlogReturnLink() {
  const params = useSearchParams();
  const state = readBlogState({
    q: params.get("q") ?? undefined,
    audience: params.get("audience") ?? undefined,
    page: params.get("page") ?? undefined,
  });
  return (
    <Link
      href={blogIndexHref(state)}
      className="inline-flex min-h-11 items-center hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      Back to articles
    </Link>
  );
}
