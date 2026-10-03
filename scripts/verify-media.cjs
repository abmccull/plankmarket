/* eslint-disable @typescript-eslint/no-require-imports -- Retained local fixture runner with isolated provider doubles. */
/* Not a standalone release check. Prerequisites: scripts/LOCAL_PROOF_RUNNERS.md.
 * node scripts/verify-media.cjs --help
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const usage = `Retained local media fixture runner; not standalone release acceptance.
Read scripts/LOCAL_PROOF_RUNNERS.md before execution.
Usage: node --conditions=react-server scripts/verify-media.cjs --disposable-local --accepted-proposal
Requires an explicitly prepared disposable database, provider doubles, authorized browser inspection,
and database-proof.json, phase-b-fixtures.json, browser-sessions.json under tmp/design-review-20260929.
These private fixture files are not distributed with the repository. No automatic setup is performed.`;
if (process.argv.includes("--help")) {
  console.log(usage);
  process.exit(0);
}
assert(
  process.argv.includes("--disposable-local"),
  "Requires --disposable-local",
);
assert(
  process.argv.includes("--accepted-proposal"),
  "Root must accept the proposed contract first",
);
const root = process.cwd();
const target =
  "postgresql://postgres@127.0.0.1:55439/plankmarket_bootstrap_design_20260929";
const fixturesDir = path.join(root, "tmp/design-review-20260929");
const missingFixtures = ["database-proof.json", "phase-b-fixtures.json", "browser-sessions.json"]
  .filter((name) => !fs.existsSync(path.join(fixturesDir, name)));
if (missingFixtures.length) {
  throw new Error(`${usage}\nMissing local fixture files: ${missingFixtures.join(", ")}`);
}
const fixture = JSON.parse(
  fs.readFileSync(path.join(fixturesDir, "database-proof.json")),
);
const phase = JSON.parse(
  fs.readFileSync(path.join(fixturesDir, "phase-b-fixtures.json")),
);
assert.equal(fixture.target, target);
assert.equal(phase.target, target);
const base = process.env.MARKETPLACE_UI_BASE_URL || "http://localhost:3101";
const allowedAppOrigins = [
  "http://localhost:3101",
  "http://localhost:3103",
  "https://localhost:3104",
];
assert(allowedAppOrigins.includes(base), "Only isolated app origins allowed");
assert(
  Array.isArray(phase.orders) &&
    phase.orders.length > 0 &&
    phase.orders.every((row) => typeof row.id === "string"),
  "Expected phase.orders array of order objects",
);
assert(
  typeof fixture.fixtures?.buyer === "string",
  "Expected fixture.fixtures.buyer ID",
);
const sessions = JSON.parse(
  fs.readFileSync(path.join(fixturesDir, "browser-sessions.json")),
).sessions;
const runId = randomUUID();
const tag = `MediaProof${runId.slice(0, 8)}`;
const out = path.join(root, "tmp/marketplace-excellence/proof/media", runId);
fs.mkdirSync(out, { recursive: true });
// Clear env-file names without loading their values, then override every integration boundary.
for (const file of [
  ".env",
  ".env.local",
  ".env.production",
  ".env.production.local",
  ".env.test",
  ".env.test.local",
]) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const name = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=/)?.[1];
    if (name) process.env[name] = "";
  }
}
for (const key of Object.keys(process.env))
  if (
    /DATABASE|SUPABASE|STRIPE|REDIS|INNGEST|PRIORITY1|RESEND|ANTHROPIC|TYPESAFE|VERIFICATION|UPLOADTHING|POSTHOG|CRON/.test(
      key,
    )
  )
    process.env[key] = "";
Object.assign(process.env, {
  NODE_ENV: "test",
  SKIP_ENV_VALIDATION: "1",
  DATABASE_URL: target,
  DATABASE_POOL_MAX: "5",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:3102",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-test",
  SUPABASE_SERVICE_ROLE_KEY: "local-test",
  STRIPE_SECRET_KEY: "sk_test_disconnected",
  STRIPE_WEBHOOK_SECRET: "whsec_local",
  STRIPE_TAX_MODE: "disabled",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_local",
  UPSTASH_REDIS_REST_URL: "http://127.0.0.1:3102/redis",
  UPSTASH_REDIS_REST_TOKEN: "local",
  NEXT_PUBLIC_APP_URL: base,
  PRIORITY1_DRY_RUN: "true",
  INNGEST_DEV: "1",
  INNGEST_BASE_URL: "http://127.0.0.1:3102/inngest",
  INNGEST_EVENT_KEY: "local-disconnected",
  VERCEL_ENV: "",
  TYPESAFE_VERIFICATION_ENABLED: "false",
  VERIFICATION_AUTO_APPROVAL_ENABLED: "false",
});
const networkAttempts = [];
const nativeFetch = global.fetch;
const proofAbortController = new AbortController();
global.fetch = async (input, options) => {
  const url = new URL(
    typeof input === "string" || input instanceof URL ? input : input.url,
  );
  assert(
    [...allowedAppOrigins, "http://127.0.0.1:3102"].includes(url.origin),
    `External fetch blocked: ${url.origin}`,
  );
  networkAttempts.push({ origin: url.origin, path: url.pathname });
  const signals = [
    proofAbortController.signal,
    options?.signal,
    input instanceof Request ? input.signal : null,
  ].filter(Boolean);
  return nativeFetch(input, { ...options, signal: AbortSignal.any(signals) });
};
// SKIP_ENV_VALIDATION leaves numeric env values as strings. Use the numeric test default.
delete process.env.DATABASE_POOL_MAX;
require("tsx/cjs");
const postgres = require("postgres");
const { chromium, expect } = require("playwright/test");
const { eq, getTableColumns } = require("drizzle-orm");
const sql = postgres(target, {
  max: 5,
  connection: {
    application_name: "media-proof-proposal",
    statement_timeout: 15000,
  },
});
const { db } = require(path.join(root, "src/server/db/index.ts"));
assert.equal(typeof db.$client.options.max, "number", "The real database pool must have a numeric size");
assert(db.$client.options.max >= 2, "Race proof requires multiple real connections");
const schema = require(path.join(root, "src/server/db/schema/index.ts"));
const { inngest } = require(path.join(root, "src/lib/inngest/client.ts"));
// Domain code stays real. Only UploadThing transport is substituted before application imports.
const eventAttempts = [],
  providerCalls = [],
  inspectionCalls = [],
  records = [];
const ids = {
  listings: [],
  media: [],
  orders: [],
  disputes: [],
  evidence: [],
  users: [],
  buyerRequests: [],
};
const pendingRaceWork = new Set(),
  lockGraphs = [];
let fatalRaceState = false;
const generatedOrderSnapshots = new Map();
const remoteObjects = new Set(),
  providerModes = new Map(),
  inspectionModes = new Map();
const sdkPath = require.resolve("uploadthing/server"),
  originalSdkExports = require(sdkPath);
async function transportDelete(input) {
  const keys = Array.isArray(input) ? input : [input];
  for (const key of keys)
    assert(
      key.startsWith(`${tag}-`),
      "Provider double refuses keys outside this proof",
    );
  const mode = providerModes.get(keys[0]) || { outcome: "success" };
  const call = {
    keys,
    outcome: mode.outcome,
    startedAt: new Date().toISOString(),
  };
  providerCalls.push(call);
  save();
  if (mode.gate) {
    mode.entered.resolve();
    await bounded(mode.gate.promise, "provider gate", 12000);
  }
  let deletedCount = 0;
  for (const key of keys) if (remoteObjects.delete(key)) deletedCount++;
  call.deletedCount = deletedCount;
  if (mode.outcome === "timeout-after-delete") {
    call.error = "Synthetic response lost after delete";
    throw Error(call.error);
  }
  call.confirmed = true;
  return { success: true, deletedCount };
}
class LocalUTApi {
  deleteFiles(keys) {
    return transportDelete(keys);
  }
}
require.cache[sdkPath].exports = { ...originalSdkExports, UTApi: LocalUTApi };
inngest.send = async (events) => {
  const batch = Array.isArray(events) ? events : [events];
  eventAttempts.push(...batch);
  return { ids: batch.map((event) => event.id || randomUUID()) };
};
const guardedFetch = global.fetch;
global.fetch = async (input, options) => {
  const url = new URL(
    typeof input === "string" || input instanceof URL ? input : input.url,
  );
  if (url.origin === "https://utfs.io") {
    const key = decodeURIComponent(url.pathname.split("/").pop());
    assert(
      key.startsWith(`${tag}-`) && inspectionModes.has(key),
      "Only registered synthetic object bytes may be inspected",
    );
    const mode = inspectionModes.get(key);
    inspectionCalls.push({ key, mode, range: options?.headers?.Range });
    if (mode === "timeout") throw Error("Synthetic object inspection timeout");
    const bytes =
      mode === "pdf"
        ? Buffer.from("%PDF-1.7 synthetic proof")
        : Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, ...Array(56).fill(0)]);
    return new Response(bytes, {
      status: 206,
      headers: {
        "content-type": mode === "pdf" ? "application/pdf" : "image/png",
      },
    });
  }
  return guardedFetch(input, options);
};
const { listingRouter } = require(
  path.join(root, "src/server/routers/listing.ts"),
);
const { uploadRouter } = require(
  path.join(root, "src/server/routers/upload.ts"),
);
const { disputeRouter } = require(
  path.join(root, "src/server/routers/dispute.ts"),
);
const { deleteOwnedMediaWithProvider, deleteUploadThingFile } = require(
  path.join(root, "src/server/services/uploadthing-files.ts"),
);
const { persistTrustedUpload } = require(
  path.join(root, "src/server/services/trusted-upload.ts"),
);
const uploadCore = require(path.join(root, "src/app/api/uploadthing/core.ts"));
const { listingFormSchema } = require(
  path.join(root, "src/lib/validators/listing.ts"),
);
const { isPro } = require(path.join(root, "src/lib/pro.ts"));
const { buyerRequestRouter } = require(
  path.join(root, "src/server/routers/buyer-request.ts"),
);
const { createBuyerRequestSchema } = require(
  path.join(root, "src/lib/validators/buyer-request.ts"),
);
const { getPublicListingByRouteParam } = require(
  path.join(root, "src/server/public/listing-reads.ts"),
);
let browser, original, listingTemplate, orderTemplate, baselineMediaIds;
const json = (value) => JSON.parse(JSON.stringify(value));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function bounded(promise, label, ms = 15000) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error(`${label} timed out`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
function save() {
  fs.writeFileSync(
    path.join(out, "results.json"),
    JSON.stringify(
      {
        runId,
        target,
        base,
        tag,
        records,
        ids,
        eventAttempts,
        providerCalls,
        inspectionCalls,
        networkAttempts,
        lockGraphs,
      },
      null,
      2,
    ),
  );
}
async function check(name, fn) {
  const row = { name, startedAt: new Date().toISOString() };
  let isolationFailure;
  try {
    row.evidence = await fn();
    row.passed = true;
  } catch (error) {
    row.passed = false;
    row.error = error.stack || error.message;
  }
  try {
    await drainRaceWork();
  } catch (error) {
    isolationFailure = error;
    row.passed = false;
    row.error = [row.error, error.stack || error.message]
      .filter(Boolean)
      .join("\n");
  }
  records.push(row);
  save();
  console.log(`${row.passed ? "PASS" : "FAIL"} ${name}`);
  if (isolationFailure) throw isolationFailure; // Never start another scenario with unresolved writes.
}
function fields(table, value) {
  const columns = getTableColumns(table);
  return Object.fromEntries(
    Object.entries(value).filter(
      ([key]) => columns[key] && !columns[key].generated,
    ),
  );
}
async function context(userId = phase.seller) {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
  });
  assert(user?.active);
  return {
    db,
    user,
    authUser: {
      id: user.authId,
      email: user.email,
      app_metadata: { role: user.role },
    },
    clientIp: "127.0.0.1",
    supabase: {},
    getAuthAssurance: async () => {
      throw Error("Unexpected provider assurance boundary");
    },
  };
}
const listingRow = (id) =>
  db.query.listings.findFirst({ where: eq(schema.listings.id, id) });
const mediaRow = (id) =>
  db.query.media.findFirst({ where: eq(schema.media.id, id) });
async function listingMedia(id) {
  return sql`select * from media where listing_id=${id} order by id`;
}
async function listingSnapshot(id) {
  return {
    row: json(await listingRow(id)),
    media: json(await listingMedia(id)),
  };
}
async function publicationCount() {
  return (
    await sql`select count(*)::int n from audit_events where actor_id=${phase.seller} and action='listing.published'`
  )[0].n;
}
async function baseline() {
  return {
    listing: json(
      (await sql`select * from listings where id=${phase.listing}`)[0],
    ),
    users: json(
      await sql`select * from users where id in ${sql([phase.seller, fixture.fixtures.buyer])} order by id`,
    ),
    orders: json(
      await sql`select * from orders where id in ${sql(phase.orders.map((row) => row.id))} order by id`,
    ),
    media: baselineMediaIds.length
      ? json(
          await sql`select * from media where id in ${sql(baselineMediaIds)} order by id`,
        )
      : [],
    disputes: json(
      await sql`select * from disputes where order_id in ${sql(phase.orders.map((row) => row.id))} order by id`,
    ),
    evidence: json(
      await sql`select e.* from dispute_evidence e join disputes d on d.id=e.dispute_id where d.order_id in ${sql(phase.orders.map((row) => row.id))} order by e.id`,
    ),
  };
}
async function seedListing(name, patch = {}) {
  const id = randomUUID(),
    now = new Date();
  await db.insert(schema.listings).values(
    fields(schema.listings, {
      ...listingTemplate,
      id,
      slug: `${tag.toLowerCase()}-${id}`,
      title: `${tag} ${name}`,
      sellerId: phase.seller,
      status: "active",
      totalSqFt: 900,
      originalTotalSqFt: 900,
      totalPallets: 1,
      moq: 1,
      moqUnit: "pallets",
      palletWeight: 1000,
      palletLength: 48,
      palletWidth: 40,
      palletHeight: 48,
      freightClass: "70",
      askPricePerSqFt: 2,
      buyNowPrice: null,
      floorPrice: null,
      originalAskPricePerSqFt: 2,
      allowOffers: true,
      materialType: "engineered",
      condition: "new_overstock",
      locationZip: "80202",
      locationCity: "Denver",
      locationState: "CO",
      warehouseId: null,
      specificationEvidenceId: null,
      specificationReviewedAt: null,
      specificationReviewedBy: null,
      taxCodeVerifiedBy: null,
      promotionTier: null,
      promotionExpiresAt: null,
      fullLotOnly: true,
      partialQuantityMarkupPercent: null,
      automaticMarkdownEnabled: false,
      automaticMarkdownFloorPercent: null,
      automaticMarkdownIntervalDays: null,
      automaticMarkdownStartedAt: null,
      automaticMarkdownCurrentStep: 0,
      automaticMarkdownLastAppliedAt: null,
      territoryMode: "unrestricted",
      allowedDestinationStates: [],
      freightPaymentMode: "buyer_pays",
      sellerFreightStates: [],
      freightDropCharge: null,
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
      soldAt: null,
      expiresAt: new Date(Date.now() + 90 * 86400000),
      lastConfirmedAt: now,
      confirmationDueAt: new Date(Date.now() + 14 * 86400000),
      viewsCount: 0,
      watchlistCount: 0,
      offerCount: 0,
      ...patch,
    }),
  );
  ids.listings.push(id);
  save();
  return id;
}
async function seedMedia(listingId = null, patch = {}) {
  const id = randomUUID(),
    key = `${tag}-${id}`;
  await db.insert(schema.media).values({
    id,
    listingId,
    uploaderId: phase.seller,
    url: "/logo.png",
    key,
    fileName: `proof-${id}.png`,
    mimeType: "image/png",
    sortOrder: 0,
    ...patch,
  });
  ids.media.push(id);
  remoteObjects.add(key);
  inspectionModes.set(key, "png");
  save();
  return id;
}
async function seedOrder(withDispute = true, buyerId = fixture.fixtures.buyer) {
  const listingId = await seedListing("evidence order"),
    orderId = randomUUID();
  await seedMedia(listingId);
  await db.insert(schema.orders).values(
    fields(schema.orders, {
      ...orderTemplate,
      id: orderId,
      listingId,
      sellerId: phase.seller,
      buyerId,
      orderNumber: `MP-${orderId.slice(0, 12)}`,
      checkoutRequestId: null,
      checkoutInputFingerprint: null,
      offerId: null,
      status: "delivered",
      paymentStatus: "succeeded",
      deliveredAt: new Date(),
      inventoryReleasedAt: null,
      stripePaymentIntentId: null,
      stripeChargeId: null,
      stripeTransferId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
  );
  ids.orders.push(orderId);
  generatedOrderSnapshots.set(
    orderId,
    json((await sql`select * from orders where id=${orderId}`)[0]),
  );
  if (!withDispute) {
    save();
    return { orderId, listingId };
  }
  const disputeId = randomUUID();
  await db.insert(schema.disputes).values({
    id: disputeId,
    orderId,
    initiatorId: buyerId,
    reason: "Synthetic media proof",
    reasonCode: "other",
    source: "buyer",
    description: `${tag} isolated evidence consistency proof`,
    status: "open",
  });
  ids.disputes.push(disputeId);
  save();
  return { orderId, listingId, disputeId };
}
async function retain(mediaId, disputeId, uploaderId = phase.seller) {
  const id = randomUUID();
  await db
    .insert(schema.disputeEvidence)
    .values({ id, mediaId, disputeId, uploaderId, evidenceType: "photo" });
  ids.evidence.push(id);
  save();
  return id;
}
async function freshBuyer() {
  const source = await db.query.users.findFirst({
    where: eq(schema.users.id, fixture.fixtures.buyer),
  });
  const id = randomUUID();
  await db.insert(schema.users).values(
    fields(schema.users, {
      ...source,
      id,
      authId: randomUUID(),
      email: `${id}@example.invalid`,
      name: `${tag} buyer`,
      businessName: `${tag} buyer company`,
      role: "buyer",
      active: true,
      verified: true,
      verificationStatus: "verified",
      proStatus: "free",
      proExpiresAt: null,
      stripeAccountId: null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      verificationDocUrl: null,
      verificationSubmissionId: null,
    }),
  );
  ids.users.push(id);
  save();
  return { id, caller: buyerRequestRouter.createCaller(await context(id)) };
}
function requestInput(name, mediaIds) {
  return createBuyerRequestSchema.parse({
    materialTypes: ["engineered"],
    minTotalSqFt: 900,
    priceMaxPerSqFt: 3,
    destinationZip: "80202",
    notes: `${tag} ${name}`,
    mediaIds,
  });
}
async function trackBuyerRequests(buyerId) {
  const requests =
    await sql`select * from buyer_requests where buyer_id=${buyerId} order by id`;
  for (const row of requests)
    if (!ids.buyerRequests.includes(row.id)) ids.buyerRequests.push(row.id);
  save();
  return requests;
}
function createInput(name, mediaIds) {
  return listingFormSchema.parse({
    title: `${tag} ${name}`,
    materialType: "engineered",
    condition: "new_overstock",
    totalSqFt: 900,
    totalPallets: 1,
    moq: 1,
    moqUnit: "pallets",
    palletWeight: 1000,
    palletLength: 48,
    palletWidth: 40,
    palletHeight: 48,
    freightClass: "70",
    locationZip: "80202",
    askPricePerSqFt: 2,
    fullLotOnly: true,
    allowOffers: true,
    automaticMarkdownEnabled: false,
    freightPaymentMode: "buyer_pays",
    territoryMode: "unrestricted",
    mediaIds,
  });
}
async function domainReject(
  promise,
  expression = /photo|image|media|evidence|upload|delet|available/i,
) {
  let caught;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  assert(caught, "Expected domain rejection");
  assert(
    [
      "BAD_REQUEST",
      "CONFLICT",
      "FORBIDDEN",
      "NOT_FOUND",
      "UPLOAD_FAILED",
    ].includes(caught.code) || caught.failure,
    `Unexpected non-domain failure: ${caught?.message}`,
  );
  assert.match(caught.message, expression);
  return {
    code: caught.code,
    failure: caught.failure,
    message: caught.message,
  };
}
async function deleteLocal(mediaId, uploaderId = phase.seller) {
  return deleteOwnedMediaWithProvider({
    mediaId,
    uploaderId,
    database: db,
    deleteRemote: (key) => deleteUploadThingFile(key, new LocalUTApi()),
  });
}
function fileFor(row) {
  return {
    key: row.key,
    url: `https://utfs.io/f/${encodeURIComponent(row.key)}`,
    name: row.fileName,
    size: 64,
    type: row.mimeType || "image/png",
  };
}
async function holdRow(table, id) {
  assert(["listings", "media"].includes(table));
  assert(ids[table].includes(id), "Only generated rows may be locked");
  const ready = deferred(),
    release = deferred();
  const work = sql.begin(async (tx) => {
    const [{ pid }] = await tx`select pg_backend_pid() pid`;
    await tx`select id from ${tx(table)} where id=${id} for update`;
    ready.resolve(pid);
    await bounded(release.promise, "held row release", 12000);
  });
  const observed = work.catch((error) => {
    ready.resolve({ error });
    return error;
  });
  let pid;
  try {
    pid = await bounded(ready.promise, "row lock setup");
  } catch (error) {
    release.resolve();
    await observed;
    throw error;
  }
  if (pid?.error) throw pid.error;
  return {
    pid,
    release: async () => {
      release.resolve();
      const result = await observed;
      if (result instanceof Error) throw result;
    },
  };
}
async function waitBlocked(pid, count) {
  const end = Date.now() + 6000;
  let graph = [];
  while (Date.now() < end) {
    graph = await sql`with recursive sessions as materialized (
        select pid,application_name,wait_event_type,pg_blocking_pids(pid) blockers
        from pg_stat_activity where datname=current_database()
      ), chain(pid,path) as (
        select ${pid}::int,array[${pid}::int]
        union all
        select child.pid,parent.path || child.pid
        from chain parent join sessions child on parent.pid=any(child.blockers)
        where not child.pid=any(parent.path)
      )
      select distinct sessions.pid,sessions.application_name,sessions.wait_event_type,sessions.blockers,chain.path
      from chain join sessions using(pid)
      where sessions.pid <> ${pid} and sessions.application_name='plankmarket-app' and sessions.wait_event_type='Lock'
      order by sessions.pid,chain.path`;
    const waitingPids = [...new Set(graph.map((row) => row.pid))];
    if (waitingPids.length >= count) {
      lockGraphs.push({
        rootPid: pid,
        expected: count,
        waitingPids,
        graph: json(graph),
        confirmedAt: new Date().toISOString(),
      });
      save();
      return graph;
    }
    await delay(40);
  }
  lockGraphs.push({
    rootPid: pid,
    expected: count,
    graph: json(graph),
    timedOut: true,
  });
  save();
  throw Error(
    `Expected ${count} distinct real transactions in the lock chain rooted at PID ${pid}; observed ${new Set(graph.map((row) => row.pid)).size}`,
  );
}
const settle = (promise) => {
  const tracked = promise.then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  pendingRaceWork.add(tracked);
  void tracked.finally(() => pendingRaceWork.delete(tracked));
  return tracked;
};
async function releaseAndDrain(lock, work, label) {
  let releaseError;
  try {
    await lock.release();
  } catch (error) {
    releaseError = error;
  }
  // Even an expired/failing barrier must drain the already-started operations.
  await bounded(Promise.all(work.filter(Boolean)), label);
  if (releaseError) throw releaseError;
}
async function drainRaceWork() {
  if (fatalRaceState || !pendingRaceWork.size) return;
  const work = [...pendingRaceWork];
  try {
    await bounded(Promise.all(work), "pending race operations", 30000);
  } catch (cause) {
    fatalRaceState = true;
    proofAbortController.abort();
    for (const mode of providerModes.values()) mode.gate?.resolve();
    // This is this Node proof's private client, never the separate app-server pool.
    // Stop its sockets so an unresolved transaction cannot mutate a later scenario.
    await db.$client.end({ timeout: 0 });
    await bounded(Promise.all(work), "stopped race operations", 10000).catch(
      () => undefined,
    );
    throw new Error(
      `Proof stopped after race cleanup failed; remaining operations: ${pendingRaceWork.size}`,
      { cause },
    );
  }
}
async function browserCheck(name, width, fn) {
  await check(name, async () => {
    const ctx = await browser.newContext({
      viewport: { width, height: 900 },
      ignoreHTTPSErrors: base === "https://localhost:3104",
    });
    await ctx.addCookies([{ ...sessions.seller.cookie, domain: "localhost" }]);
    await ctx.route("**/*", (route) => {
      const url = new URL(route.request().url());
      return [...allowedAppOrigins, "http://127.0.0.1:3102"].includes(
        url.origin,
      )
        ? route.continue()
        : route.abort("blockedbyclient");
    });
    const page = await ctx.newPage();
    page.setDefaultTimeout(15000);
    page.setDefaultNavigationTimeout(45000);
    try {
      const result = await fn(page);
      await page.screenshot({
        path: path.join(out, `${name}.png`),
        fullPage: true,
        animations: "disabled",
        timeout: 15000,
      });
      return result;
    } catch (error) {
      await page
        .screenshot({
          path: path.join(out, `${name}-failed.png`),
          fullPage: true,
        })
        .catch(() => {});
      fs.writeFileSync(
        path.join(out, `${name}-failed.txt`),
        await page
          .locator("body")
          .innerText()
          .catch(() => "Unavailable"),
      );
      throw error;
    } finally {
      await ctx.close();
    }
  });
}
(async () => {
  try {
    const [identity] =
      await sql`select current_database() name,host(inet_server_addr()) address,inet_server_port() port`;
    assert.equal(identity.name, "plankmarket_bootstrap_design_20260929");
    assert.equal(identity.address, "127.0.0.1");
    assert.equal(identity.port, 55439);
    assert(
      db.$client.options.max >= 2,
      "Race proof requires at least two private application connections",
    );
    assert.equal(
      db.$client.options.connection.application_name,
      "plankmarket-app",
    );
    const [guards] =
      await sql`select exists(select 1 from pg_trigger where tgname='dispute_evidence_block_deleting_media' and tgenabled <> 'D') trigger_ready,
      exists(select 1 from pg_constraint where conrelid='dispute_evidence'::regclass and confrelid='media'::regclass and confdeltype='r') retention_ready`;
    assert(
      guards.trigger_ready && guards.retention_ready,
      "Required existing media deletion/evidence migrations must be present",
    );
    baselineMediaIds = (
      await sql`select id from media where uploader_id in ${sql([phase.seller, fixture.fixtures.buyer])}`
    ).map((row) => row.id);
    original = await baseline();
    listingTemplate = await listingRow(phase.listing);
    orderTemplate = await db.query.orders.findFirst({
      where: eq(schema.orders.id, phase.orders[0].id),
    });
    assert(listingTemplate && orderTemplate);
    const sellerContext = await context(),
      buyerContext = await context(fixture.fixtures.buyer);
    assert(
      isPro(sellerContext.user),
      "The media proof requires the existing Pro seller fixture so publication quota cannot mask media failures",
    );
    const seller = listingRouter.createCaller(sellerContext),
      uploads = uploadRouter.createCaller(sellerContext);
    const sellerDisputes = disputeRouter.createCaller(sellerContext),
      buyerDisputes = disputeRouter.createCaller(buyerContext);

    await check("create-without-photo-is-atomic", async () => {
      const startEvents = eventAttempts.length,
        startProviders = providerCalls.length,
        startAudits = await publicationCount(),
        results = [];
      for (const [name, selection] of [
        ["omitted", undefined],
        ["empty", []],
      ]) {
        const input = createInput(`create ${name}`, selection);
        if (selection === undefined) delete input.mediaIds;
        results.push(await domainReject(seller.create(input)));
        const [{ n }] =
          await sql`select count(*)::int n from listings where title=${input.title}`;
        assert.equal(n, 0);
      }
      assert.equal(eventAttempts.length, startEvents);
      assert.equal(providerCalls.length, startProviders);
      assert.equal(await publicationCount(), startAudits);
      return results;
    });
    await check(
      "create-rejects-invalid-photo-selections-without-association",
      async () => {
        const retainedCase = await seedOrder();
        const retained = await seedMedia();
        await retain(retained, retainedCase.disputeId);
        const cases = [
            ["missing", randomUUID()],
            [
              "foreign",
              await seedMedia(null, { uploaderId: fixture.fixtures.buyer }),
            ],
            [
              "claimed",
              await seedMedia(null, {
                deletionClaimToken: randomUUID(),
                deletionClaimedAt: new Date(),
              }),
            ],
            ["pdf", await seedMedia(null, { mimeType: "application/pdf" })],
            ["svg", await seedMedia(null, { mimeType: "image/svg+xml" })],
            ["unknown mime", await seedMedia(null, { mimeType: null })],
            ["retained evidence", retained],
          ],
          results = [];
        const editTarget = await seedListing("invalid edit photo target"),
          savedPhoto = await seedMedia(editTarget),
          savedTarget = await listingSnapshot(editTarget);
        for (const [name, id] of cases) {
          const before = await mediaRow(id),
            input = createInput(`invalid ${name}`, [id]),
            eventCount = eventAttempts.length,
            auditCount = await publicationCount();
          results.push({ name, ...(await domainReject(seller.create(input))) });
          assert.deepEqual(await mediaRow(id), before);
          assert.equal(eventAttempts.length, eventCount);
          assert.equal(await publicationCount(), auditCount);
          const [{ n }] =
            await sql`select count(*)::int n from listings where title=${input.title}`;
          assert.equal(n, 0);
          await domainReject(
            seller.update({
              id: editTarget,
              data: { mediaIds: [savedPhoto, id] },
            }),
          );
          assert.deepEqual(await listingSnapshot(editTarget), savedTarget);
          assert.deepEqual(await mediaRow(id), before);
        }
        return results;
      },
    );
    await check(
      "valid-active-create-and-partial-edit-preserve-photos",
      async () => {
        const photo = await seedMedia(),
          created = await seller.create(
            createInput("valid active creation", [photo]),
          );
        ids.listings.push(created.id);
        assert.equal((await listingRow(created.id)).status, "active");
        assert.equal((await mediaRow(photo)).listingId, created.id);
        await seller.update({
          id: created.id,
          data: { title: `${tag} safe partial edit` },
        });
        assert.equal((await mediaRow(photo)).listingId, created.id);
        return { id: created.id, photo };
      },
    );
    await check(
      "active-empty-save-rolls-back-and-replacement-detaches-without-deleting",
      async () => {
        const id = await seedListing("active last photo"),
          first = await seedMedia(id),
          second = await seedMedia();
        const before = await listingSnapshot(id),
          calls = providerCalls.length;
        await domainReject(
          seller.update({
            id,
            data: { mediaIds: [], title: `${tag} should roll back` },
          }),
        );
        assert.deepEqual(await listingSnapshot(id), before);
        await seller.update({ id, data: { mediaIds: [first, second] } });
        await seller.update({ id, data: { mediaIds: [second] } });
        assert.equal((await mediaRow(first)).listingId, null);
        assert.equal((await mediaRow(second)).listingId, id);
        assert.equal(providerCalls.length, calls);
        return { id, detached: first, retained: second };
      },
    );
    await check(
      "draft-zero-photos-remains-valid-but-cannot-publish",
      async () => {
        const id = await seedListing("zero photo draft", {
          status: "draft",
          publishedAt: null,
        });
        await seller.update({
          id,
          data: { mediaIds: [], title: `${tag} draft without photos` },
        });
        assert.equal((await listingRow(id)).status, "draft");
        await domainReject(seller.publishBulk({ listingIds: [id] }));
        assert.equal((await listingRow(id)).status, "draft");
        return { id };
      },
    );
    await check("attached-delete-refuses-until-saved-detachment", async () => {
      const id = await seedListing("detach before delete"),
        first = await seedMedia(id),
        second = await seedMedia(id),
        calls = providerCalls.length;
      const error = await domainReject(
        uploads.deleteMedia({ id: first }),
        /remove|detach|save|attached/i,
      );
      assert.equal(providerCalls.length, calls);
      assert.equal((await mediaRow(first)).deletionClaimToken, null);
      await seller.update({ id, data: { mediaIds: [second] } });
      await uploads.deleteMedia({ id: first });
      assert.equal(await mediaRow(first), undefined);
      assert.equal(providerCalls.length, calls + 1);
      assert.equal((await mediaRow(second)).listingId, id);
      const buyerPhoto = await seedMedia(null, {
        uploaderId: fixture.fixtures.buyer,
      });
      await uploadRouter
        .createCaller(buyerContext)
        .deleteBuyerMedia({ id: buyerPhoto });
      assert.equal(await mediaRow(buyerPhoto), undefined);
      return { id, first, second, error, buyerPhoto };
    });
    await check(
      "ambiguous-delete-keeps-claim-and-stale-absent-retry-finalizes",
      async () => {
        const id = await seedMedia(),
          row = await mediaRow(id),
          evidence = await seedOrder();
        providerModes.set(row.key, { outcome: "timeout-after-delete" });
        const initial = await domainReject(deleteLocal(id));
        const claimed = await mediaRow(id);
        assert(claimed.deletionClaimToken && claimed.deletionClaimedAt);
        assert(!remoteObjects.has(row.key));
        const calls = providerCalls.length;
        await domainReject(deleteLocal(id));
        assert.equal(
          providerCalls.length,
          calls,
          "Unexpired lease must not repeat provider I/O",
        );
        assert.deepEqual(await uploads.getOwnedMedia({ ids: [id] }), []);
        const targetListing = await seedListing("claimed attachment target");
        await seedMedia(targetListing);
        await domainReject(
          seller.update({ id: targetListing, data: { mediaIds: [id] } }),
        );
        await domainReject(
          sellerDisputes.addEvidence({
            disputeId: evidence.disputeId,
            evidence: [{ mediaId: id, evidenceType: "photo" }],
          }),
        );
        await sql`update media set deletion_claimed_at=clock_timestamp()-interval '6 minutes' where id=${id}`;
        providerModes.set(row.key, { outcome: "success" });
        await deleteLocal(id);
        assert.equal(await mediaRow(id), undefined);
        assert.equal(providerCalls.length, calls + 1);
        assert.equal(providerCalls.at(-1).deletedCount, 0);
        return {
          id,
          initial,
          retainedToken: claimed.deletionClaimToken,
          finalProvider: providerCalls.at(-1),
        };
      },
    );
    for (const outcome of ["success", "timeout-after-delete"])
      await check(
        `old-${outcome}-cannot-clear-or-finalize-new-token`,
        async () => {
          const id = await seedMedia(),
            row = await mediaRow(id),
            gate = deferred(),
            entered = deferred();
          providerModes.set(row.key, { outcome, gate, entered });
          const pending = settle(deleteLocal(id));
          await bounded(entered.promise, "delete claim committed");
          const originalClaim = await mediaRow(id),
            replacement = randomUUID();
          try {
            await sql`update media set deletion_claim_token=${replacement},deletion_claimed_at=clock_timestamp() where id=${id}`;
          } finally {
            gate.resolve();
          }
          const result = await bounded(pending, "old delete finalization");
          assert(result.error);
          const after = await mediaRow(id);
          assert(after);
          assert.equal(after.deletionClaimToken, replacement);
          assert.notEqual(
            after.deletionClaimToken,
            originalClaim.deletionClaimToken,
          );
          return { id, failure: result.error.failure, replacement };
        },
      );
    await check(
      "legacy-attached-expired-claim-can-finalize-with-other-photo-preserved",
      async () => {
        const id = await seedListing("legacy attached claim"),
          retained = await seedMedia(id),
          claimed = await seedMedia(id, {
            deletionClaimToken: randomUUID(),
            deletionClaimedAt: new Date(Date.now() - 6 * 60000),
          });
        remoteObjects.delete((await mediaRow(claimed)).key);
        await deleteLocal(claimed);
        assert.equal(await mediaRow(claimed), undefined);
        assert.equal((await mediaRow(retained)).listingId, id);
        return { id, retained, claimed };
      },
    );
    await check("attach-first-lock-race-blocks-physical-deletion", async () => {
      const id = await seedListing("attach wins"),
        saved = await seedMedia(id),
        attaching = await seedMedia(),
        calls = providerCalls.length,
        lock = await holdRow("media", attaching);
      let attachingCall, deletingCall;
      try {
        attachingCall = settle(
          seller.update({ id, data: { mediaIds: [saved, attaching] } }),
        );
        await waitBlocked(lock.pid, 1);
        deletingCall = settle(deleteLocal(attaching));
        await waitBlocked(lock.pid, 2);
      } finally {
        await releaseAndDrain(
          lock,
          [attachingCall, deletingCall],
          "attach/delete cleanup",
        );
      }
      const [a, d] = await bounded(
        Promise.all([attachingCall, deletingCall]),
        "attach/delete race",
      );
      assert(!a.error, a.error?.message);
      assert(d.error);
      assert.equal((await mediaRow(attaching)).listingId, id);
      assert.equal(providerCalls.length, calls);
      return { id, attaching, deleteFailure: d.error.failure };
    });
    await check("claim-first-blocks-save-and-direct-callback", async () => {
      const id = await seedListing("claim wins"),
        saved = await seedMedia(id),
        candidate = await seedMedia(),
        row = await mediaRow(candidate),
        gate = deferred(),
        entered = deferred();
      providerModes.set(row.key, { outcome: "success", gate, entered });
      const deleting = settle(deleteLocal(candidate));
      await bounded(entered.promise, "provider claim gate");
      const claim = await mediaRow(candidate);
      try {
        await domainReject(
          seller.update({ id, data: { mediaIds: [candidate] } }),
        );
        await domainReject(
          persistTrustedUpload({
            database: db,
            userId: phase.seller,
            listingId: id,
            file: fileFor(row),
            mimeTypeOverride: "image/png",
          }),
        );
        assert.equal(
          (await mediaRow(candidate)).deletionClaimToken,
          claim.deletionClaimToken,
        );
        assert.equal((await mediaRow(saved)).listingId, id);
      } finally {
        gate.resolve();
      }
      const result = await bounded(deleting, "claim-first completion");
      assert(!result.error, result.error?.message);
      return { id, candidate, saved };
    });
    await check(
      "opposite-photo-removals-serialize-with-at-least-one-remaining",
      async () => {
        const id = await seedListing("competing removals"),
          a = await seedMedia(id),
          b = await seedMedia(id),
          lock = await holdRow("listings", id),
          calls = providerCalls.length;
        let first, second;
        try {
          first = settle(seller.update({ id, data: { mediaIds: [a] } }));
          await waitBlocked(lock.pid, 1);
          second = settle(seller.update({ id, data: { mediaIds: [b] } }));
          await waitBlocked(lock.pid, 2);
        } finally {
          await releaseAndDrain(
            lock,
            [first, second],
            "competing edits cleanup",
          );
        }
        const results = await bounded(
          Promise.all([first, second]),
          "competing photo edits",
        );
        for (const result of results)
          assert(!result.error, result.error?.message);
        const after = await listingMedia(id);
        assert.equal(after.length, 1);
        assert([a, b].includes(after[0].id));
        assert.equal(after[0].deletion_claim_token, null);
        assert.equal(providerCalls.length, calls);
        return { id, a, b, selected: after[0].id };
      },
    );
    await check("evidence-attach-first-lock-race-retains-object", async () => {
      const { disputeId } = await seedOrder(),
        id = await seedMedia(),
        lock = await holdRow("media", id),
        calls = providerCalls.length;
      let evidenceCall, deleteCall;
      try {
        evidenceCall = settle(
          sellerDisputes.addEvidence({
            disputeId,
            evidence: [{ mediaId: id, evidenceType: "photo" }],
          }),
        );
        await waitBlocked(lock.pid, 1);
        deleteCall = settle(deleteLocal(id));
        await waitBlocked(lock.pid, 2);
      } finally {
        await releaseAndDrain(
          lock,
          [evidenceCall, deleteCall],
          "evidence/delete cleanup",
        );
      }
      const [e, d] = await bounded(
        Promise.all([evidenceCall, deleteCall]),
        "evidence/delete race",
      );
      assert(!e.error, e.error?.message);
      assert.equal(d.error?.failure, "evidence_retained");
      const rows =
        await sql`select id from dispute_evidence where media_id=${id}`;
      assert.equal(rows.length, 1);
      ids.evidence.push(rows[0].id);
      assert(await mediaRow(id));
      assert.equal(providerCalls.length, calls);
      return { id, disputeId };
    });
    await check(
      "claim-first-blocks-dispute-create-add-and-database-bypass",
      async () => {
        const current = await seedOrder(),
          newOrder = await seedOrder(false),
          sellerPhoto = await seedMedia(null, {
            deletionClaimToken: randomUUID(),
            deletionClaimedAt: new Date(),
          }),
          buyerPhoto = await seedMedia(null, {
            uploaderId: fixture.fixtures.buyer,
            deletionClaimToken: randomUUID(),
            deletionClaimedAt: new Date(),
          });
        await domainReject(
          sellerDisputes.addEvidence({
            disputeId: current.disputeId,
            evidence: [{ mediaId: sellerPhoto, evidenceType: "photo" }],
          }),
        );
        await domainReject(
          buyerDisputes.create({
            orderId: newOrder.orderId,
            reasonCode: "other",
            description:
              "Synthetic claimed media must never become usable evidence.",
            evidence: [{ mediaId: buyerPhoto, evidenceType: "photo" }],
          }),
        );
        await assert.rejects(
          sql`insert into dispute_evidence(id,dispute_id,media_id,uploader_id,evidence_type) values(${randomUUID()},${current.disputeId},${sellerPhoto},${phase.seller},'photo')`,
          (error) =>
            /media deletion is already in progress/i.test(error.message),
        );
        assert.equal(
          (
            await sql`select id from disputes where order_id=${newOrder.orderId}`
          ).length,
          0,
        );
        assert.equal(
          (
            await sql`select id from dispute_evidence where media_id in ${sql([sellerPhoto, buyerPhoto])}`
          ).length,
          0,
        );
        return { current, newOrder, sellerPhoto, buyerPhoto };
      },
    );
    await check(
      "direct-callback-rejects-claimed-retained-and-other-parent-media",
      async () => {
        const id = await seedListing("callback target"),
          saved = await seedMedia(id),
          evidence = await seedOrder(),
          retained = await seedMedia();
        await retain(retained, evidence.disputeId);
        const other = await seedListing("callback other parent");
        const candidates = [
          retained,
          await seedMedia(null, {
            deletionClaimToken: randomUUID(),
            deletionClaimedAt: new Date(),
          }),
          await seedMedia(other),
          await seedMedia(null, { uploaderId: fixture.fixtures.buyer }),
          await seedMedia(null, { mimeType: "application/pdf" }),
        ];
        for (const candidate of candidates) {
          const before = await mediaRow(candidate);
          await domainReject(
            persistTrustedUpload({
              database: db,
              userId: phase.seller,
              listingId: id,
              file: fileFor(before),
              mimeTypeOverride: before.mimeType,
            }),
          );
          assert.deepEqual(await mediaRow(candidate), before);
        }
        assert.equal((await mediaRow(saved)).listingId, id);
        return { id, candidates, saved };
      },
    );
    await check(
      "real-listing-callback-is-idempotent-and-preserves-existing-photo",
      async () => {
        const id = await seedListing("real callback"),
          saved = await seedMedia(id),
          key = `${tag}-${randomUUID()}`;
        remoteObjects.add(key);
        inspectionModes.set(key, "png");
        const args = {
          metadata: { userId: phase.seller, listingId: id },
          file: {
            key,
            url: `https://utfs.io/f/${key}`,
            name: "callback-proof.png",
            size: 64,
            type: "image/png",
          },
        };
        const first =
          await uploadCore.ourFileRouter.listingImageUploader.onUploadComplete(
            args,
          );
        ids.media.push(first.id);
        save();
        const second =
          await uploadCore.ourFileRouter.listingImageUploader.onUploadComplete(
            args,
          );
        assert.equal(first.id, second.id);
        assert.equal((await mediaRow(first.id)).listingId, id);
        assert.equal((await mediaRow(saved)).listingId, id);
        assert.equal(
          (await sql`select id from media where key=${key}`).length,
          1,
        );
        return { id, first, second };
      },
    );
    await check(
      "inspection-timeout-never-deletes-saved-or-retained-object",
      async () => {
        const id = await seedListing("inspection timeout"),
          attached = await seedMedia(id),
          evidence = await seedOrder(),
          retained = await seedMedia();
        await retain(retained, evidence.disputeId);
        const start = providerCalls.length;
        for (const mediaId of [attached, retained]) {
          const row = await mediaRow(mediaId);
          inspectionModes.set(row.key, "timeout");
          await assert.rejects(
            uploadCore.validateListingOrBuyerUploadThingFile(fileFor(row)),
            /inspect|validat|upload/i,
          );
          assert.deepEqual(await mediaRow(mediaId), row);
          assert(remoteObjects.has(row.key));
        }
        assert.equal(
          providerCalls.length,
          start,
          "An inspection outage is not authorization to delete an existing object",
        );
        return { attached, retained };
      },
    );
    await check(
      "zero-photo-reconfirmation-requires-replacement-and-claimed-reads-exclude",
      async () => {
        const id = await seedListing("legacy photo required", {
          lastConfirmedAt: new Date(Date.now() - 20 * 86400000),
          confirmationDueAt: new Date(Date.now() - 6 * 86400000),
        });
        const claimed = await seedMedia(id, {
            deletionClaimToken: randomUUID(),
            deletionClaimedAt: new Date(),
          }),
          before = await listingSnapshot(id);
        await domainReject(
          seller.reconfirm({
            id,
            expectedUpdatedAt: new Date(before.row.updatedAt),
          }),
        );
        assert.deepEqual(await listingSnapshot(id), before);
        assert.equal(
          (await uploads.getListingMedia({ listingId: id })).some(
            (row) => row.id === claimed,
          ),
          false,
        );
        for (const mime of [null, "application/pdf", "image/svg+xml"]) {
          const legacy = await seedListing(
            `legacy unusable ${mime || "unknown"}`,
            { confirmationDueAt: new Date(Date.now() - 86400000) },
          );
          await seedMedia(legacy, { mimeType: mime });
          const unchanged = await listingSnapshot(legacy);
          await domainReject(seller.reconfirm({ id: legacy }));
          assert.deepEqual(await listingSnapshot(legacy), unchanged);
        }
        const cleanId = await seedListing("legacy no photos repair", {
          lastConfirmedAt: new Date(Date.now() - 20 * 86400000),
          confirmationDueAt: new Date(Date.now() - 6 * 86400000),
        });
        const replacement = await seedMedia();
        await seller.update({ id: cleanId, data: { mediaIds: [replacement] } });
        const saved = await listingRow(cleanId);
        await seller.reconfirm({
          id: cleanId,
          expectedUpdatedAt: saved.updatedAt,
        });
        assert((await listingRow(cleanId)).confirmationDueAt > new Date());
        return { id, claimed, cleanId, replacement };
      },
    );

    await check("buyer-request-invalid-mixed-media-is-atomic", async () => {
      const buyer = await freshBuyer(),
        good = await seedMedia(null, { uploaderId: buyer.id });
      const evidenceOrder = await seedOrder(true, buyer.id),
        retained = await seedMedia(null, { uploaderId: buyer.id });
      await retain(retained, evidenceOrder.disputeId, buyer.id);
      const cases = [
          ["missing", randomUUID()],
          ["foreign", await seedMedia()],
          [
            "claimed",
            await seedMedia(null, {
              uploaderId: buyer.id,
              deletionClaimToken: randomUUID(),
              deletionClaimedAt: new Date(),
            }),
          ],
          [
            "pdf",
            await seedMedia(null, {
              uploaderId: buyer.id,
              mimeType: "application/pdf",
            }),
          ],
          [
            "svg",
            await seedMedia(null, {
              uploaderId: buyer.id,
              mimeType: "image/svg+xml",
            }),
          ],
          ["retained", retained],
        ],
        outcomes = [];
      assert.equal(
        (await trackBuyerRequests(buyer.id)).length,
        0,
        "New buyer fixture must not have quota-consuming requests",
      );
      for (const [name, candidate] of cases) {
        const beforeGood = await mediaRow(good),
          beforeCandidate = await mediaRow(candidate),
          startEvents = eventAttempts.length,
          startProvider = providerCalls.length;
        let outcome;
        try {
          outcome = await domainReject(
            buyer.caller.create(
              requestInput(`invalid request ${name}`, [good, candidate]),
            ),
          );
        } finally {
          await trackBuyerRequests(buyer.id);
        }
        assert.equal(
          (await trackBuyerRequests(buyer.id)).length,
          0,
          "Invalid media must roll back the inserted request",
        );
        assert.deepEqual(await mediaRow(good), beforeGood);
        assert.deepEqual(await mediaRow(candidate), beforeCandidate);
        assert.equal(eventAttempts.length, startEvents);
        assert.equal(providerCalls.length, startProvider);
        outcomes.push({ name, candidate, outcome });
      }
      return { buyerId: buyer.id, good, outcomes };
    });
    await check(
      "buyer-request-owned-raster-and-optional-empty-photos-succeed",
      async () => {
        const buyer = await freshBuyer(),
          photo = await seedMedia(null, { uploaderId: buyer.id });
        let created, empty;
        try {
          created = await buyer.caller.create(
            requestInput("valid raster request", [photo]),
          );
          ids.buyerRequests.push(created.id);
          save();
          empty = await buyer.caller.create(
            requestInput("optional empty request", []),
          );
          ids.buyerRequests.push(empty.id);
          save();
        } finally {
          await trackBuyerRequests(buyer.id);
        }
        assert.equal(created.buyerId, buyer.id);
        assert.equal((await mediaRow(photo)).buyerRequestId, created.id);
        assert.equal((await mediaRow(photo)).listingId, null);
        const rows =
          await sql`select id from media where buyer_request_id=${created.id}`;
        assert.deepEqual(
          rows.map((row) => row.id),
          [photo],
        );
        assert.equal(
          (await sql`select id from media where buyer_request_id=${empty.id}`)
            .length,
          0,
        );
        assert.equal((await trackBuyerRequests(buyer.id)).length, 2);
        // Legacy request feed must filter before limit:1; distinct URLs make cover identity observable.
        const goodUrl = `/logo.png?usable=${photo}`;
        await sql`update media set url=${goodUrl},sort_order=10 where id=${photo}`;
        const invalidCover = await seedMedia(null, {
          uploaderId: buyer.id,
          buyerRequestId: created.id,
          sortOrder: 0,
          url: "/logo.png?invalid=claimed",
          deletionClaimToken: randomUUID(),
          deletionClaimedAt: new Date(),
        });
        const pdf = await seedMedia(null, {
          uploaderId: buyer.id,
          buyerRequestId: created.id,
          sortOrder: 1,
          url: "/logo.png?invalid=pdf",
          mimeType: "application/pdf",
        });
        const retained = await seedMedia(null, {
          uploaderId: buyer.id,
          buyerRequestId: created.id,
          sortOrder: 2,
          url: "/logo.png?invalid=retained",
        });
        const evidence = await seedOrder(true, buyer.id);
        await retain(retained, evidence.disputeId, buyer.id);
        const feed = await buyerRequestRouter
          .createCaller(sellerContext)
          .browse({
            minSqFt: 900,
            maxSqFt: 900,
            limit: 50,
            page: 1,
            sort: "newest",
          });
        const card = feed.items.find((item) => item.id === created.id);
        assert(card, "New valid request must appear in the seller demand feed");
        assert.equal(
          card.thumbnailUrl,
          goodUrl,
          "Buyer-request browse must exclude invalid covers before limit:1",
        );
        return {
          buyerId: buyer.id,
          createdId: created.id,
          emptyId: empty.id,
          photo,
          excludedCoverIds: [invalidCover, pdf, retained],
          thumbnailUrl: card.thumbnailUrl,
        };
      },
    );
    await check(
      "public-detail-slug-browse-and-ssr-exclude-ineligible-cover-media",
      async () => {
        const id = await seedListing("public media boundary"),
          good = await seedMedia(id, { sortOrder: 10 }),
          evidence = await seedOrder();
        const claimed = await seedMedia(id, {
          sortOrder: 0,
          deletionClaimToken: randomUUID(),
          deletionClaimedAt: new Date(),
        });
        const pdf = await seedMedia(id, {
            sortOrder: 1,
            mimeType: "application/pdf",
          }),
          svg = await seedMedia(id, {
            sortOrder: 2,
            mimeType: "image/svg+xml",
          });
        const retained = await seedMedia(id, { sortOrder: 3 }),
          unknown = await seedMedia(id, { sortOrder: 4, mimeType: null });
        await retain(retained, evidence.disputeId);
        const beforeMedia = json(await listingMedia(id)),
          row = await listingRow(id);
        const publicCaller = listingRouter.createCaller({
          ...buyerContext,
          user: null,
          authUser: null,
        });
        const detail = await publicCaller.getById({ id }),
          slug = await publicCaller.getBySlug({ slug: row.slug });
        const browse = await publicCaller.list({ query: row.title, limit: 20 }),
          card = browse.items.find((item) => item.id === id);
        assert(card, "Valid lot must remain visible in browse");
        const serverId = await getPublicListingByRouteParam(id, new Headers()),
          serverSlug = await getPublicListingByRouteParam(
            row.slug,
            new Headers(),
          );
        const outputs = {
          detail: detail.media,
          slug: slug.media,
          cover: card.media,
          serverId: serverId.listing.media,
          serverSlug: serverSlug.listing.media,
        };
        for (const [surface, media] of Object.entries(outputs))
          assert.deepEqual(
            media.map((item) => item.id),
            [good],
            `${surface} must filter unusable media before selecting its cover`,
          );
        assert.deepEqual(
          json(await listingMedia(id)),
          beforeMedia,
          "Read filtering must not rewrite legacy media",
        );
        return {
          id,
          good,
          excluded: [claimed, pdf, svg, retained, unknown],
          returned: Object.fromEntries(
            Object.entries(outputs).map(([surface, media]) => [
              surface,
              media.map((item) => item.id),
            ]),
          ),
        };
      },
    );
    await check(
      "direct-callback-capacity-rejects-21st-but-replays-existing",
      async () => {
        const id = await seedListing("callback capacity"),
          attached = [];
        for (let i = 0; i < 20; i++)
          attached.push(await seedMedia(id, { sortOrder: i }));
        const candidate = await seedMedia(),
          row = await mediaRow(candidate),
          before = await listingSnapshot(id),
          candidateBefore = json(row);
        await domainReject(
          persistTrustedUpload({
            database: db,
            userId: phase.seller,
            listingId: id,
            file: fileFor(row),
            mimeTypeOverride: "image/png",
          }),
          /20|photo|image/i,
        );
        assert.deepEqual(await listingSnapshot(id), before);
        assert.deepEqual(json(await mediaRow(candidate)), candidateBefore);
        const first = await mediaRow(attached[0]);
        const replay = await persistTrustedUpload({
          database: db,
          userId: phase.seller,
          listingId: id,
          file: fileFor(first),
          mimeTypeOverride: "image/png",
        });
        assert.equal(replay.id, first.id);
        assert.deepEqual(await listingSnapshot(id), before);
        return { id, rejected: candidate, count: 20, replayId: replay.id };
      },
    );
    await check(
      "concurrent-same-key-callbacks-converge-on-one-associated-row",
      async () => {
        const id = await seedListing("concurrent callbacks"),
          saved = await seedMedia(id),
          key = `${tag}-${randomUUID()}`;
        remoteObjects.add(key);
        inspectionModes.set(key, "png");
        const input = {
          database: db,
          userId: phase.seller,
          listingId: id,
          mimeTypeOverride: "image/png",
          file: {
            key,
            url: `https://utfs.io/f/${key}`,
            name: "concurrent-proof.png",
            size: 64,
            type: "image/png",
          },
        };
        const lock = await holdRow("listings", id);
        let first, second;
        try {
          first = settle(persistTrustedUpload(input));
          await waitBlocked(lock.pid, 1);
          second = settle(persistTrustedUpload(input));
          await waitBlocked(lock.pid, 2);
        } finally {
          try {
            await releaseAndDrain(
              lock,
              [first, second],
              "concurrent callbacks cleanup",
            );
          } finally {
            const rows = await sql`select id from media where key=${key}`;
            for (const row of rows)
              if (!ids.media.includes(row.id)) ids.media.push(row.id);
            save();
          }
        }
        const [a, b] = await Promise.all([first, second]);
        assert(!a.error, a.error?.message);
        assert(!b.error, b.error?.message);
        assert.equal(a.value.id, b.value.id);
        assert.equal((await mediaRow(a.value.id)).listingId, id);
        assert.equal(
          (await sql`select id from media where key=${key}`).length,
          1,
        );
        assert.equal((await mediaRow(saved)).listingId, id);
        assert.equal((await listingMedia(id)).length, 2);
        return {
          id,
          key,
          sharedMediaId: a.value.id,
          saved,
          realBlockedTransactions: 2,
        };
      },
    );

    browser = await chromium.launch({ headless: true });
    for (const width of [390, 1440])
      await browserCheck(
        `edit-last-photo-error-preserves-draft-${width}`,
        width,
        async (page) => {
          const id = await seedListing(`browser last photo ${width}`),
            photo = await seedMedia(id),
            row = await mediaRow(photo),
            before = await listingSnapshot(id);
          await page.goto(`${base}/seller/listings/${id}/edit`);
          await expect(
            page.getByRole("button", {
              name: `Delete ${row.fileName}`,
              exact: true,
            }),
          ).toBeVisible({ timeout: 30000 });
          const title = page.getByLabel("Listing Title", { exact: false });
          await title.fill(`${tag} unsaved title ${width}`);
          await page
            .getByRole("button", {
              name: `Delete ${row.fileName}`,
              exact: true,
            })
            .click();
          await page
            .getByRole("button", { name: "Save Changes", exact: true })
            .click();
          await expect(
            page
              .locator("[data-sonner-toast]")
              .filter({
                hasText: /at least one.*photo|add.*photo|photo.*required/i,
              })
              .first(),
          ).toBeVisible({ timeout: 15000 });
          await expect(
            page.getByRole("button", { name: "Save Changes", exact: true }),
          ).toBeEnabled({ timeout: 15000 });
          await expect(title).toHaveValue(`${tag} unsaved title ${width}`);
          await expect(
            page.getByRole("button", {
              name: `Delete ${row.fileName}`,
              exact: true,
            }),
          ).toHaveCount(0);
          assert.deepEqual(await listingSnapshot(id), before);
          await page.screenshot({
            path: path.join(out, `edit-local-draft-${width}.png`),
            fullPage: true,
          });
          await page.reload();
          await expect(
            page.getByRole("button", {
              name: `Delete ${row.fileName}`,
              exact: true,
            }),
          ).toBeVisible({ timeout: 30000 });
          return { id, photo, savedRowUnchanged: true };
        },
      );
    await browserCheck(
      "edit-two-photos-save-detaches-one",
      390,
      async (page) => {
        const id = await seedListing("browser remove one of two", {
            finish: "matte",
            grade: "select",
            thickness: 0.5,
            width: 7,
            wearLayer: 3,
            reasonCode: "warehouse_clearance",
          }),
          first = await seedMedia(id),
          second = await seedMedia(id),
          row = await mediaRow(first);
        const beforeEdit = await listingRow(id);
        await page.goto(`${base}/seller/listings/${id}/edit`);
        await expect(
          page.getByRole("button", {
            name: `Delete ${row.fileName}`,
            exact: true,
          }),
        ).toBeVisible({ timeout: 30000 });
        await page
          .getByRole("button", { name: `Delete ${row.fileName}`, exact: true })
          .click();
        await page
          .getByRole("button", { name: "Save Changes", exact: true })
          .click();
        await expect
          .poll(async () => (await mediaRow(first)).listingId, {
            timeout: 15000,
          })
          .toBe(null);
        assert.equal((await mediaRow(second)).listingId, id);
        const afterEdit = await listingRow(id);
        const preservedFields = [
          "materialType",
          "condition",
          "moq",
          "moqUnit",
          "totalSqFt",
          "askPricePerSqFt",
          "buyNowPrice",
          "floorPrice",
          "fullLotOnly",
          "partialQuantityMarkupPercent",
          "freightPaymentMode",
          "sellerFreightStates",
          "freightDropCharge",
          "territoryMode",
          "allowedDestinationStates",
          "allowOffers",
          "automaticMarkdownEnabled",
          "automaticMarkdownFloorPercent",
          "automaticMarkdownIntervalDays",
          "allowSampleRequests",
          "installationMethod",
          "waterResistance",
          "packagingType",
          "finish",
          "grade",
          "reasonCode",
        ];
        preservedFields.push("thickness", "width", "wearLayer");
        for (const field of preservedFields)
          assert.deepEqual(
            afterEdit[field],
            beforeEdit[field],
            `Photo-only edit must preserve ${field}`,
          );
        await page.goto(`${base}/seller/listings/${id}/edit`);
        await expect(
          page.getByRole("button", {
            name: `Delete ${(await mediaRow(second)).fileName}`,
            exact: true,
          }),
        ).toBeVisible({ timeout: 30000 });
        await expect(
          page.getByRole("button", {
            name: `Delete ${row.fileName}`,
            exact: true,
          }),
        ).toHaveCount(0);
        return { id, detached: first, retained: second, preservedFields };
      },
    );
    await browserCheck(
      "inventory-zero-photo-reconfirm-shows-recovery",
      390,
      async (page) => {
        const id = await seedListing("browser zero photo overdue", {
            lastConfirmedAt: new Date(Date.now() - 20 * 86400000),
            confirmationDueAt: new Date(Date.now() - 6 * 86400000),
          }),
          before = await listingSnapshot(id);
        await page.goto(
          `${base}/seller/listings?q=${encodeURIComponent(tag + " browser zero photo overdue")}&status=needs_confirmation`,
        );
        await page
          .getByRole("button", { name: "Confirm availability", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Yes, still available", exact: true })
          .click();
        await expect(
          page
            .locator("[data-sonner-toast]")
            .filter({ hasText: /photo|image/i })
            .first(),
        ).toBeVisible({ timeout: 15000 });
        assert.deepEqual(await listingSnapshot(id), before);
        await expect(
          page.locator(`a[href='/seller/listings/${id}/edit']`).first(),
        ).toBeVisible();
        return { id, confirmationUnchanged: true };
      },
    );
  } finally {
    await browser?.close();
    for (const id of ids.listings)
      await sql`update listings set status='archived' where id=${id}`;
    if (original)
      await check(
        "original-fixtures-and-financial-records-preserved",
        async () => {
          assert.deepEqual(await baseline(), original);
          for (const [id, snapshot] of generatedOrderSnapshots)
            assert.deepEqual(
              json((await sql`select * from orders where id=${id}`)[0]),
              snapshot,
              "Media actions changed a generated order/commercial snapshot",
            );
          return {
            listing: phase.listing,
            users: [phase.seller, fixture.fixtures.buyer],
            orders: phase.orders.map((row) => row.id),
            generatedOrdersChecked: generatedOrderSnapshots.size,
            originalMediaCount: baselineMediaIds.length,
          };
        },
      );
    save();
    require.cache[sdkPath].exports = originalSdkExports;
    await sql.end();
  }
  console.log(
    JSON.stringify({
      artifact: out,
      passed: records.filter((row) => row.passed).length,
      failed: records.filter((row) => !row.passed).length,
    }),
  );
  process.exit(records.some((row) => !row.passed) ? 1 : 0);
})().catch((error) => {
  console.error(error.stack);
  save();
  process.exit(1);
});
