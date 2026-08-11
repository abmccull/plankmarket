"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/lib/stores/auth-store";
import { trpc } from "@/lib/trpc/client";
import { SheetClose } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/brand/logo";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  Search,
  Package,
  Heart,
  LayoutDashboard,
  List,
  Plus,
  FileSpreadsheet,
  BarChart3,
  CreditCard,
  Settings,
  ShoppingCart,
  LogOut,
  User,
  Shield,
  Users,
  TrendingUp,
  Bot,
  Crown,
  PackageOpen,
  BookOpen,
  Calculator,
} from "lucide-react";

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const protectedNavPrefixes = [
  "/admin",
  "/buyer",
  "/messages",
  "/notifications",
  "/offers",
  "/preferences",
  "/seller",
  "/settings/agent",
  "/settings/subscription",
];

function isProtectedNavRoute(pathname: string) {
  return protectedNavPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

interface ProtectedNavShellProps {
  title: string;
  description: string;
}

function ProtectedNavShell({ title, description }: ProtectedNavShellProps) {
  return (
    <nav className="flex h-full flex-col" aria-label="Mobile navigation">
      <div className="mb-4">
        <Logo variant="full" size="sm" />
      </div>
      <div
        role="status"
        aria-live="polite"
        className="rounded-2xl border border-border/60 bg-gradient-to-br from-background via-background to-muted/30 p-4 shadow-sm"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <LayoutDashboard className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {description}
            </p>
          </div>
        </div>
      </div>
      <div className="mt-4 flex-1 space-y-2" aria-hidden="true">
        <div className="h-11 animate-pulse rounded-xl bg-muted/60" />
        <div className="h-11 animate-pulse rounded-xl bg-muted/50" />
        <div className="h-11 animate-pulse rounded-xl bg-muted/40" />
        <div className="h-11 animate-pulse rounded-xl bg-muted/30" />
      </div>
    </nav>
  );
}

export function MobileNav() {
  const { user, isAuthenticated, isLoading } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const isProtectedRoute = isProtectedNavRoute(pathname);

  const utils = trpc.useUtils();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    // Clear tRPC cache so next login doesn't see stale data
    await utils.invalidate();
    useAuthStore.getState().logout();
    router.push("/");
    router.refresh();
  };

  if (isProtectedRoute && isLoading) {
    return (
      <ProtectedNavShell
        title="Checking access"
        description="We’re syncing your dashboard session before showing protected navigation."
      />
    );
  }

  if (isProtectedRoute && !user) {
    return (
      <ProtectedNavShell
        title="Secure dashboard"
        description="Your session is being handed back to sign in so the protected workspace stays accurate."
      />
    );
  }

  // Define navigation items based on user role
  const getNavItems = (): NavItem[] => {
    if (!isAuthenticated || !user) {
      return [
        { title: "Browse", href: "/listings", icon: Search },
        { title: "Sell Inventory", href: "/for-sellers", icon: Package },
        { title: "How It Works", href: "/how-it-works", icon: LayoutDashboard },
        { title: "Pricing", href: "/pricing", icon: CreditCard },
        {
          title: "Inventory Calculator",
          href: "/tools/carrying-cost-calculator",
          icon: Calculator,
        },
        { title: "Blog", href: "/blog", icon: BookOpen },
        { title: "Pro", href: "/pro", icon: Crown, badge: "Pro" },
        { title: "Create Buyer Account", href: "/register?role=buyer", icon: ShoppingCart },
        { title: "Sign In", href: "/login", icon: User },
      ];
    }

    // Use user role to determine nav items, not just pathname.
    // Shared routes like /preferences, /messages, /offers don't have a role prefix.
    const isAdminUser = user.role === "admin";
    const isOnAdminRoute = pathname.startsWith("/admin");
    const isOnSellerRoute = pathname.startsWith("/seller");
    const isOnBuyerRoute = pathname.startsWith("/buyer");
    const isSeller = user.role === "seller";

    if (isAdminUser && isOnAdminRoute) {
      return [
        { title: "Browse Listings", href: "/listings", icon: Search },
        { title: "Admin Dashboard", href: "/admin", icon: LayoutDashboard },
        { title: "Orders", href: "/admin/orders", icon: ShoppingCart },
        { title: "Listings", href: "/admin/listings", icon: List },
        { title: "Verifications", href: "/admin/verifications", icon: Shield },
        { title: "Shipments", href: "/admin/shipments", icon: Package },
        { title: "Settings", href: "/admin/settings", icon: Settings },
      ];
    }

    // Admin on seller or buyer routes: show context-appropriate items + Admin Panel link
    // Default to seller items on shared routes (/messages, /preferences, etc.)
    if (isAdminUser) {
      const adminPanelItem: NavItem = { title: "Admin Panel", href: "/admin", icon: Shield };
      if (isOnSellerRoute || !isOnBuyerRoute) {
        return [
          adminPanelItem,
          { title: "Dashboard", href: "/seller", icon: LayoutDashboard },
          { title: "My Listings", href: "/seller/listings", icon: List },
          { title: "Create Listing", href: "/seller/listings/new", icon: Plus },
          { title: "Bulk Upload", href: "/seller/listings/bulk-upload", icon: FileSpreadsheet, badge: "Pro" },
          { title: "Buyer CRM", href: "/seller/crm", icon: Users, badge: "Pro" },
          { title: "Market Intel", href: "/seller/market", icon: TrendingUp, badge: "Pro" },
          { title: "AI Agent", href: "/settings/agent", icon: Bot, badge: "Pro" },
          { title: "Orders", href: "/seller/orders", icon: Package },
          { title: "Samples", href: "/seller/samples", icon: PackageOpen },
          { title: "Analytics", href: "/seller/analytics", icon: BarChart3 },
          { title: "Payments", href: "/seller/payments", icon: CreditCard },
          { title: "Subscription", href: "/settings/subscription", icon: CreditCard },
          { title: "Settings", href: "/seller/settings", icon: Settings },
        ];
      }
      return [
        adminPanelItem,
        { title: "Browse Listings", href: "/listings", icon: Search },
        { title: "Dashboard", href: "/buyer", icon: LayoutDashboard },
        { title: "My Orders", href: "/buyer/orders", icon: ShoppingCart },
        { title: "Samples", href: "/buyer/samples", icon: PackageOpen },
        { title: "Watchlist", href: "/buyer/watchlist", icon: Heart },
        { title: "Saved Searches", href: "/buyer/saved-searches", icon: Search },
        { title: "AI Agent", href: "/settings/agent", icon: Bot, badge: "Pro" },
        { title: "Subscription", href: "/settings/subscription", icon: CreditCard },
        { title: "Settings", href: "/buyer/settings", icon: Settings },
      ];
    }

    if (isSeller) {
      return [
        { title: "Dashboard", href: "/seller", icon: LayoutDashboard },
        { title: "My Listings", href: "/seller/listings", icon: List },
        { title: "Create Listing", href: "/seller/listings/new", icon: Plus },
        { title: "Bulk Upload", href: "/seller/listings/bulk-upload", icon: FileSpreadsheet, badge: "Pro" },
        { title: "Buyer CRM", href: "/seller/crm", icon: Users, badge: "Pro" },
        { title: "Market Intel", href: "/seller/market", icon: TrendingUp, badge: "Pro" },
        { title: "AI Agent", href: "/settings/agent", icon: Bot, badge: "Pro" },
        { title: "Orders", href: "/seller/orders", icon: Package },
        { title: "Samples", href: "/seller/samples", icon: PackageOpen },
        { title: "Analytics", href: "/seller/analytics", icon: BarChart3 },
        { title: "Payments", href: "/seller/payments", icon: CreditCard },
        { title: "Subscription", href: "/settings/subscription", icon: CreditCard },
        { title: "Settings", href: "/seller/settings", icon: Settings },
      ];
    }

    return [
      { title: "Browse Listings", href: "/listings", icon: Search },
      { title: "Dashboard", href: "/buyer", icon: LayoutDashboard },
      { title: "My Orders", href: "/buyer/orders", icon: ShoppingCart },
      { title: "Samples", href: "/buyer/samples", icon: PackageOpen },
      { title: "Watchlist", href: "/buyer/watchlist", icon: Heart },
      { title: "Saved Searches", href: "/buyer/saved-searches", icon: Search },
      { title: "AI Agent", href: "/settings/agent", icon: Bot, badge: "Pro" },
      { title: "Subscription", href: "/settings/subscription", icon: CreditCard },
      { title: "Settings", href: "/buyer/settings", icon: Settings },
    ];
  };

  const navItems = getNavItems();

  return (
    <nav className="flex flex-col h-full" aria-label="Mobile navigation">
      <div className="mb-4">
        <Logo variant="full" size="sm" />
      </div>

      {/* User Info Section */}
      {isAuthenticated && user && (
        <div className="pb-4 mb-4 border-b">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary/10 to-secondary/10">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">
                {user.businessName || user.name}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {user.email}
              </p>
            </div>
          </div>
          <div className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold">
            {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
          </div>
        </div>
      )}

      {/* Navigation Items */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-1">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/seller" &&
                item.href !== "/buyer" &&
                item.href !== "/admin" &&
                pathname.startsWith(item.href));

            return (
              <SheetClose asChild key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-secondary text-secondary-foreground"
                      : "text-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                  >
                    <item.icon className="h-5 w-5" />
                    {item.title}
                    {item.badge && (
                      <Badge variant="outline" className="ml-auto border-amber-300 bg-amber-50 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                        {item.badge}
                      </Badge>
                    )}
                  </Link>
                </SheetClose>
              );
          })}
        </div>
      </div>

      {/* Logout Button */}
      {isAuthenticated && (
        <div className="pt-4 mt-4 border-t">
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={handleLogout}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </div>
      )}
    </nav>
  );
}
