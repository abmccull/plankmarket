// Candidate: src/server/services/__tests__/listing-photo-raster.test.ts
// Failure expectations frozen before the raster helper candidate; no provider/DB calls.
// @vitest-environment node
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => { throw new Error("Provider forbidden in raster proof"); } }));
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/services/listing-photo-policy", () => ({ assertListingPhotoStoragePolicy: () => { throw new Error("Database forbidden in raster proof"); } }));
const storage = await import("@/server/services/listing-photo-storage");
type Validator = (bytes: Uint8Array, expectedSize: number, expectedType: string) => void | Promise<void>;
const strict = (storage as unknown as { validateListingPhotoRaster?: Validator }).validateListingPhotoRaster;
const subject: Validator = strict ?? storage.validateListingPhotoBytes;
const sources = ["src/server/services/listing-photo-storage.ts", "src/server/services/listing-photos.ts", "src/lib/listing-photos.ts", "src/server/services/__tests__/listing-photo-raster.test.ts", "node_modules/sharp/package.json"];
const binding = () => sources.map(file => ({ path: file, sha256: createHash("sha256").update(fs.readFileSync(file)).digest("hex") }));
const proof: { mode: string; cases: Array<{ label: string; passed: boolean }>; before?: unknown; after?: unknown } = { mode: strict ? "strict-raster-candidate" : "existing-signature-only-baseline", cases: [] };
const directory = path.resolve("tmp/journey10/private-listing-photos/image-quality/proof", randomUUID());
beforeAll(() => { fs.mkdirSync(directory, { recursive: true }); proof.before = binding(); });
afterAll(() => { proof.after = binding(); fs.writeFileSync(path.join(directory, "results.json"), JSON.stringify(proof, null, 2)); expect(proof.after).toEqual(proof.before); });
async function record(label: string, body: () => Promise<void>) { const item = { label, passed: false }; proof.cases.push(item); await body(); item.passed = true; }
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, bytes: Uint8Array) {
  const name = Buffer.from(type), body = Buffer.from(bytes), header = Buffer.alloc(4), check = Buffer.alloc(4);
  header.writeUInt32BE(body.length); check.writeUInt32BE(crc32(Buffer.concat([name, body])));
  return Buffer.concat([header, name, body, check]);
}
// Independent valid grayscale PNG fixture encoder. Large dimensions are real
// compressed rasters, not lying headers that any ordinary decoder would reject.
function png(width: number, height: number, extra: Buffer[] = []) {
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8;
  const rows = Buffer.alloc((width + 1) * height); // filter0 followed by black grayscale pixels
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", header), ...extra, chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}
const smallPng = png(3, 2);
let jpeg: Buffer, webp: Buffer, animatedWebp: Buffer;
beforeAll(async () => {
  jpeg = await sharp({ create: { width: 3, height: 2, channels: 3, background: "#a08050" } }).jpeg().toBuffer();
  webp = await sharp({ create: { width: 3, height: 2, channels: 3, background: "#a08050" } }).webp({ lossless: true }).toBuffer();
  const frames = Buffer.from([255,0,0,255,0,0,0,0,255,0,0,255]);
  animatedWebp = await sharp(frames, { raw: { width: 2, height: 2, channels: 3, pageHeight: 1 } }).webp({ lossless: true, loop: 0, delay: [100, 100] }).toBuffer();
  assert.equal((await sharp(animatedWebp).metadata()).pages, 2, "Animated fixture must actually contain two frames");
});
const accepted = async (bytes: Uint8Array, mime: string) => { const before = Buffer.from(bytes); await subject(bytes, bytes.byteLength, mime); expect(Buffer.from(bytes)).toEqual(before); };
const rejected = async (bytes: Uint8Array, mime: string, expectedSize = bytes.byteLength) => {
  const before = Buffer.from(bytes);
  await expect(Promise.resolve().then(() => subject(bytes, expectedSize, mime))).rejects.toThrow();
  expect(Buffer.from(bytes)).toEqual(before);
};
describe("private listing photo bounded raster admission", () => {
  it("exports a strict async-ready validator without removing the cheap read check", () => record("new-validator-contract", async () => {
    expect(typeof strict).toBe("function"); expect(typeof storage.validateListingPhotoBytes).toBe("function");
  }));
  for (const format of ["png", "jpeg", "webp"] as const) it(`accepts complete ${format} raster without changing original bytes`, () => record(`complete-${format}`, async () => {
    await accepted(format === "png" ? smallPng : format === "jpeg" ? jpeg : webp, `image/${format}`);
  }));
  it("accepts ordinary24MP within axis and compressed-byte limits", () => record("valid-24mp", async () => {
    const bytes = png(6000, 4000); expect(bytes.byteLength).toBeLessThan(4 * 1024 * 1024); await accepted(bytes, "image/png");
  }), 15000);
  for (const [label, mime, bytes] of [
    ["png-signature", "image/png", new Uint8Array([137,80,78,71,13,10,26,10])],
    ["jpeg-signature", "image/jpeg", new Uint8Array([255,216,255])],
    ["webp-signature", "image/webp", Buffer.from("524946460400000057454250", "hex")],
  ] as const) it(`rejects ${label} with no raster`, () => record(label, async () => rejected(bytes, mime)));
  it("rejects PNG with a truncated IDAT body", () => record("png-truncated-idat", async () => rejected(smallPng.subarray(0, 45), "image/png")));
  it("rejects truncated JPEG scan data", () => record("jpeg-truncated-scan", async () => rejected(jpeg.subarray(0, Math.floor(jpeg.length * 0.6)), "image/jpeg")));
  it("rejects truncated WebP payload", () => record("webp-truncated-payload", async () => rejected(webp.subarray(0, Math.max(12, Math.floor(webp.length / 2))), "image/webp")));
  it("rejects corrupt PNG pixel-data checksum", () => record("png-invalid-idat-crc", async () => {
    const broken = Buffer.from(smallPng), idat = broken.indexOf(Buffer.from("IDAT")); assert(idat > 0);
    const crcOffset = idat + 4 + broken.readUInt32BE(idat - 4); broken[crcOffset] ^= 0xff; await rejected(broken, "image/png");
  }));
  it("retains exact declared size enforcement", () => record("declared-size", async () => rejected(smallPng, "image/png", smallPng.length + 1)));
  it("retains MIME enforcement", () => record("mime-mismatch", async () => rejected(smallPng, "image/jpeg")));
  it("rejects SVG despite its being a decodable image format", () => record("svg-not-permitted", async () => rejected(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'), "image/svg+xml")));
  for (const [label, width, height] of [["width-limit", 8193, 1], ["height-limit", 1, 8193], ["pixel-limit", 6200, 5200]] as const) {
    it(`rejects actual decodable PNG above ${label}`, () => record(label, async () => {
      const bytes = png(width, height); expect(bytes.byteLength).toBeLessThan(4 * 1024 * 1024);
      await expect(Promise.resolve().then(() => subject(bytes, bytes.length, "image/png"))).rejects.toThrow(/8192|32\s?MP|32[,.]?000[,.]?000|resize/i);
    }), 15000);
  }
  it("rejects animated WebP", () => record("animated-webp", async () => rejected(animatedWebp, "image/webp")));
  it("rejects PNG advertising an APNG animation", () => record("apng", async () => {
    const animation = Buffer.alloc(8); animation.writeUInt32BE(2); await rejected(png(3, 2, [chunk("acTL", animation)]), "image/png");
  }));
});
