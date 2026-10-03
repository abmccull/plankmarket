import type { ComponentType } from "react";
import type { UserRole } from "@/types";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Heart,
  Search,
  Settings,
  Plus,
  BarChart3,
  CreditCard,
  List,
  MessageSquare,
  Handshake,
  ClipboardList,
  Clock,
  FileText,
  FileSpreadsheet,
  PackageOpen,
  SlidersHorizontal,
  TrendingUp,
  Bot,
  Users,
  Shield,
  Database,
  Bell,
} from "lucide-react";
import { adminItems } from "@/lib/admin-navigation";

export interface WorkspaceNavItem {
  title: string;
  href: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  badge?: "Pro";
}
export interface WorkspaceNavGroup {
  id: string;
  title: string;
  items: WorkspaceNavItem[];
  secondary?: boolean;
}
const item = (
  title: string,
  href: string,
  icon: WorkspaceNavItem["icon"],
  pro = false,
): WorkspaceNavItem => ({
  title,
  href,
  icon,
  ...(pro ? { badge: "Pro" as const } : {}),
});
const group = (
  id: string,
  title: string,
  items: WorkspaceNavItem[],
  secondary = false,
): WorkspaceNavGroup => ({
  id,
  title,
  items,
  ...(secondary ? { secondary } : {}),
});

const communications = [
  item("Offers", "/offers", Handshake),
  item("Messages", "/messages", MessageSquare),
  item("Notifications", "/notifications", Bell),
];
const account = (role: "seller" | "buyer") => [
  item("Preferences", `/preferences?workspace=${role}`, SlidersHorizontal),
  item("Resale purchasing", "/settings/resale", FileText),
  item("Automation & alerts", "/settings/agent", Bot, role === "seller"),
  item("Subscription", "/settings/subscription", CreditCard),
  item("Settings", `/${role}/settings`, Settings),
];
const sellerGroups = [
  group("trading", "Trading", [
    item("Dashboard", "/seller", LayoutDashboard),
    item("My Listings", "/seller/listings", List),
    item("Create Listing", "/seller/listings/new", Plus),
    item("Sales", "/seller/orders", Package),
    ...communications.filter((entry) => entry.href !== "/notifications"),
    item("Payments & payouts", "/seller/payments", CreditCard),
  ]),
  group(
    "inventory",
    "Inventory tools",
    [
      item(
        "Bulk Upload",
        "/seller/listings/bulk-upload",
        FileSpreadsheet,
        true,
      ),
      item("Inventory Feeds", "/seller/inventory", Database),
      item("Warehouses", "/seller/warehouses", Package),
    ],
    true,
  ),
  group(
    "customers",
    "Customer tools",
    [
      item("Request Board", "/seller/request-board", ClipboardList),
      item("Samples", "/seller/samples", PackageOpen),
      item("Buyer CRM", "/seller/crm", Users, true),
      item("Follow-ups", "/seller/followups", Clock, true),
    ],
    true,
  ),
  group(
    "performance",
    "Insights",
    [
      item("Analytics", "/seller/analytics", BarChart3),
      item("Market Intel", "/seller/market", TrendingUp, true),
    ],
    true,
  ),
  group(
    "updates",
    "Saved searches & updates",
    [
      item("Saved Searches", "/settings/saved-searches", Search),
      ...communications.filter((entry) => entry.href === "/notifications"),
    ],
    true,
  ),
  group("account", "Account", account("seller"), true),
];
const buyerGroups = [
  group("trading", "Trading", [
    item("Dashboard", "/buyer", LayoutDashboard),
    item("Browse Listings", "/listings", Search),
    item("Purchases", "/buyer/orders", ShoppingCart),
    ...communications.filter((entry) => entry.href !== "/notifications"),
    item("My Requests", "/buyer/requests", FileText),
    item("Watchlist", "/buyer/watchlist", Heart),
  ]),
  group(
    "sourcing",
    "Sourcing tools",
    [
      item("Samples", "/buyer/samples", PackageOpen),
      item("Saved Searches", "/settings/saved-searches", Search),
      ...communications.filter((entry) => entry.href === "/notifications"),
    ],
    true,
  ),
  group("account", "Account", account("buyer"), true),
];

export function getAdminNavGroups(): WorkspaceNavGroup[] {
  const available: WorkspaceNavItem[] = [...adminItems];
  if (!available.some((entry) => entry.href === "/admin/moderation")) {
    available.push(item("Moderation", "/admin/moderation", Shield));
  }
  const definitions = [
    {
      id: "operations",
      title: "Operations",
      paths: [
        "/admin",
        "/admin/orders",
        "/admin/shipments",
        "/admin/disputes",
        "/admin/reconciliation",
      ],
    },
    {
      id: "marketplace",
      title: "Marketplace",
      paths: [
        "/admin/users",
        "/admin/listings",
        "/admin/inventory",
        "/admin/verifications",
        "/admin/resale",
        "/admin/moderation",
      ],
    },
    {
      id: "business",
      title: "Business",
      paths: [
        "/admin/finance",
        "/admin/feedback",
        "/admin/promotions",
        "/admin/settings",
      ],
    },
  ];
  const used = new Set(definitions.flatMap((definition) => definition.paths));
  const groups = definitions.map((definition) =>
    group(
      definition.id,
      definition.title,
      definition.paths.flatMap((path) =>
        available.filter((entry) => entry.href === path),
      ),
    ),
  );
  const remaining = available.filter((entry) => !used.has(entry.href));
  if (remaining.length) groups.push(group("other", "Other tools", remaining));
  return groups;
}
export type TradingWorkspace = "buyer" | "seller";

export function resolveTradingWorkspace(role: UserRole, pathname: string, remembered?: string | null): TradingWorkspace {
  if (role === "buyer") return "buyer";
  if (isPathWithin(pathname, "/buyer")) return "buyer";
  if (isPathWithin(pathname, "/seller")) return "seller";
  return remembered === "buyer" ? "buyer" : "seller";
}

export function getWorkspaceNavigation(role: UserRole, pathname: string, remembered?: TradingWorkspace) {
  if (role === "admin" && isPathWithin(pathname, "/admin")) {
    return { title: "Admin workspace", groups: getAdminNavGroups() };
  }
  const context = resolveTradingWorkspace(role, pathname, remembered);
  const sourceGroups = context === "seller" ? sellerGroups : buyerGroups;
  const groups = role === "buyer"
    ? sourceGroups.map(section => section.id === "account" ? {
        ...section,
        items: [item("Start selling", "/settings/selling", Plus), ...section.items],
      } : section)
    : sourceGroups;
  return {
    title: context === "seller" ? "Seller workspace" : "Buyer workspace",
    groups:
      role === "admin"
        ? [
            group("administration", "Administration", [
              item("Admin Panel", "/admin", Shield),
            ]),
            ...groups,
          ]
        : groups,
  };
}
export function isPathWithin(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
export function isWorkspacePath(pathname: string) {
  return [
    "/admin",
    "/buyer",
    "/seller",
    "/messages",
    "/notifications",
    "/offers",
    "/preferences",
    "/settings",
  ].some((prefix) => isPathWithin(pathname, prefix));
}
export function getActiveNavigationHref(
  pathname: string,
  groups: WorkspaceNavGroup[],
) {
  const exactOnly = new Set(["/buyer", "/seller", "/admin"]);
  return groups
    .flatMap((entry) => entry.items)
    .filter((entry) => {
      const path = entry.href.split("?")[0];
      return pathname === path || (!exactOnly.has(path) && isPathWithin(pathname, path));
    })
    .sort((left, right) => right.href.length - left.href.length)[0]?.href;
}
