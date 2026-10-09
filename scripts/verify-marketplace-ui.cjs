/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS acceptance runner. */
/* Browser acceptance: see docs/MARKETPLACE_9_OF_10_PLAN.md failure scenarios written before implementation.
 * Only the explicitly named disposable loopback fixture is allowed. No providers/workers.
 * Usage: node scripts/verify-marketplace-ui.cjs --disposable-local
 */
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { chromium } = require("playwright"),
  { expect } = require("playwright/test"),
  postgres = require("postgres");
assert(
  process.argv.includes("--disposable-local"),
  "Requires explicit --disposable-local",
);
const fixturesDir =
  process.env.MARKETPLACE_UI_FIXTURES_DIR || "tmp/design-review-20260929";
const proof = JSON.parse(
  fs.readFileSync(path.join(fixturesDir, "database-proof.json")),
);
assert.equal(
  proof.target,
  "postgresql://postgres@127.0.0.1:55439/plankmarket_bootstrap_design_20260929",
);
const sessions = JSON.parse(
  fs.readFileSync(path.join(fixturesDir, "browser-sessions.json")),
).sessions;
const phase = JSON.parse(
  fs.readFileSync(path.join(fixturesDir, "phase-b-fixtures.json")),
);
const base = process.env.MARKETPLACE_UI_BASE_URL || "http://localhost:3101",
  out =
    process.env.MARKETPLACE_UI_PROOF_DIR || "tmp/marketplace-excellence/proof";
assert(
  [
    "http://localhost:3101",
    "http://localhost:3103",
    "https://localhost:3104",
  ].includes(base),
  "Only the disposable local app ports are allowed",
);
fs.mkdirSync(out, { recursive: true });
const db = postgres(proof.target, { max: 1 }),
  records = [];
let browser;
async function run(name, role, size, fn) {
  const ctx = await browser.newContext({
    viewport: size,
    bypassCSP: true,
    ignoreHTTPSErrors: base === "https://localhost:3104",
  });
  if (role)
    await ctx.addCookies([{ ...sessions[role].cookie, domain: "localhost" }]);
  const p = await ctx.newPage();
  p.setDefaultTimeout(12000);
  p.setDefaultNavigationTimeout(45000);
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  const row = {
    name,
    role,
    viewport: size,
    startedAt: new Date().toISOString(),
  };
  try {
    await fn(p);
    row.passed = true;
  } catch (e) {
    row.passed = false;
    row.error = e.message;
  } finally {
    row.url = p.url();
    row.pageErrors = errors;
    row.text = await p
      .locator("body")
      .innerText()
      .catch(() => null);
    try {
      await p.screenshot({
        path: path.join(out, name + ".png"),
        animations: "disabled",
        timeout: 8000,
      });
      row.screenshot = name + ".png";
    } catch (e) {
      row.screenshotError = e.message;
    }
    records.push(row);
    fs.writeFileSync(
      path.join(out, "acceptance.json"),
      JSON.stringify(records, null, 2),
    );
    console.log(
      (row.passed ? "PASS " : "FAIL ") +
        name +
        (row.error ? ": " + row.error.split("\n")[0] : ""),
    );
    await ctx.close();
  }
}
async function go(p, route) {
  await p.goto(base + route, { waitUntil: "domcontentloaded" });
}
const desktop = { width: 1440, height: 1000 },
  mobile = { width: 390, height: 844 };
(async () => {
  browser = await chromium.launch({ headless: true });
  try {
    for (const width of [1024, 1100, 1279, 1280])
      await run("table-" + width, null, { width, height: 1000 }, async (p) => {
        await go(p, "/listings?limit=50");
        await expect(
          p
            .getByRole("link", {
              name: "Synthetic engineered oak acceptance lot",
            })
            .last(),
        ).toBeVisible();
        const table = await p
          .getByRole("link", {
            name: "Synthetic engineered oak acceptance lot",
            exact: true,
          })
          .last()
          .locator("xpath=ancestor::tr")
          .evaluate((row) => {
            const t = row.closest("table");
            const visible = (e) => getComputedStyle(e).display !== "none";
            return {
              heads: [...t.querySelectorAll("th")]
                .filter(visible)
                .map((e) => e.textContent.trim()),
              cells: [...row.querySelectorAll("td")]
                .filter(visible)
                .map((e) => e.textContent.trim()),
            };
          });
        assert.equal(table.heads.length, table.cells.length);
        const values = Object.fromEntries(
          table.heads.map((h, i) => [h, table.cells[i]]),
        );
        assert.match(values["Sq Ft"], /900/);
        assert.equal(values["$/sq ft"], "$2.00");
        assert.equal(values["Lot Value"], "$1,800.00");
        assert.match(values.Material, /Engineered/);
      });
    await db`update agent_configs set offer_auto_enabled=true,repricing_enabled=true,monitor_enabled=true where user_id=${phase.seller}`;
    for (const [tab, label, save, column] of [
      [
        "Offer Rules",
        "Auto-handle incoming offers",
        "Save Offer Rules",
        "offer_auto_enabled",
      ],
      [
        "Smart Repricing",
        "Auto-reprice stale listings",
        "Save Repricing Rules",
        "repricing_enabled",
      ],
    ])
      await run("disable-" + column, "seller", desktop, async (p) => {
        await go(p, "/settings/agent");
        await p.getByRole("tab", { name: tab, exact: true }).click();
        const toggle = p.getByRole("switch", { name: label });
        await expect(toggle).toHaveAttribute("aria-checked", "true");
        await toggle.click();
        await expect(p.getByRole("button", { name: save })).toBeVisible();
        await expect(p.getByText(/not saved|unsaved/i).first()).toBeVisible();
        await p.getByRole("button", { name: save }).click();
        await expect
          .poll(async () => {
            const [r] =
              await db`select offer_auto_enabled,repricing_enabled,monitor_enabled from agent_configs where user_id=${phase.seller}`;
            return r[column];
          })
          .toBe(false);
        await p.reload();
        await p.getByRole("tab", { name: tab, exact: true }).click();
        await expect(p.getByRole("switch", { name: label })).toHaveAttribute(
          "aria-checked",
          "false",
        );
      });
    await run("automation-failed-save", "seller", mobile, async (p) => {
      await go(p, "/settings/agent");
      const toggle = p.getByRole("switch", {
        name: "Auto-handle incoming offers",
      });
      await expect(toggle).toHaveAttribute("aria-checked", "false");
      await toggle.click();
      await p.route(/\/api\/trpc\/.*agent\.updateOfferRules/, (r) =>
        r.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify([
            {
              error: {
                json: {
                  message: "Synthetic save failure",
                  code: -32603,
                  data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 },
                },
              },
            },
          ]),
        }),
      );
      await p.getByRole("button", { name: "Save Offer Rules" }).click();
      await expect(
        p.getByText(/couldn't confirm your save/i).first(),
      ).toBeVisible();
      const [row] =
        await db`select offer_auto_enabled from agent_configs where user_id=${phase.seller}`;
      assert.equal(row.offer_auto_enabled, false);
      await expect(p.getByText(/not saved|unsaved/i).first()).toBeVisible();
    });
    await run(
      "automation-draft-survives-other-save",
      "seller",
      mobile,
      async (p) => {
        await go(p, "/settings/agent");
        const offer = p.getByRole("tabpanel", {
          name: "Offer Rules",
          exact: true,
        });
        await offer.getByRole("switch").click();
        await offer
          .getByLabel("Accept at or above (%)", { exact: true })
          .fill("94");
        await p
          .getByRole("tab", { name: "Smart Repricing", exact: true })
          .click();
        await p
          .getByRole("tabpanel", { name: "Smart Repricing", exact: true })
          .getByRole("button", { name: "Save Repricing Rules" })
          .click();
        await expect(
          p.getByRole("tab", { name: "Smart Repricing", exact: true }),
        ).toHaveAttribute("aria-selected", "true");
        await p.getByRole("tab", { name: "Offer Rules", exact: true }).click();
        await expect(
          offer.getByLabel("Accept at or above (%)", { exact: true }),
        ).toHaveValue("94");
        await expect(offer.getByText(/unsaved changes/i)).toBeVisible();
        await offer
          .getByLabel("Accept at or above (%)", { exact: true })
          .fill("1");
        await offer.getByRole("switch").click();
        await offer.getByRole("button", { name: "Save Offer Rules" }).click();
        await expect(offer.getByText(/Last confirmed: disabled/)).toBeVisible();
      },
    );
    await run("expired-pro-owner-can-stop", "seller", mobile, async (p) => {
      const [before] =
        await db`select pro_status,pro_expires_at from users where id=${phase.seller}`;
      try {
        await db`update users set pro_status='free',pro_expires_at=null where id=${phase.seller}`;
        await db`update agent_configs set offer_auto_enabled=true where user_id=${phase.seller}`;
        await go(p, "/settings/agent");
        await expect(
          p.getByText(
            "Pro is required to enable offer handling and repricing.",
            {
              exact: false,
            },
          ),
        ).toBeVisible();
        const panel = p.getByRole("tabpanel", {
          name: "Offer Rules",
          exact: true,
        });
        await panel.getByRole("switch").click();
        await panel.getByRole("button", { name: "Save Offer Rules" }).click();
        await expect
          .poll(
            async () =>
              (
                await db`select offer_auto_enabled from agent_configs where user_id=${phase.seller}`
              )[0].offer_auto_enabled,
          )
          .toBe(false);
        await expect(panel.getByRole("switch")).toBeDisabled();
      } finally {
        await db`update users set pro_status=${before.pro_status},pro_expires_at=${before.pro_expires_at} where id=${phase.seller}`;
      }
    });
    await run("buyer-agent-role-controls", "buyer", mobile, async (p) => {
      await go(p, "/settings/agent");
      await expect(
        p.getByRole("tab", { name: "Saved-search alerts", exact: true }),
      ).toBeVisible();
      await expect(
        p.getByRole("tab", { name: "Offer Rules", exact: true }),
      ).toHaveCount(0);
      await expect(
        p.getByRole("tab", { name: "Smart Repricing", exact: true }),
      ).toHaveCount(0);
    });
    for (const role of ["buyer", "seller"])
      await run("canonical-alerts-" + role, role, mobile, async (p) => {
        const owner = role === "seller" ? phase.seller : proof.fixtures.buyer;
        const [search] =
          await db`insert into saved_searches(user_id,name,filters,alert_enabled,alert_frequency,alert_channels) values (${owner},'Acceptance alert preferences','{}'::jsonb,true,'daily','["email"]'::jsonb) returning id`;
        try {
          await go(p, "/settings/agent");
          await p
            .getByRole("tab", { name: "Saved-search alerts", exact: true })
            .click();
          await expect(
            p.getByRole("switch", {
              name: "Monitor saved searches for new matches",
            }),
          ).toHaveCount(0);
          const summary = p.getByRole("list", {
            name: "Saved-search alert settings",
          });
          await expect(
            summary.getByText("Acceptance alert preferences"),
          ).toBeVisible();
          await expect(
            summary.getByText("Daily digest · Email", { exact: true }).first(),
          ).toBeVisible();
          await p
            .getByRole("link", { name: "Manage saved searches", exact: true })
            .click();
          await expect(
            p.getByRole("heading", { name: "Saved Searches", exact: true }),
          ).toBeVisible();
          await p
            .getByRole("button", {
              name: "Edit Acceptance alert preferences",
              exact: true,
            })
            .click();
          const dialog = p.getByRole("dialog");
          await dialog
            .getByRole("button", { name: "Weekly digest", exact: true })
            .click();
          await dialog.getByRole("button", { name: /In-App/ }).click();
          await dialog.getByRole("button", { name: /Email/ }).click();
          await dialog
            .getByRole("button", { name: "Save", exact: true })
            .click();
          await expect(dialog).toBeHidden();
          const [saved] =
            await db`select alert_frequency,alert_channels from saved_searches where id=${search.id}`;
          assert.equal(saved.alert_frequency, "weekly");
          assert.deepEqual(saved.alert_channels, ["in_app"]);
          await p.reload();
          await p
            .getByRole("button", {
              name: "Edit Acceptance alert preferences",
              exact: true,
            })
            .click();
          await expect(
            dialog.getByRole("button", { name: "Weekly digest", exact: true }),
          ).toHaveAttribute("aria-pressed", "true");
          await dialog
            .getByRole("switch", { name: "Alerts for this saved search" })
            .click();
          await dialog
            .getByRole("button", { name: "Save", exact: true })
            .click();
          await expect(dialog).toBeHidden();
          assert.equal(
            (
              await db`select alert_enabled from saved_searches where id=${search.id}`
            )[0].alert_enabled,
            false,
          );
          if (role === "buyer") {
            await go(p, "/buyer/saved-searches");
            await expect(p).toHaveURL(/settings\/saved-searches/);
            await expect(
              p.getByRole("button", {
                name: "Edit Acceptance alert preferences",
                exact: true,
              }),
            ).toBeVisible();
          }
          assert.equal(
            await p.evaluate(
              () => document.documentElement.scrollWidth > innerWidth,
            ),
            false,
          );
        } finally {
          await db`delete from saved_searches where id=${search.id} and user_id=${owner}`;
        }
      });
    for (const [name, route, procedure, title, empty, tab] of [
      [
        "failed-transfers-error",
        "/admin/finance",
        "admin.getFailedTransfers",
        /couldn't check failed transfers/i,
        "No failed transfers",
        "Failed Transfers",
      ],
      [
        "moderation-error",
        "/admin/moderation",
        "admin.getContentViolations",
        /couldn't load.*moderation|couldn't load flagged content/i,
        "No violations found",
        null,
      ],
    ])
      await run(name, "admin", desktop, async (p) => {
        await p.route(
          new RegExp("/api/trpc/.*" + procedure.replaceAll(".", "\\.")),
          (r) =>
            r.fulfill({
              status: 500,
              contentType: "application/json",
              body: JSON.stringify([
                {
                  error: {
                    json: {
                      message: "Synthetic query failure",
                      code: -32603,
                      data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 },
                    },
                  },
                },
              ]),
            }),
        );
        await go(p, route);
        if (tab) await p.getByRole("tab", { name: tab }).click();
        await expect(p.getByRole("heading", { name: title })).toBeVisible({
          timeout: 20000,
        });
        await expect(p.getByText(empty, { exact: true })).toHaveCount(0);
        await expect(
          p.getByRole("button", { name: "Try again" }),
        ).toBeVisible();
      });
    await run("failed-transfers-empty", "admin", mobile, async (p) => {
      await go(p, "/admin/finance");
      await p.getByRole("tab", { name: "Failed Transfers" }).click();
      await expect(
        p.getByText("No failed transfers", { exact: true }),
      ).toBeVisible();
    });
    for (const role of ["buyer", "seller"])
      await run("offer-order-" + role, role, mobile, async (p) => {
        await go(p, "/offers/" + phase.offer);
        const link = p.getByRole("link", { name: "View Order" }).first();
        await expect(link).toHaveAttribute(
          "href",
          `/${role}/orders/${phase.orders[0].id}`,
        );
        await link.click();
        await expect(
          p.getByRole("heading", {
            name: "Order " + phase.orders[0].order_number,
            exact: true,
          }),
        ).toBeVisible();
      });
    await run("pro-unconfirmed", "buyer", mobile, async (p) => {
      await go(p, "/pro/success?session_id=synthetic-unconfirmed");
      await expect(
        p.getByRole("heading", {
          name: /confirming.*subscription|subscription.*not.*confirmed/i,
        }),
      ).toBeVisible();
      await expect(p.getByText(/Your subscription is active/)).toHaveCount(0);
      await expect(
        p.getByRole("button", { name: /check.*status|try again/i }),
      ).toBeVisible();
    });
    for (const role of ["buyer", "seller"])
      await run("navigation-" + role, role, mobile, async (p) => {
        await go(p, "/" + role);
        await expect(
          p.getByRole("button", { name: "Open user menu" }),
        ).toBeVisible();
        await p.getByRole("button", { name: "Open navigation menu" }).click();
        await expect(
          p.getByRole("link", { name: "Offers", exact: true }),
        ).toBeVisible();
        await expect(p.getByRole("link", { name: /^Messages/ })).toBeVisible();
        await expect(
          p.getByRole("link", { name: "Notifications", exact: true }),
        ).toBeVisible();
      });
  } finally {
    await browser?.close();
    await db.end();
    fs.writeFileSync(
      path.join(out, "acceptance.json"),
      JSON.stringify(records, null, 2),
    );
    const failed = records.filter((r) => !r.passed);
    console.log(
      JSON.stringify({
        passed: records.length - failed.length,
        failed: failed.length,
        artifact: path.join(out, "acceptance.json"),
      }),
    );
    if (failed.length) process.exitCode = 1;
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
