// Candidate: src/server/routers/__tests__/private-listing-photo-storage-fixture.ts
// Provider-boundary fixture only. No real storage SDK, HTTP, or token acceptance.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export const PNG = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=", "base64"));
export type StoreCall = { op: "sign" | "download" | "copy" | "remove"; paths: string[] };
type Reply<T> = { data: T | null; error: Error | null };
export class PhotoStorageFixture {
  objects = new Map<string, Uint8Array>();
  calls: StoreCall[] = [];
  tokens = new Map<string, { path: string; expiresAt: number }>();
  failSignAfterIssue = false;
  failCopyAfterWrite = false;
  failRemove = false;
  copyReplacement: Uint8Array | null = null;
  afterFrozenCopy: null | ((path: string) => Promise<void>) = null;
  beforeDownload: null | ((path: string) => Promise<void>) = null;
  factoryError: Error | null = null;
  factoryCalls = 0;

  async factory() {
    this.factoryCalls++;
    if (this.factoryError) throw this.factoryError;
    return this;
  }
  async createSignedUploadUrl(path: string, options: { upsert?: boolean }): Promise<Reply<{ path: string; token: string; signedUrl: string }>> {
    assert.equal(options.upsert, false, "Private signed uploads must never overwrite existing bytes");
    this.calls.push({ op: "sign", paths: [path] });
    const token = randomUUID(); this.tokens.set(token, { path, expiresAt: Date.now() + 2 * 60 * 60 * 1000 });
    if (this.failSignAfterIssue) { this.failSignAfterIssue = false; throw new Error("Signed intent response lost after issuance"); }
    return { data: { path, token, signedUrl: `https://synthetic.invalid/private-upload/${token}` }, error: null };
  }
  upload(intent: { path: string; token: string }, bytes = PNG) {
    const issued = this.tokens.get(intent.token);
    assert(issued && issued.path === intent.path, "Token must bind the exact incoming object");
    assert(Date.now() < issued.expiresAt, "Expired token cannot admit a new transfer");
    assert(!this.objects.has(intent.path), "Signed upload upsert:false");
    this.objects.set(intent.path, bytes.slice());
  }
  async download(path: string): Promise<Reply<Blob>> {
    this.calls.push({ op: "download", paths: [path] });
    await this.beforeDownload?.(path);
    const bytes = this.objects.get(path);
    return bytes ? { data: new Blob([new Uint8Array(bytes)], { type: "application/octet-stream" }), error: null }
      : { data: null, error: Object.assign(new Error("Object unavailable"), { statusCode: "404" }) };
  }
  async copy(from: string, to: string): Promise<Reply<{ path: string }>> {
    this.calls.push({ op: "copy", paths: [from, to] });
    assert.notEqual(from, to, "Frozen bytes must use a separate non-uploadable object");
    const bytes = this.objects.get(from);
    if (!bytes) return { data: null, error: Object.assign(new Error("Source unavailable"), { statusCode: "404" }) };
    if (this.objects.has(to)) return { data: null, error: Object.assign(new Error("Destination already exists"), { statusCode: "409" }) };
    this.objects.set(to, (this.copyReplacement ?? bytes).slice());
    await this.afterFrozenCopy?.(to);
    if (this.failCopyAfterWrite) { this.failCopyAfterWrite = false; throw new Error("Copy response lost after provider accepted bytes"); }
    return { data: { path: to }, error: null };
  }
  async remove(paths: string[]): Promise<Reply<Array<{ name: string }>>> {
    this.calls.push({ op: "remove", paths: [...paths] });
    if (this.failRemove) return { data: null, error: new Error("Delete response unavailable") };
    for (const path of paths) this.objects.delete(path);
    return { data: paths.map(name => ({ name })), error: null };
  }
}
