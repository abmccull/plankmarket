import type { ComponentType } from "react";
import { LayoutDashboard, TrendingUp, Users, List, Package, ShieldCheck, MessageSquare, Settings, Megaphone, Scale, Wrench, Database } from "lucide-react";
import { FEATURES } from "@/lib/feature-flags";
export interface AdminNavigationItem { title: string; href: string; icon: ComponentType<{ className?: string }> }
export const adminItems: AdminNavigationItem[] = [
  { title: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { title: "Finance", href: "/admin/finance", icon: TrendingUp },
  { title: "Users", href: "/admin/users", icon: Users },
  { title: "Listings", href: "/admin/listings", icon: List },
  { title: "Inventory", href: "/admin/inventory", icon: Database },
  { title: "Orders", href: "/admin/orders", icon: Package },
  { title: "Shipments", href: "/admin/shipments", icon: Package },
  { title: "Disputes", href: "/admin/disputes", icon: Scale },
  { title: "Reconciliation", href: "/admin/reconciliation", icon: Wrench },
  { title: "Verifications", href: "/admin/verifications", icon: ShieldCheck },
  ...(FEATURES.PROMOTIONS_ENABLED
    ? [{ title: "Promotions", href: "/admin/promotions", icon: Megaphone }]
    : []),
  { title: "Feedback", href: "/admin/feedback", icon: MessageSquare },
  { title: "Settings", href: "/admin/settings", icon: Settings },
];

