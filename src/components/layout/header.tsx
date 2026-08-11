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
  Crown,
  Shield,
} from "lucide-react";
import { useProStatus } from "@/hooks/use-pro-status";
import { Logo } from "@/components/brand/logo";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { getDashboardPath } from "@/lib/auth/roles";
import { formatRelativeTime, truncate } from "@/lib/utils";
import { getNotificationHref } from "@/lib/utils/notification-href";

export function Header() {
  const { user, isAuthenticated, isLoading } = useAuthStore();
  const router = useRouter();
  const { isPro } = useProStatus();
  const sellHref =
    isAuthenticated && (user?.role === "seller" || user?.role === "admin")
      ? "/seller/listings/new"
      : "/for-sellers";
  const proHref = isPro ? "/settings/subscription" : "/pro";
  const canLoadNotifications = Boolean(isAuthenticated && user);

  // Notification data - only fetch when authenticated
  const { data: unreadData } = trpc.notification.getUnreadCount.useQuery(
    undefined,
    {
      enabled: canLoadNotifications,
      refetchInterval: canLoadNotifications ? 30000 : false,
      retry: false,
    }
  );
  const { data: latestNotifications } = trpc.notification.getLatest.useQuery(
    { limit: 5 },
    { enabled: canLoadNotifications, retry: false }
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
  const clearReadMutation = trpc.notification.clearRead.useMutation({
    onSuccess: () => {
      utils.notification.getUnreadCount.invalidate();
      utils.notification.getLatest.invalidate();
    },
  });

  const unreadCount = unreadData?.count ?? 0;

  const handleClearAll = async () => {
    if (unreadCount > 0) {
      await markAllAsReadMutation.mutateAsync();
    }
    clearReadMutation.mutate();
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    // Clear tRPC cache so next login doesn't see stale data
    await utils.invalidate();
    useAuthStore.getState().logout();
    router.push("/");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background shadow-elevation-xs">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-white focus:text-black focus:rounded focus:shadow-lg focus:outline-2 focus:outline-offset-2">
        Skip to main content
      </a>
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
        <Link href="/" aria-label="PlankMarket home">
          <Logo variant="full" size="sm" className="sm:hidden" />
          <Logo variant="full" size="md" className="hidden sm:flex" />
        </Link>

        {/* Navigation */}
        <nav className="hidden items-center gap-6 lg:flex" aria-label="Primary navigation">
          <Link
            href="/listings"
            className="link-animated text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Browse
          </Link>
          <Link
            href={sellHref}
            className="link-animated text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Sell Inventory
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
          <Link
            href="/blog"
            className="link-animated text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Blog
          </Link>
          <Link
            href={proHref}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-b from-amber-400 to-amber-500 px-3 py-1 text-xs font-semibold text-amber-950 shadow-sm transition-all hover:brightness-110"
          >
            <Crown className="h-3 w-3" aria-hidden="true" />
            Pro
          </Link>
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-3">
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="hidden text-muted-foreground hover:text-foreground md:flex"
          >
            <Link href="/listings" aria-label="Search listings">
              <Search className="h-4 w-4" />
            </Link>
          </Button>

          {isLoading ? (
            <div
              role="status"
              aria-live="polite"
              aria-label="Checking account session"
              className="flex items-center gap-2"
            >
              <span className="sr-only">Checking account session</span>
              <span
                aria-hidden="true"
                className="h-9 w-9 animate-pulse rounded-full bg-muted"
              />
              <span
                aria-hidden="true"
                className="hidden h-9 w-24 animate-pulse rounded-lg bg-muted sm:block"
              />
            </div>
          ) : isAuthenticated && user ? (
            <>
              {user.role === "buyer" && (
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Link href="/buyer/watchlist" aria-label="Watchlist">
                    <Heart className="h-4 w-4" />
                  </Link>
                </Button>
              )}

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
                    <div className="flex items-center gap-2">
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
                      {latestNotifications && latestNotifications.length > 0 && (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            handleClearAll();
                          }}
                          className="text-xs font-normal text-destructive hover:underline"
                          disabled={clearReadMutation.isPending}
                        >
                          Clear all
                        </button>
                      )}
                    </div>
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
                  {user.role === "admin" && (
                    <DropdownMenuItem
                      onClick={() => router.push("/admin")}
                    >
                      <Shield className="mr-2 h-4 w-4" />
                      Admin Panel
                    </DropdownMenuItem>
                  )}
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
              <Link href="/login" className="hidden sm:block">
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                  Sign in
                </Button>
              </Link>
              <Link href="/register">
                <Button size="sm">Create Account</Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
