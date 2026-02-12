import { create } from "zustand";
import type { SearchFilters, SortOption } from "@/types";

interface SearchState {
  filters: SearchFilters;
  isFilterPanelOpen: boolean;
  viewMode: "grid" | "list";
  setFilters: (filters: Partial<SearchFilters>) => void;
  clearFilters: () => void;
  setSort: (sort: SortOption) => void;
  setPage: (page: number) => void;
  setQuery: (query: string) => void;
  toggleFilterPanel: () => void;
  setViewMode: (mode: "grid" | "list") => void;
}

const defaultFilters: SearchFilters = {
  sort: "date_newest",
  page: 1,
  limit: 24,
};

export const useSearchStore = create<SearchState>((set) => ({
  filters: { ...defaultFilters },
  isFilterPanelOpen: true,
  viewMode: "grid",

  setFilters: (newFilters) =>
    set((state) => ({
      filters: { ...state.filters, ...newFilters, page: 1 },
    })),

  clearFilters: () =>
    set({
      filters: { ...defaultFilters },
    }),

  setSort: (sort) =>
    set((state) => ({
      filters: { ...state.filters, sort, page: 1 },
    })),

  setPage: (page) =>
    set((state) => ({
      filters: { ...state.filters, page },
    })),

  setQuery: (query) =>
    set((state) => ({
      filters: { ...state.filters, query, page: 1 },
    })),

  toggleFilterPanel: () =>
    set((state) => ({
      isFilterPanelOpen: !state.isFilterPanelOpen,
    })),

  setViewMode: (viewMode) => set({ viewMode }),
}));
