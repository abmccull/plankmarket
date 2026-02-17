import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface BulkListingItem {
  id: string;
  title: string;
  materialType: string;
  totalSqFt: number;
  askPricePerSqFt: number;
  hasPhotos: boolean;
  mediaCount: number;
}

interface BulkUploadState {
  batchId: string | null;
  listings: BulkListingItem[];
  currentPhotoIndex: number;
  setBatch: (batchId: string, listings: BulkListingItem[]) => void;
  markListingHasPhotos: (listingId: string, mediaCount: number) => void;
  setCurrentPhotoIndex: (index: number) => void;
  reset: () => void;
}

export const useBulkUploadStore = create<BulkUploadState>()(
  persist(
    (set) => ({
      batchId: null,
      listings: [],
      currentPhotoIndex: 0,

      setBatch: (batchId, listings) =>
        set({ batchId, listings, currentPhotoIndex: 0 }),

      markListingHasPhotos: (listingId, mediaCount) =>
        set((state) => ({
          listings: state.listings.map((l) =>
            l.id === listingId
              ? { ...l, hasPhotos: mediaCount > 0, mediaCount }
              : l
          ),
        })),

      setCurrentPhotoIndex: (index) => set({ currentPhotoIndex: index }),

      reset: () =>
        set({ batchId: null, listings: [], currentPhotoIndex: 0 }),
    }),
    {
      name: "plankmarket-bulk-upload",
      storage: {
        getItem: (name) => {
          const str = sessionStorage.getItem(name);
          return str ? JSON.parse(str) : null;
        },
        setItem: (name, value) => {
          sessionStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: (name) => {
          sessionStorage.removeItem(name);
        },
      },
      partialize: (state) => ({
        batchId: state.batchId,
        listings: state.listings,
        currentPhotoIndex: state.currentPhotoIndex,
      }) as unknown as BulkUploadState,
    }
  )
);
