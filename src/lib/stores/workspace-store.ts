"use client";

import { create } from "zustand";
import { useAuthStore } from "./auth-store";
import { canCreateListings } from "@/lib/auth/roles";
import type { TradingWorkspace } from "@/lib/workspace-navigation";

interface WorkspaceState {
  accountId: string | null;
  generation: number;
  selected: TradingWorkspace | null;
}

const key = (id: string) => `plankmarket:workspace:${id}`;
export const useWorkspaceStore = create<WorkspaceState>(() => ({
  accountId: null,
  generation: 0,
  selected: null,
}));

function readSelection(id: string): TradingWorkspace | null {
  try {
    const value = sessionStorage.getItem(key(id));
    return value === "buyer" || value === "seller" ? value : null;
  } catch {
    return null;
  }
}

function syncAccount() {
  const auth = useAuthStore.getState();
  const actor = auth?.isAuthenticated ? auth.user : null;
  const current = useWorkspaceStore.getState();
  if ((actor?.id ?? null) !== current.accountId) {
    // A late callback from the old login must not affect the new account.
    const saved = actor ? readSelection(actor.id) : null;
    useWorkspaceStore.setState({
      accountId: actor?.id ?? null,
      generation: current.generation + 1,
      selected: saved === "seller" && actor && !canCreateListings(actor.role) ? null : saved,
    });
  } else if (current.selected === "seller" && actor && !canCreateListings(actor.role)) {
    useWorkspaceStore.setState({ selected: null });
  }
}

useAuthStore.subscribe(syncAccount);
syncAccount();

/** This is tab-local display context, never authentication or transaction authority. */
export function rememberWorkspace(binding: Pick<WorkspaceState, "accountId" | "generation">, selected: TradingWorkspace) {
  if (selected !== "buyer" && selected !== "seller") return false;
  const auth = useAuthStore.getState();
  const current = useWorkspaceStore.getState();
  if (!auth?.user || !auth.isAuthenticated || auth.isLoading ||
      auth.user.id !== binding.accountId || current.accountId !== binding.accountId ||
      current.generation !== binding.generation ||
      (selected === "seller" && !canCreateListings(auth.user.role))) return false;
  if (current.selected !== selected) useWorkspaceStore.setState({ selected });
  try { sessionStorage.setItem(key(auth.user.id), selected); } catch { /* Keep in-memory navigation usable. */ }
  return true;
}
