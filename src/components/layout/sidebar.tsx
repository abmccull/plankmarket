"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/stores/auth-store";
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
} from "lucide-react";

interface SidebarItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const sellerItems: SidebarItem[] = [
  { title: "Dashboard", href: "/seller", icon: LayoutDashboard },
  { title: "My Listings", href: "/seller/listings", icon: List },
  { title: "Create Listing", href: "/seller/listings/new", icon: Plus },
  { title: "Orders", href: "/seller/orders", icon: Package },
  { title: "Analytics", href: "/seller/analytics", icon: BarChart3 },
  { title: "Payments", href: "/seller/stripe-onboarding", icon: CreditCard },
  { title: "Settings", href: "/seller/settings", icon: Settings },
];

const buyerItems: SidebarItem[] = [
  { title: "Dashboard", href: "/buyer", icon: LayoutDashboard },
  { title: "My Orders", href: "/buyer/orders", icon: ShoppingCart },
  { title: "Watchlist", href: "/buyer/watchlist", icon: Heart },
  { title: "Saved Searches", href: "/buyer/saved-searches", icon: Search },
  { title: "Settings", href: "/buyer/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuthStore();

  const isSeller = pathname.startsWith("/seller");
  const items = isSeller ? sellerItems : buyerItems;

  return (
    <aside className="hidden lg:flex w-64 flex-col border-r bg-sidebar min-h-[calc(100vh-4rem)]">
      <div className="flex flex-col gap-1 p-4">
        <div className="mb-4 rounded-lg bg-gradient-to-br from-primary/10 to-secondary/10 p-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-secondary text-white">
              <LayoutDashboard className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                {isSeller ? "Seller Dashboard" : "Buyer Dashboard"}
              </h2>
              <p className="text-xs text-muted-foreground">
                {user?.businessName || user?.name}
              </p>
            </div>
          </div>
        </div>
        {items.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/seller" &&
              item.href !== "/buyer" &&
              pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.title}
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
