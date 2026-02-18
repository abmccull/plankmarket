"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/lib/stores/auth-store";
import { SheetClose } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";
import { createClient } from "@/lib/supabase/client";
import { getDashboardPath } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";
import {
  Search,
  Package,
  Heart,
  LayoutDashboard,
  List,
  Plus,
  BarChart3,
  CreditCard,
  Settings,
  ShoppingCart,
  LogOut,
  User,
  Shield,
} from "lucide-react";

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

export function MobileNav() {
  const { user, isAuthenticated } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    useAuthStore.getState().logout();
    router.push("/");
    router.refresh();
  };

  // Define navigation items based on user role
  const getNavItems = (): NavItem[] => {
    if (!isAuthenticated || !user) {
      return [
        { title: "Browse Listings", href: "/listings", icon: Search },
        { title: "How It Works", href: "/how-it-works", icon: LayoutDashboard },
        { title: "Pricing", href: "/pricing", icon: CreditCard },
        { title: "For Sellers", href: "/for-sellers", icon: Package },
        { title: "Login", href: "/login", icon: User },
        { title: "Register", href: "/register", icon: User },
      ];
    }

    // Use user role to determine nav items, not just pathname.
    // Shared routes like /preferences, /messages, /offers don't have a role prefix.
    const isSeller =
      user.role === "seller" || user.role === "admin" || pathname.startsWith("/seller");

    if (pathname.startsWith("/admin")) {
      return [
        { title: "Browse Listings", href: "/listings", icon: Search },
        { title: "Dashboard", href: getDashboardPath(user.role), icon: LayoutDashboard },
        { title: "My Orders", href: "/buyer/orders", icon: ShoppingCart },
        { title: "Watchlist", href: "/buyer/watchlist", icon: Heart },
        { title: "Admin Panel", href: "/admin", icon: Shield },
        { title: "Settings", href: `${getDashboardPath(user.role)}/settings`, icon: Settings },
      ];
    }

    if (isSeller) {
      return [
        { title: "Dashboard", href: "/seller", icon: LayoutDashboard },
        { title: "My Listings", href: "/seller/listings", icon: List },
        { title: "Create Listing", href: "/seller/listings/new", icon: Plus },
        { title: "Orders", href: "/seller/orders", icon: Package },
        { title: "Analytics", href: "/seller/analytics", icon: BarChart3 },
        { title: "Payments", href: "/seller/stripe-onboarding", icon: CreditCard },
        { title: "Settings", href: "/seller/settings", icon: Settings },
      ];
    }

    return [
      { title: "Browse Listings", href: "/listings", icon: Search },
      { title: "Dashboard", href: "/buyer", icon: LayoutDashboard },
      { title: "My Orders", href: "/buyer/orders", icon: ShoppingCart },
      { title: "Watchlist", href: "/buyer/watchlist", icon: Heart },
      { title: "Saved Searches", href: "/buyer/saved-searches", icon: Search },
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
