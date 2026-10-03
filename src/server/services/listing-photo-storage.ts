import { TRPCError } from "@trpc/server";
import sharp from "sharp";
import { createServiceClient } from "@/lib/supabase/server";
import { LISTING_PHOTO_BUCKET, LISTING_PHOTO_MIME_TYPES, MAX_LISTING_PHOTO_BYTES } from "@/lib/listing-photos";
import { detectEvidenceMimeType } from "@/server/security/evidence-files";
import { db, type Database } from "@/server/db";
import { assertListingPhotoStoragePolicy } from "./listing-photo-policy";

export function validateListingPhotoBytes(bytes: Uint8Array, expectedSize: number, expectedType: string) {
  if (!bytes.length || bytes.length !== expectedSize || bytes.length > MAX_LISTING_PHOTO_BYTES) {
    throw new Error("The photo size does not match the selected file. Choose the photo again.");
  }
  if (!(LISTING_PHOTO_MIME_TYPES as readonly string[]).includes(expectedType) || detectEvidenceMimeType(bytes) !== expectedType) {
    throw new Error("Choose a photo containing JPEG, PNG or WebP image data.");
  }
}

const MAX_PHOTO_PIXELS = 32_000_000;
const MAX_PHOTO_EDGE = 8192;
const MAX_PHOTO_CHANNELS = 4;
const PHOTO_RASTER_GUIDANCE = "This photo could not be fully read as a supported still image. Export a still JPEG, PNG or WebP, resize it to no more than 8192 pixels per side and 32 MP, and keep the file under 4 MB.";

/** libvips may expose only the PNG base frame. Reject APNG control chunks
 * explicitly rather than admitting an unvalidated animation after that frame. */
function assertStillPng(bytes: Uint8Array) {
  const input = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  while (offset + 12 <= input.length) {
    const length = input.readUInt32BE(offset);
    if (length > input.length - offset - 12) throw new Error(PHOTO_RASTER_GUIDANCE);
    const kind = input.toString("ascii", offset + 4, offset + 8);
    if (kind === "acTL" || kind === "fcTL" || kind === "fdAT") throw new Error(PHOTO_RASTER_GUIDANCE);
    offset += length + 12;
    if (kind === "IEND") return;
  }
  throw new Error(PHOTO_RASTER_GUIDANCE);
}

/** Admission only, before ready persistence. Decode without changing stored
 * bytes; metadata alone cannot prove the compressed raster is complete. */
export async function validateListingPhotoRaster(bytes: Uint8Array, expectedSize: number, expectedType: string) {
  validateListingPhotoBytes(bytes, expectedSize, expectedType);
  try {
    if (expectedType === "image/png") assertStillPng(bytes);
    const decoder = sharp(bytes, {
      failOn: "warning", limitInputPixels: MAX_PHOTO_PIXELS,
      limitInputChannels: MAX_PHOTO_CHANNELS, sequentialRead: true,
    });
    const metadata = await decoder.metadata();
    const format = expectedType === "image/jpeg" ? "jpeg" : expectedType === "image/png" ? "png" : "webp";
    const width = metadata.width, height = metadata.height;
    if (metadata.format !== format || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width < 1 || height < 1 || width > MAX_PHOTO_EDGE || height > MAX_PHOTO_EDGE || width * height > MAX_PHOTO_PIXELS ||
      (metadata.pages !== undefined && metadata.pages !== 1) || metadata.channels < 1 || metadata.channels > MAX_PHOTO_CHANNELS) {
      throw new Error(PHOTO_RASTER_GUIDANCE);
    }
    // Sharp's native evaluation timer excludes libuv queue waiting. It is not
    // a hard wall-clock deadline or a substitute for the pixel/channel caps.
    const decoded = await decoder.timeout({ seconds: 3 }).raw().toBuffer({ resolveWithObject: true });
    if (decoded.info.width !== width || decoded.info.height !== height || decoded.info.channels < 1 ||
      decoded.info.channels > MAX_PHOTO_CHANNELS || decoded.data.byteLength !== width * height * decoded.info.channels) {
      throw new Error(PHOTO_RASTER_GUIDANCE);
    }
  } catch {
    throw new Error(PHOTO_RASTER_GUIDANCE);
  }
}

/** Every operation and body read shares one deadline. A timeout is never a deletion receipt. */
export async function privateListingPhotoStorage(options: { deadlineAt?: number; database?: Pick<Database, "execute"> } = {}) {
  if (options.deadlineAt !== undefined && !Number.isFinite(options.deadlineAt)) throw new Error("Invalid private photo storage deadline");
  const startedAt = Date.now();
  const timeoutMs = Math.max(0, Math.min(8_000, (options.deadlineAt ?? startedAt + 8_000) - startedAt));
  const expiresAt = startedAt + timeoutMs;
  const timeoutError = new TRPCError({ code: "TIMEOUT", message: "Photo storage did not respond in time. Retry this upload." });
  let expired = false;
  const deadline = new Promise<never>((_resolve, reject) => {
    const timer = setTimeout(() => { expired = true; reject(timeoutError); }, timeoutMs);
    timer.unref?.();
  });
  void deadline.catch(() => {});
  const assertDeadline = () => { if (expired || Date.now() >= expiresAt) throw timeoutError; };
  async function run<T>(operation: () => PromiseLike<T>): Promise<T> {
    assertDeadline();
    const result = await Promise.race([Promise.resolve().then(() => { assertDeadline(); return operation(); }), deadline]);
    assertDeadline();
    return result;
  }
  await run(() => assertListingPhotoStoragePolicy(options.database ?? db));
  const client = await run(() => createServiceClient({ requestTimeoutMs: Math.max(1, expiresAt - Date.now()) }));
  const bucket = await run(() => client.storage.getBucket(LISTING_PHOTO_BUCKET));
  const allowed = bucket.data?.allowed_mime_types;
  if (bucket.error || !bucket.data || bucket.data.public || Number(bucket.data.file_size_limit) !== MAX_LISTING_PHOTO_BYTES || !allowed ||
    [...allowed].sort().join(",") !== [...LISTING_PHOTO_MIME_TYPES].sort().join(",")) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Private listing photo storage is not configured. Your draft is saved; contact support." });
  }
  const storage = client.storage.from(LISTING_PHOTO_BUCKET);
  return {
    createSignedUploadUrl: (...args: Parameters<typeof storage.createSignedUploadUrl>) => run(() => storage.createSignedUploadUrl(...args)),
    copy: (...args: Parameters<typeof storage.copy>) => run(() => storage.copy(...args)),
    async download(...args: Parameters<typeof storage.download>) {
      const result = await run(() => storage.download(...args));
      if (result.error || !result.data) return result;
      if (result.data.size > MAX_LISTING_PHOTO_BYTES) throw new TRPCError({ code: "BAD_REQUEST", message: "The photo exceeds the 4 MB size limit." });
      const bytes = await run(() => result.data!.arrayBuffer());
      if (bytes.byteLength > MAX_LISTING_PHOTO_BYTES) throw new TRPCError({ code: "BAD_REQUEST", message: "The photo exceeds the 4 MB size limit." });
      return { ...result, data: new Blob([bytes], { type: result.data.type }) };
    },
    async remove(...args: Parameters<typeof storage.remove>) {
      try { return await run(() => storage.remove(...args)); }
      catch (error) { if (error !== timeoutError) throw error; return { data: null, error: timeoutError }; }
    },
  };
}
