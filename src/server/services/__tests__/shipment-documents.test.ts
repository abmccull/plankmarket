import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDocuments: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: {
    PRIORITY1_DRY_RUN: "true",
    PRIORITY1_API_KEY: "dry-run-key",
    PRIORITY1_DOCUMENT_ALLOWED_HOSTS: "priority1.example",
    NODE_ENV: "test",
  },
}));

vi.mock("../priority1", () => ({
  Priority1ApiError: class Priority1ApiError extends Error {},
  priority1: {
    getDocuments: mocks.getDocuments,
  },
}));

import {
  fetchPriority1DocumentUrl,
  resolveDispatchBolUrl,
  resolveDispatchLabelUrl,
  shipmentDocumentIdentifierFrom,
  shipmentDocumentIdentifiersFrom,
} from "../shipment-documents";

// fetch helpers are covered via tracking/dispatch integration paths.

describe("shipment-documents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves label URL preferring primary then extended then plural", () => {
    expect(
      resolveDispatchLabelUrl({
        capacityProviderPalletLabelUrl: null,
        capacityProviderPalletLabelExtendedUrl:
          "https://priority1.example/labels/ext.pdf",
        capacityProviderPalletLabelsUrl: null,
      }),
    ).toBe("https://priority1.example/labels/ext.pdf");

    expect(
      resolveDispatchLabelUrl({
        capacityProviderPalletLabelUrl:
          "https://priority1.example/labels/main.pdf",
        capacityProviderPalletLabelExtendedUrl:
          "https://priority1.example/labels/ext.pdf",
        capacityProviderPalletLabelsUrl:
          "https://priority1.example/labels/plural.pdf",
      }),
    ).toBe("https://priority1.example/labels/main.pdf");
  });

  it("resolves BOL URL", () => {
    expect(
      resolveDispatchBolUrl({
        capacityProviderBolUrl: "https://priority1.example/bol.pdf",
      }),
    ).toBe("https://priority1.example/bol.pdf");
    expect(resolveDispatchBolUrl({ capacityProviderBolUrl: null })).toBeNull();
  });

  it("builds document identifiers preferring PRO then explicit BOL", () => {
    expect(
      shipmentDocumentIdentifierFrom({
        proNumber: "PRO-1",
        bolNumber: "BOL-1",
        trackingNumber: "TRACK-1",
      }),
    ).toEqual({ proNumber: "PRO-1" });
    expect(
      shipmentDocumentIdentifierFrom({
        proNumber: null,
        bolNumber: "BOL-1",
        trackingNumber: "TRACK-1",
      }),
    ).toEqual({ bolNumber: "BOL-1" });
    // The singular compatibility helper still returns the preferred PRO form.
    expect(
      shipmentDocumentIdentifierFrom({
        proNumber: null,
        bolNumber: null,
        trackingNumber: "PRO-OR-BOL",
      }),
    ).toEqual({ proNumber: "PRO-OR-BOL" });
    expect(
      shipmentDocumentIdentifierFrom({
        proNumber: null,
        trackingNumber: null,
      }),
    ).toBeNull();
  });

  it("keeps both safe lookup forms for an ambiguous legacy tracking value", () => {
    expect(
      shipmentDocumentIdentifiersFrom({
        proNumber: null,
        bolNumber: null,
        trackingNumber: "PRO-OR-BOL",
      }),
    ).toEqual([{ proNumber: "PRO-OR-BOL" }, { bolNumber: "PRO-OR-BOL" }]);
  });

  it("falls back from a legacy PRO lookup to the BOL form", async () => {
    mocks.getDocuments
      .mockRejectedValueOnce(new Error("PRO lookup returned no shipment"))
      .mockResolvedValueOnce({
        imageUrl: "https://priority1.example/bol/legacy.pdf",
      });

    const result = await fetchPriority1DocumentUrl(
      "BillOfLading",
      shipmentDocumentIdentifiersFrom({
        trackingNumber: "LEGACY-IDENTIFIER",
      }),
    );

    expect(result).toEqual({
      url: "https://priority1.example/bol/legacy.pdf",
      error: null,
      permanent: false,
    });
    expect(mocks.getDocuments).toHaveBeenNthCalledWith(1, {
      shipmentImageTypeId: "BillOfLading",
      imageFormatTypeId: "PDF",
      proNumber: "LEGACY-IDENTIFIER",
    });
    expect(mocks.getDocuments).toHaveBeenNthCalledWith(2, {
      shipmentImageTypeId: "BillOfLading",
      imageFormatTypeId: "PDF",
      bolNumber: "LEGACY-IDENTIFIER",
    });
  });
});
