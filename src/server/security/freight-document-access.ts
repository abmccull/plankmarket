export type FreightDocumentViewerRole = "buyer" | "seller" | "admin";

export function canViewFreightDocuments(params: {
  viewerRole: FreightDocumentViewerRole;
  orderStatus: string;
}): boolean {
  return (
    params.viewerRole === "admin" ||
    params.viewerRole === "seller" ||
    params.orderStatus === "delivered"
  );
}
