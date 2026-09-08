export const VERIFICATION_BUCKET = "verification-documents";
export const MAX_VERIFICATION_BYTES = 10 * 1024 * 1024;
export const VERIFICATION_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
export function verificationDocumentId(reference: string | null | undefined): string | null {
  const match = /^verification-document:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(reference ?? "");
  return match?.[1] ?? null;
}
export function verificationDocumentReference(id: string): string { return `verification-document:${id}`; }
export function verificationDocumentHref(reference: string): string {
  const id = verificationDocumentId(reference);
  return id ? `/api/verification-documents/${id}` : reference;
}
