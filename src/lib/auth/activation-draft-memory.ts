"use client";

import { useAuthStore } from "@/lib/stores/auth-store";
import type { SellerActivationView } from "@/server/services/seller-activation";

type View = SellerActivationView;
type Application = NonNullable<View["application"]>;
export type ActivationDraftUncertainty = "save" | "submit" | null;
export interface ActivationDraftBinding { ownerId: string; generation: number }
export interface ActivationDraft {
  basis: Application | null;
  observed: Pick<Application, "id" | "requestId" | "revision"> | null;
  requestId: string;
  website: string;
  ein: string;
  dirty: boolean;
  replacing: boolean;
  uncertain: ActivationDraftUncertainty;
}

// One current-tab draft. Never serialize this value into browser storage,
// history, query caches or an auth store: it may contain a private EIN.
let accountId: string | null = null;
let generation = 0;
let retained: ActivationDraft | null = null;
let initialized = false;

function syncAccount() {
  const auth = useAuthStore.getState();
  const actor = auth.isAuthenticated ? auth.user : null;
  if ((actor?.id ?? null) !== accountId) {
    accountId = actor?.id ?? null;
    generation += 1;
    retained = null;
  } else if (actor?.role !== "buyer") {
    retained = null;
  }
}

function initialize() {
  if (typeof window === "undefined" || initialized) return;
  initialized = true;
  // Subscription outlives the page so A → B → A cannot revive A's private input.
  useAuthStore.subscribe(syncAccount);
  window.addEventListener("beforeunload", event => {
    if (!retained) return;
    event.preventDefault();
    event.returnValue = "";
  });
  syncAccount();
}

export function activationDraftBinding(ownerId: string): ActivationDraftBinding {
  initialize();
  return { ownerId, generation };
}

/** Fences callbacks as well as memory; an old login for the same ID is obsolete. */
export function isCurrentActivationOwner(binding: ActivationDraftBinding) {
  const auth = useAuthStore.getState();
  return typeof window !== "undefined" && auth.isAuthenticated && !auth.isLoading &&
    auth.user?.id === binding.ownerId && accountId === binding.ownerId && generation === binding.generation;
}

export function rememberActivationDraft(binding: ActivationDraftBinding, draft: ActivationDraft | null) {
  if (!isCurrentActivationOwner(binding)) return;
  retained = useAuthStore.getState().user?.role === "buyer" ? draft : null;
}

function sameApplication(a: ActivationDraft["observed"], b: View["application"]) {
  return a?.id === b?.id && a?.requestId === b?.requestId && a?.revision === b?.revision;
}

/** Call only after an owned fresh read. Server state decides whether editing is valid. */
export function readActivationDraft(binding: ActivationDraftBinding, view: View): ActivationDraft | null {
  if (!isCurrentActivationOwner(binding) || view.ownerId !== binding.ownerId || !retained ||
      view.sellerAccessActive || !view.currentBusiness.active || view.currentBusiness.role !== "buyer") return null;
  const draft = retained;
  const app = view.application;
  if (draft.replacing && !app?.canEdit) {
    return view.nextAction === "replace_application" && sameApplication(draft.observed, app) ? draft : null;
  }
  if (app && (!app.canEdit || app.evidencePurgedAt)) return null;
  if (!app && draft.observed) return null;
  if (app && app.id !== draft.observed?.id && app.requestId !== draft.requestId) return null;
  return {
    ...draft,
    uncertain: draft.uncertain ?? (sameApplication(draft.observed, app) ? null : "save"),
  };
}
