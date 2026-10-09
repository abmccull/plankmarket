// Candidate target: src/server/services/__tests__/seller-activation-postgres.test.ts
// Apply before service implementation. Preparation only; not executed by author.
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { users, verificationDocuments, sellerActivationRequests } from "@/server/db/schema";
import { createSellerActivationFixture, type SellerActivationFixture } from "./fixtures/seller-activation-postgres-fixture";
import { createRoleProvider, barrier, within } from "./fixtures/seller-activation-role-provider";

process.env.SKIP_ENV_VALIDATION = "1";
vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ db: {} }));
// A forgotten injection must fail, never fall through to a live admin/provider.
vi.mock("@/lib/supabase/server", () => ({ createClient: () => { throw new Error("Live Supabase forbidden in activation service proof"); }, createServiceClient: () => { throw new Error("Live Supabase forbidden in activation service proof"); } }));

type Service = typeof import("@/server/services/seller-activation");
const EIN = "12-3456789";
const WEBSITE = "https://activation-fixture.example.invalid";
const DAY = 86_400_000;
const future = (days = 15) => new Date(Date.now() + days * DAY);
const past = (days = 1) => new Date(Date.now() - days * DAY);
async function outcome<T>(promise: Promise<T>) {
  try { return { ok: true as const, value: await promise }; }
  catch (error) { return { ok: false as const, error }; }
}

describe.skipIf(process.env.SELLER_ACTIVATION_DB_PROOF !== "1")("same-account seller activation on isolated actual PostgreSQL", () => {
  let f: SellerActivationFixture;
  let service: Service;
  beforeAll(async () => {
    service = await import("@/server/services/seller-activation");
    f = await createSellerActivationFixture();
  }, 20_000);
  afterAll(async () => { if (f) await f.cleanup(); }, 20_000);

  async function draft(options: Parameters<SellerActivationFixture["seed"]>[0] = {}) {
    const seeded = await f.seed(options);
    const fresh = options.document?.purpose === "seller_activation";
    const input = { requestId: seeded.requestId, expectedRevision: null, businessWebsite: WEBSITE, einTaxId: EIN, ...(fresh ? {} : { documentId: seeded.document.id }) };
    const receipt = await service.saveSellerActivationDraft(f.a.db, seeded.user.id, input);
    let application = await f.request(seeded.user.id, seeded.requestId);
    expect(application).toBeDefined();
    if (fresh) {
      seeded.document = await f.bindDocumentToActivation(seeded.document.id, seeded.user.id, application!.id);
      await service.saveSellerActivationDraft(f.a.db, seeded.user.id, { requestId: seeded.requestId, expectedRevision: application!.revision, documentId: seeded.document.id });
      application = await f.request(seeded.user.id, seeded.requestId);
    }
    return { ...seeded, input, receipt, application: application! };
  }
  async function pending(options: Parameters<SellerActivationFixture["seed"]>[0] = {}) {
    const setup = await draft(options);
    const submitInput = { requestId: setup.requestId, expectedRevision: setup.application.revision };
    await service.submitSellerActivation(f.a.db, setup.user.id, submitInput);
    return { ...setup, submitInput, application: (await f.request(setup.user.id, setup.requestId))! };
  }
  async function approved(options: Parameters<SellerActivationFixture["seed"]>[0] = {}) {
    const setup = await pending(options);
    const reviewInput = { id: setup.application.id, expectedRevision: setup.application.revision, reviewRequestId: randomUUID(), decision: "approved" as const, note: "Same existing business; current seller evidence reviewed." };
    await service.reviewSellerActivation(f.a.db, f.admin.id, reviewInput);
    return { ...setup, reviewInput, application: (await f.request(setup.user.id, setup.requestId))! };
  }
  function privacy(value: unknown, objectPath?: string) {
    const serialized = JSON.stringify(value);
    expect(serialized).not.toContain(EIN);
    expect(serialized).not.toContain(EIN.replace("-", ""));
    if (objectPath) expect(serialized).not.toContain(objectPath);
  }
  async function accountUnchanged(userId: string, before: Awaited<ReturnType<SellerActivationFixture["user"]>>) {
    expect(await f.user(userId)).toEqual(before);
  }

  it("get is owner-scoped and pure, and active seller authority does not require application history", async () => {
    const a = await draft(), b = await draft();
    const seller = await f.seed({ user: { role: "seller" } });
    const before = await f.stateDigest();
    const first = await service.getSellerActivation(f.a.db, a.user.id);
    const second = await service.getSellerActivation(f.a.db, b.user.id);
    const existingSeller = await service.getSellerActivation(f.a.db, seller.user.id);
    expect(first).toMatchObject({ ownerId: a.user.id, sellerAccessActive: false, application: { id: a.application.id } });
    expect(second).toMatchObject({ ownerId: b.user.id, application: { id: b.application.id } });
    expect(existingSeller).toMatchObject({ ownerId: seller.user.id, sellerAccessActive: true, application: null });
    privacy(first, a.document.objectPath); privacy(second, b.document.objectPath);
    expect(JSON.stringify(first)).not.toContain(b.user.id);
    expect(await f.stateDigest()).toEqual(before);
  });

  it("retains the entire buyer account and order until activation, then changes only approved role/website/timestamp", async () => {
    const setup = await draft();
    const beforeUser = await f.user(setup.user.id), beforeOrder = await f.order(setup.orderId);
    const requestBefore = await f.request(setup.user.id, setup.requestId);
    await service.submitSellerActivation(f.a.db, setup.user.id, { requestId: setup.requestId, expectedRevision: requestBefore!.revision });
    await accountUnchanged(setup.user.id, beforeUser);
    let row = (await f.request(setup.user.id, setup.requestId))!;
    expect(row).toMatchObject({ status: "pending", syncState: "none", sourceVerificationSubmissionId: setup.user.verificationSubmissionId });
    expect(row.identitySnapshot).toMatchObject({ authId: setup.user.authId, businessName: setup.user.businessName });
    expect(Object.keys(row.identitySnapshot!).sort()).toEqual(["authId", "businessAddress", "businessCity", "businessName", "businessState", "businessZip", "sourceVerificationSubmissionId"].sort());
    await service.reviewSellerActivation(f.a.db, f.admin.id, { id: row.id, expectedRevision: row.revision, reviewRequestId: randomUUID(), decision: "approved", note: "Verified the existing business and current seller evidence." });
    await accountUnchanged(setup.user.id, beforeUser);
    row = (await f.request(setup.user.id, setup.requestId))!;
    expect(row).toMatchObject({ status: "approved", syncState: "pending" });
    const provider = createRoleProvider(setup.user.authId);
    const result = await service.reconcileSellerActivation(f.a.db, setup.user.id, row.id, provider, f.coordinate);
    expect(result).toMatchObject({ ownerId: setup.user.id, sellerAccessActive: true });
    const afterUser = (await f.user(setup.user.id))!;
    expect({ ...afterUser, role: beforeUser!.role, businessWebsite: beforeUser!.businessWebsite, updatedAt: beforeUser!.updatedAt }).toEqual(beforeUser);
    expect(afterUser).toMatchObject({ role: "seller", businessWebsite: WEBSITE, verified: true, stripeOnboardingComplete: false });
    expect(await f.order(setup.orderId)).toEqual(beforeOrder);
    expect(provider.current().appMetadata).toMatchObject({ role: "seller", fixtureUnrelated: { keep: "unchanged" } });
    expect(provider.calls.every(call => call.authId === setup.user.authId)).toBe(true);
    expect((await f.request(setup.user.id, setup.requestId))!).toMatchObject({ status: "approved", syncState: "complete" });
    privacy(result, setup.document.objectPath);
    const artifacts = await f.artifacts(setup.user.id);
    expect(artifacts.audits.length).toBeGreaterThan(0); expect(artifacts.notifications.length).toBeGreaterThan(0);
    privacy(artifacts, setup.document.objectPath);
    expect(JSON.stringify(artifacts.audits)).not.toContain(setup.user.email);
    f.note("identity-continuity", { userId: setup.user.id, authId: setup.user.authId, orderId: setup.orderId, currentRole: afterUser.role });
  });

  it("same create key returns one receipt without renewing its deadline; a different payload conflicts", async () => {
    const setup = await draft(), before = await f.request(setup.user.id, setup.requestId), artifacts = await f.artifacts(setup.user.id);
    await service.saveSellerActivationDraft(f.a.db, setup.user.id, setup.input);
    expect(await f.request(setup.user.id, setup.requestId)).toEqual(before);
    expect(await f.artifacts(setup.user.id)).toEqual(artifacts);
    expect(await f.requestCount(setup.user.id)).toBe(1);
    await expect(service.saveSellerActivationDraft(f.a.db, setup.user.id, { ...setup.input, businessWebsite: "https://different.example.invalid" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await f.request(setup.user.id, setup.requestId)).toEqual(before);
  });

  it("omitted draft fields persist, empty strings/null clear, and stale revisions do not overwrite", async () => {
    const setup = await draft(), expiry = setup.application.purgeAfter;
    await service.saveSellerActivationDraft(f.a.db, setup.user.id, { requestId: setup.requestId, expectedRevision: setup.application.revision, businessWebsite: "https://edited.example.invalid" });
    const edited = (await f.request(setup.user.id, setup.requestId))!;
    expect(edited).toMatchObject({ einTaxId: EIN, documentId: setup.document.id, purgeAfter: expiry });
    expect(edited.revision).toBeGreaterThan(setup.application.revision);
    await expect(service.saveSellerActivationDraft(f.a.db, setup.user.id, { requestId: setup.requestId, expectedRevision: setup.application.revision, businessWebsite: "https://late.example.invalid" })).rejects.toMatchObject({ code: "CONFLICT" });
    await service.saveSellerActivationDraft(f.a.db, setup.user.id, { requestId: setup.requestId, expectedRevision: edited.revision, businessWebsite: "", einTaxId: "", documentId: null });
    const cleared = (await f.request(setup.user.id, setup.requestId))!;
    expect(cleared).toMatchObject({ businessWebsite: null, einTaxId: null, documentId: null, purgeAfter: expiry });
    await expect(service.submitSellerActivation(f.a.db, setup.user.id, { requestId: setup.requestId, expectedRevision: cleared.revision })).rejects.toThrow();
  });

  it("concurrent initial saves create one row, and two edits of one revision have one winner", async () => {
    const seeded = await f.seed();
    const input = { requestId: seeded.requestId, expectedRevision: null, businessWebsite: WEBSITE, einTaxId: EIN, documentId: seeded.document.id };
    const creates = await Promise.all([outcome(service.saveSellerActivationDraft(f.a.db, seeded.user.id, input)), outcome(service.saveSellerActivationDraft(f.b.db, seeded.user.id, input))]);
    expect(creates.filter(result => result.ok)).toHaveLength(2);
    const row = (await f.request(seeded.user.id, seeded.requestId))!;
    expect(await f.requestCount(seeded.user.id)).toBe(1);
    const edits = await Promise.all([outcome(service.saveSellerActivationDraft(f.a.db, seeded.user.id, { requestId: seeded.requestId, expectedRevision: row.revision, businessWebsite: "https://one.example.invalid" })), outcome(service.saveSellerActivationDraft(f.b.db, seeded.user.id, { requestId: seeded.requestId, expectedRevision: row.revision, businessWebsite: "https://two.example.invalid" }))]);
    expect(edits.filter(result => result.ok)).toHaveLength(1);
    expect(edits.find(result => !result.ok)).toMatchObject({ error: { code: "CONFLICT" } });
    expect(["https://one.example.invalid", "https://two.example.invalid"]).toContain((await f.request(seeded.user.id, seeded.requestId))!.businessWebsite);
  });

  it.each([
    { active: false }, { role: "seller" as const }, { role: "admin" as const },
  ])("cannot create an activation for an ineligible current account: %j", async user => {
    const seeded = await f.seed({ user }), before = await f.user(seeded.user.id);
    await expect(service.saveSellerActivationDraft(f.a.db, seeded.user.id, { requestId: seeded.requestId, expectedRevision: null })).rejects.toThrow();
    expect(await f.requestCount(seeded.user.id)).toBe(0); await accountUnchanged(seeded.user.id, before);
  });

  it.each(["unverified", "pending", "rejected"])("cannot submit while current buyer verification is %s", async verificationStatus => {
    const setup = await draft();
    await f.a.db.update(users).set({ verified: false, verificationStatus }).where(eq(users.id, setup.user.id));
    const before = await f.user(setup.user.id);
    await expect(service.submitSellerActivation(f.a.db, setup.user.id, { requestId: setup.requestId, expectedRevision: setup.application.revision })).rejects.toThrow();
    expect((await f.request(setup.user.id, setup.requestId))!.status).not.toBe("pending");
    await accountUnchanged(setup.user.id, before);
  });

  it.each(["foreign", "unready", "deleted", "resale", "missing", "wrong-activation-origin"] as const)("rejects unsafe document selection (%s) without weakening existing buying authority", async variant => {
    const seeded = await f.seed(), foreign = await f.seed();
    let documentId = seeded.document.id;
    if (variant === "foreign") documentId = foreign.document.id;
    if (variant === "missing") documentId = randomUUID();
    if (variant === "unready") await f.a.db.update(verificationDocuments).set({ readyAt: null }).where(eq(verificationDocuments.id, documentId));
    if (variant === "deleted") await f.a.db.update(verificationDocuments).set({ deletedAt: new Date() }).where(eq(verificationDocuments.id, documentId));
    if (variant === "resale") await f.a.db.update(verificationDocuments).set({ purpose: "resale_certificate" }).where(eq(verificationDocuments.id, documentId));
    if (variant === "wrong-activation-origin") await f.a.db.update(verificationDocuments).set({ purpose: "seller_activation", objectPath: `${seeded.user.id}/ready/${randomUUID()}/${documentId}` }).where(eq(verificationDocuments.id, documentId));
    const before = await f.user(seeded.user.id);
    const save = await outcome(service.saveSellerActivationDraft(f.a.db, seeded.user.id, { requestId: seeded.requestId, expectedRevision: null, businessWebsite: WEBSITE, einTaxId: EIN, documentId }));
    // Draft selection may fail earlier. It must never reach submitted/reviewable state.
    if (save.ok) {
      const row = (await f.request(seeded.user.id, seeded.requestId))!;
      await expect(service.submitSellerActivation(f.a.db, seeded.user.id, { requestId: seeded.requestId, expectedRevision: row.revision })).rejects.toThrow();
    }
    expect((await f.request(seeded.user.id, seeded.requestId))?.status).not.toBe("pending");
    await accountUnchanged(seeded.user.id, before);
  });

  it("caps reused business evidence to its earlier owner deadline and never extends it on replay", async () => {
    const deadline = future(2);
    const setup = await pending({ user: { verificationDataPurgeAfter: deadline }, document: { purpose: "business_verification", createdAt: past(20), readyAt: past(19) } });
    expect(setup.application.purgeAfter.getTime()).toBeLessThanOrEqual(deadline.getTime());
    expect(setup.application.purgeAfter.getTime()).toBeLessThanOrEqual(setup.document.createdAt.getTime() + 30 * DAY);
    const before = await f.request(setup.user.id, setup.requestId);
    await service.submitSellerActivation(f.a.db, setup.user.id, setup.submitInput);
    await service.getSellerActivation(f.a.db, setup.user.id);
    expect(await f.request(setup.user.id, setup.requestId)).toEqual(before);
  });

  it.each(["draft", "document", "retained-business-evidence"] as const)("does not submit expired %s evidence", async variant => {
    const setup = await draft();
    if (variant === "retained-business-evidence") await f.a.db.update(users).set({ verificationDataPurgeAfter: past() }).where(eq(users.id, setup.user.id));
    if (variant === "draft") await f.a.db.update(sellerActivationRequests).set({ purgeAfter: sql`${sellerActivationRequests.createdAt}` }).where(eq(sellerActivationRequests.id, setup.application.id));
    if (variant === "document") await f.a.db.update(verificationDocuments).set({ createdAt: past(31), readyAt: past(30) }).where(eq(verificationDocuments.id, setup.document.id));
    await expect(service.submitSellerActivation(f.a.db, setup.user.id, { requestId: setup.requestId, expectedRevision: setup.application.revision })).rejects.toThrow();
    expect((await f.user(setup.user.id))!).toMatchObject({ role: "buyer", verified: true, verificationStatus: "verified" });
    expect((await f.request(setup.user.id, setup.requestId))!.status).not.toBe("pending");
  });

  it("allows a verified legacy buyer with null submission and purged evidence to supply fresh seller evidence", async () => {
    const setup = await approved({ user: { verificationSubmissionId: null, einTaxId: null, einLast4: null, verificationDocUrl: null, verificationEvidencePurgedAt: past(), verificationDataPurgeAfter: past() }, document: { purpose: "seller_activation" } });
    expect(setup.application).toMatchObject({ status: "approved", sourceVerificationSubmissionId: null });
    const provider = createRoleProvider(setup.user.authId);
    await service.reconcileSellerActivation(f.a.db, setup.user.id, setup.application.id, provider, f.coordinate);
    expect(await f.user(setup.user.id)).toMatchObject({ role: "seller", verified: true, verificationSubmissionId: null, einTaxId: null, verificationDocUrl: null });
  });

  it("can reuse retained matching owner EIN but cannot substitute another business EIN", async () => {
    const seeded = await f.seed({ user: { einTaxId: EIN, einLast4: "6789" } });
    await service.saveSellerActivationDraft(f.a.db, seeded.user.id, { requestId: seeded.requestId, expectedRevision: null, businessWebsite: WEBSITE, documentId: seeded.document.id });
    const row = (await f.request(seeded.user.id, seeded.requestId))!;
    await service.submitSellerActivation(f.a.db, seeded.user.id, { requestId: seeded.requestId, expectedRevision: row.revision });
    expect((await f.request(seeded.user.id, seeded.requestId))!).toMatchObject({ status: "pending", einLast4: "6789" });
    const conflict = await draft({ user: { einTaxId: "98-7654321", einLast4: "4321" } });
    await expect(service.submitSellerActivation(f.a.db, conflict.user.id, { requestId: conflict.requestId, expectedRevision: conflict.application.revision })).rejects.toThrow();
    expect((await f.user(conflict.user.id))!).toMatchObject({ role: "buyer", verified: true, einTaxId: "98-7654321" });
  });

  it("submission is immutable and exact submission replay after review has no new effects", async () => {
    const setup = await approved(), before = await f.request(setup.user.id, setup.requestId), artifacts = await f.artifacts(setup.user.id);
    await service.submitSellerActivation(f.a.db, setup.user.id, setup.submitInput);
    expect(await f.request(setup.user.id, setup.requestId)).toEqual(before);
    expect(await f.artifacts(setup.user.id)).toEqual(artifacts);
    await expect(service.saveSellerActivationDraft(f.a.db, setup.user.id, { requestId: setup.requestId, expectedRevision: before!.revision, einTaxId: "98-7654321" })).rejects.toThrow();
    await expect(service.submitSellerActivation(f.a.db, setup.user.id, { requestId: setup.requestId, expectedRevision: setup.submitInput.expectedRevision + 10 })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await f.request(setup.user.id, setup.requestId)).toEqual(before);
  });

  it.each(["self", "buyer", "inactive-admin"] as const)("review denies %s independent of router assurance", async kind => {
    const setup = await pending();
    const reviewer = kind === "self" ? setup.user : (await f.seed({ user: { role: kind === "buyer" ? "buyer" : "admin", active: kind !== "inactive-admin" } })).user;
    const before = await f.request(setup.user.id, setup.requestId);
    await expect(service.reviewSellerActivation(f.a.db, reviewer.id, { id: setup.application.id, expectedRevision: setup.application.revision, reviewRequestId: randomUUID(), decision: "approved", note: "Must be denied." })).rejects.toThrow();
    expect(await f.request(setup.user.id, setup.requestId)).toEqual(before);
  });

  it.each(["identity", "source-submission", "verification", "inactive", "expired", "deleted-document"] as const)("approval rechecks current %s", async kind => {
    const setup = await pending();
    if (kind === "identity") await f.a.db.update(users).set({ businessAddress: "999 Different Business Way" }).where(eq(users.id, setup.user.id));
    if (kind === "source-submission") await f.a.db.update(users).set({ verificationSubmissionId: randomUUID() }).where(eq(users.id, setup.user.id));
    if (kind === "verification") await f.a.db.update(users).set({ verified: false, verificationStatus: "unverified" }).where(eq(users.id, setup.user.id));
    if (kind === "inactive") await f.a.db.update(users).set({ active: false }).where(eq(users.id, setup.user.id));
    if (kind === "expired") await f.a.db.update(sellerActivationRequests).set({ purgeAfter: sql`${sellerActivationRequests.createdAt}` }).where(eq(sellerActivationRequests.id, setup.application.id));
    if (kind === "deleted-document") await f.a.db.update(verificationDocuments).set({ deletedAt: new Date() }).where(eq(verificationDocuments.id, setup.document.id));
    const beforeUser = await f.user(setup.user.id);
    await expect(service.reviewSellerActivation(f.a.db, f.admin.id, { id: setup.application.id, expectedRevision: setup.application.revision, reviewRequestId: randomUUID(), decision: "approved", note: "The old review must not pass current guards." })).rejects.toThrow();
    expect((await f.request(setup.user.id, setup.requestId))!.status).not.toBe("approved");
    await accountUnchanged(setup.user.id, beforeUser);
  });

  it("exact review replay is silent; reused key with changed decision and stale revision both conflict", async () => {
    const setup = await approved(), before = await f.request(setup.user.id, setup.requestId), artifacts = await f.artifacts(setup.user.id);
    await service.reviewSellerActivation(f.a.db, f.admin.id, setup.reviewInput);
    expect(await f.request(setup.user.id, setup.requestId)).toEqual(before);
    expect(await f.artifacts(setup.user.id)).toEqual(artifacts);
    await expect(service.reviewSellerActivation(f.a.db, f.admin.id, { ...setup.reviewInput, decision: "rejected" })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(service.reviewSellerActivation(f.a.db, f.admin.id, { ...setup.reviewInput, reviewRequestId: randomUUID(), expectedRevision: setup.reviewInput.expectedRevision - 1 })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("competing review decisions commit one decision and one set of durable receipts", async () => {
    const setup = await pending();
    const input = { id: setup.application.id, expectedRevision: setup.application.revision, note: "Reviewed current evidence." };
    const results = await Promise.all([outcome(service.reviewSellerActivation(f.a.db, f.admin.id, { ...input, reviewRequestId: randomUUID(), decision: "approved" })), outcome(service.reviewSellerActivation(f.b.db, f.admin.id, { ...input, reviewRequestId: randomUUID(), decision: "rejected" }))]);
    expect(results.filter(result => result.ok)).toHaveLength(1);
    expect(results.find(result => !result.ok)).toMatchObject({ error: { code: "CONFLICT" } });
    const row = (await f.request(setup.user.id, setup.requestId))!;
    expect(["approved", "rejected"]).toContain(row.status);
    expect(row.reviewedRevision).toBe(setup.application.revision);
    expect((await f.user(setup.user.id))!.role).toBe("buyer");
    const artifacts = await f.artifacts(setup.user.id);
    expect(new Set(artifacts.audits.map(event => event.idempotencyKey)).size).toBe(artifacts.audits.length);
  });

  it.each(["foreign-owner", "pending", "rejected"] as const)("reconcile refuses %s before provider access", async kind => {
    const setup = kind === "foreign-owner" ? await approved() : await pending();
    if (kind === "rejected") await service.reviewSellerActivation(f.a.db, f.admin.id, { id: setup.application.id, expectedRevision: setup.application.revision, reviewRequestId: randomUUID(), decision: "rejected", note: "Current seller evidence rejected for fixture." });
    const actor = kind === "foreign-owner" ? (await f.seed()).user.id : setup.user.id;
    const provider = createRoleProvider(setup.user.authId);
    await outcome(service.reconcileSellerActivation(f.a.db, actor, setup.application.id, provider, f.coordinate));
    expect(provider.calls).toHaveLength(0);
    expect((await f.user(setup.user.id))!.role).toBe("buyer");
  });

  it("does not patch or promote when provider readback returns another auth identity", async () => {
    const setup = await approved(), provider = createRoleProvider(setup.user.authId);
    provider.returnedId = randomUUID();
    await outcome(service.reconcileSellerActivation(f.a.db, setup.user.id, setup.application.id, provider, f.coordinate));
    expect(provider.calls.filter(call => call.kind === "patch")).toHaveLength(0);
    expect((await f.user(setup.user.id))!.role).toBe("buyer");
    expect((await f.request(setup.user.id, setup.requestId))!.syncState).not.toBe("complete");
  });

  it.each(["initial-read", "before-patch", "after-apply", "confirmation-read"] as const)("recovers %s failure using authoritative readback without duplicate activation receipts", async fault => {
    const setup = await approved(), provider = createRoleProvider(setup.user.authId);
    let enabled = true;
    provider.beforeRead = async () => { if (enabled && (fault === "initial-read" || ((fault === "after-apply" || fault === "confirmation-read") && provider.appliedPatches > 0))) throw new Error("Injected provider read unavailable"); };
    provider.beforePatch = async call => {
      if (enabled && fault === "before-patch") {
        expect(call.kind).toBe("patch");
        if (call.kind !== "patch") throw new Error("Expected the issued role patch");
        provider.deferRemotePatch(call.patch);
        throw new Error("Injected local failure before remote application; request remains in flight");
      }
    };
    provider.afterPatch = async () => { if (enabled && fault === "after-apply") throw new Error("Injected accepted-but-response-lost"); };
    const result = await outcome(service.reconcileSellerActivation(f.a.db, setup.user.id, setup.application.id, provider, f.coordinate));
    if (result.ok) expect(result.value).toMatchObject({ sellerAccessActive: false });
    expect((await f.user(setup.user.id))!.role).toBe("buyer");
    const failed = (await f.request(setup.user.id, setup.requestId))!;
    expect(failed.syncState).not.toBe("complete");
    expect(["pending", "uncertain", "blocked"]).toContain(failed.syncState);
    const previousCalls = provider.calls.length, previousApplied = provider.appliedPatches;
    enabled = false;
    if (fault === "initial-read") expect(await f.roleWrites(setup.user.id)).toHaveLength(0);
    if (fault === "before-patch") {
      const issued = await f.roleWrites(setup.user.id);
      expect(issued).toHaveLength(1);
      expect(issued[0]).toMatchObject({ confirmedAt: null, expectedRole: "seller", activationMarker: setup.application.activationOperationId });
      expect(provider.pendingRemotePatch()?.plankmarket_role_write).toBe(issued[0].id);
      const patches = provider.calls.filter(call => call.kind === "patch").length;
      expect(patches).toBe(1); expect(provider.appliedPatches).toBe(0);
      await outcome(service.reconcileSellerActivation(f.b.db, setup.user.id, setup.application.id, provider, f.coordinate));
      expect(await f.roleWrites(setup.user.id)).toEqual(issued);
      expect(provider.calls.filter(call => call.kind === "patch")).toHaveLength(patches);
      expect(provider.appliedPatches).toBe(0); expect(provider.current().appMetadata.role).toBe("buyer");
      expect((await f.user(setup.user.id))!.role).toBe("buyer");
      expect(["complete", "cancelled"]).not.toContain((await f.request(setup.user.id, setup.requestId))!.syncState);
      // Apply only the original issued remote request. The next real service
      // read must settle its exact receipt; this does not edit any DB receipt.
      provider.settlePendingPatch();
      expect(provider.appliedPatches).toBe(1);
      expect((await f.roleWrites(setup.user.id))[0].confirmedAt).toBeNull();
      f.note("unknown-before-apply-remains-blocked", { userId: setup.user.id, receiptId: issued[0].id, noSecondPut: true, originalRemoteRequestApplied: true });
    }
    const recovered = await service.reconcileSellerActivation(f.a.db, setup.user.id, setup.application.id, provider, f.coordinate);
    expect(provider.calls[previousCalls]?.kind).toBe("read");
    expect(recovered).toMatchObject({ sellerAccessActive: true });
    if (previousApplied > 0) expect(provider.appliedPatches).toBe(previousApplied);
    if (fault === "before-patch") {
      expect(provider.calls.filter(call => call.kind === "patch")).toHaveLength(1);
      expect(provider.appliedPatches).toBe(1); expect(provider.pendingRemotePatch()).toBeNull();
      const confirmed = await f.roleWrites(setup.user.id);
      expect(confirmed).toHaveLength(1); expect(confirmed[0].confirmedAt).not.toBeNull();
      expect(provider.current().appMetadata.plankmarket_role_write).toBe(confirmed[0].id);
    }
    const receipt = await f.request(setup.user.id, setup.requestId), artifacts = await f.artifacts(setup.user.id), applied = provider.appliedPatches;
    await service.reconcileSellerActivation(f.b.db, setup.user.id, setup.application.id, provider, f.coordinate);
    expect(await f.request(setup.user.id, setup.requestId)).toEqual(receipt);
    expect(await f.artifacts(setup.user.id)).toEqual(artifacts);
    expect(provider.appliedPatches).toBe(applied);
    privacy(recovered, setup.document.objectPath);
    f.note("provider-fault-reconciled", { fault, userId: setup.user.id, providerOperations: provider.calls, syncState: receipt!.syncState });
  });

  it("does not accept a seller marker owned by another activation operation", async () => {
    const setup = await approved(), provider = createRoleProvider(setup.user.authId);
    provider.setMetadata({ role: "seller", plankmarket_seller_activation: randomUUID(), fixtureUnrelated: { keep: "unchanged" } });
    await outcome(service.reconcileSellerActivation(f.a.db, setup.user.id, setup.application.id, provider, f.coordinate));
    expect((await f.user(setup.user.id))!.role).toBe("buyer");
    expect((await f.request(setup.user.id, setup.requestId))!.syncState).not.toBe("complete");
    expect(provider.calls.filter(call => call.kind === "patch")).toHaveLength(0);
  });

  it("a concurrent reconcile cannot duplicate the claimed external role transition", async () => {
    const setup = await approved(), provider = createRoleProvider(setup.user.authId), held = barrier();
    provider.afterPatch = async () => { held.enter(); await held.released; };
    const first = outcome(service.reconcileSellerActivation(f.a.db, setup.user.id, setup.application.id, provider, f.coordinate));
    try {
      await within(held.entered);
      const second = await within(outcome(service.reconcileSellerActivation(f.b.db, setup.user.id, setup.application.id, provider, f.coordinate)));
      if (second.ok) expect(second.value).toMatchObject({ sellerAccessActive: false });
      expect(provider.calls.filter(call => call.kind === "patch")).toHaveLength(1);
      expect((await f.user(setup.user.id))!.role).toBe("buyer");
    } finally { held.release(); await first; }
    expect((await f.user(setup.user.id))!.role).toBe("seller");
    const artifacts = await f.artifacts(setup.user.id), row = await f.request(setup.user.id, setup.requestId);
    await service.reconcileSellerActivation(f.b.db, setup.user.id, setup.application.id, provider, f.coordinate);
    expect(await f.artifacts(setup.user.id)).toEqual(artifacts); expect(await f.request(setup.user.id, setup.requestId)).toEqual(row);
  }, 15_000);

  it.each(["suspension", "identity", "verification", "superseded-claim"] as const)("late provider success cannot defeat current %s", async change => {
    const setup = await approved(), provider = createRoleProvider(setup.user.authId), held = barrier();
    provider.afterPatch = async () => { held.enter(); await held.released; };
    const running = outcome(service.reconcileSellerActivation(f.a.db, setup.user.id, setup.application.id, provider, f.coordinate));
    let replacementToken: string | undefined;
    try {
      await within(held.entered);
      if (change === "suspension") await f.b.db.update(users).set({ active: false }).where(eq(users.id, setup.user.id));
      if (change === "identity") await f.b.db.update(users).set({ businessName: "Changed approved business" }).where(eq(users.id, setup.user.id));
      if (change === "verification") await f.b.db.update(users).set({ verificationStatus: "unverified", verified: false }).where(eq(users.id, setup.user.id));
      if (change === "superseded-claim") {
        replacementToken = randomUUID();
        await f.b.db.update(sellerActivationRequests).set({ claimToken: replacementToken, claimExpiresAt: future(1), syncState: "in_progress" }).where(eq(sellerActivationRequests.id, setup.application.id));
      }
    } finally { held.release(); await running; }
    expect((await f.user(setup.user.id))!.role).toBe("buyer");
    const row = (await f.request(setup.user.id, setup.requestId))!;
    expect(row.syncState).not.toBe("complete");
    if (replacementToken) expect(row.claimToken).toBe(replacementToken);
    const dto = await service.getSellerActivation(f.a.db, setup.user.id);
    expect(dto).toMatchObject({ sellerAccessActive: false });
  }, 15_000);

  it.each(["demoted", "suspended"] as const)("retrying completed history cannot reactivate a later %s account", async change => {
    const setup = await approved(), provider = createRoleProvider(setup.user.authId);
    await service.reconcileSellerActivation(f.a.db, setup.user.id, setup.application.id, provider, f.coordinate);
    await f.a.db.update(users).set(change === "demoted" ? { role: "buyer" } : { active: false }).where(eq(users.id, setup.user.id));
    const beforeUser = await f.user(setup.user.id), beforeRow = await f.request(setup.user.id, setup.requestId), beforeArtifacts = await f.artifacts(setup.user.id), beforeCalls = provider.calls.length;
    await outcome(service.reconcileSellerActivation(f.a.db, setup.user.id, setup.application.id, provider, f.coordinate));
    await accountUnchanged(setup.user.id, beforeUser);
    expect(await f.request(setup.user.id, setup.requestId)).toEqual(beforeRow);
    expect(await f.artifacts(setup.user.id)).toEqual(beforeArtifacts);
    expect(provider.calls.length).toBe(beforeCalls);
    expect(await service.getSellerActivation(f.a.db, setup.user.id)).toMatchObject({ sellerAccessActive: false });
  });

  it("confirmed cleanup of a stale owned provider operation permits a fresh application without restoring old approval", async () => {
    const setup = await approved(), provider = createRoleProvider(setup.user.authId);
    let loseConfirmation = true;
    provider.beforeRead = async () => { if (loseConfirmation && provider.appliedPatches > 0) throw new Error("Injected lost confirmation before invalidation"); };
    provider.afterPatch = async () => { if (loseConfirmation) throw new Error("Injected accepted-but-lost response"); };
    await outcome(service.reconcileSellerActivation(f.a.db, setup.user.id, setup.application.id, provider, f.coordinate));
    expect((await f.user(setup.user.id))!.role).toBe("buyer");
    const original = (await f.request(setup.user.id, setup.requestId))!;
    expect(provider.current().appMetadata).toMatchObject({ role: "seller", plankmarket_seller_activation: original.activationOperationId });
    await f.b.db.update(users).set({ verificationSubmissionId: randomUUID() }).where(eq(users.id, setup.user.id));
    const replacementRequestId = randomUUID();
    await expect(service.saveSellerActivationDraft(f.a.db, setup.user.id, { requestId: replacementRequestId, expectedRevision: null })).rejects.toThrow();
    loseConfirmation = false;
    await outcome(service.reconcileSellerActivation(f.a.db, setup.user.id, setup.application.id, provider, f.coordinate));
    const cleaned = (await f.request(setup.user.id, setup.requestId))!;
    expect(cleaned).toMatchObject({ status: "stale", syncState: "cancelled", claimToken: null, claimExpiresAt: null, activatedAt: null,
      activationOperationId: original.activationOperationId, reviewRequestId: original.reviewRequestId, reviewedBy: original.reviewedBy });
    expect(provider.current().appMetadata).toMatchObject({ role: "buyer", plankmarket_seller_activation: null, fixtureUnrelated: { keep: "unchanged" } });
    expect((await f.user(setup.user.id))!).toMatchObject({ role: "buyer", verified: true });
    await service.saveSellerActivationDraft(f.a.db, setup.user.id, { requestId: replacementRequestId, expectedRevision: null });
    const replacement = (await f.request(setup.user.id, replacementRequestId))!;
    expect(replacement.id).not.toBe(cleaned.id);
    expect(replacement).toMatchObject({ status: "draft", syncState: "none", reviewedBy: null });
    const calls = provider.calls.length;
    await outcome(service.reconcileSellerActivation(f.b.db, setup.user.id, cleaned.id, provider, f.coordinate));
    expect(provider.calls.length).toBe(calls);
    expect(await f.request(setup.user.id, replacementRequestId)).toEqual(replacement);
  });

  it.each(["foreign-marker", "provider-admin"] as const)("stale cleanup cannot overwrite %s authority or unblock replacement without confirmation", async conflict => {
    const setup = await approved(), provider = createRoleProvider(setup.user.authId);
    const metadata = { role: conflict === "provider-admin" ? "admin" : "seller", plankmarket_seller_activation: conflict === "foreign-marker" ? randomUUID() : setup.application.activationOperationId, fixtureUnrelated: { keep: "unchanged" } };
    provider.setMetadata(metadata);
    await f.a.db.update(users).set({ verificationSubmissionId: randomUUID() }).where(eq(users.id, setup.user.id));
    await outcome(service.reconcileSellerActivation(f.a.db, setup.user.id, setup.application.id, provider, f.coordinate));
    expect(provider.calls.filter(call => call.kind === "patch")).toHaveLength(0);
    expect(provider.current().appMetadata).toEqual(metadata);
    expect((await f.request(setup.user.id, setup.requestId))!).toMatchObject({ status: "stale", syncState: "blocked" });
    expect((await f.user(setup.user.id))!.role).toBe("buyer");
    await expect(service.saveSellerActivationDraft(f.a.db, setup.user.id, { requestId: randomUUID(), expectedRevision: null })).rejects.toThrow();
  });

  it("notification insertion failure rolls back review decision/audit so an exact retry can succeed", async () => {
    const setup = await pending(), before = await f.request(setup.user.id, setup.requestId), artifacts = await f.artifacts(setup.user.id);
    const input = { id: setup.application.id, expectedRevision: setup.application.revision, reviewRequestId: randomUUID(), decision: "approved" as const, note: "Current seller evidence confirmed." };
    await f.rejectNotificationsFor(setup.user.id);
    try {
      await expect(service.reviewSellerActivation(f.a.db, f.admin.id, input)).rejects.toThrow();
      expect(await f.request(setup.user.id, setup.requestId)).toEqual(before);
      expect(await f.artifacts(setup.user.id)).toEqual(artifacts);
      expect((await f.user(setup.user.id))!.role).toBe("buyer");
    } finally { await f.allowNotifications(); }
    await service.reviewSellerActivation(f.a.db, f.admin.id, input);
    expect((await f.request(setup.user.id, setup.requestId))!).toMatchObject({ status: "approved", syncState: "pending" });
  });

  it("lost final database commit is recovered from provider state without repeating its role patch", async () => {
    const setup = await approved(), provider = createRoleProvider(setup.user.authId);
    const beforeArtifacts = await f.artifacts(setup.user.id);
    await f.rejectNotificationsFor(setup.user.id);
    try {
      await outcome(service.reconcileSellerActivation(f.a.db, setup.user.id, setup.application.id, provider, f.coordinate));
      expect(provider.appliedPatches).toBe(1);
      expect((await f.user(setup.user.id))!.role).toBe("buyer");
      expect((await f.request(setup.user.id, setup.requestId))!.syncState).not.toBe("complete");
      expect((await f.artifacts(setup.user.id)).notifications).toEqual(beforeArtifacts.notifications);
    } finally { await f.allowNotifications(); }
    await service.reconcileSellerActivation(f.b.db, setup.user.id, setup.application.id, provider, f.coordinate);
    expect((await f.user(setup.user.id))!.role).toBe("seller");
    expect(provider.appliedPatches).toBe(1);
  });
});
