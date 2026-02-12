import type { UserRole } from "@/types";

export const ROLES = {
  BUYER: "buyer" as const,
  SELLER: "seller" as const,
  ADMIN: "admin" as const,
};

export const ROLE_LABELS: Record<UserRole, string> = {
  buyer: "Buyer",
  seller: "Seller",
  admin: "Administrator",
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  buyer: "Purchase liquidation flooring inventory at wholesale prices",
  seller: "List your overstock, closeout, and discontinued flooring inventory",
  admin: "Manage the PlankMarket platform",
};

export const ROLE_DASHBOARD_PATHS: Record<UserRole, string> = {
  buyer: "/buyer",
  seller: "/seller",
  admin: "/admin",
};

export function canCreateListings(role: UserRole): boolean {
  return role === "seller" || role === "admin";
}

export function canPurchase(role: UserRole): boolean {
  return role === "buyer" || role === "admin";
}

export function canManageUsers(role: UserRole): boolean {
  return role === "admin";
}

export function canViewAllOrders(role: UserRole): boolean {
  return role === "admin";
}

export function getDashboardPath(role: UserRole): string {
  return ROLE_DASHBOARD_PATHS[role] || "/";
}
