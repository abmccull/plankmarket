/* eslint-disable @typescript-eslint/no-require-imports -- tsx/cjs registers the real TypeScript handlers after safe environment setup. */
/* Disposable database integration proof. Failure modes declared in
 * docs/MARKETPLACE_9_OF_10_PLAN.md and automation-stop-review.md before edits.
 * Runs the real Inngest handlers/SQL; replaces only orchestration and event transport.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { randomUUID } = require("node:crypto");
assert(
  process.argv.includes("--disposable-local"),
  "Requires --disposable-local",
);
const target =
  "postgresql://postgres@127.0.0.1:55439/plankmarket_bootstrap_design_20260929";
const proof = JSON.parse(
  fs.readFileSync("tmp/design-review-20260929/database-proof.json"),
);
assert.equal(proof.target, target);
for (const key of Object.keys(process.env))
  if (
    /DATABASE|STRIPE|RESEND|SUPABASE|REDIS|INNGEST|PRIORITY1|ANTHROPIC|TYPESAFE|VERIFICATION|UPLOADTHING/.test(
      key,
    )
  )
    delete process.env[key];
Object.assign(process.env, {
  DATABASE_URL: target,
  DATABASE_POOL_MAX: "3",
  SKIP_ENV_VALIDATION: "1",
  NODE_ENV: "test",
  INNGEST_DEV: "1",
  INNGEST_BASE_URL: "http://127.0.0.1:3102/inngest",
});
// SKIP_ENV_VALIDATION leaves numeric env values as strings. Use the numeric test default.
delete process.env.DATABASE_POOL_MAX;
require("tsx/cjs");
const postgres = require("postgres");
const sql = postgres(target, { max: 3 });
const phase = JSON.parse(
  fs.readFileSync("tmp/design-review-20260929/phase-b-fixtures.json"),
);
const { inngest } = require("../src/lib/inngest/client.ts");
const { db: applicationDb } = require("../src/server/db/index.ts");
assert.equal(typeof applicationDb.$client.options.max, "number", "The real database pool must have a numeric size");
assert(applicationDb.$client.options.max >= 2, "Race proof requires multiple real connections");
const schema = require("../src/server/db/schema/index.ts");
const handlers = {};
inngest.createFunction = (options, _trigger, handler) => {
  handlers[options.id] = handler;
  return { id: options.id };
};
inngest.send = async () => {
  throw new Error("External event transport is forbidden in this proof");
};
require("../src/lib/inngest/functions/agent-offer-handler.ts");
require("../src/lib/inngest/functions/agent-repricer.ts");
require("../src/lib/inngest/functions/agent-monitor.ts");
const records = [],
  out = "tmp/marketplace-excellence/proof/automation-controls.json";
const emitted = [],
  createdListings = [],
  createdSearches = [];
function steps(before, cache = new Map()) {
  return {
    async run(name, callback) {
      if (cache.has(name)) return cache.get(name);
      await before?.(name);
      const result = await callback();
      cache.set(name, result);
      return result;
    },
    async sendEvent(name, event) {
      emitted.push({ name, event });
    },
  };
}
async function check(name, fn) {
  try {
    await fn();
    records.push({ name, passed: true });
  } catch (error) {
    records.push({ name, passed: false, error: error.message });
  }
  fs.mkdirSync(require("node:path").dirname(out), { recursive: true });
  fs.writeFileSync(
    out,
    JSON.stringify({ target, at: new Date().toISOString(), records }, null, 2),
  );
  console.log((records.at(-1).passed ? "PASS " : "FAIL ") + name);
}
async function offerFixture(price = 2) {
  const id = randomUUID();
  await sql`insert into offers select (jsonb_populate_record(null::offers, to_jsonb(o) || ${sql.json({ id, status: "pending", current_round: 1, last_actor_id: phase.buyer, offer_price_per_sq_ft: price, expires_at: new Date(Date.now() + 86400000).toISOString(), order_id: null })})).* from offers o where id=${phase.offer}`;
  return id;
}
async function enable() {
  await sql`update agent_configs set offer_auto_enabled=true, offer_accept_above=90, offer_counter_at=80, offer_reject_below=70, repricing_enabled=true, repricing_stale_after_days=14, repricing_drop_percent=5, repricing_floor_percent=70, monitor_enabled=true where user_id=${phase.seller}`;
}
(async () => {
  phase.buyer = (
    await sql`select buyer_id from offers where id=${phase.offer}`
  )[0].buyer_id;
  const [original] =
    await sql`select * from agent_configs where user_id=${phase.seller}`;
  assert(original, "Expected disposable seller config");
  try {
    await check("queued-offer-honors-saved-off", async () => {
      await enable();
      const id = await offerFixture();
      await handlers["agent-offer-handler"]({
        event: { data: { offerId: id } },
        step: steps(async (name) => {
          if (name === "apply-rules")
            await sql`update agent_configs set offer_auto_enabled=false where user_id=${phase.seller}`;
        }),
      });
      const [row] = await sql`select status from offers where id=${id}`;
      assert.equal(row.status, "pending");
      const [audit] =
        await sql`select count(*)::int n from agent_actions where related_id=${id}`;
      assert.equal(audit.n, 0);
    });
    await check("off-acknowledgment-waits-for-atomic-action", async () => {
      await enable();
      const id = await offerFixture();
      let entered, release;
      const ready = new Promise((resolve) => {
        entered = resolve;
      });
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const transaction = applicationDb.transaction.bind(applicationDb);
      applicationDb.transaction = (callback, ...options) =>
        transaction(
          (tx) =>
            callback(
              new Proxy(tx, {
                get(target, key) {
                  if (key === "query")
                    return {
                      ...target.query,
                      agentConfigs: {
                        findFirst: async (...args) => {
                          const result =
                            await target.query.agentConfigs.findFirst(...args);
                          entered();
                          await gate;
                          return result;
                        },
                      },
                    };
                  const value = Reflect.get(target, key);
                  return typeof value === "function"
                    ? value.bind(target)
                    : value;
                },
              }),
            ),
          ...options,
        );
      let worker, stopping;
      try {
        worker = handlers["agent-offer-handler"]({
          event: { data: { offerId: id } },
          step: steps(),
        });
        await Promise.race([
          ready,
          new Promise((_, reject) =>
            setTimeout(
              () => reject(Error("Worker did not reach config lock")),
              5000,
            ),
          ),
        ]);
        stopping =
          sql`update agent_configs set offer_auto_enabled=false where user_id=${phase.seller}`.then(
            () => "acknowledged",
          );
        const state = await Promise.race([
          stopping,
          new Promise((resolve) => setTimeout(() => resolve("waiting"), 150)),
        ]);
        assert.equal(state, "waiting");
        release();
        await worker;
        await stopping;
        const [row] = await sql`select status from offers where id=${id}`;
        assert.equal(row.status, "accepted");
        const next = await offerFixture();
        await handlers["agent-offer-handler"]({
          event: { data: { offerId: next } },
          step: steps(),
        });
        assert.equal(
          (await sql`select status from offers where id=${next}`)[0].status,
          "pending",
        );
      } finally {
        release();
        applicationDb.transaction = transaction;
        await worker;
        await stopping;
      }
    });
    await check("offer-action-rolls-back-when-audit-fails", async () => {
      await enable();
      const id = await offerFixture();
      const transaction = applicationDb.transaction.bind(applicationDb);
      applicationDb.transaction = (callback, ...options) =>
        transaction(
          (tx) =>
            callback(
              new Proxy(tx, {
                get(target, key) {
                  if (key === "insert")
                    return (table) => {
                      if (table === schema.agentActions)
                        return {
                          values() {
                            throw Error("Synthetic audit write failure");
                          },
                        };
                      return target.insert(table);
                    };
                  const value = Reflect.get(target, key);
                  return typeof value === "function"
                    ? value.bind(target)
                    : value;
                },
              }),
            ),
          ...options,
        );
      try {
        await assert.rejects(
          () =>
            handlers["agent-offer-handler"]({
              event: { data: { offerId: id } },
              step: steps(),
            }),
          /audit write failure/,
        );
      } finally {
        applicationDb.transaction = transaction;
      }
      assert.equal(
        (await sql`select status from offers where id=${id}`)[0].status,
        "pending",
      );
      assert.equal(
        (
          await sql`select count(*)::int n from offer_events where offer_id=${id}`
        )[0].n,
        0,
      );
    });
    await check(
      "queued-offer-uses-current-rules-and-manual-response-wins",
      async () => {
        await enable();
        const id = await offerFixture(1.7);
        await handlers["agent-offer-handler"]({
          event: { data: { offerId: id } },
          step: steps(async (name) => {
            if (name === "apply-rules")
              await sql`update agent_configs set offer_accept_above=80,offer_counter_at=75 where user_id=${phase.seller}`;
          }),
        });
        assert.equal(
          (await sql`select status from offers where id=${id}`)[0].status,
          "accepted",
        );
        const manual = await offerFixture();
        await handlers["agent-offer-handler"]({
          event: { data: { offerId: manual } },
          step: steps(async (name) => {
            if (name === "apply-rules")
              await sql`update offers set status='rejected',last_actor_id=${phase.seller} where id=${manual}`;
          }),
        });
        assert.equal(
          (await sql`select status from offers where id=${manual}`)[0].status,
          "rejected",
        );
        assert.equal(
          (
            await sql`select count(*)::int n from agent_actions where related_id=${manual}`
          )[0].n,
          0,
        );
      },
    );
    for (const [action, price, legacy] of [
      ["accepted", 2, false],
      ["countered", 1.7, false],
      ["accepted", 2, true],
      ["countered", 1.7, true],
    ])
      await check(
        "committed-" +
          action +
          "-recovers-after-off" +
          (legacy ? "-legacy" : ""),
        async () => {
          await enable();
          const id = await offerFixture(price),
            cache = new Map();
          let crashed = false;
          const step = steps(null, cache);
          const run = step.run;
          step.run = async (name, fn) => {
            if (name === "apply-rules" && !crashed) {
              crashed = true;
              await fn();
              throw new Error("Synthetic lost checkpoint");
            }
            return run(name, fn);
          };
          await assert.rejects(
            () =>
              handlers["agent-offer-handler"]({
                event: { data: { offerId: id } },
                step,
              }),
            /lost checkpoint/,
          );
          if (legacy)
            await sql`update agent_actions set details=details-'executionKey'-'result' where related_id=${id}`;
          await sql`update agent_configs set offer_auto_enabled=false where user_id=${phase.seller}`;
          const count = emitted.length;
          await handlers["agent-offer-handler"]({
            event: { data: { offerId: id } },
            step,
          });
          assert.equal(emitted.length, count + 1);
          const [row] = await sql`select status from offers where id=${id}`;
          assert.equal(row.status, action);
          const [audit] =
            await sql`select count(*)::int n from agent_actions where related_id=${id}`;
          assert.equal(audit.n, 1);
        },
      );
    await check("old-offer-step-checkpoint-dispatches", async () => {
      const id = await offerFixture();
      const cache = new Map([
        [
          "apply-rules",
          {
            action: "accepted",
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          },
        ],
      ]);
      const count = emitted.length;
      await handlers["agent-offer-handler"]({
        event: { data: { offerId: id } },
        step: steps(null, cache),
      });
      assert.equal(emitted.length, count + 1);
      assert.equal(emitted.at(-1).event.data.offerId, id);
    });
    await check("queued-repricing-honors-off-and-atomic-replay", async () => {
      await enable();
      const id = randomUUID();
      createdListings.push(id);
      const columns = (
        await sql`select column_name from information_schema.columns where table_schema='public' and table_name='listings' and is_generated='NEVER' order by ordinal_position`
      ).map((row) => row.column_name);
      await sql`insert into listings (${sql(columns)}) select ${sql(columns)} from (select (jsonb_populate_record(null::listings,to_jsonb(l)||${sql.json({ id, slug: null, title: "Synthetic repricer control " + id, status: "active", ask_price_per_sq_ft: 2, buy_now_price: null, offer_count: 0, automatic_markdown_enabled: false, updated_at: new Date(Date.now() - 30 * 86400000).toISOString() })})).* from listings l where id=${phase.listing}) cloned`;
      const event = { id: "proof-" + id };
      await handlers["agent-repricer"]({
        event,
        step: steps(async (name) => {
          if (name === `reprice-${phase.seller}`)
            await sql`update agent_configs set repricing_enabled=false where user_id=${phase.seller}`;
        }),
      });
      let [row] =
        await sql`select ask_price_per_sq_ft::float price from listings where id=${id}`;
      assert.equal(row.price, 2);
      await enable();
      await handlers["agent-repricer"]({ event, step: steps() });
      [row] =
        await sql`select ask_price_per_sq_ft::float price from listings where id=${id}`;
      assert.equal(row.price, 1.9);
      await handlers["agent-repricer"]({ event, step: steps() });
      const [audit] =
        await sql`select count(*)::int n from agent_actions where related_id=${id} and action_type='listing_repriced'`;
      assert.equal(audit.n, 1);
      await sql`update listings set updated_at=${new Date(Date.now() - 30 * 86400000)} where id=${id}`;
      const oldCache = new Map([
        [
          "load-configs",
          [
            {
              agent_configs: { userId: phase.seller },
              users: { id: phase.seller },
            },
          ],
        ],
      ]);
      await handlers["agent-repricer"]({ event, step: steps(null, oldCache) });
      [row] =
        await sql`select ask_price_per_sq_ft::float price from listings where id=${id}`;
      assert.equal(row.price, 1.9);
    });
    await check(
      "monitor-stops-matches-filters-and-preserves-email-cursor",
      async () => {
        await enable();
        const id = randomUUID();
        const prior = new Date(Date.now() - 3600000);
        createdSearches.push(id);
        await sql`insert into saved_searches(id,user_id,name,filters,alert_enabled,alert_frequency,alert_channels,last_alert_at,created_at) values(${id},${phase.seller},'Synthetic narrow monitor',${sql.json({ materialType: ["vinyl_lvp"], priceMax: 0.01 })},true,'daily','["email"]'::jsonb,${prior},${new Date(Date.now() - 86400000 * 90)})`;
        const originalCursor = (
          await sql`select last_alert_at from saved_searches where id=${id}`
        )[0].last_alert_at;
        await handlers["agent-monitor"]({
          step: steps(async (name) => {
            if (name === `scan-${phase.seller}`)
              await sql`update agent_configs set monitor_enabled=false where user_id=${phase.seller}`;
          }),
        });
        let [count] =
          await sql`select count(*)::int n from agent_actions where details->>'searchId'=${id}`;
        assert.equal(count.n, 0);
        await enable();
        await handlers["agent-monitor"]({ step: steps() });
        [count] =
          await sql`select count(*)::int n from agent_actions where details->>'searchId'=${id}`;
        assert.equal(count.n, 0);
        await sql`update saved_searches set filters=${sql.json({ materialType: ["engineered"], priceMax: 3 })} where id=${id}`;
        await handlers["agent-monitor"]({ step: steps() });
        [count] =
          await sql`select count(*)::int n from agent_actions where details->>'searchId'=${id}`;
        assert(count.n > 0, "Expected matching fixture");
        const first = count.n;
        await Promise.all([
          handlers["agent-monitor"]({ step: steps() }),
          handlers["agent-monitor"]({ step: steps() }),
        ]);
        const oldCache = new Map([
          [
            "load-configs",
            [
              {
                agent_configs: { userId: phase.seller },
                users: { id: phase.seller },
              },
            ],
          ],
        ]);
        await handlers["agent-monitor"]({ step: steps(null, oldCache) });
        const [duplicates] =
          await sql`select count(*)::int n from (select related_id from agent_actions where details->>'searchId'=${id} group by related_id having count(*)>1) d`;
        assert.equal(duplicates.n, 0);
        const [search] =
          await sql`select last_alert_at from saved_searches where id=${id}`;
        assert.equal(
          search.last_alert_at.toISOString(),
          originalCursor.toISOString(),
        );
        assert(first <= 10, "Bounded batch");
      },
    );
  } finally {
    for (const id of createdListings)
      await sql`update listings set status='archived' where id=${id}`;
    for (const id of createdSearches)
      await sql`update saved_searches set alert_enabled=false where id=${id}`;
    await sql`update agent_configs set offer_auto_enabled=${original.offer_auto_enabled},offer_accept_above=${original.offer_accept_above},offer_counter_at=${original.offer_counter_at},offer_reject_below=${original.offer_reject_below},repricing_enabled=${original.repricing_enabled},repricing_stale_after_days=${original.repricing_stale_after_days},repricing_drop_percent=${original.repricing_drop_percent},repricing_floor_percent=${original.repricing_floor_percent},monitor_enabled=${original.monitor_enabled} where user_id=${phase.seller}`;
    await sql.end();
  }
  console.log(
    JSON.stringify({
      passed: records.filter((r) => r.passed).length,
      failed: records.filter((r) => !r.passed).length,
      artifact: out,
    }),
  );
  process.exit(records.some((r) => !r.passed) ? 1 : 0);
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
