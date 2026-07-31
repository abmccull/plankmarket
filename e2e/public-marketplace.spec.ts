import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "playwright/test";

const publicRoutes = [
  {
    path: "/",
    heading: /Your Closeout Inventory Is Losing Value Right Now/i,
  },
  {
    path: "/listings",
    heading: /Browse surplus flooring listings/i,
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
