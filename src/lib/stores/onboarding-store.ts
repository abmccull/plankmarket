import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UserRole } from "@/types";

export type SellerOnboardingStep =
  | "profile_complete"
  | "verification_submitted"
  | "stripe_connected"
  | "first_listing";

export type BuyerOnboardingStep =
  | "profile_complete"
  | "first_browse"
  | "first_save_search";

export type OnboardingStep = SellerOnboardingStep | BuyerOnboardingStep;

interface OnboardingState {
  completedSteps: OnboardingStep[];
  isDismissed: boolean;
  markComplete: (step: OnboardingStep) => void;
  isComplete: (step: OnboardingStep) => boolean;
  getProgress: (role: UserRole) => number;
  dismiss: () => void;
  reset: () => void;
}

const SELLER_STEPS: SellerOnboardingStep[] = [
  "profile_complete",
  "verification_submitted",
  "stripe_connected",
  "first_listing",
];

const BUYER_STEPS: BuyerOnboardingStep[] = [
  "profile_complete",
  "first_browse",
  "first_save_search",
];

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set, get) => ({
      completedSteps: [],
      isDismissed: false,

      markComplete: (step) => {
        set((state) => {
          if (state.completedSteps.includes(step)) {
            return state;
          }
          return {
            completedSteps: [...state.completedSteps, step],
          };
        });
      },

      isComplete: (step) => {
        return get().completedSteps.includes(step);
      },

      getProgress: (role) => {
        const completedSteps = get().completedSteps;
        const relevantSteps =
          role === "seller" ? SELLER_STEPS : role === "buyer" ? BUYER_STEPS : [];

        if (relevantSteps.length === 0) {
          return 100;
        }

        const completed = relevantSteps.filter((step) =>
          completedSteps.includes(step)
        ).length;

        return Math.round((completed / relevantSteps.length) * 100);
      },

      dismiss: () => {
        set({ isDismissed: true });
      },

      reset: () => {
        set({ completedSteps: [], isDismissed: false });
      },
    }),
    {
      name: "plankmarket-onboarding",
    }
  )
);
