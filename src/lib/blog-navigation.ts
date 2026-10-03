import type { BlogPostMeta } from "@/lib/blog";

export const BLOG_PAGE_SIZE = 12;
export const BLOG_QUERY_LIMIT = 120;
export type BlogSearchParams = Record<string, string | string[] | undefined>;
export type BlogBrowseState = {
  query: string;
  audience: "all" | "Buyers" | "Sellers";
  page: number;
};

export function readBlogState(params: BlogSearchParams): BlogBrowseState {
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
  const query = first(params.q)
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, BLOG_QUERY_LIMIT);
  const audience = first(params.audience);
  const rawPage = first(params.page);
  return {
    query,
    audience:
      audience === "Buyers" || audience === "Sellers" ? audience : "all",
    page:
      /^\d{1,6}$/.test(rawPage) && Number(rawPage) > 0 ? Number(rawPage) : 1,
  };
}

export function blogQueryString(state: BlogBrowseState) {
  const params = new URLSearchParams();
  if (state.query) params.set("q", state.query);
  if (state.audience !== "all") params.set("audience", state.audience);
  if (state.page > 1) params.set("page", String(state.page));
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function blogIndexHref(state: BlogBrowseState) {
  return `/blog${blogQueryString(state)}#articles`;
}

export function blogPostHref(slug: string, state?: BlogBrowseState) {
  return `/blog/${encodeURIComponent(slug)}${state ? blogQueryString(state) : ""}`;
}

export function selectBlogPage(posts: BlogPostMeta[], state: BlogBrowseState) {
  const terms = state.query.toLowerCase().split(" ").filter(Boolean);
  const matches = posts
    .filter((post) => {
      if (
        state.audience !== "all" &&
        post.audience !== state.audience &&
        post.audience !== "Both"
      )
        return false;
      const searchable =
        `${post.title} ${post.description} ${post.targetKeyword} ${post.secondaryKeywords}`.toLowerCase();
      return terms.every((term) => searchable.includes(term));
    })
    .sort((a, b) => {
      const dateA = Date.parse(a.publishDate) || 0;
      const dateB = Date.parse(b.publishDate) || 0;
      return dateB - dateA || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
    });
  const total = matches.length;
  const totalPages = Math.max(1, Math.ceil(total / BLOG_PAGE_SIZE));
  const page = Math.min(state.page, totalPages);
  const offset = (page - 1) * BLOG_PAGE_SIZE;
  return {
    state: { ...state, page },
    posts: matches.slice(offset, offset + BLOG_PAGE_SIZE),
    total,
    totalPages,
    from: total === 0 ? 0 : offset + 1,
    to: Math.min(offset + BLOG_PAGE_SIZE, total),
  };
}
