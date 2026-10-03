"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { LayoutDashboard } from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth-store";
import { trpc } from "@/lib/trpc/client";
import { getWorkspaceNavigation } from "@/lib/workspace-navigation";
import { WorkspaceNavLinks } from "./workspace-nav-links";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { useTradingWorkspace } from "@/hooks/use-trading-workspace";

export function Sidebar() {
  const pathname = usePathname();
  const { workspace } = useTradingWorkspace(pathname);
  const sidebarRef = useRef<HTMLElement>(null);
  const { user, isLoading, isAuthenticated } = useAuthStore();
  const ready = Boolean(user && !isLoading && isAuthenticated);
  const { data: unreadData, isError } = trpc.message.getUnreadCount.useQuery(
    undefined,
    {
      enabled: ready,
      retry: false,
      refetchInterval: ready ? 30000 : false,
    },
  );
  const navigation =
    ready && user ? getWorkspaceNavigation(user.role, pathname, workspace) : null;

  useEffect(() => {
    const sidebar = sidebarRef.current;
    const header = document.getElementById("main-content")?.previousElementSibling;
    if (!sidebar || !(header instanceof HTMLElement) || header.tagName !== "HEADER") {
      return;
    }
    const updateHeaderHeight = () => {
      sidebar.style.setProperty(
        "--workspace-header-height",
        String(header.getBoundingClientRect().height) + "px",
      );
    };
    updateHeaderHeight();
    const observer = new ResizeObserver(updateHeaderHeight);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  return (
    <aside
      ref={sidebarRef}
      className="sticky hidden min-h-0 w-64 shrink-0 self-start flex-col border-r bg-sidebar lg:flex"
      style={{
        top: "var(--workspace-header-height, 4rem)",
        maxHeight: "max(0px, calc(100dvh - var(--workspace-header-height, 4rem)))",
      }}
    >
      <div className="flex shrink-0 items-start gap-3 border-b p-5">
        <LayoutDashboard
          className="mt-0.5 h-5 w-5 shrink-0 text-primary"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {navigation?.title ??
              (isLoading ? "Checking access" : "Secure dashboard")}
          </p>
          <p className="mt-1 break-words text-xs text-muted-foreground">
            {ready
              ? user?.businessName || user?.name
              : "Loading your workspace"}
          </p>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
        {navigation && <div className="mb-4"><WorkspaceSwitcher /></div>}
        {navigation ? (
          <WorkspaceNavLinks
            groups={navigation.groups}
            pathname={pathname}
            unreadCount={isError ? undefined : unreadData?.count}
          />
        ) : (
          <p role="status" className="px-3 text-sm text-muted-foreground">
            {isLoading ? "Confirming your account…" : "Returning to sign in…"}
          </p>
        )}
      </div>
    </aside>
  );
}
