import { MAX_LISTING_PHOTO_BYTES } from "@/lib/listing-photos";

export const MAX_SOURCE_PHOTO_BYTES = 25 * 1024 * 1024;
export const LISTING_PHOTO_ACCEPT = {
  "image/jpeg": [".jpg", ".jpeg"], "image/png": [".png"], "image/webp": [".webp"],
  "image/heic": [".heic"], "image/heif": [".heif"],
};
export const PHOTO_SOURCE_GUIDANCE = "Choose JPEG, PNG, WebP or HEIC photos up to 25 MB each.";

/** One cancellable worker per source bounds codec lifetime. Callers
 * process sequentially and keep the returned File unchanged for upload retries. */
export async function prepareListingPhoto(file: File, { signal }: { signal?: AbortSignal } = {}): Promise<File> {
  if (signal?.aborted) throw new Error("Photo preparation cancelled. Retry when you are ready.");
  const supported = file.type ? Object.hasOwn(LISTING_PHOTO_ACCEPT, file.type) : /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
  if (!supported || !file.size || file.size > MAX_SOURCE_PHOTO_BYTES) throw new Error(PHOTO_SOURCE_GUIDANCE);
  const basename = file.name.split(/[\\/]/).at(-1) ?? "photo";
  const stem = basename.replace(/\.[^.]*$/, "").replace(/[<>:"|?*\x00-\x1f]/g, "").trim().slice(0, 236) || "photo";
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try { worker = new Worker(new URL("./prepare-listing-photo.worker.ts", import.meta.url), { type: "module" }); }
    catch { reject(new Error("Photo preparation is unavailable. Try a current browser or reload this page.")); return; }
    let settled = false;
    const finish = (result: File | Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      worker.onmessage = worker.onerror = worker.onmessageerror = null;
      worker.terminate();
      if (result instanceof Error) reject(result); else resolve(result);
    };
    const abort = () => finish(new Error("Photo preparation cancelled. Retry when you are ready."));
    const timer = setTimeout(() => finish(new Error("Photo preparation timed out. Retry with a smaller photo.")), 30_000);
    signal?.addEventListener("abort", abort, { once: true });
    worker.onerror = event => { event.preventDefault(); finish(new Error("Photo preparation failed. Try another photo or reload this page.")); };
    worker.onmessageerror = () => finish(new Error("Photo preparation failed. Try another photo."));
    worker.onmessage = ({ data }: MessageEvent<unknown>) => {
      const value = data && typeof data === "object" ? data : {};
      if ("error" in value && typeof value.error === "string") { finish(new Error(value.error)); return; }
      const output = "file" in value ? value.file : undefined;
      if (!(output instanceof Blob) || output.type !== "image/jpeg" || !output.size || output.size > MAX_LISTING_PHOTO_BYTES) {
        finish(new Error("This photo could not be prepared. Try another photo.")); return;
      }
      finish(new File([output], `${stem}.jpg`, { type: "image/jpeg", lastModified: file.lastModified }));
    };
    try { worker.postMessage({ file }); }
    catch { finish(new Error("This photo could not be prepared. Try another photo.")); }
  });
}
