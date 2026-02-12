"use client";

import Link from "next/link";
import { useAuthStore } from "@/lib/stores/auth-store";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { MobileNav } from "@/components/layout/mobile-nav";
import {
  Search,
  User,
  LogOut,
  LayoutDashboard,
  Settings,
  Heart,
  Package,
  Menu,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { getDashboardPath } from "@/lib/auth/roles";

export function Header() {
  const { user, isAuthenticated } = useAuthStore();
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    useAuthStore.getState().logout();
    router.push("/");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-xl shadow-elevation-xs border-border/50">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        {/* Mobile Menu Button */}
        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label="Open navigation menu"
            >
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left">
            <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
            <MobileNav />
          </SheetContent>
        </Sheet>

        {/* Logo */}
        <Link href="/">
          <Logo variant="full" size="md" />
        </Link>

        {/* Navigation */}
        <nav className="hidden md:flex items-center gap-6">
          <Link
            href="/listings"
            className="link-animated text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Browse Listings
          </Link>
          {isAuthenticated && user?.role === "seller" && (
            <Link
              href="/seller/listings/new"
              className="link-animated text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Create Listing
            </Link>
          )}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-3">
          <Link href="/listings">
            <Button variant="ghost" size="icon" className="hidden md:flex" aria-label="Search listings">
              <Search className="h-4 w-4" />
            </Button>
          </Link>

          {isAuthenticated && user ? (
            <>
              <Link href="/buyer/watchlist">
                <Button variant="ghost" size="icon" aria-label="Wishlist">
                  <Heart className="h-4 w-4" />
                </Button>
              </Link>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="flex items-center gap-2"
                    aria-label="Open user menu"
                  >
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                    <span className="hidden md:inline text-sm">
                      {user.name}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <div className="flex flex-col">
                      <span>{user.name}</span>
                      <span className="text-xs font-normal text-muted-foreground">
                        {user.email}
                      </span>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() =>
                      router.push(getDashboardPath(user.role))
                    }
                  >
                    <LayoutDashboard className="mr-2 h-4 w-4" />
                    Dashboard
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      router.push(`${getDashboardPath(user.role)}/orders`)
                    }
                  >
                    <Package className="mr-2 h-4 w-4" />
                    Orders
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      router.push(
                        `${getDashboardPath(user.role)}/settings`
                      )
                    }
                  >
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/login">
                <Button variant="ghost" size="sm">
                  Sign in
                </Button>
              </Link>
              <Link href="/register">
                <Button variant="secondary" size="sm">Get Started</Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
