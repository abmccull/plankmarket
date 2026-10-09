// Written before implementation: worker-boundary acceptance only, no real image
// decoding, browser worker, upload, provider request or metadata-removal proof.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LISTING_PHOTO_ACCEPT, MAX_SOURCE_PHOTO_BYTES, prepareListingPhoto } from "../prepare-listing-photo";

const MiB = 1024 * 1024;
const OUTPUT_CAP = 4 * MiB;
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
const source = (name = "oak-board.HEIC", type = "image/heic", size = 16) => new File([new Uint8Array(size)], name, { type, lastModified: 1_700_000_000_000 });
const jpeg = (size = JPEG_BYTES.length) => new Blob([size === JPEG_BYTES.length ? JPEG_BYTES : new Uint8Array(size)], { type: "image/jpeg" });

class MockWorker extends EventTarget {
  static instances: MockWorker[] = [];
  static constructorFailure: Error | null = null;
  static postFailure: Error | null = null;
  readonly url: string | URL;
  readonly options: WorkerOptions | undefined;
  onmessage: ((event: MessageEvent) => unknown) | null = null;
  onerror: ((event: ErrorEvent) => unknown) | null = null;
  onmessageerror: ((event: MessageEvent) => unknown) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn((_value: unknown) => { if (MockWorker.postFailure) throw MockWorker.postFailure; });
  constructor(url: string | URL, options?: WorkerOptions) {
    super(); if (MockWorker.constructorFailure) throw MockWorker.constructorFailure;
    this.url = url; this.options = options; MockWorker.instances.push(this);
  }
  message(data: unknown) {
    const event = new MessageEvent("message", { data });
    this.dispatchEvent(event); this.onmessage?.(event);
  }
  error() {
    const event = new ErrorEvent("error", { message: "Synthetic worker decode failure", cancelable: true });
    this.dispatchEvent(event); this.onerror?.(event);
  }
  messageError() {
    const event = new MessageEvent("messageerror", { data: null });
    this.dispatchEvent(event); this.onmessageerror?.(event);
  }
}

let deniedFetch: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers(); MockWorker.instances = []; MockWorker.constructorFailure = null; MockWorker.postFailure = null;
  vi.stubGlobal("Worker", MockWorker);
  deniedFetch = vi.fn(() => { throw new Error("Photo preparation must not make a provider request"); });
  vi.stubGlobal("fetch", deniedFetch);
});
afterEach(() => {
  try { expect(deniedFetch).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0); }
  finally { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); }
});
async function start(file = source(), options: { signal?: AbortSignal } = {}) {
  const promise = prepareListingPhoto(file, options);
  // Observe rejection immediately so the tests' deliberate errors never create
  // an unhandled rejection while we inspect the worker boundary.
  void promise.catch(() => {});
  await Promise.resolve(); await Promise.resolve();
  expect(MockWorker.instances).toHaveLength(1);
  return { promise, worker: MockWorker.instances[0], file };
}
function expectTerminated(worker: MockWorker) {
  expect(worker.terminate).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
}

describe("listing photo preparation input contract", () => {
  it("advertises only explicit JPEG, PNG, WebP, HEIC and HEIF input types", () => {
    expect(MAX_SOURCE_PHOTO_BYTES).toBe(25 * MiB);
    expect(LISTING_PHOTO_ACCEPT).toEqual({
      "image/jpeg": [".jpg", ".jpeg"], "image/png": [".png"], "image/webp": [".webp"],
      "image/heic": [".heic"], "image/heif": [".heif"],
    });
  });
  it.each([
    ["oak.jpg", "image/jpeg"], ["oak.png", "image/png"], ["oak.webp", "image/webp"],
    ["oak.heic", "image/heic"], ["oak.heif", "image/heif"], ["camera-photo", "image/jpeg"],
  ])("accepts supported MIME %s (%s)", async (name, type) => {
    const { worker, promise } = await start(source(name, type)); worker.message({ file: jpeg() });
    expect((await promise).type).toBe("image/jpeg"); expectTerminated(worker);
  });
  it.each(["JPG", "JPEG", "PNG", "WEBP", "HEIC", "HEIF"])("allows blank MIME only through a supported .%s extension", async extension => {
    const { worker, promise } = await start(source(`oak.${extension}`, "")); worker.message({ file: jpeg() });
    expect((await promise).name).toBe("oak.jpg"); expectTerminated(worker);
  });
  it.each([
    ["vector.svg", "image/svg+xml"], ["animation.gif", "image/gif"], ["vector.jpg", "image/svg+xml"],
    ["animation.png", "image/gif"], ["arbitrary.jpg", "application/octet-stream"], ["arbitrary.heic", "text/plain"],
    ["vector.svg", ""], ["animation.gif", ""], ["not-a-photo.txt", ""], ["no-extension", ""],
  ])("rejects unsupported or misleading input %s (%s) before spawning a worker", async (name, type) => {
    await expect(prepareListingPhoto(source(name, type))).rejects.toThrow(); expect(MockWorker.instances).toHaveLength(0);
  });
  it("rejects empty input before spawning a worker", async () => {
    await expect(prepareListingPhoto(source("empty.jpg", "image/jpeg", 0))).rejects.toThrow(); expect(MockWorker.instances).toHaveLength(0);
  });
  it("rejects a source just above 25 MiB before spawning a worker", async () => {
    await expect(prepareListingPhoto(source("large.jpg", "image/jpeg", 25 * MiB + 1))).rejects.toThrow(); expect(MockWorker.instances).toHaveLength(0);
  });
  it("allows a source exactly at 25 MiB", async () => {
    const { worker, promise } = await start(source("at-cap.heic", "image/heic", 25 * MiB));
    worker.message({ file: jpeg() }); expect((await promise).size).toBe(JPEG_BYTES.length); expectTerminated(worker);
  });
});

describe("listing photo worker protocol and output", () => {
  it("starts the module worker with the original File and returns a distinct JPEG File", async () => {
    const file = source(), before = { name: file.name, type: file.type, size: file.size, lastModified: file.lastModified };
    const { worker, promise } = await start(file), resultBlob = jpeg();
    expect(worker.url).toBeInstanceOf(URL); expect(String(worker.url)).toMatch(/prepare-listing-photo\.worker\.ts(?:\?|$)/);
    expect(worker.options).toMatchObject({ type: "module" }); expect(worker.postMessage).toHaveBeenCalledTimes(1);
    expect(worker.postMessage.mock.calls[0][0]).toEqual({ file });
    expect((worker.postMessage.mock.calls[0][0] as { file: File }).file).toBe(file);
    worker.message({ file: resultBlob }); const prepared = await promise;
    expect(prepared).toBeInstanceOf(File); expect(prepared).not.toBe(file);
    expect(prepared).toMatchObject({ name: "oak-board.jpg", type: "image/jpeg", size: resultBlob.size });
    expect({ name: file.name, type: file.type, size: file.size, lastModified: file.lastModified }).toEqual(before);
    expectTerminated(worker);
  });
  it.each(["../private/oak.PNG", "C:\\private\\oak.HEIC"])("uses only the safe original basename for %s", async name => {
    const { worker, promise } = await start(source(name)); worker.message({ file: jpeg() });
    expect((await promise).name).toBe("oak.jpg"); expectTerminated(worker);
  });
  it("removes unsafe filename characters and bounds the resulting name to 240 characters", async () => {
    const unsafe = `bad<>:"|?*\u0000\u0001${"x".repeat(300)}.HEIF`;
    const { worker, promise } = await start(source(unsafe, "image/heif")); worker.message({ file: jpeg() });
    const output = await promise;
    expect(output.name).toMatch(/\.jpg$/); expect(output.name).not.toMatch(/[\\/<>:"|?*\u0000-\u001f]/);
    expect(output.name.length).toBeGreaterThan(4); expect(output.name.length).toBeLessThanOrEqual(240); expectTerminated(worker);
  });
  it("provides a nonempty safe basename when the original has no usable stem", async () => {
    const { worker, promise } = await start(source(".HEIC")); worker.message({ file: jpeg() });
    const output = await promise; expect(output.name).toMatch(/^.+\.jpg$/); expect(output.name).not.toBe(".jpg"); expectTerminated(worker);
  });
  it("allows a prepared JPEG exactly at 4 MiB", async () => {
    const { worker, promise } = await start(); worker.message({ file: jpeg(OUTPUT_CAP) });
    expect((await promise).size).toBe(OUTPUT_CAP); expectTerminated(worker);
  });
  it.each([
    ["missing envelope", undefined], ["null envelope", null], ["missing file", {}], ["string body", "jpeg"],
    ["non-Blob file", { file: { type: "image/jpeg", size: 4 } }], ["null file", { file: null }],
    ["empty JPEG", { file: new Blob([], { type: "image/jpeg" }) }],
    ["non-JPEG Blob", { file: new Blob([JPEG_BYTES], { type: "image/png" }) }],
    ["typeless Blob", { file: new Blob([JPEG_BYTES]) }], ["malformed error", { error: 123 }],
  ])("rejects malformed worker output: %s", async (_label, message) => {
    const { worker, promise } = await start(); worker.message(message);
    await expect(promise).rejects.toThrow(); expectTerminated(worker);
  });
  it("rejects a JPEG just above 4 MiB", async () => {
    const { worker, promise } = await start(); worker.message({ file: jpeg(OUTPUT_CAP + 1) });
    await expect(promise).rejects.toThrow(); expectTerminated(worker);
  });
});

describe("listing photo preparation lifecycle", () => {
  it("rejects an already aborted operation without spawning a worker", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(prepareListingPhoto(source(), { signal: controller.signal })).rejects.toBeDefined(); expect(MockWorker.instances).toHaveLength(0);
  });
  it("terminates on abort and ignores a late worker completion", async () => {
    const controller = new AbortController(), { worker, promise } = await start(source(), { signal: controller.signal });
    const fulfilled = vi.fn(), rejected = vi.fn(); const settled = promise.then(fulfilled, rejected);
    controller.abort(); await settled; expect(fulfilled).not.toHaveBeenCalled(); expect(rejected).toHaveBeenCalledTimes(1);
    expectTerminated(worker); worker.message({ file: jpeg() }); await Promise.resolve();
    expect(fulfilled).not.toHaveBeenCalled(); expect(rejected).toHaveBeenCalledTimes(1); expectTerminated(worker);
  });
  it("success wins once and a later abort/error/message cannot settle or terminate again", async () => {
    const controller = new AbortController(), { worker, promise } = await start(source(), { signal: controller.signal });
    const fulfilled = vi.fn(), rejected = vi.fn(); const settled = promise.then(fulfilled, rejected);
    worker.message({ file: jpeg() }); await settled; expect(fulfilled).toHaveBeenCalledTimes(1); expect(rejected).not.toHaveBeenCalled();
    controller.abort(); worker.error(); worker.messageError(); worker.message({ error: "Late error" }); worker.message({ file: jpeg() });
    await Promise.resolve(); expect(fulfilled).toHaveBeenCalledTimes(1); expect(rejected).not.toHaveBeenCalled(); expectTerminated(worker);
  });
  it.each(["error", "messageerror", "error response"] as const)("terminates and rejects on worker %s", async kind => {
    const { worker, promise } = await start();
    if (kind === "error") worker.error(); else if (kind === "messageerror") worker.messageError(); else worker.message({ error: "Try another photo; this source could not be decoded." });
    await expect(promise).rejects.toThrow(); expectTerminated(worker);
    worker.message({ file: jpeg() }); await Promise.resolve(); expectTerminated(worker);
  });
  it("rejects cleanly when constructing the worker fails", async () => {
    MockWorker.constructorFailure = new Error("Module workers unavailable");
    await expect(prepareListingPhoto(source())).rejects.toThrow(); expect(MockWorker.instances).toHaveLength(0);
  });
  it("terminates the constructed worker when posting the File fails", async () => {
    MockWorker.postFailure = new Error("Synthetic DataCloneError");
    await expect(prepareListingPhoto(source())).rejects.toThrow(); expect(MockWorker.instances).toHaveLength(1); expectTerminated(MockWorker.instances[0]);
  });
  it("waits up to 30 seconds, then terminates with an actionable timeout and ignores late completion", async () => {
    const { worker, promise } = await start(); const fulfilled = vi.fn(), rejected = vi.fn(); const settled = promise.then(fulfilled, rejected);
    await vi.advanceTimersByTimeAsync(29_999); expect(fulfilled).not.toHaveBeenCalled(); expect(rejected).not.toHaveBeenCalled(); expect(worker.terminate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); await settled;
    expect(fulfilled).not.toHaveBeenCalled(); expect(rejected).toHaveBeenCalledTimes(1);
    const error = rejected.mock.calls[0][0]; expect(error).toBeInstanceOf(Error);
    expect(error.message).toMatch(/timed?\s*out|taking too long|30\s*seconds/i); expect(error.message).toMatch(/retry|try again|smaller|another|different/i);
    expectTerminated(worker); worker.message({ file: jpeg() }); await Promise.resolve(); expect(fulfilled).not.toHaveBeenCalled(); expectTerminated(worker);
  });
});
