/**
 * Upload metadata is persisted only from UploadThing's signed callback. This
 * URL check is defense in depth against a callback/configuration mismatch.
 */
export function isTrustedUploadThingFileUrl(url: string, key: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    if (parsed.username || parsed.password || parsed.port) return false;

    const trustedHost =
      parsed.hostname === "utfs.io" ||
      /^[a-z0-9-]+\.ufs\.sh$/i.test(parsed.hostname);
    if (!trustedHost) return false;

    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length !== 2 || segments[0] !== "f") return false;

    return decodeURIComponent(segments[1] ?? "") === key;
  } catch {
    return false;
  }
}
