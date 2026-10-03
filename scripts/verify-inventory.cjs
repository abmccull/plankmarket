/* eslint-disable @typescript-eslint/no-require-imports -- Real-server integration runner with isolated local provider doubles. */
/* Accepted integration proof. Failure modes/contracts: tmp/marketplace-excellence/inventory-proof-contract.md.
 * Real database and router handlers, local provider doubles. No live fixtures.
 * node --conditions=react-server scripts/verify-inventory.cjs --disposable-local --accepted-proposal
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
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
const tag = `InventoryProof${runId.slice(0, 8)}`;
const out = path.join(
  root,
  "tmp/marketplace-excellence/proof/inventory-proposal",
  runId,
);
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
global.fetch = async (input, options) => {
  const url = new URL(
    typeof input === "string" || input instanceof URL ? input : input.url,
  );
  assert(
    [...allowedAppOrigins, "http://127.0.0.1:3102"].includes(url.origin),
    `External fetch blocked: ${url.origin}`,
  );
  networkAttempts.push({ origin: url.origin, path: url.pathname });
  return nativeFetch(input, options);
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
    application_name: "inventory-proof-proposal",
    statement_timeout: 15000,
  },
});
const { db } = require(path.join(root, "src/server/db/index.ts"));
assert.equal(typeof db.$client.options.max, "number", "The real database pool must have a numeric size");
assert(db.$client.options.max >= 2, "Race proof requires multiple real connections");
const schema = require(path.join(root, "src/server/db/schema/index.ts"));
const { inngest } = require(path.join(root, "src/lib/inngest/client.ts"));
const eventAttempts = [];
let failEventSend = false;
const failEventListingIds = new Set();
inngest.send = async (events) => {
  const batch = Array.isArray(events) ? events : [events];
  const failed =
    failEventSend ||
    batch.some((event) => failEventListingIds.has(event.data?.listingId));
  eventAttempts.push(...batch.map((event) => ({ event, accepted: !failed })));
  if (failed) throw Error("Synthetic disconnected event transport");
  return { ids: batch.map((event) => event.id || randomUUID()) };
};
const { listingRouter } = require(
  path.join(root, "src/server/routers/listing.ts"),
);
const { listingFormSchema } = require(
  path.join(root, "src/lib/validators/listing.ts"),
);
const records = [],
  ids = { listings: [], users: [], orders: [], media: [] };
let browser, original, template, orderTemplate;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const json = (value) => JSON.parse(JSON.stringify(value));
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
        networkAttempts,
      },
      null,
      2,
    ),
  );
}
async function check(name, fn) {
  const row = { name, startedAt: new Date().toISOString() };
  try {
    row.evidence = await fn();
    row.passed = true;
  } catch (error) {
    row.passed = false;
    row.error = error.message;
  }
  records.push(row);
  save();
  console.log(`${row.passed ? "PASS" : "FAIL"} ${name}`);
}
async function caller(userId = phase.seller) {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
  });
  assert(user?.active, "Proof caller must be an active local user");
  return listingRouter.createCaller({
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
      throw Error("Unexpected assurance/provider boundary");
    },
  });
}
async function snapshotBaseline() {
  return {
    listing: json(
      (await sql`select * from listings where id=${phase.listing}`)[0],
    ),
    user: json((await sql`select * from users where id=${phase.seller}`)[0]),
    orders: json(
      await sql`select * from orders where id in ${sql(phase.orders.map((row) => row.id))} order by id`,
    ),
  };
}
function valuesForInsert(table, values) {
  const columns = getTableColumns(table);
  return Object.fromEntries(
    Object.entries(values).filter(
      ([key]) => columns[key] && !columns[key].generated,
    ),
  );
}
async function listing(name, patch = {}, photo = true) {
  const id = randomUUID();
  const now = new Date();
  const values = valuesForInsert(schema.listings, {
    ...template,
    id,
    slug: `${tag.toLowerCase()}-${id}`,
    title: `${tag} ${name}`,
    status: "draft",
    totalSqFt: 900,
    originalTotalSqFt: 900,
    totalPallets: 1,
    moq: 1,
    moqUnit: "pallets",
    palletWeight: 1000,
    palletLength: 48,
    palletWidth: 40,
    palletHeight: 48,
    askPricePerSqFt: 2,
    buyNowPrice: null,
    floorPrice: null,
    allowOffers: true,
    locationZip: "80202",
    locationCity: "Denver",
    locationState: "CO",
    freightClass: "70",
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
    territoryMode: "unrestricted",
    allowedDestinationStates: [],
    freightPaymentMode: "buyer_pays",
    sellerFreightStates: [],
    freightDropCharge: null,
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
    soldAt: null,
    expiresAt: new Date(Date.now() + 90 * 86400000),
    lastConfirmedAt: now,
    confirmationDueAt: new Date(Date.now() + 14 * 86400000),
    viewsCount: 0,
    watchlistCount: 0,
    offerCount: 0,
    ...patch,
  });
  await db.insert(schema.listings).values(values);
  ids.listings.push(id);
  save();
  if (photo) await attachPhoto(id, values.sellerId);
  return id;
}
async function attachPhoto(listingId, uploaderId = phase.seller) {
  const id = randomUUID();
  await db.insert(schema.media).values({
    id,
    listingId,
    uploaderId,
    url: "/logo.png",
    mimeType: "image/png",
    fileName: "synthetic-proof-image.png",
    sortOrder: 0,
  });
  ids.media.push(id);
  return id;
}
async function fresh(id) {
  return db.query.listings.findFirst({ where: eq(schema.listings.id, id) });
}
async function newSeller() {
  const source = await db.query.users.findFirst({
    where: eq(schema.users.id, phase.seller),
  });
  const id = randomUUID();
  await db.insert(schema.users).values({
    ...source,
    id,
    authId: randomUUID(),
    email: `${id}@example.invalid`,
    name: `${tag} free seller`,
    businessName: `${tag} proof company`,
    stripeAccountId: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    verificationDocUrl: null,
    verificationSubmissionId: null,
    proStatus: "free",
    proExpiresAt: null,
    verified: true,
    active: true,
    verificationStatus: "verified",
  });
  ids.users.push(id);
  save();
  return id;
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
async function rejectedOrSkipped(id, c, label) {
  const before = json(await fresh(id));
  let response, error;
  try {
    response = await c.publishBulk({ listingIds: [id] });
  } catch (cause) {
    error = { code: cause.code, message: cause.message };
    assert(
      ["BAD_REQUEST", "CONFLICT", "FORBIDDEN", "NOT_FOUND"].includes(
        cause.code,
      ),
      `${label}: unexpected failure`,
    );
  }
  const after = json(await fresh(id));
  assert.deepEqual(after, before, `${label} must not mutate invalid listing`);
  if (response) {
    assert(!response.publishedIds.includes(id));
    const skipped = response.skippedDetails?.find((row) => row.id === id);
    assert(
      skipped?.title && skipped?.message,
      `${label}: actionable skippedDetails required`,
    );
  }
  return { id, response, error };
}
async function auditCount(id) {
  return Number(
    (
      await sql`select count(*)::int n from audit_events where entity_type='listing' and entity_id=${id}`
    )[0].n,
  );
}
async function publicationAudit(id, action) {
  return sql`select action,idempotency_key,metadata from audit_events where entity_type='listing' and entity_id=${id} and action=${action}`;
}
function capturePublicationRecovery() {
  // Capture the real registered handlers, not a copied implementation. No queue/service runs.
  const modulePath = require.resolve(
    path.join(
      root,
      "src/lib/inngest/functions/listing-publication-recovery.ts",
    ),
  );
  const priorModule = require.cache[modulePath],
    createFunction = inngest.createFunction;
  const definitions = [];
  inngest.createFunction = (config, trigger, handler) => {
    definitions.push({ config, trigger, handler });
    return { proofCapturedFunction: config.id };
  };
  try {
    delete require.cache[modulePath];
    require(modulePath);
  } finally {
    inngest.createFunction = createFunction;
    if (priorModule) require.cache[modulePath] = priorModule;
    else delete require.cache[modulePath];
  }
  return definitions;
}
async function invokeRecovery(definition, event, allowedListingIds) {
  const steps = [],
    events = [],
    loaded = [];
  const result = await definition.handler({
    event,
    step: {
      run: async (name, callback) => {
        assert(
          !steps.includes(name),
          `Duplicate step name within one recovery page: ${name}`,
        );
        steps.push(name);
        const value = await callback();
        if (name === "load-pending-publications") {
          assert(value.length <= 50, "Recovery page must stay bounded");
          for (const row of value)
            assert(
              allowedListingIds.has(row.listingId),
              "Recovery escaped the generated-only cursor window",
            );
          loaded.push(...value);
        }
        return value;
      },
      sendEvent: async (name, payload) => {
        events.push({ step: name, event: json(payload) });
        return { ids: [payload.id || randomUUID()] };
      },
    },
  });
  return { result, steps, events, loaded };
}
async function reserve(id, tx = sql) {
  const orderId = randomUUID();
  const row = {
    ...orderTemplate,
    id: orderId,
    listingId: id,
    sellerId: (await fresh(id)).sellerId,
    orderNumber: `IP-${orderId.slice(0, 12)}`,
    checkoutRequestId: randomUUID(),
    offerId: null,
    inventoryReleasedAt: null,
    status: "pending",
    stripePaymentIntentId: null,
    stripeChargeId: null,
    stripeTransferId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  // Use the exact existing monetary snapshot; no calculation or provider simulation is claimed.
  const sqlColumns = Object.fromEntries(
    Object.entries(valuesForInsert(schema.orders, row)).map(([key, value]) => [
      getTableColumns(schema.orders)[key].name,
      value,
    ]),
  );
  await tx`insert into orders ${tx(sqlColumns)}`;
  ids.orders.push(orderId);
  save();
  return { orderId, quantity: Number(row.quantitySqFt) };
}
async function waitForAppLock() {
  for (let i = 0; i < 60; i++) {
    const rows =
      await sql`select pid from pg_stat_activity where datname=current_database() and application_name='plankmarket-app' and wait_event_type='Lock'`;
    if (rows.length) return;
    await delay(100);
  }
  throw Error("Caller did not wait for the held listing lock");
}
async function browserCheck(name, width, fn) {
  await check(name, async () => {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      ignoreHTTPSErrors: base === "https://localhost:3104",
    });
    await context.addCookies([
      { ...sessions.seller.cookie, domain: "localhost" },
    ]);
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      return [...allowedAppOrigins, "http://127.0.0.1:3102"].includes(
        url.origin,
      )
        ? route.continue()
        : route.abort("blockedbyclient");
    });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    page.setDefaultNavigationTimeout(45000);
    try {
      const evidence = await fn(page, context);
      await page.screenshot({
        path: path.join(out, name + ".png"),
        fullPage: true,
        animations: "disabled",
        timeout: 12000,
      });
      return evidence;
    } catch (error) {
      await page
        .screenshot({
          path: path.join(out, name + "-failed.png"),
          fullPage: true,
        })
        .catch(() => {});
      fs.writeFileSync(
        path.join(out, name + "-failed.txt"),
        await page
          .locator("body")
          .innerText()
          .catch(() => "Unavailable"),
      );
      throw error;
    } finally {
      await context.close();
    }
  });
}
const listUrl = (query, extra = "") =>
  `${base}/seller/listings?q=${encodeURIComponent(query)}${extra}`;
(async () => {
  try {
    const [identity] =
      await sql`select current_database() name, host(inet_server_addr()) address, inet_server_port() port`;
    assert.equal(identity.name, "plankmarket_bootstrap_design_20260929");
    assert.equal(identity.port, 55439);
    assert(["127.0.0.1", "::1"].includes(identity.address));
    original = await snapshotBaseline();
    template = await fresh(phase.listing);
    orderTemplate = await db.query.orders.findFirst({
      where: eq(schema.orders.id, phase.orders[0].id),
    });
    assert(template && orderTemplate, "Missing immutable base fixtures");
    createInput("fixture schema validation", []);
    const c = await caller();
    let valid, expired, uiDraft;
    await check("publish-valid-and-repeat-is-idempotent", async () => {
      valid = await listing("valid publication");
      const beforeEvents = eventAttempts.length;
      const first = await c.publishBulk({ listingIds: [valid] });
      assert(first.publishedIds.includes(valid));
      assert.equal((await fresh(valid)).status, "active");
      assert.equal(
        (await publicationAudit(valid, "listing.published")).length,
        1,
        "Durable publication intent required",
      );
      assert.equal(
        (await publicationAudit(valid, "listing.publication_event_accepted"))
          .length,
        1,
        "Successful event transport acceptance marker required",
      );
      const firstState = json(await fresh(valid));
      const firstAudits = await auditCount(valid);
      const afterFirstEvents = eventAttempts.length;
      const second = await c.publishBulk({ listingIds: [valid] });
      assert.equal(second.publishedCount, 0);
      assert(second.alreadyPublishedIds.includes(valid));
      assert.deepEqual(json(await fresh(valid)), firstState);
      assert.equal(await auditCount(valid), firstAudits);
      assert.equal(eventAttempts.length, afterFirstEvents);
      assert(
        afterFirstEvents > beforeEvents,
        "New publish should attempt one logical listing event",
      );
      return { first, second, firstState };
    });
    await check(
      "publish-stale-selection-conflicts-atomically-and-fresh-token-succeeds",
      async () => {
        const changed = await listing("stale publish edited lot"),
          sibling = await listing("stale publish unchanged sibling");
        const selected = await fresh(changed),
          siblingSelected = await fresh(sibling);
        // A committed edit after the confirmation was opened. Force a distinct millisecond token.
        await sql`update listings set title=title || ' edited',total_sq_ft=800,
        updated_at=greatest(clock_timestamp(),updated_at+interval '1 second') where id=${changed}`;
        const edited = await fresh(changed),
          siblingBefore = await fresh(sibling);
        assert.notEqual(
          edited.updatedAt.getTime(),
          selected.updatedAt.getTime(),
        );
        const beforeAttempts = eventAttempts.length;
        await assert.rejects(
          c.publishBulk({
            listingIds: [sibling, changed],
            expectedUpdatedAt: {
              [changed]: selected.updatedAt,
              [sibling]: siblingSelected.updatedAt,
            },
          }),
          (error) => error.code === "CONFLICT",
        );
        assert.deepEqual(json(await fresh(changed)), json(edited));
        assert.deepEqual(json(await fresh(sibling)), json(siblingBefore));
        assert.equal(await auditCount(changed), 0);
        assert.equal(await auditCount(sibling), 0);
        assert.equal(
          eventAttempts.length,
          beforeAttempts,
          "A stale batch must not emit publication events",
        );
        const published = await c.publishBulk({
          listingIds: [sibling, changed],
          expectedUpdatedAt: {
            [changed]: edited.updatedAt,
            [sibling]: siblingBefore.updatedAt,
          },
        });
        assert.equal(published.publishedCount, 2);
        assert.deepEqual(
          new Set(published.publishedIds),
          new Set([changed, sibling]),
        );
        assert.equal(
          (await fresh(changed)).totalSqFt,
          800,
          "Publish must preserve the newer stock edit",
        );
        const active = json(await fresh(changed)),
          acceptedAttempts = eventAttempts.length;
        const replay = await c.publishBulk({
          listingIds: [changed],
          expectedUpdatedAt: { [changed]: selected.updatedAt },
        });
        assert(replay.alreadyPublishedIds.includes(changed));
        assert.deepEqual(json(await fresh(changed)), active);
        assert.equal(
          eventAttempts.length,
          acceptedAttempts,
          "A completed active replay is idempotent even with its old draft token",
        );
        return {
          changed,
          sibling,
          staleUpdatedAt: selected.updatedAt,
          freshUpdatedAt: edited.updatedAt,
          published,
          replay,
        };
      },
    );
    for (const [name, patch, photo] of [
      ["no-photo", {}, false],
      ["malformed", { palletWeight: null }, true],
      ["archived", { status: "archived" }, true],
      ["sold", { status: "sold" }, true],
      ["depleted", { totalSqFt: 0 }, true],
    ]) {
      await check("reject-" + name, async () =>
        rejectedOrSkipped(await listing(name, patch, photo), c, name),
      );
    }
    await check("foreign-and-missing-ids-reject-entire-selection", async () => {
      const owner = await newSeller();
      const foreign = await listing("foreign private lot", { sellerId: owner });
      const owned = await listing("mixed batch owned");
      for (const id of [foreign, randomUUID()]) {
        await assert.rejects(
          c.publishBulk({ listingIds: [owned, id] }),
          (error) =>
            ["NOT_FOUND", "FORBIDDEN"].includes(error.code) &&
            !error.message.includes("foreign private lot"),
        );
        assert.equal((await fresh(owned)).status, "draft");
      }
      assert.equal((await fresh(foreign)).status, "draft");
      return { foreign, owned };
    });
    await check("reserved-draft-cannot-publish", async () => {
      const id = await listing("reserved draft");
      const reservation = await reserve(id);
      return { reservation, ...(await rejectedOrSkipped(id, c, "reserved")) };
    });
    await check(
      "publish-survives-event-send-failure-without-retransition",
      async () => {
        const id = await listing("event transport failure");
        failEventSend = true;
        try {
          await c.publishBulk({ listingIds: [id] });
        } finally {
          failEventSend = false;
        }
        assert.equal((await fresh(id)).status, "active");
        const after = json(await fresh(id));
        assert.equal(
          (await publicationAudit(id, "listing.published")).length,
          1,
        );
        assert.equal(
          (await publicationAudit(id, "listing.publication_event_accepted"))
            .length,
          0,
        );
        const attemptsBeforeRetry = eventAttempts.length;
        const retry = await c.publishBulk({ listingIds: [id] });
        assert(retry.alreadyPublishedIds.includes(id));
        assert.deepEqual(json(await fresh(id)), after);
        assert.equal(
          (await publicationAudit(id, "listing.published")).length,
          1,
        );
        assert.equal(
          (await publicationAudit(id, "listing.publication_event_accepted"))
            .length,
          1,
        );
        assert.equal(
          eventAttempts.length,
          attemptsBeforeRetry + 1,
          "Retry active listing must recover the missing event acceptance",
        );
        const last = eventAttempts.at(-1);
        assert.equal(last.event.id, `listing-created:${id}`);
        assert.equal(last.accepted, true);
        await c.publishBulk({ listingIds: [id] });
        assert.equal(
          eventAttempts.length,
          attemptsBeforeRetry + 1,
          "Accepted event must not be re-enqueued",
        );
        return {
          id,
          retry,
          initialTransportAccepted: false,
          retryTransportAccepted: true,
        };
      },
    );
    await check(
      "old-active-without-intent-does-not-fabricate-publication",
      async () => {
        const id = await listing("legacy active without event intent", {
          status: "active",
        });
        const before = eventAttempts.length;
        const result = await c.publishBulk({ listingIds: [id] });
        assert(result.alreadyPublishedIds.includes(id));
        assert.equal(
          (await publicationAudit(id, "listing.published")).length,
          0,
        );
        assert.equal(
          (await publicationAudit(id, "listing.publication_event_accepted"))
            .length,
          0,
        );
        assert.equal(eventAttempts.length, before);
        return { id, result };
      },
    );
    await check(
      "slow-alert-provider-does-not-delay-published-confirmation",
      async () => {
        const id = await listing("slow alert publication");
        const originalSend = inngest.send;
        let release;
        const gate = new Promise((resolve) => {
          release = resolve;
        });
        inngest.send = async (...args) => {
          await gate;
          return originalSend(...args);
        };
        try {
          const started = Date.now();
          const response = await c.publishBulk({ listingIds: [id] });
          assert(
            Date.now() - started < 3500,
            "Successful publication must return before a hung alert provider resolves",
          );
          assert.equal(response.alertsPending, true);
          assert.equal((await fresh(id)).status, "active");
          assert.equal(
            (await publicationAudit(id, "listing.publication_event_accepted"))
              .length,
            0,
          );
          release();
          await expect
            .poll(
              async () =>
                (
                  await publicationAudit(
                    id,
                    "listing.publication_event_accepted",
                  )
                ).length,
            )
            .toBe(1);
          return { id, alertsPending: response.alertsPending };
        } finally {
          release();
          inngest.send = originalSend;
        }
      },
    );
    await check(
      "recovery-real-handlers-page-past-50-failures-with-precise-cursor",
      async () => {
        const definitions = capturePublicationRecovery();
        const scheduler = definitions.find(
          (row) => row.config.id === "listing-publication-recovery",
        );
        const pageWorker = definitions.find(
          (row) => row.config.id === "listing-publication-recovery-page",
        );
        assert(
          scheduler && pageWorker,
          "Both real recovery handlers must be declared",
        );
        assert.equal(scheduler.trigger.cron, "*/5 * * * *");
        assert.equal(scheduler.config.concurrency.limit, 1);
        assert.equal(pageWorker.config.concurrency.limit, 1);
        assert.equal(
          pageWorker.trigger.event,
          "listing/publication-recovery-page",
        );
        const cronBefore = Date.now(),
          attemptStart = eventAttempts.length;
        const scheduled = await invokeRecovery(
          scheduler,
          { data: {} },
          new Set(),
        );
        assert.equal(scheduled.events.length, 1);
        assert.equal(scheduled.loaded.length, 0);
        assert.equal(
          eventAttempts.length,
          attemptStart,
          "Scheduler must only queue a page, never dispatch listing alerts itself",
        );
        const scheduledEvent = scheduled.events[0].event;
        assert.equal(scheduledEvent.name, pageWorker.trigger.event);
        assert(
          Date.parse(scheduledEvent.data.scanStartedAt) >= cronBefore &&
            Date.parse(scheduledEvent.data.scanStartedAt) <= Date.now(),
        );
        assert.equal(scheduledEvent.data.afterCreatedAt, undefined);
        assert.equal(scheduledEvent.data.afterId, undefined);

        // Controlled future window isolates this proof from all existing pending intents.
        // Six-digit DB precision + identical timestamps exercise the UUID tie-break cursor.
        // This is handler proof, not evidence that a real cron or provider ran.
        const [window] =
          await sql`with anchor as materialized (select date_trunc('second',clock_timestamp()+interval '1 hour') t) select
        (t+interval '0.123456 seconds')::text as "createdAt",
        (t+interval '0.123455 seconds')::text as "afterCreatedAt",
        (t+interval '1 second')::text as "scanStartedAt" from anchor`;
        const [{ n }] =
          await sql`select count(*)::int n from audit_events where created_at > ${window.afterCreatedAt}::text::timestamptz and created_at <= ${window.scanStartedAt}::text::timestamptz`;
        assert.equal(
          n,
          0,
          "Synthetic recovery cursor window must contain no existing audit records",
        );
        const seeded = [];
        for (let i = 0; i < 51; i++) {
          seeded.push({
            id: randomUUID(),
            listingId: await listing(`recovery pending ${i}`, {
              status: "active",
              publishedAt: new Date(),
            }),
          });
        }
        seeded.sort((a, b) => (a.id < b.id ? -1 : 1));
        for (const row of seeded)
          await sql`insert into audit_events
        (id,actor_type,actor_id,action,entity_type,entity_id,idempotency_key,summary,created_at)
        values (${row.id},'user',${phase.seller},'listing.published','listing',${row.listingId},${`listing-published:${row.listingId}`},${`${tag} synthetic recovery pagination intent`},${window.createdAt}::text::timestamptz)`;
        const persistedTimes =
          await sql`select created_at::text stamp from audit_events where id in ${sql(seeded.map((row) => row.id))}`;
        assert.equal(persistedTimes.length, 51);
        for (const row of persistedTimes)
          assert.equal(row.stamp, window.createdAt);
        ids.auditEvents = [
          ...(ids.auditEvents || []),
          ...seeded.map((row) => row.id),
        ];
        save();
        const allowed = new Set(seeded.map((row) => row.listingId));
        const entry = {
          name: pageWorker.trigger.event,
          data: {
            scanStartedAt: window.scanStartedAt,
            afterCreatedAt: window.afterCreatedAt,
            afterId: "00000000-0000-0000-0000-000000000000",
          },
        };
        const first50 = seeded.slice(0, 50),
          last = seeded[50];
        first50.forEach((row) => failEventListingIds.add(row.listingId));
        let firstPage, secondPage, retryPage, exhausted, replay;
        try {
          const before = eventAttempts.length;
          firstPage = await invokeRecovery(pageWorker, entry, allowed);
          assert.deepEqual(firstPage.result, {
            selected: 50,
            accepted: 0,
            failed: 50,
          });
          assert.deepEqual(
            firstPage.loaded.map((row) => row.id),
            first50.map((row) => row.id),
          );
          assert.equal(
            firstPage.events.length,
            1,
            "Failures must still schedule the next page",
          );
          const continuation = firstPage.events[0].event;
          assert.equal(continuation.name, pageWorker.trigger.event);
          assert.equal(
            continuation.data.scanStartedAt,
            entry.data.scanStartedAt,
          );
          assert.equal(
            continuation.data.afterCreatedAt,
            window.createdAt,
            "Cursor must preserve DB microseconds as text",
          );
          assert.equal(continuation.data.afterId, first50[49].id);
          assert.equal(
            continuation.id,
            `listing-publication-page:${entry.data.scanStartedAt}:${first50[49].id}`,
          );
          secondPage = await invokeRecovery(pageWorker, continuation, allowed);
          assert.deepEqual(secondPage.result, {
            selected: 1,
            accepted: 1,
            failed: 0,
          });
          assert.equal(secondPage.loaded[0].listingId, last.listingId);
          assert.equal(secondPage.events.length, 0);
          const attempts = eventAttempts.slice(before);
          assert.equal(attempts.length, 51);
          assert.equal(attempts.filter((row) => row.accepted).length, 1);
          assert.equal(
            new Set(attempts.map((row) => row.event.data.listingId)).size,
            51,
            "Page two must not loop over the first 50 failures",
          );
          for (const attempt of attempts)
            assert.equal(
              attempt.event.id,
              `listing-created:${attempt.event.data.listingId}`,
            );
          const markers =
            await sql`select entity_id from audit_events where action='listing.publication_event_accepted' and entity_id in ${sql([...allowed])}`;
          assert.deepEqual(
            markers.map((row) => row.entity_id),
            [last.listingId],
          );
          assert.equal(
            (await publicationAudit(last.listingId, "listing.published"))
              .length,
            1,
          );
        } finally {
          failEventListingIds.clear();
        }

        // A later independent scan repairs the 50 failures; the accepted 51st is excluded.
        const beforeRetry = eventAttempts.length;
        retryPage = await invokeRecovery(pageWorker, entry, allowed);
        assert.deepEqual(retryPage.result, {
          selected: 50,
          accepted: 50,
          failed: 0,
        });
        assert.equal(retryPage.events.length, 1);
        exhausted = await invokeRecovery(
          pageWorker,
          retryPage.events[0].event,
          allowed,
        );
        assert.deepEqual(exhausted.result, {
          selected: 0,
          accepted: 0,
          failed: 0,
        });
        assert.equal(exhausted.events.length, 0);
        assert.equal(eventAttempts.length, beforeRetry + 50);
        assert(
          !eventAttempts
            .slice(beforeRetry)
            .some((row) => row.event.data.listingId === last.listingId),
        );
        const afterAccepted = eventAttempts.length;
        replay = await invokeRecovery(pageWorker, entry, allowed);
        assert.deepEqual(replay.result, {
          selected: 0,
          accepted: 0,
          failed: 0,
        });
        assert.equal(replay.events.length, 0);
        assert.equal(eventAttempts.length, afterAccepted);
        const counts =
          await sql`select action,count(*)::int n from audit_events where entity_id in ${sql([...allowed])} group by action order by action`;
        assert.deepEqual(
          Array.from(counts, (row) => ({ action: row.action, n: row.n })),
          [
            { action: "listing.publication_event_accepted", n: 51 },
            { action: "listing.published", n: 51 },
          ],
        );
        return {
          handlerSource:
            "src/lib/inngest/functions/listing-publication-recovery.ts",
          scheduled,
          window,
          seeded,
          firstPage,
          secondPage,
          retryPage,
          exhausted,
          replay,
          providerCalls: 0,
          clockExecution: false,
        };
      },
    );
    await check(
      "old-import-draft-starts-markdown-schedule-at-publication",
      async () => {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
        const id = await listing("old imported markdown draft", {
          automaticMarkdownEnabled: true,
          automaticMarkdownFloorPercent: 70,
          automaticMarkdownIntervalDays: 7,
          automaticMarkdownStartedAt: thirtyDaysAgo,
          automaticMarkdownCurrentStep: 2,
          automaticMarkdownLastAppliedAt: new Date(Date.now() - 16 * 86400000),
          originalAskPricePerSqFt: 2,
        });
        const before = await fresh(id);
        await c.publishBulk({ listingIds: [id] });
        const after = await fresh(id);
        assert.equal(after.status, "active");
        assert(after.publishedAt instanceof Date);
        assert.equal(
          after.automaticMarkdownStartedAt?.getTime(),
          after.publishedAt.getTime(),
          "Draft age must not age the live markdown schedule",
        );
        assert.equal(after.automaticMarkdownCurrentStep, 0);
        assert.equal(after.automaticMarkdownLastAppliedAt, null);
        for (const key of [
          "askPricePerSqFt",
          "buyNowPrice",
          "floorPrice",
          "originalAskPricePerSqFt",
        ])
          assert.deepEqual(
            after[key],
            before[key],
            `Publication changed ${key}`,
          );
        const replay = await c.publishBulk({ listingIds: [id] });
        assert(replay.alreadyPublishedIds.includes(id));
        assert.deepEqual(
          json(await fresh(id)),
          json(after),
          "Active replay must not restart schedule or change prices",
        );
        return {
          id,
          oldStart: thirtyDaysAgo,
          publishedAt: after.publishedAt,
          currentStep: after.automaticMarkdownCurrentStep,
        };
      },
    );
    await check("create-publish-race-shares-final-free-slot", async () => {
      const owner = await newSeller();
      const free = await caller(owner);
      for (let i = 0; i < 9; i++)
        await listing(`quota existing ${i}`, {
          sellerId: owner,
          status: "active",
        });
      const draft = await listing("quota draft", { sellerId: owner });
      const photo = randomUUID();
      await db.insert(schema.media).values({
        id: photo,
        uploaderId: owner,
        url: "/logo.png",
        mimeType: "image/png",
      });
      ids.media.push(photo);
      const originalTransaction = db.transaction.bind(db);
      let entered = 0,
        release;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const timer = setTimeout(() => release(), 5000);
      db.transaction = async (...args) => {
        if (++entered === 2) release();
        await gate;
        return originalTransaction(...args);
      };
      let attempts;
      try {
        attempts = await Promise.allSettled([
          free.create(createInput("quota created", [photo])),
          free.publishBulk({ listingIds: [draft] }),
        ]);
      } finally {
        clearTimeout(timer);
        db.transaction = originalTransaction;
      }
      if (attempts[0].status === "fulfilled")
        ids.listings.push(attempts[0].value.id);
      assert(entered >= 2, "Race fixture did not reach both transactions");
      const [{ n }] =
        await sql`select count(*)::int n from listings where seller_id=${owner} and status='active'`;
      assert.equal(n, 10, "Exactly one final slot may be consumed");
      assert.equal(attempts.filter((x) => x.status === "fulfilled").length, 1);
      return {
        owner,
        active: n,
        attempts: attempts.map((x) =>
          x.status === "fulfilled"
            ? { status: x.status }
            : { status: x.status, code: x.reason.code },
        ),
      };
    });
    await check(
      "publish-waits-for-archive-and-does-not-resurrect",
      async () => {
        const id = await listing("archive race");
        let held, unlock;
        const ready = new Promise((resolve) => {
          held = resolve;
        });
        const gate = new Promise((resolve) => {
          unlock = resolve;
        });
        const archiving = sql.begin(async (tx) => {
          await tx`select id from listings where id=${id} for update`;
          await tx`update listings set status='archived',updated_at=clock_timestamp() where id=${id}`;
          held();
          await gate;
        });
        await ready;
        const pending = c.publishBulk({ listingIds: [id] }).then(
          (value) => ({ value }),
          (error) => ({ error: error.code }),
        );
        try {
          await waitForAppLock();
        } finally {
          unlock();
        }
        await archiving;
        const result = await pending;
        assert.equal((await fresh(id)).status, "archived");
        return { id, result };
      },
    );
    await check(
      "reconfirm-preserves-stock-money-reservations-and-audits",
      async () => {
        expired = await listing("overdue inventory", {
          status: "active",
          lastConfirmedAt: new Date(Date.now() - 20 * 86400000),
          confirmationDueAt: new Date(Date.now() - 6 * 86400000),
        });
        const reservation = await reserve(expired);
        const before = await fresh(expired);
        const auditBefore = await auditCount(expired);
        const buyer = await caller(fixture.fixtures.buyer);
        await assert.rejects(
          buyer.getById({ id: expired }),
          (error) => error.code === "NOT_FOUND" || error.code === "FORBIDDEN",
        );
        const orderBefore = json(
          (await sql`select * from orders where id=${reservation.orderId}`)[0],
        );
        await c.reconfirm({ id: expired, expectedUpdatedAt: before.updatedAt });
        const after = await fresh(expired);
        for (const key of [
          "status",
          "totalSqFt",
          "originalTotalSqFt",
          "askPricePerSqFt",
          "buyNowPrice",
          "floorPrice",
          "sellerId",
        ])
          assert.deepEqual(after[key], before[key], `Reconfirm changed ${key}`);
        assert(after.confirmationDueAt > new Date());
        assert(after.lastConfirmedAt > before.lastConfirmedAt);
        assert.deepEqual(
          json(
            (
              await sql`select * from orders where id=${reservation.orderId}`
            )[0],
          ),
          orderBefore,
        );
        assert((await auditCount(expired)) > auditBefore);
        assert.equal((await buyer.getById({ id: expired })).id, expired);
        return { before: json(before), after: json(after), reservation };
      },
    );
    await check(
      "reconfirm-stale-attestation-conflicts-after-reservation",
      async () => {
        const id = await listing("reservation race", { status: "active" });
        const before = await fresh(id);
        let held, unlock;
        const ready = new Promise((resolve) => {
          held = resolve;
        });
        const gate = new Promise((resolve) => {
          unlock = resolve;
        });
        const reservation = sql.begin(async (tx) => {
          await tx`select id from listings where id=${id} for update`;
          const booked = await reserve(id, tx);
          await tx`update listings set total_sq_ft=total_sq_ft-${booked.quantity},updated_at=clock_timestamp() where id=${id}`;
          held();
          await gate;
          return booked;
        });
        await ready;
        const confirming = c
          .reconfirm({ id, expectedUpdatedAt: before.updatedAt })
          .then(
            (value) => ({ value }),
            (error) => ({ error: error.code }),
          );
        try {
          await waitForAppLock();
        } finally {
          unlock();
        }
        const booked = await reservation;
        const result = await confirming;
        assert.equal(result.error, "CONFLICT");
        const after = await fresh(id);
        assert.equal(after.totalSqFt, before.totalSqFt - booked.quantity);
        assert.equal(after.originalTotalSqFt, before.originalTotalSqFt);
        return { id, result, booked };
      },
    );
    const paging = [];
    for (let i = 0; i < 65; i++)
      paging.push(
        await listing(
          `Paging ${String(i).padStart(2, "0")} engineered oak long inventory title with grade and packaging information`,
          { brand: `${tag} Brand`, modelNumber: `${tag} Model` },
          false,
        ),
      );
    const literal = await listing("Literal%_\\marker", {}, false);
    await check(
      "server-search-pages-ownership-and-literal-wildcards",
      async () => {
        const seen = new Set();
        let total;
        for (let page = 1; page <= 4; page++) {
          const response = await c.getMyListings({
            query: `${tag} Paging`,
            page,
            limit: 20,
          });
          total = response.total;
          for (const row of response.items) {
            assert.equal(row.sellerId, phase.seller);
            assert(!seen.has(row.id));
            seen.add(row.id);
          }
        }
        assert.equal(total, 65);
        assert.equal(seen.size, 65);
        for (const query of ["%", "_", "\\"]) {
          const response = await c.getMyListings({
            query: `${tag} Literal${query === "%" ? "%" : query === "_" ? "%_" : "%_\\"}`,
            page: 1,
            limit: 20,
          });
          assert.equal(response.total, 1);
          assert.equal(response.items[0].id, literal);
        }
        for (const query of [`${tag} Brand`, `${tag} Model`])
          assert.equal(
            (await c.getMyListings({ query, page: 1, limit: 20 })).total,
            65,
          );
        return { total, uniqueRows: seen.size, literal };
      },
    );
    uiDraft = await listing("UI durable imported draft");
    const uiStale = await listing("UI availability overdue", {
      status: "active",
      lastConfirmedAt: new Date(Date.now() - 20 * 86400000),
      confirmationDueAt: new Date(Date.now() - 6 * 86400000),
    });
    browser = await chromium.launch({ headless: true });
    for (const width of [360, 390, 768, 1440])
      await browserCheck("rows-" + width, width, async (page) => {
        await page.goto(listUrl(`${tag} Paging`), {
          waitUntil: "domcontentloaded",
        });
        const inventory = page.getByRole("list", { name: "Your inventory" });
        await expect(inventory).toBeVisible();
        const row = inventory.getByRole("listitem").first(),
          title = row.getByRole("heading").first();
        await expect(title).toBeVisible();
        const layout = await title.evaluate((e) => {
          const b = e.getBoundingClientRect(),
            s = getComputedStyle(e);
          return {
            width: b.width,
            height: b.height,
            whiteSpace: s.whiteSpace,
            overflow: s.overflow,
            scrollWidth: e.scrollWidth,
            clientWidth: e.clientWidth,
          };
        });
        assert(layout.width > 100);
        assert(layout.height > 0);
        assert(
          layout.scrollWidth <= layout.clientWidth + 1,
          "Title visually clipped",
        );
        assert.notEqual(layout.whiteSpace, "nowrap");
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
        );
        return { layout, rows: await inventory.getByRole("listitem").count() };
      });
    await browserCheck(
      "url-filter-pages-refresh-and-back",
      390,
      async (page) => {
        await page.goto(listUrl(`${tag} Paging`, "&page=3"), {
          waitUntil: "domcontentloaded",
        });
        const search = page.getByLabel("Search your inventory");
        await expect(search).toHaveValue(`${tag} Paging`);
        await expect(
          page.getByRole("navigation", { name: "Listing pages" }),
        ).toContainText("3");
        const pagination = page.getByRole("navigation", {
          name: "Listing pages",
        });
        await pagination
          .getByRole("button", { name: "Next", exact: true })
          .click();
        await expect
          .poll(() => new URL(page.url()).searchParams.get("page"))
          .toBe("4");
        await expect(
          pagination.getByRole("button", { name: "Next", exact: true }),
        ).toBeDisabled();
        await pagination
          .getByRole("button", { name: "Previous", exact: true })
          .click();
        await expect
          .poll(() => new URL(page.url()).searchParams.get("page"))
          .toBe("3");
        await page.getByLabel("Show", { exact: true }).selectOption("draft");
        await expect
          .poll(() => new URL(page.url()).searchParams.get("page"))
          .toBe(null);
        assert.equal(new URL(page.url()).searchParams.get("status"), "draft");
        await page.reload();
        await expect(page.getByLabel("Show", { exact: true })).toHaveValue(
          "draft",
        );
        await expect(search).toHaveValue(`${tag} Paging`);
        const preserved = page.url();
        await page.goto(base + "/pricing");
        await page.goBack();
        await expect(
          page.getByRole("list", { name: "Your inventory" }),
        ).toBeVisible();
        assert.equal(page.url(), preserved);
        await search.fill(`${tag} Paging 64`);
        await page.getByRole("button", { name: "Search", exact: true }).click();
        await expect
          .poll(() => new URL(page.url()).searchParams.get("q"))
          .toBe(`${tag} Paging 64`);
        await expect(
          page
            .getByRole("list", { name: "Your inventory" })
            .getByRole("listitem"),
        ).toHaveCount(1);
        await page.goto(listUrl(`${tag} Paging`, "&page=999"));
        await page
          .getByRole("button", { name: "First page", exact: true })
          .click();
        await expect
          .poll(() => new URL(page.url()).searchParams.get("page"))
          .toBe(null);
        return { preserved };
      },
    );
    await browserCheck(
      "durable-draft-publish-without-session-storage",
      390,
      async (page) => {
        await page.goto(listUrl(`${tag} UI durable`));
        await page.evaluate(() => sessionStorage.clear());
        await page.reload();
        const before = json(await fresh(uiDraft));
        await page
          .getByRole("button", { name: "Publish listing", exact: true })
          .click();
        const dialog = page.getByRole("dialog");
        await expect(
          dialog.getByRole("heading", { name: "Ready to publish?" }),
        ).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
        assert.deepEqual(json(await fresh(uiDraft)), before);
        await page
          .getByRole("button", { name: "Publish listing", exact: true })
          .click();
        await page
          .getByRole("dialog")
          .getByRole("button", { name: "Publish listing", exact: true })
          .click();
        await expect
          .poll(async () => (await fresh(uiDraft)).status)
          .toBe("active");
        await expect(page.getByRole("dialog")).toBeHidden();
        return { id: uiDraft, after: json(await fresh(uiDraft)) };
      },
    );
    await browserCheck(
      "availability-confirmation-preserves-stock",
      390,
      async (page) => {
        const before = await fresh(uiStale);
        await page.goto(
          listUrl(`${tag} UI availability`, "&status=needs_confirmation"),
        );
        await expect(
          page.getByText("Hidden · confirm stock", { exact: true }),
        ).toBeVisible();
        await page
          .getByRole("button", { name: "Confirm availability", exact: true })
          .click();
        await page
          .getByRole("dialog")
          .getByRole("button", { name: "Yes, still available", exact: true })
          .click();
        await expect
          .poll(
            async () => (await fresh(uiStale)).confirmationDueAt > new Date(),
          )
          .toBe(true);
        const after = await fresh(uiStale);
        assert.equal(after.totalSqFt, before.totalSqFt);
        assert.equal(after.status, before.status);
        return { id: uiStale, quantity: after.totalSqFt };
      },
    );
    await browserCheck(
      "inventory-query-error-preserves-filter-context",
      390,
      async (page) => {
        let failing = true;
        await page.route(
          /\/api\/trpc\/.*listing\.getMyListings/,
          async (route) => {
            if (!failing) return route.continue();
            const methods = new URL(route.request().url()).pathname
              .split("/")
              .pop()
              .split(",");
            const response = await route.fetch();
            const body = await response.json();
            body[methods.indexOf("listing.getMyListings")] = {
              error: {
                json: {
                  message: "Synthetic inventory read failure",
                  code: -32603,
                  data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 },
                },
              },
            };
            return route.fulfill({ response, status: 200, json: body });
          },
        );
        await page.goto(listUrl(`${tag} Paging`, "&status=draft&page=2"));
        await expect(
          page.getByRole("button", { name: "Try again", exact: true }),
        ).toBeVisible({ timeout: 20000 });
        await expect(
          page.getByText("No listings found", { exact: true }),
        ).toHaveCount(0);
        const url = page.url();
        failing = false;
        await page
          .getByRole("button", { name: "Try again", exact: true })
          .click();
        await expect(
          page.getByRole("list", { name: "Your inventory" }),
        ).toBeVisible();
        assert.equal(page.url(), url);
        return { url };
      },
    );
  } finally {
    await browser?.close();
    for (const id of ids.listings)
      await sql`update listings set status='archived' where id=${id}`;
    // Do not delete immutable audit history or mutate original fixtures. New actors remain identifiable.
    if (original)
      await check("original-fixtures-preserved", async () => {
        assert.deepEqual(await snapshotBaseline(), original);
        return {
          sourceListing: phase.listing,
          sourceSeller: phase.seller,
          sourceOrders: phase.orders.map((row) => row.id),
        };
      });
    save();
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
