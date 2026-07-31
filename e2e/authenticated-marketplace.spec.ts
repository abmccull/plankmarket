import { expect, test } from "playwright/test";

const buyerStorageState = process.env.E2E_BUYER_STORAGE_STATE?.trim();
const sellerStorageState = process.env.E2E_SELLER_STORAGE_STATE?.trim();

test.describe("authenticated buyer journey", () => {
  test.skip(
    !buyerStorageState,
    "Set E2E_BUYER_STORAGE_STATE to a Playwright storage-state file.",
  );
  test.use({ storageState: buyerStorageState });

  test("buyer can open their request workspace", async ({ page }) => {
    const response = await page.goto("/buyer/requests");
    expect(response?.status()).toBeLessThan(400);
    await expect(page).not.toHaveURL(/\/login(?:[/?]|$)/);
    await expect(page.getByRole("heading", { name: /buyer requests/i })).toBeVisible();
  });
});

test.describe("authenticated seller journey", () => {
  test.skip(
    !sellerStorageState,
    "Set E2E_SELLER_STORAGE_STATE to a Playwright storage-state file.",
  );
  test.use({ storageState: sellerStorageState });

  test("seller can open their marketplace dashboard", async ({ page }) => {
    const response = await page.goto("/seller");
    expect(response?.status()).toBeLessThan(400);
    await expect(page).not.toHaveURL(/\/login(?:[/?]|$)/);
    await expect(
      page.getByRole("heading", { name: /seller dashboard/i }),
    ).toBeVisible();
  });
});
