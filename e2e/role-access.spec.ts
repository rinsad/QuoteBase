import { expect, test, type Page } from "@playwright/test";

import { signInWithMagicLink } from "./helpers/auth";

const ADMIN_EMAIL = "rinsad@gmail.com";
const ACCOUNT_MANAGER_EMAIL = "estimate@westernmaterials.net";
const ESTIMATOR_EMAIL = "dispatch@westernmaterials.net";

test.describe("role-based access control", () => {
  test.describe.configure({ mode: "serial" });

  test("admin can access admin-only and approval routes", async ({ page }) => {
    await signInWithMagicLink(page, ADMIN_EMAIL);

    await expect(roleTile(page)).toContainText("Admin");

    await page.goto("/admin/pricing");
    await expect(page).toHaveURL(/\/admin\/pricing$/);
    await expect(
      page.getByRole("heading", { name: "Pricing Rules", level: 1 }),
    ).toBeVisible();

    await page.goto("/quotes/approvals");
    await expect(page).toHaveURL(/\/quotes\/approvals$/);
    await expect(
      page.getByRole("heading", { name: "Approval Queue" }),
    ).toBeVisible();
  });

  test("account manager can access operational admin pages but not admin-only routes", async ({
    page,
  }) => {
    await signInWithMagicLink(page, ACCOUNT_MANAGER_EMAIL);

    await expect(roleTile(page)).toContainText("Account Manager");

    await page.goto("/admin/plants");
    await expect(page).toHaveURL(/\/admin\/plants$/);
    await expect(
      page.getByRole("heading", { name: "Plants & Materials" }),
    ).toBeVisible();

    await page.goto("/admin/material-prices");
    await expect(page).toHaveURL(/\/admin\/material-prices$/);
    await expect(
      page.getByRole("heading", { name: "Material Prices" }),
    ).toBeVisible();

    await page.goto("/admin/pricing");
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto("/quotes/approvals");
    await expect(page).toHaveURL(/\/quotes$/);
  });

  test("estimator can use quote creation but cannot access admin surfaces", async ({
    page,
  }) => {
    await signInWithMagicLink(page, ESTIMATOR_EMAIL);

    await expect(roleTile(page)).toContainText("Estimator");

    await page.goto("/quotes/new");
    await expect(page).toHaveURL(/\/quotes\/new$/);
    await expect(
      page.getByRole("heading", { name: "New Draft Quote" }),
    ).toBeVisible();

    await page.goto("/admin/plants");
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto("/admin/material-prices");
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto("/admin/system-check");
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});

function roleTile(page: Page) {
  return page.locator(".glass-tile").filter({ hasText: "Role" });
}
