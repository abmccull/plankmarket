import { create } from "zustand";
import type { ListingFormInput } from "@/lib/validators/listing";

type Draft = { currentStep: number; formData: Partial<ListingFormInput>; uploadedMediaIds: string[] };
interface ListingFormState extends Draft {
  sellerId: string | null;
  saveError: string | null;
  bindSeller: (sellerId: string | null) => void;
  setStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  updateFormData: (data: Partial<ListingFormInput>) => void;
  addMediaId: (id: string) => void;
  removeMediaId: (id: string) => void;
  setMediaIds: (ids: string[]) => void;
  reset: () => void;
}
const blank = (): Draft => ({ currentStep: 1, formData: { allowOffers: true, certifications: [] }, uploadedMediaIds: [] });
const key = (sellerId: string) => `plankmarket-listing-form:${sellerId}`;
function readDraft(sellerId: string): Draft {
  if (typeof window === "undefined") return blank();
  try {
    const saved = JSON.parse(localStorage.getItem(key(sellerId)) ?? "null");
    if (!saved || !saved.formData || !Array.isArray(saved.uploadedMediaIds)) return blank();
    return { currentStep: Math.min(6, Math.max(1, Number(saved.currentStep) || 1)), formData: saved.formData, uploadedMediaIds: saved.uploadedMediaIds.filter((id: unknown) => typeof id === "string").slice(0, 20) };
  } catch { return blank(); }
}
export const useListingFormStore = create<ListingFormState>((set, get) => {
  const persist = (changes: Partial<Draft>) => {
    set(changes);
    const current = get();
    if (!current.sellerId || typeof window === "undefined") return;
    const { currentStep, formData, uploadedMediaIds } = current;
    try { localStorage.setItem(key(current.sellerId), JSON.stringify({ currentStep, formData, uploadedMediaIds })); if (current.saveError) set({ saveError: null }); }
    catch { set({ saveError: "This browser could not save your draft. Keep this page open until you publish." }); }
  };
  return {
    ...blank(), sellerId: null, saveError: null,
    bindSeller: (sellerId) => { if (get().sellerId !== sellerId) set({ sellerId, ...(sellerId ? readDraft(sellerId) : blank()) }); },
    setStep: (step) => persist({ currentStep: Math.min(6, Math.max(1, step)) }),
    nextStep: () => persist({ currentStep: Math.min(6, get().currentStep + 1) }),
    prevStep: () => persist({ currentStep: Math.max(1, get().currentStep - 1) }),
    updateFormData: (data) => persist({ formData: { ...get().formData, ...data } }),
    addMediaId: (id) => persist({ uploadedMediaIds: [...get().uploadedMediaIds, id] }),
    removeMediaId: (id) => persist({ uploadedMediaIds: get().uploadedMediaIds.filter((value) => value !== id) }),
    setMediaIds: (ids) => persist({ uploadedMediaIds: ids }),
    reset: () => { const sellerId = get().sellerId; if (sellerId && typeof window !== "undefined") localStorage.removeItem(key(sellerId)); set(blank()); },
  };
});
