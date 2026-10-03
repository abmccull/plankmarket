"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Search,
  Package,
  LayoutDashboard,
  CreditCard,
  Calculator,
  BookOpen,
  Crown,
  ShoppingCart,
  User,
  LogOut,
} from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth-store";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";
import {
  getWorkspaceNavigation,
  isWorkspacePath,
} from "@/lib/workspace-navigation";
import { WorkspaceNavLinks } from "./workspace-nav-links";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { useTradingWorkspace } from "@/hooks/use-trading-workspace";
import { useSignOut } from "@/hooks/use-sign-out";

const publicItems = [
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
  { title: "Pro", href: "/pro", icon: Crown },
  {
    title: "Create Buyer Account",
    href: "/register?role=buyer",
    icon: ShoppingCart,
  },
  { title: "Sign In", href: "/login", icon: User },
];

export function MobileNav({ onNavigate }: { onNavigate?: () => void }) {
  const { user, isAuthenticated, isLoading } = useAuthStore();
  const pathname = usePathname();
  const { workspace } = useTradingWorkspace(pathname);
  const { signOut, pending, error } = useSignOut(onNavigate);
  const ready = Boolean(user && isAuthenticated && !isLoading);
  const { data: unread, isError } = trpc.message.getUnreadCount.useQuery(
    undefined,
    {
      enabled: ready,
      retry: false,
      refetchInterval: ready ? 30000 : false,
    },
  );
  const navigation =
    ready && user ? getWorkspaceNavigation(user.role, pathname, workspace) : null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="shrink-0">
        <Logo variant="full" size="sm" />
      </div>
      {navigation && user && (
        <div className="shrink-0 border-b pb-4">
          <p className="break-words text-sm font-semibold">
            {user.businessName || user.name}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {navigation.title}
          </p>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-6">
        {navigation && <div className="mb-4"><WorkspaceSwitcher onNavigate={onNavigate} /></div>}
        {navigation ? (
          <WorkspaceNavLinks
            groups={navigation.groups}
            pathname={pathname}
            unreadCount={isError ? undefined : unread?.count}
            label="Mobile workspace navigation"
            onNavigate={onNavigate}
          />
        ) : isLoading || isWorkspacePath(pathname) ? (
          <p role="status" className="px-3 text-sm text-muted-foreground">
            {isLoading ? "Confirming your account…" : "Returning to sign in…"}
          </p>
        ) : (
          <nav aria-label="Mobile navigation">
            <ul className="space-y-1">
              {publicItems.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onNavigate={onNavigate}
                    aria-current={pathname === item.href ? "page" : undefined}
                    className="flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <item.icon className="h-4 w-4" aria-hidden="true" />
                    {item.title}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
      {navigation && (
        <div className="shrink-0 border-t pt-3">
          {error && (
            <p role="alert" className="mb-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <Button
            variant="outline"
            className="min-h-11 w-full justify-start"
            onClick={() => void signOut()}
            disabled={pending}
          >
            <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
            {pending ? "Signing out…" : "Sign out"}
          </Button>
        </div>
      )}
    </div>
  );
}
