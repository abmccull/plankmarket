import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ListingFormInput } from "@/lib/validators/listing";

interface ListingFormState {
  currentStep: number;
  formData: Partial<ListingFormInput>;
  uploadedMediaIds: string[];
  setStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  updateFormData: (data: Partial<ListingFormInput>) => void;
  addMediaId: (id: string) => void;
  removeMediaId: (id: string) => void;
  setMediaIds: (ids: string[]) => void;
  reset: () => void;
}

const TOTAL_STEPS = 6;

export const useListingFormStore = create<ListingFormState>()(
  persist(
    (set) => ({
      currentStep: 1,
      formData: {
        allowOffers: true,
        certifications: [],
      },
      uploadedMediaIds: [],

      setStep: (step) =>
        set({ currentStep: Math.min(Math.max(1, step), TOTAL_STEPS) }),

      nextStep: () =>
        set((state) => ({
          currentStep: Math.min(state.currentStep + 1, TOTAL_STEPS),
        })),

      prevStep: () =>
        set((state) => ({
          currentStep: Math.max(state.currentStep - 1, 1),
        })),

      updateFormData: (data) =>
        set((state) => ({
          formData: { ...state.formData, ...data },
        })),

      addMediaId: (id) =>
        set((state) => ({
          uploadedMediaIds: [...state.uploadedMediaIds, id],
        })),

      removeMediaId: (id) =>
        set((state) => ({
          uploadedMediaIds: state.uploadedMediaIds.filter((mid) => mid !== id),
        })),

      setMediaIds: (ids) => set({ uploadedMediaIds: ids }),

      reset: () =>
        set({
          currentStep: 1,
          formData: {
            allowOffers: true,
            certifications: [],
          },
          uploadedMediaIds: [],
        }),
    }),
    {
      name: "plankmarket-listing-form",
      partialize: (state) => ({
        currentStep: state.currentStep,
        formData: state.formData,
        uploadedMediaIds: state.uploadedMediaIds,
      }),
    }
  )
);
