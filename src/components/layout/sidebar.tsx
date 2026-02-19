"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/stores/auth-store";
import { trpc } from "@/lib/trpc/client";
import { UnreadBadge } from "@/components/messaging/unread-badge";
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
  DollarSign,
  List,
  MessageSquare,
  Handshake,
  ClipboardList,
  Clock,
  FileText,
  FileSpreadsheet,
  SlidersHorizontal,
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
  { title: "Bulk Upload", href: "/seller/listings/bulk-upload", icon: FileSpreadsheet },
  { title: "Request Board", href: "/seller/request-board", icon: ClipboardList },
  { title: "Follow-ups", href: "/seller/followups", icon: Clock },
  { title: "Preferences", href: "/preferences", icon: SlidersHorizontal },
  { title: "Offers", href: "/offers", icon: Handshake },
  { title: "Messages", href: "/messages", icon: MessageSquare },
  { title: "Orders", href: "/seller/orders", icon: Package },
  { title: "Analytics", href: "/seller/analytics", icon: BarChart3 },
  { title: "Payouts", href: "/seller/payouts", icon: DollarSign },
  { title: "Payments", href: "/seller/stripe-onboarding", icon: CreditCard },
  { title: "Settings", href: "/seller/settings", icon: Settings },
];

const buyerItems: SidebarItem[] = [
  { title: "Dashboard", href: "/buyer", icon: LayoutDashboard },
  { title: "My Orders", href: "/buyer/orders", icon: ShoppingCart },
  { title: "Offers", href: "/offers", icon: Handshake },
  { title: "Messages", href: "/messages", icon: MessageSquare },
  { title: "Watchlist", href: "/buyer/watchlist", icon: Heart },
  { title: "Saved Searches", href: "/buyer/saved-searches", icon: Search },
  { title: "My Requests", href: "/buyer/requests", icon: FileText },
  { title: "Preferences", href: "/preferences", icon: SlidersHorizontal },
  { title: "Settings", href: "/buyer/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuthStore();

  // Determine sidebar variant from user role, with pathname as fallback.
  // Shared routes like /preferences, /messages, /offers don't contain a role
  // prefix, so we rely on the user's actual role to keep the correct sidebar.
  const isSeller =
    user?.role === "seller" || user?.role === "admin" || pathname.startsWith("/seller");
  const items = isSeller ? sellerItems : buyerItems;

  // Get unread message count
  const { data: unreadData } = trpc.message.getUnreadCount.useQuery(undefined, {
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const unreadCount = unreadData?.count || 0;

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
          const isMessagesItem = item.href === "/messages";
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
              {isMessagesItem && unreadCount > 0 && (
                <UnreadBadge count={unreadCount} className="ml-auto" />
              )}
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
