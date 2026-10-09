"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/lib/stores/auth-store";
import { rememberWorkspace, useWorkspaceStore } from "@/lib/stores/workspace-store";
import { resolveTradingWorkspace, type TradingWorkspace } from "@/lib/workspace-navigation";

const HISTORY_KEY = "plankmarketWorkspace";
const CONTEXT_EVENT = "plankmarket:workspace-history";
const validContext = (value?: string | null): TradingWorkspace | null => value === "buyer" || value === "seller" ? value : null;

/** Mount inside a small Suspense boundary; query-only Next navigation also updates shared menus. */
export function WorkspaceLocationSync() {
  const pathname = usePathname();
  const query = useSearchParams().toString();
  useEffect(() => { window.dispatchEvent(new Event(CONTEXT_EVENT)); }, [pathname, query]);
  return null;
}
function subscribe(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  window.addEventListener(CONTEXT_EVENT, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(CONTEXT_EVENT, onChange);
  };
}
function browserSnapshot() {
  const saved = window.history.state?.[HISTORY_KEY];
  return JSON.stringify({ path: window.location.pathname, search: window.location.search,
    accountId: saved?.accountId, href: saved?.href, selected: saved?.selected });
}

export function useTradingWorkspace(pathname: string, requested?: string | null) {
  const { user, isAuthenticated, isLoading } = useAuthStore();
  const binding = useWorkspaceStore();
  // Read URL/history through an external store: Header remains server-renderable
  // without a page-wide useSearchParams Suspense bailout.
  const snapshot = useSyncExternalStore(subscribe, browserSnapshot, () => "");
  const location = snapshot ? JSON.parse(snapshot) as {
    path: string; search: string; accountId?: string; href?: string; selected?: string;
  } : null;
  const ready = Boolean(user && isAuthenticated && !isLoading);
  const samePath = location?.path === pathname;
  const fromUrl = samePath ? new URLSearchParams(location.search).get("workspace") : null;
  const historyContext = samePath && location.accountId === user?.id &&
    location.href === location.path + location.search ? location.selected : null;
  const remembered = binding.accountId === user?.id ? binding.selected : null;
  const workspace = resolveTradingWorkspace(user?.role ?? "buyer", pathname,
    validContext(requested) ?? validContext(fromUrl) ?? validContext(historyContext) ?? remembered);

  const selectWorkspace = useCallback((next: TradingWorkspace) => rememberWorkspace(binding, next), [binding]);
  useEffect(() => {
    if (!ready || !rememberWorkspace(binding, workspace)) return;
    if (window.location.pathname !== pathname) return;
    const href = window.location.pathname + window.location.search;
    const previous = window.history.state?.[HISTORY_KEY];
    if (previous?.accountId === binding.accountId && previous?.href === href && previous?.selected === workspace) return;
    try {
      window.history.replaceState({ ...window.history.state, [HISTORY_KEY]: { accountId: binding.accountId, href, selected: workspace } }, "");
      window.dispatchEvent(new Event(CONTEXT_EVENT));
    } catch { /* Optional history persistence cannot block navigation. */ }
  }, [ready, binding, workspace, pathname]);
  return { workspace, selectWorkspace, ready };
}
