import { beforeEach, describe, expect, it } from "vitest";
import { useListingFormStore } from "../listing-form-store";
describe("seller-specific listing drafts", () => {
  beforeEach(() => { localStorage.clear(); useListingFormStore.getState().bindSeller(null); });
  it("restores edits without requiring a step change and isolates sellers", () => {
    useListingFormStore.getState().bindSeller("seller-a");
    useListingFormStore.getState().updateFormData({ title: "Unsaved step title" });
    useListingFormStore.getState().setMediaIds(["photo-a"]);
    useListingFormStore.getState().bindSeller("seller-b");
    expect(useListingFormStore.getState().formData.title).toBeUndefined();
    expect(useListingFormStore.getState().uploadedMediaIds).toEqual([]);
    useListingFormStore.getState().bindSeller("seller-a");
    expect(useListingFormStore.getState().formData.title).toBe("Unsaved step title");
    expect(useListingFormStore.getState().uploadedMediaIds).toEqual(["photo-a"]);
  });
  it("does not import a previous unscoped browser draft into another account", () => {
    localStorage.setItem("plankmarket-listing-form", JSON.stringify({ state: { formData: { title: "Private draft" } } }));
    useListingFormStore.getState().bindSeller("seller-new");
    expect(useListingFormStore.getState().formData.title).toBeUndefined();
  });
});
