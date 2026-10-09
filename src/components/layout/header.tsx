"use client";

import { Suspense, useState } from "react";
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
import { useSignOut } from "@/hooks/use-sign-out";
import { usePathname, useRouter } from "next/navigation";
import { canPurchase } from "@/lib/auth/roles";
import { useTradingWorkspace, WorkspaceLocationSync } from "@/hooks/use-trading-workspace";
import { isPathWithin, isWorkspacePath } from "@/lib/workspace-navigation";
import { formatRelativeTime, truncate } from "@/lib/utils";
import { getNotificationHref } from "@/lib/utils/notification-href";

export function Header() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const {
    signOut,
    pending: signOutPending,
    error: signOutError,
  } = useSignOut();
  const { user, isAuthenticated, isLoading } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const { workspace: tradingWorkspace } = useTradingWorkspace(pathname);
  const dashboardPath = user?.role === "admin" && isPathWithin(pathname, "/admin") ? "/admin" : `/${tradingWorkspace}`;
  const workspace = isWorkspacePath(pathname) && !isPathWithin(pathname, "/admin");
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
    },
  );
  const { data: latestNotifications } = trpc.notification.getLatest.useQuery(
    { limit: 5 },
    { enabled: canLoadNotifications, retry: false },
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

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background shadow-elevation-xs">
      <Suspense fallback={null}><WorkspaceLocationSync /></Suspense>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-white focus:text-black focus:rounded focus:shadow-lg focus:outline-2 focus:outline-offset-2"
      >
        Skip to main content
      </a>
      <div className="container mx-auto flex min-h-16 items-center justify-between gap-2 px-3 py-2 sm:px-4">
        {/* Mobile Menu Button */}
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={`h-[44px] w-[44px] shrink-0 ${workspace ? "lg:hidden" : "xl:hidden"}`}
              aria-label="Open navigation menu"
            >
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="flex h-dvh w-[min(22rem,calc(100vw-1.5rem))] flex-col overflow-hidden p-4 pt-14"
            aria-describedby={undefined}
          >
            <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
            <MobileNav onNavigate={() => setMobileNavOpen(false)} />
          </SheetContent>
        </Sheet>

        {/* Logo */}
        <Link
          href="/"
          aria-label="PlankMarket home"
          className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center"
        >
          <Logo variant="icon" size="sm" className="sm:hidden" />
          <Logo variant="full" size="md" className="hidden sm:flex" />
        </Link>

        {/* Navigation */}
        {workspace ? <nav className="hidden items-center gap-6 lg:flex" aria-label="Workspace shortcuts">
          <Link href="/listings" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Search className="h-4 w-4" aria-hidden="true" />Browse inventory
          </Link>
          <Link href="/contact" className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Help</Link>
        </nav> : <nav
          className="hidden items-center gap-4 xl:flex"
          aria-label="Primary navigation"
        >
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
        </nav>}

        {/* Right side */}
        <div className="flex shrink-0 items-center gap-1 sm:gap-3">
          <Button
            asChild
            variant="ghost"
            size="icon"
            className={`${workspace ? "flex lg:hidden" : "hidden md:flex"} h-[44px] w-[44px] shrink-0 text-muted-foreground hover:text-foreground`}
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
              {canPurchase(user.role) && (
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  className="h-[44px] w-[44px] shrink-0 text-muted-foreground hover:text-foreground"
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
                    className="relative h-[44px] w-[44px] shrink-0 text-muted-foreground hover:text-foreground"
                    aria-label="Notifications"
                  >
                    <Bell className="h-4 w-4" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-[calc(100vw-2rem)] sm:w-80 max-h-[70vh] overflow-y-auto"
                >
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
                      {latestNotifications &&
                        latestNotifications.length > 0 && (
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
                              markAsReadMutation.mutate({
                                id: notification.id,
                              });
                            }
                            const href = getNotificationHref(
                              notification,
                              user?.role,
                            );
                            if (href) {
                              router.push(href);
                            }
                          }}
                        >
                          <div className="mt-0.5">
                            {!notification.read && (
                              <div className="h-2 w-2 rounded-full bg-primary" />
                            )}
                            {notification.read && <div className="h-2 w-2" />}
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
                    className="flex h-[44px] w-[44px] shrink-0 items-center gap-2 p-0 text-foreground hover:bg-muted 2xl:w-auto 2xl:px-3"
                    aria-label="Open user menu"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                    <span className="hidden max-w-32 truncate text-sm 2xl:inline-block">
                      {user.name}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <div className="flex flex-col">
                      <span className="break-words">{user.name}</span>
                      <span className="text-xs font-normal text-muted-foreground">
                        {user.email}
                      </span>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => router.push(dashboardPath)}
                  >
                    <LayoutDashboard className="mr-2 h-4 w-4" />
                    Dashboard
                  </DropdownMenuItem>
                  {user.role === "admin" && (
                    <DropdownMenuItem onClick={() => router.push("/admin")}>
                      <Shield className="mr-2 h-4 w-4" />
                      Admin Panel
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() =>
                      router.push(`${dashboardPath}/orders`)
                    }
                  >
                    <Package className="mr-2 h-4 w-4" />
                    {dashboardPath === "/buyer" ? "Purchases" : dashboardPath === "/seller" ? "Sales" : "Orders"}
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
                      router.push(`${dashboardPath}/settings`)
                    }
                  >
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={signOutPending}
                    onClick={() => void signOut()}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    {signOutPending ? "Signing out…" : "Sign out"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="hidden min-h-[44px] text-muted-foreground hover:text-foreground sm:inline-flex"
              >
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild size="sm" className="min-h-[44px]">
                <Link href="/register">Create Account</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
      {signOutError && (
        <p
          role="alert"
          className="border-t bg-background px-4 py-2 text-center text-sm text-destructive"
        >
          {signOutError}
        </p>
      )}
    </header>
  );
}
