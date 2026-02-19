"use client";

import Link from "next/link";
import { useAuthStore } from "@/lib/stores/auth-store";
import { trpc } from "@/lib/trpc/client";
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
  Bell,
  ChevronRight,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { getDashboardPath } from "@/lib/auth/roles";
import { formatRelativeTime, truncate } from "@/lib/utils";
import type { Notification } from "@/server/db/schema/notifications";
import type { UserRole } from "@/types";

function getNotificationHref(
  notification: Pick<Notification, "type" | "data">,
  role?: UserRole | null,
): string | null {
  const data = notification.data as Record<string, unknown> | null;

  if (notification.type === "new_offer") return "/offers";

  if (notification.type === "listing_match" && data?.listingSlug) {
    return `/listings/${data.listingSlug}`;
  }

  if (data?.orderId) {
    const base = role === "seller" ? "/seller" : "/buyer";
    return `${base}/orders/${data.orderId}`;
  }

  if (data?.listingId && (notification.type === "listing_expiring" || notification.type === "system")) {
    return "/seller/listings";
  }

  if (data?.conversationId) {
    return `/messages?conversation=${data.conversationId}`;
  }

  if (data?.type === "response_accepted" || data?.type === "response_declined") {
    return "/seller/request-board";
  }

  if (data?.type === "request_response") {
    return "/buyer/requests";
  }

  return null;
}

export function Header() {
  const { user, isAuthenticated } = useAuthStore();
  const router = useRouter();

  // Notification data - only fetch when authenticated
  const { data: unreadData } = trpc.notification.getUnreadCount.useQuery(
    undefined,
    { enabled: isAuthenticated, refetchInterval: 30000 }
  );
  const { data: latestNotifications } = trpc.notification.getLatest.useQuery(
    { limit: 5 },
    { enabled: isAuthenticated }
  );
  const utils = trpc.useUtils();
  const markAsReadMutation = trpc.notification.markAsRead.useMutation({
    onSuccess: () => {
      utils.notification.getUnreadCount.invalidate();
      utils.notification.getLatest.invalidate();
    },
  });
  const markAllAsReadMutation = trpc.notification.markAllAsRead.useMutation({
    onSuccess: () => {
      utils.notification.getUnreadCount.invalidate();
      utils.notification.getLatest.invalidate();
    },
  });

  const unreadCount = unreadData?.count ?? 0;

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    useAuthStore.getState().logout();
    router.push("/");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background shadow-elevation-xs">
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
          <Link
            href="/how-it-works"
            className="link-animated text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            How It Works
          </Link>
          <Link
            href="/pricing"
            className="link-animated text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Pricing
          </Link>
          {isAuthenticated && user?.role === "seller" ? (
            <>
              <Link
                href="/seller-guide"
                className="link-animated text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Seller Guide
              </Link>
              <Link
                href="/seller/listings/new"
                className="link-animated text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Create Listing
              </Link>
            </>
          ) : !isAuthenticated ? (
            <Link
              href="/for-sellers"
              className="link-animated text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              For Sellers
            </Link>
          ) : null}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-3">
          <Link href="/listings">
            <Button variant="ghost" size="icon" className="hidden md:flex text-muted-foreground hover:text-foreground" aria-label="Search listings">
              <Search className="h-4 w-4" />
            </Button>
          </Link>

          {isAuthenticated && user ? (
            <>
              <Link href="/buyer/watchlist">
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground" aria-label="Wishlist">
                  <Heart className="h-4 w-4" />
                </Button>
              </Link>

              {/* Notification Bell */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="relative text-muted-foreground hover:text-foreground"
                    aria-label="Notifications"
                  >
                    <Bell className="h-4 w-4" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[calc(100vw-2rem)] sm:w-80 max-h-[70vh] overflow-y-auto">
                  <DropdownMenuLabel className="flex items-center justify-between">
                    <span>Notifications</span>
                    {unreadCount > 0 && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          markAllAsReadMutation.mutate();
                        }}
                        className="text-xs font-normal text-primary hover:underline"
                      >
                        Mark all read
                      </button>
                    )}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {latestNotifications && latestNotifications.length > 0 ? (
                    <>
                      {latestNotifications.map((notification) => (
                        <DropdownMenuItem
                          key={notification.id}
                          className="flex items-start gap-3 cursor-pointer py-3"
                          onClick={() => {
                            if (!notification.read) {
                              markAsReadMutation.mutate({ id: notification.id });
                            }
                            const href = getNotificationHref(notification, user?.role);
                            if (href) {
                              router.push(href);
                            }
                          }}
                        >
                          <div className="mt-0.5">
                            {!notification.read && (
                              <div className="h-2 w-2 rounded-full bg-primary" />
                            )}
                            {notification.read && (
                              <div className="h-2 w-2" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium leading-tight">
                              {notification.title}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5 leading-tight">
                              {truncate(notification.message, 80)}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {formatRelativeTime(notification.createdAt)}
                            </p>
                          </div>
                          {getNotificationHref(notification, user?.role) && (
                            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          )}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="justify-center text-sm text-primary cursor-pointer"
                        onClick={() => router.push("/notifications")}
                      >
                        View all notifications
                      </DropdownMenuItem>
                    </>
                  ) : (
                    <div className="py-6 text-center text-sm text-muted-foreground">
                      No notifications yet
                    </div>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="flex items-center gap-2 text-foreground hover:bg-muted"
                    aria-label="Open user menu"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
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
                    onClick={() => router.push("/notifications")}
                  >
                    <Bell className="mr-2 h-4 w-4" />
                    Notifications
                    {unreadCount > 0 && (
                      <span className="ml-auto text-xs bg-primary text-primary-foreground rounded-full px-1.5 py-0.5">
                        {unreadCount}
                      </span>
                    )}
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
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                  Sign in
                </Button>
              </Link>
              <Link href="/register">
                <Button size="sm">Get Started</Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
