import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "playwright/test";

const publicRoutes = [
  {
    path: "/",
    heading: /Buy closeout flooring\.\s*Sell your surplus\./i,
  },
  {
    path: "/listings",
    heading: /^Flooring listings$/i,
  },
  {
    path: "/seller-guide",
    heading: /sell|seller/i,
  },
] as const;

async function expectNoBlockingAccessibilityViolations(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = result.violations
    .filter(({ impact }) => impact === "critical" || impact === "serious")
    .map(({ id, impact, nodes }) => ({
      id,
      impact,
      targets: nodes.flatMap((node) => node.target),
    }));

  expect(blocking, "serious or critical accessibility violations").toEqual([]);
}

for (const route of publicRoutes) {
  test(`${route.path} is public, rendered, and accessible`, async ({ page }) => {
    const response = await page.goto(route.path, {
      waitUntil: "domcontentloaded",
    });

    expect(response, `${route.path} did not return a document response`).not.toBeNull();
    expect(response!.status(), `${route.path} returned an error response`).toBeLessThan(
      400,
    );
    await expect(page).not.toHaveURL(/\/(?:login|register)(?:[/?]|$)/);
    await expect(
      page.getByRole("heading", { level: 1, name: route.heading }),
    ).toBeVisible();
    await expectNoBlockingAccessibilityViolations(page);
  });
}

for (const path of ["/buyer", "/seller/listings/new", "/admin"]) {
  test(`${path} sends signed-out visitors to sign in`, async ({ page }) => {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login\?redirect=/);
    expect(new URL(page.url()).searchParams.get("redirect")).toBe(path);
    await expect(page.getByRole("heading", { name: /sign in|welcome back/i }).first()).toBeVisible();
  });
}
