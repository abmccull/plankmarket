import { MAX_LISTING_PHOTO_BYTES } from "@/lib/listing-photos";

const guidance = "This photo could not be read. Export a still JPEG, PNG or WebP and choose it again.";
const sizeGuidance = "This photo is too large to prepare. Export it at 60 MP or less, with no side over 12,000 pixels.";
function checkDimensions(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new Error(guidance);
  if (Math.max(width, height) > 12000 || width * height > 60_000_000) throw new Error(sizeGuidance);
}

/** Inspect declared dimensions before the codec allocates a full raster. This
 * is an admission bound, not a hard ceiling on the decoder's internal memory. */
function inspectDimensions(bytes: Uint8Array, kind: "jpeg" | "png" | "webp" | "heic") {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  let found = false;
  const accept = (width: number, height: number) => { checkDimensions(width, height); found = true; };
  if (kind === "png") {
    if (bytes.length < 33 || text(12) !== "IHDR" || view.getUint32(8) !== 13) throw new Error(guidance);
    accept(view.getUint32(16), view.getUint32(20));
  } else if (kind === "jpeg") {
    let offset = 2;
    while (offset < bytes.length) {
      if (bytes[offset++] !== 0xff) throw new Error(guidance);
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) throw new Error(guidance);
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) throw new Error(guidance);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        if (length < 8) throw new Error(guidance);
        accept(view.getUint16(offset + 5), view.getUint16(offset + 3));
      }
      offset += length;
    }
  } else if (kind === "webp") {
    for (let offset = 12; offset + 8 <= bytes.length;) {
      const type = text(offset), length = view.getUint32(offset + 4, true), start = offset + 8;
      if (start + length > bytes.length) throw new Error(guidance);
      if (type === "VP8X" && length >= 10) {
        const uint24 = (at: number) => bytes[at] + bytes[at + 1] * 256 + bytes[at + 2] * 65536 + 1;
        accept(uint24(start + 4), uint24(start + 7));
      } else if (type === "VP8 " && length >= 10 && bytes[start + 3] === 0x9d && bytes[start + 4] === 1 && bytes[start + 5] === 0x2a) {
        accept(view.getUint16(start + 6, true) & 0x3fff, view.getUint16(start + 8, true) & 0x3fff);
      } else if (type === "VP8L" && length >= 5 && bytes[start] === 0x2f) {
        const bits = view.getUint32(start + 1, true);
        accept((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
      }
      offset = start + length + length % 2;
    }
  } else {
    let boxes = 0;
    const scan = (start: number, end: number, depth: number) => {
      if (depth > 8) throw new Error(guidance);
      for (let offset = start; offset < end;) {
        if (++boxes > 20_000 || offset + 8 > end) throw new Error(guidance);
        let length = view.getUint32(offset), header = 8;
        const type = text(offset + 4);
        if (length === 1) {
          if (offset + 16 > end) throw new Error(guidance);
          length = view.getUint32(offset + 8) * 4294967296 + view.getUint32(offset + 12); header = 16;
        } else if (length === 0) length = end - offset;
        if (!Number.isSafeInteger(length) || length < header || offset + length > end) throw new Error(guidance);
        if (type === "ispe") {
          if (length < header + 12) throw new Error(guidance);
          accept(view.getUint32(offset + header + 4), view.getUint32(offset + header + 8));
        } else if (["meta", "iprp", "ipco"].includes(type)) {
          scan(offset + header + (type === "meta" ? 4 : 0), offset + length, depth + 1);
        }
        offset += length;
      }
    };
    scan(0, bytes.length, 0);
  }
  if (!found) throw new Error(guidance);
}
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<{ file: File }>) => void) | null;
  postMessage: (value: { file: Blob } | { error: string }) => void;
};

/** This is preparation, not admission. The server independently validates the
 * resulting raster before recording media. No original bytes leave the device. */
async function decode(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes[0] === 137 && ascii(1, 4) === "PNG";
  const webp = ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
  const heic = ascii(4, 8) === "ftyp" && ["heic", "heix", "mif1"].includes(ascii(8, 12));
  if (!jpeg && !png && !webp && !heic) throw new Error(guidance);
  inspectDimensions(bytes, jpeg ? "jpeg" : png ? "png" : webp ? "webp" : "heic");
  // Do not silently turn APNG/WebP animation into an arbitrary frame.
  const view = new DataView(bytes.buffer);
  if (png || webp) {
    for (let offset = png ? 8 : 12; offset + 8 <= bytes.length;) {
      const size = view.getUint32(offset + (png ? 0 : 4), !png);
      const kind = ascii(offset + (png ? 4 : 0), offset + (png ? 8 : 4));
      if (kind === "acTL" || kind === "ANIM" || kind === "ANMF") throw new Error("Choose a still photo instead of an animation.");
      const next = offset + size + (png ? 12 : 8 + (size % 2));
      if (next > bytes.length || next <= offset) throw new Error(guidance);
      offset = next;
    }
  }
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    if (!heic) throw new Error(guidance);
    // This build uses a CSP-compatible JS decoder; no eval/wasm policy changes.
    // It is downloaded only when a HEIC cannot be decoded natively.
    const { heicTo } = await import("heic-to/csp");
    try { return await heicTo({ blob: file, type: "bitmap" }); }
    catch { throw new Error("This HEIC photo could not be converted. Export it as JPEG and choose it again."); }
  }
}

scope.onmessage = async ({ data }) => {
  let bitmap: ImageBitmap | undefined;
  let canvas: OffscreenCanvas | undefined;
  try {
    if (!(data.file instanceof Blob) || !data.file.size || data.file.size > 25 * 1024 * 1024) throw new Error("Choose a photo up to 25 MB.");
    bitmap = await decode(data.file);
    checkDimensions(bitmap.width, bitmap.height);
    for (const edge of [3200, 2560, 2048]) {
      const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
      canvas = new OffscreenCanvas(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)));
      const context = canvas.getContext("2d");
      if (!context) throw new Error(guidance);
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.92, 0.84, 0.76]) {
        const result = await canvas.convertToBlob({ type: "image/jpeg", quality });
        if (result.type !== "image/jpeg" || !result.size) throw new Error(guidance);
        if (result.size <= MAX_LISTING_PHOTO_BYTES) { scope.postMessage({ file: result }); return; }
      }
      canvas.width = canvas.height = 1;
    }
    throw new Error("This photo is still too large. Export a smaller JPEG and choose it again.");
  } catch (error) {
    scope.postMessage({ error: error instanceof Error ? error.message : guidance });
  } finally {
    bitmap?.close();
    if (canvas) canvas.width = canvas.height = 1;
  }
};
