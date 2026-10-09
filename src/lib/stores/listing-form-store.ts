import { create } from "zustand";
import type { ListingFormInput } from "@/lib/validators/listing";

export type Draft = {
  defaultsApplied: boolean;
  currentStep: number;
  formData: Partial<ListingFormInput>;
  uploadedMediaIds: string[];
};
type Restored = Draft & { publishedListingId: string | null; accountDraftId: string | null; accountRevision: number | null; accountSnapshot: string | null };
interface ListingFormState extends Restored {
  sellerId: string | null;
  saveError: string | null;
  restoreError: string | null;
  storageReadBlocked: boolean;
  bindSeller: (sellerId: string | null) => void;
  markDefaultsApplied: () => void;
  acknowledgeAccount: (id: string, revision: number, snapshot: string) => void;
  restoreAccount: (draft: Draft, id: string, revision: number, snapshot: string, listingId?: string | null) => void;
  retryRestore: () => boolean;
  saveDraft: () => boolean;
  continueWithoutSaving: () => void;
  setStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  updateFormData: (data: Partial<ListingFormInput>) => void;
  addMediaId: (id: string) => void;
  removeMediaId: (id: string) => void;
  setMediaIds: (ids: string[]) => void;
  reset: () => boolean;
  completePublication: (sellerId: string, listingId: string, submittedDraftSnapshot: string, preserveUnreadDraft?: boolean) => void;
}

const blank = (): Restored => ({
  currentStep: 1,
  defaultsApplied: false,
  accountDraftId: null, accountRevision: null, accountSnapshot: null,
  formData: { allowOffers: true, certifications: [] },
  uploadedMediaIds: [],
  publishedListingId: null,
});
const key = (sellerId: string) => `plankmarket-listing-form:${sellerId}`;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Exhaustive field shapes keep browser storage from supplying a scalar where
// renderers expect a number or array, without enforcing publication validity.
const draftFieldTypes = {
  warehouseId: "text", warehouseRevision: "number",
  packagingType: "text", installationMethod: "text", lotNumber: "text", waterResistance: "text",
  title: "text", description: "text", materialType: "text", species: "text", finish: "text", grade: "text",
  color: "text", colorFamily: "text", brand: "text", modelNumber: "text", moqUnit: "text",
  nmfcCode: "text", freightClass: "text", locationCity: "text", locationState: "text", locationZip: "text",
  condition: "text", reasonCode: "text", territoryMode: "text", freightPaymentMode: "text",
  thickness: "nullableNumber", width: "nullableNumber", length: "nullableNumber", wearLayer: "nullableNumber",
  sqFtPerBox: "nullableNumber", boxesPerPallet: "nullableNumber", buyNowPrice: "nullableNumber", floorPrice: "nullableNumber",
  totalSqFt: "number", totalPallets: "number", moq: "number", palletWeight: "number", palletLength: "number",
  palletWidth: "number", palletHeight: "number", askPricePerSqFt: "number",
  partialQuantityMarkupPercent: "nullableNumber", automaticMarkdownFloorPercent: "nullableNumber",
  automaticMarkdownIntervalDays: "nullableNumber", freightDropCharge: "nullableNumber",
  automaticMarkdownCurrentStep: "number", pricingRulesVersion: "number",
  allowOffers: "boolean", fullLotOnly: "boolean", automaticMarkdownEnabled: "boolean", allowSampleRequests: "boolean",
  certifications: "strings", allowedDestinationStates: "strings", sellerFreightStates: "strings", mediaIds: "strings",
  automaticMarkdownStartedAt: "date", automaticMarkdownLastAppliedAt: "date",
} satisfies Record<keyof ListingFormInput, "text" | "number" | "nullableNumber" | "boolean" | "strings" | "date">;
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
// Drafts are intentionally incomplete. Do not parse through creation defaults or
// require finished fields here. The full schema/server remain publication gates.
function readDraft(sellerId: string): Restored {
  if (typeof window === "undefined") return blank();
  const raw = localStorage.getItem(key(sellerId));
  if (!raw) return blank();
  if (raw.length > 100_000) throw new Error("Draft is too large");
  const saved: unknown = JSON.parse(raw);
  if (!isRecord(saved)) throw new Error("Draft is unreadable");
  if (saved.kind === "published" && typeof saved.listingId === "string" && uuid.test(saved.listingId)) {
    return { ...blank(), publishedListingId: saved.listingId };
  }
  if (!isRecord(saved.formData) || !Array.isArray(saved.uploadedMediaIds)) {
    throw new Error("Draft has an unsupported format");
  }
  const formData: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(saved.formData)) {
    if (!Object.hasOwn(draftFieldTypes, field) || field === "mediaIds") continue;
    const type = draftFieldTypes[field as keyof typeof draftFieldTypes];
    const finiteNumber = typeof value === "number" && Number.isFinite(value);
    const valid = type === "text" ? typeof value === "string"
      : type === "boolean" ? typeof value === "boolean"
      : type === "number" || type === "nullableNumber" ? finiteNumber || value === null
      : type === "strings" ? Array.isArray(value) && value.length <= 100 && value.every(item => typeof item === "string")
      : value === null || (typeof value === "string" && Number.isFinite(Date.parse(value)));
    if (!valid) throw new Error("Draft contains an unsupported field type");
    // JSON represents an unfinished NaN number as null. Retain an empty field
    // rather than inventing a value; optional legacy clears remain nullable.
    formData[field] = type === "number" && value === null ? undefined : value;
  }
  return {
    currentStep: saved.schemaVersion === 2 ? Math.min(3, Math.max(1, Math.trunc(Number(saved.currentStep)) || 1)) : Number(saved.currentStep) === 6 ? 3 : [2, 3].includes(Number(saved.currentStep)) ? 2 : 1,
    defaultsApplied: saved.schemaVersion === 2 ? saved.defaultsApplied === true : Object.keys(formData).length > 2,
    accountDraftId: typeof saved.accountDraftId === "string" && uuid.test(saved.accountDraftId) ? saved.accountDraftId : null,
    accountRevision: typeof saved.accountRevision === "number" && Number.isSafeInteger(saved.accountRevision) ? saved.accountRevision : null,
    accountSnapshot: typeof saved.accountSnapshot === "string" ? saved.accountSnapshot : null,
    formData: formData as Partial<ListingFormInput>,
    uploadedMediaIds: saved.uploadedMediaIds.filter((id: unknown): id is string => typeof id === "string").slice(0, 20),
    publishedListingId: null,
  };
}

export const useListingFormStore = create<ListingFormState>((set, get) => {
  const restore = (sellerId: string | null) => {
    try {
      set({ sellerId, ...(sellerId ? readDraft(sellerId) : blank()), saveError: null, restoreError: null, storageReadBlocked: false });
      return true;
    } catch {
      const sameSeller = get().sellerId === sellerId;
      set({ sellerId, ...(sameSeller ? {} : blank()), saveError: null, storageReadBlocked: true, restoreError: "This browser could not restore your saved draft. Nothing has been overwritten. Retry, continue without saving, or explicitly discard it to start again." });
      return false;
    }
  };
  const persist = (changes: Partial<Draft>) => {
    // Once the server has confirmed publication, form-watch callbacks must not
    // recreate that finished draft while its terminal receipt is displayed.
    if (get().publishedListingId) return false;
    set(changes);
    const current = get();
    if (!current.sellerId || typeof window === "undefined" || current.restoreError) return false;
    if (current.storageReadBlocked) {
      set({ saveError: "These edits are only in this open page. The previous saved draft could not be read and has not been overwritten. Keep this page open; restore the saved version only if you want to replace these edits." });
      return false;
    }
    const { currentStep, formData, uploadedMediaIds, defaultsApplied, accountDraftId, accountRevision, accountSnapshot } = current;
    try {
      localStorage.setItem(key(current.sellerId), JSON.stringify({ schemaVersion: 2, currentStep, formData, uploadedMediaIds, defaultsApplied, accountDraftId, accountRevision, accountSnapshot }));
      set({ saveError: null });
      return true;
    } catch {
      set({ saveError: "Your latest edits are only in this open page. This browser could not save them. Keep this page open and retry saving before leaving." });
      return false;
    }
  };
  return {
    ...blank(), sellerId: null, saveError: null, restoreError: null, storageReadBlocked: false,
    bindSeller: sellerId => { if (get().sellerId !== sellerId) restore(sellerId); },
    markDefaultsApplied: () => { persist({ defaultsApplied: true }); },
    acknowledgeAccount: (id, revision, snapshot) => {
      set({ accountDraftId: id, accountRevision: revision, accountSnapshot: snapshot });
      persist({});
    },
    restoreAccount: (draft, id, revision, snapshot, listingId = null) => {
      set({ ...draft, accountDraftId: id, accountRevision: revision, accountSnapshot: snapshot, publishedListingId: listingId, restoreError: null });
      if (listingId) {
        try { if (get().sellerId && !get().storageReadBlocked) localStorage.setItem(key(get().sellerId!), JSON.stringify({ kind: "published", listingId })); } catch { /* The account receipt remains authoritative. */ }
      } else persist({});
    },
    retryRestore: () => restore(get().sellerId),
    saveDraft: () => persist({}),
    continueWithoutSaving: () => {
      if (get().storageReadBlocked) set({ restoreError: null, saveError: "These edits will stay only in this open page. The unread saved draft will not be overwritten. Keep this page open until you finish." });
    },
    setStep: step => { persist({ currentStep: Math.min(3, Math.max(1, step)) }); },
    nextStep: () => { persist({ currentStep: Math.min(3, get().currentStep + 1) }); },
    prevStep: () => { persist({ currentStep: Math.max(1, get().currentStep - 1) }); },
    updateFormData: data => { persist({ formData: { ...get().formData, ...data } }); },
    addMediaId: id => { persist({ uploadedMediaIds: [...get().uploadedMediaIds, id] }); },
    removeMediaId: id => { persist({ uploadedMediaIds: get().uploadedMediaIds.filter(value => value !== id) }); },
    setMediaIds: ids => { persist({ uploadedMediaIds: ids }); },
    reset: () => {
      const sellerId = get().sellerId;
      try {
        if (sellerId && typeof window !== "undefined") localStorage.removeItem(key(sellerId));
        set({ ...blank(), saveError: null, restoreError: null, storageReadBlocked: false });
        return true;
      } catch {
        set({ saveError: "This browser could not clear the saved draft. It has not been replaced. Retry when browser storage is available." });
        return false;
      }
    },
    completePublication: (sellerId, listingId, submittedDraftSnapshot, preserveUnreadDraft = false) => {
      const snapshot = (draft: Draft) => JSON.stringify({ currentStep: draft.currentStep, formData: draft.formData, uploadedMediaIds: draft.uploadedMediaIds });
      const current = get();
      // A departed submission must not replace newer edits after A -> B -> A.
      // While another seller is current, only replace a matching saved draft.
      if (current.sellerId === sellerId) {
        if (current.publishedListingId || snapshot(current) !== submittedDraftSnapshot) return;
      } else {
        if (preserveUnreadDraft) return;
        try {
          const saved = readDraft(sellerId);
          if (saved.publishedListingId || snapshot(saved) !== submittedDraftSnapshot) return;
        } catch { return; }
      }
      let warning: string | null = null;
      if (preserveUnreadDraft) {
        warning = "Your listing was published. The previous unread browser draft was kept untouched. Check your inventory before preparing the same lot again.";
      } else try {
        // Replace the draft with a minimal receipt until the seller explicitly
        // prepares another lot. Reload/Back must not restore a submitted draft.
        localStorage.setItem(key(sellerId), JSON.stringify({ kind: "published", listingId }));
      } catch {
        try {
          // If a receipt cannot be saved, still remove the superseded draft
          // when possible. The current page remains a terminal receipt.
          localStorage.removeItem(key(sellerId));
          warning = "Your listing was published, but this browser could not save its confirmation. The old local draft was cleared. Check your inventory before preparing the same lot again.";
        } catch {
          warning = "Your listing was published, but this browser could not save its confirmation or clear the old local draft. Check your inventory before preparing the same lot again.";
        }
      }
      // A delayed response must never reset another seller's draft.
      if (get().sellerId === sellerId) {
        set({ ...blank(), publishedListingId: listingId, saveError: warning, restoreError: null, storageReadBlocked: false });
      }
    },
  };
});
