import { create } from "zustand";

export interface BulkListingItem {
  id: string;
  title: string;
  modelNumber?: string | null;
  materialType: string;
  totalSqFt: number;
  askPricePerSqFt: number;
  hasPhotos: boolean;
  mediaCount: number;
}

interface BulkUploadState {
  sellerId: string | null;
  batchId: string | null;
  listings: BulkListingItem[];
  currentPhotoIndex: number;
  storageWarning: string | null;
  bindSeller: (sellerId: string) => void;
  setBatch: (
    sellerId: string,
    batchId: string,
    listings: BulkListingItem[],
  ) => void;
  markListingHasPhotos: (
    sellerId: string,
    listingId: string,
    mediaCount: number,
  ) => void;
  setCurrentPhotoIndex: (index: number) => void;
  reset: () => void;
}

const blank = () => ({
  batchId: null,
  listings: [] as BulkListingItem[],
  currentPhotoIndex: 0,
});
const key = (sellerId: string) => "plankmarket-bulk-upload:" + sellerId;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function readBatch(sellerId: string) {
  if (typeof window === "undefined") return blank();
  const raw = sessionStorage.getItem(key(sellerId));
  if (!raw) return blank();
  if (raw.length > 150_000) throw new Error("Unsupported batch size");
  const saved: unknown = JSON.parse(raw);
  if (
    !isRecord(saved) ||
    saved.sellerId !== sellerId ||
    typeof saved.batchId !== "string" ||
    !uuid.test(saved.batchId) ||
    !Array.isArray(saved.listings) ||
    !saved.listings.length ||
    saved.listings.length > 100
  )
    throw new Error("Unsupported batch");
  const listings: BulkListingItem[] = saved.listings.map((item: unknown) => {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      !uuid.test(item.id) ||
      typeof item.title !== "string" ||
      (item.modelNumber !== undefined && item.modelNumber !== null &&
        (typeof item.modelNumber !== "string" || item.modelNumber.length > 255)) ||
      typeof item.materialType !== "string" ||
      typeof item.totalSqFt !== "number" ||
      !Number.isFinite(item.totalSqFt) ||
      typeof item.askPricePerSqFt !== "number" ||
      !Number.isFinite(item.askPricePerSqFt) ||
      typeof item.hasPhotos !== "boolean" ||
      typeof item.mediaCount !== "number" ||
      !Number.isInteger(item.mediaCount) ||
      item.mediaCount < 0 ||
      item.mediaCount > 20
    )
      throw new Error("Unsupported listing metadata");
    return {
      id: item.id,
      title: item.title,
      modelNumber: typeof item.modelNumber === "string" ? item.modelNumber : null,
      materialType: item.materialType,
      totalSqFt: item.totalSqFt,
      askPricePerSqFt: item.askPricePerSqFt,
      hasPhotos: item.hasPhotos,
      mediaCount: item.mediaCount,
    };
  });
  const index =
    typeof saved.currentPhotoIndex === "number" &&
    Number.isFinite(saved.currentPhotoIndex)
      ? Math.trunc(saved.currentPhotoIndex)
      : 0;
  return {
    batchId: saved.batchId,
    listings,
    currentPhotoIndex: Math.min(listings.length - 1, Math.max(0, index)),
  };
}

export const useBulkUploadStore = create<BulkUploadState>((set, get) => {
  const persist = () => {
    const { sellerId, batchId, listings, currentPhotoIndex } = get();
    if (!sellerId || typeof window === "undefined") return;
    try {
      if (batchId)
        sessionStorage.setItem(
          key(sellerId),
          JSON.stringify({ sellerId, batchId, listings, currentPhotoIndex }),
        );
      else sessionStorage.removeItem(key(sellerId));
      set({ storageWarning: null });
    } catch {
      set({
        storageWarning:
          "This browser could not save photo-session progress. Your created listings remain saved. Continue from Drafts if you leave this page.",
      });
    }
  };
  return {
    sellerId: null,
    ...blank(),
    storageWarning: null,
    bindSeller: (sellerId) => {
      if (get().sellerId === sellerId) return;
      try {
        // The legacy unowned key is deliberately not assigned to a signed-in seller.
        set({ sellerId, ...readBatch(sellerId), storageWarning: null });
      } catch {
        set({
          sellerId,
          ...blank(),
          storageWarning:
            "This browser could not restore photo-session progress. Your saved listings are still available in Drafts.",
        });
      }
    },
    setBatch: (sellerId, batchId, listings) => {
      if (get().sellerId !== sellerId) return;
      set({ batchId, listings, currentPhotoIndex: 0 });
      persist();
    },
    markListingHasPhotos: (sellerId, listingId, mediaCount) => {
      if (get().sellerId !== sellerId) return;
      set((state) => ({
        listings: state.listings.map((item) =>
          item.id === listingId
            ? { ...item, hasPhotos: mediaCount > 0, mediaCount }
            : item,
        ),
      }));
      persist();
    },
    setCurrentPhotoIndex: (index) => {
      if (!Number.isFinite(index)) return;
      set({
        currentPhotoIndex: Math.min(
          Math.max(0, get().listings.length - 1),
          Math.max(0, Math.trunc(index)),
        ),
      });
      persist();
    },
    reset: () => {
      set(blank());
      persist();
    },
  };
});
