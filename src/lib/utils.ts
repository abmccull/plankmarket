import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat("en-US").format(num);
}

export function formatSqFt(sqft: number): string {
  return `${formatNumber(sqft)} sq ft`;
}

export function formatPricePerSqFt(price: number): string {
  return `${formatCurrency(price)}/sq ft`;
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}

export function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return formatDate(date);
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + "...";
}

export function calculateBuyerFee(price: number): number {
  return Math.round(price * 0.03 * 100) / 100; // 3% buyer fee
}

export function calculateSellerFee(price: number): number {
  return Math.round(price * 0.02 * 100) / 100; // 2% seller fee
}

export function calculateStripeFee(totalCharge: number): number {
  return Math.round((totalCharge * 0.029 + 0.30) * 100) / 100; // Stripe 2.9% + $0.30
}

export function calculateTotalWithFees(price: number): number {
  return price + calculateBuyerFee(price);
}

/**
 * Extract a clean, user-friendly error message from tRPC/Zod errors.
 * tRPC Zod validation errors come back as a JSON array of Zod issues in error.message.
 * This parses that and returns just the human-readable message string.
 */
export function getErrorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (!error) return fallback;

  // Handle Error objects (including TRPCClientError)
  if (error instanceof Error) {
    const msg = error.message;

    // tRPC wraps Zod validation errors as a JSON array string
    if (msg.startsWith("[")) {
      try {
        const issues = JSON.parse(msg) as Array<{ message?: string }>;
        if (Array.isArray(issues) && issues.length > 0 && issues[0]?.message) {
          return issues[0].message;
        }
      } catch {
        // Not valid JSON — fall through to use raw message
      }
    }

    // Direct error message
    if (msg && msg !== "undefined") return msg;
  }

  // Handle plain string errors
  if (typeof error === "string" && error.length > 0) return error;

  return fallback;
}
