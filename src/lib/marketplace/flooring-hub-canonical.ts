/**
 * Flooring hub SEO canonical paths (www + no trailing slash via metadataBase).
 *
 * Rules:
 * - page <= 1 (missing, page=1, invalid) → `/flooring/{materialType}` (no query)
 * - page >= 2 with listings on that page → `/flooring/{materialType}?page={n}`
 * - page >= 2 empty / out of range → page-1 URL (do not self-canonical empty shells)
 */
export function buildFlooringHubCanonicalPath(options: {
  materialType: string;
  page: number;
  hasListingsOnPage: boolean;
}): string {
  const { materialType, page, hasListingsOnPage } = options;
  const basePath = `/flooring/${materialType}`;

  if (!Number.isFinite(page) || page <= 1) {
    return basePath;
  }

  if (hasListingsOnPage) {
    return `${basePath}?page=${page}`;
  }

  return basePath;
}

/** Parse hub `page` query; invalid / missing / non-positive → 1. */
export function parseFlooringHubPage(pageParam: string | undefined): number {
  if (pageParam === undefined || pageParam === "") {
    return 1;
  }

  const parsed = Number.parseInt(pageParam, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }

  return parsed;
}
