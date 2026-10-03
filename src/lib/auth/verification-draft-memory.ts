"use client";

import { useAuthStore } from "@/lib/stores/auth-store";

export interface VerificationDraftFields {
  businessWebsite: string;
  businessAddress: string;
  businessCity: string;
  businessState: string;
  businessZip: string;
  einTaxId: string;
  verificationDocUrl: string;
}
export interface VerificationDraftBasis { fields: VerificationDraftFields; updatedAt: Date | null }
export interface VerificationDraftAttempt extends VerificationDraftBasis { kind: "save" | "submit" }
export interface VerificationDraftBinding { ownerId: string; generation: number }
export interface VerificationDraftMemory {
  fields: VerificationDraftFields;
  basis: VerificationDraftBasis;
  attempt: VerificationDraftAttempt | null;
  forceSave: boolean;
}

// One owner and one current-tab draft. Never serialize private fields into
// browser storage, history, URLs, query caches or the authentication store.
let ownerId: string | null = null;
let generation = 0;
let retained: VerificationDraftMemory | null = null;
let initialized = false;

function syncAccount() {
  const auth = useAuthStore.getState();
  const user = auth.isAuthenticated ? auth.user : null;
  if ((user?.id ?? null) !== ownerId) {
    ownerId = user?.id ?? null;
    generation++;
    retained = null;
  }
  if (!user || !["buyer", "seller"].includes(user.role) || !["unverified", "rejected"].includes(user.verificationStatus)) retained = null;
}

function initialize() {
  if (typeof window === "undefined" || initialized) return;
  initialized = true;
  useAuthStore.subscribe(syncAccount);
  window.addEventListener("beforeunload", event => {
    if (!retained) return;
    event.preventDefault(); event.returnValue = "";
  });
  syncAccount();
}

export function verificationDraftBinding(id: string): VerificationDraftBinding {
  initialize();
  return { ownerId: id, generation };
}

export function isCurrentVerificationOwner(binding: VerificationDraftBinding) {
  const auth = useAuthStore.getState();
  return typeof window !== "undefined" && auth.isAuthenticated && !auth.isLoading &&
    auth.user?.id === binding.ownerId && ownerId === binding.ownerId && generation === binding.generation;
}

export function rememberVerificationDraft(binding: VerificationDraftBinding, draft: VerificationDraftMemory | null) {
  if (!isCurrentVerificationOwner(binding)) return;
  const user = useAuthStore.getState().user;
  retained = user && ["buyer", "seller"].includes(user.role) && ["unverified", "rejected"].includes(user.verificationStatus) ? draft : null;
}

/** Read only after a fresh owned server response; restored work requires a check. */
export function readVerificationDraftMemory(binding: VerificationDraftBinding, receiptOwnerId: string) {
  return isCurrentVerificationOwner(binding) && receiptOwnerId === binding.ownerId ? retained : null;
}
