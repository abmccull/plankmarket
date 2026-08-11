import { isTrustedUploadThingFileUrl } from "@/server/security/uploadthing";

const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const HEIF_BRANDS = new Set([
  "avif",
  "avis",
  "heic",
  "heif",
  "heis",
  "heix",
  "hevc",
  "hevx",
  "mif1",
  "msf1",
]);
const ALLOWED_EVIDENCE_MIME_TYPES = [
  "application/pdf",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type EvidenceMimeType = (typeof ALLOWED_EVIDENCE_MIME_TYPES)[number];
const SIGNATURE_BYTE_LIMIT = 64;

function hasPrefix(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function detectHeifMimeType(bytes: Uint8Array): EvidenceMimeType | null {
  if (bytes.length < 12) return null;
  const boxType = new TextDecoder("ascii").decode(bytes.slice(4, 8));
  if (boxType !== "ftyp") return null;

  const brand = new TextDecoder("ascii").decode(bytes.slice(8, 12)).toLowerCase();
  if (!HEIF_BRANDS.has(brand)) {
    return null;
  }

  return brand.startsWith("hei") ? "image/heic" : "image/heif";
}

export function normalizeEvidenceMimeType(
  value: string | null | undefined,
): EvidenceMimeType | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;

  if (normalized === "image/jpg") return "image/jpeg";
  if (normalized === "application/x-pdf") return "application/pdf";

  return (ALLOWED_EVIDENCE_MIME_TYPES as readonly string[]).includes(normalized)
    ? (normalized as EvidenceMimeType)
    : null;
}

export function isAllowedEvidenceMimeType(
  value: string | null | undefined,
): value is EvidenceMimeType {
  return normalizeEvidenceMimeType(value) !== null;
}

export function detectEvidenceMimeType(bytes: Uint8Array): EvidenceMimeType | null {
  if (bytes.length === 0) return null;
  if (hasPrefix(bytes, PDF_SIGNATURE)) return "application/pdf";
  if (hasPrefix(bytes, PNG_SIGNATURE)) return "image/png";
  if (hasPrefix(bytes, JPEG_SIGNATURE)) return "image/jpeg";

  if (
    bytes.length >= 12 &&
    new TextDecoder("ascii").decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder("ascii").decode(bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }

  return detectHeifMimeType(bytes);
}

export async function inspectEvidenceUpload(params: {
  fileKey: string;
  fileUrl: string;
  claimedMimeType?: string | null;
}): Promise<{ mimeType: EvidenceMimeType }> {
  if (!isTrustedUploadThingFileUrl(params.fileUrl, params.fileKey)) {
    throw new Error("Evidence file location is not trusted");
  }

  let response: Response;
  try {
    response = await fetch(params.fileUrl, {
      headers: { Range: "bytes=0-63" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new Error("Evidence upload could not be inspected");
  }
  if (!response.ok) {
    throw new Error("Evidence upload could not be inspected");
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Evidence upload could not be inspected");
  }

  const chunks: Uint8Array[] = [];
  let totalLength = 0;
  while (totalLength < SIGNATURE_BYTE_LIMIT) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    const remaining = SIGNATURE_BYTE_LIMIT - totalLength;
    const slice = value.byteLength > remaining ? value.slice(0, remaining) : value;
    chunks.push(slice);
    totalLength += slice.byteLength;
    if (totalLength >= SIGNATURE_BYTE_LIMIT) break;
  }
  await reader.cancel().catch(() => undefined);

  const bytes = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    const remaining = bytes.length - offset;
    if (remaining <= 0) break;
    const slice = chunk.byteLength > remaining ? chunk.slice(0, remaining) : chunk;
    bytes.set(slice, offset);
    offset += slice.byteLength;
  }
  const detectedMimeType = detectEvidenceMimeType(bytes);
  if (!detectedMimeType) {
    throw new Error("Evidence must be a PDF or supported raster image");
  }

  const claimedMimeType = normalizeEvidenceMimeType(params.claimedMimeType);
  if (params.claimedMimeType && !claimedMimeType) {
    throw new Error("Evidence type is not allowed");
  }
  if (claimedMimeType && claimedMimeType !== detectedMimeType) {
    throw new Error("Evidence content does not match its declared type");
  }

  return { mimeType: detectedMimeType };
}

export function shouldForceAttachmentForEvidence(
  mimeType: EvidenceMimeType,
): boolean {
  return mimeType === "application/pdf";
}

export function sanitizeDownloadFileName(
  fileName: string | null | undefined,
  mimeType: EvidenceMimeType,
): string {
  const fallbackExtension =
    mimeType === "application/pdf"
      ? "pdf"
      : mimeType === "image/png"
        ? "png"
        : mimeType === "image/webp"
          ? "webp"
          : mimeType === "image/jpeg"
            ? "jpg"
            : "heic";
  const baseName =
    fileName?.trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") ||
    `evidence.${fallbackExtension}`;

  return /\.[A-Za-z0-9]+$/.test(baseName)
    ? baseName
    : `${baseName}.${fallbackExtension}`;
}
