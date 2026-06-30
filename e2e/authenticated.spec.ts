import { expect, test } from "@playwright/test";

import { signInAsLocalAdmin } from "./helpers/auth";

test.describe("authenticated admin workspace", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await signInAsLocalAdmin(page);
  });

  test("loads the admin dashboard with tenant-scoped profile details", async ({
    page,
  }) => {
    await expect(page.getByText("Welcome, Rinsad.")).toBeVisible();

    await expect(
      page.getByText("Your workspace is scoped to Demo Distributor."),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "New Quote" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  });

  test("can navigate to core authenticated workspaces", async ({ page }) => {
    await page.getByRole("link", { name: "Customers" }).click();
    await expect(page).toHaveURL(/\/customers$/);
    await expect(
      page.getByRole("heading", { name: "Customers and job sites" }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Pipeline" }).click();
    await page.getByRole("link", { name: "New Quote" }).click();
    await expect(page).toHaveURL(/\/quotes\/new$/);
    await expect(
      page.getByRole("heading", { name: "New Draft Quote" }),
    ).toBeVisible();
    await expect(page.getByText("Create a priced draft.")).toBeVisible();

    await page.getByRole("link", { name: "Dashboard" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("admin-only system check is available to the local admin", async ({
    page,
  }) => {
    await page.goto("/admin/system-check");

    await expect(page).toHaveURL(/\/admin\/system-check$/);
    await expect(
      page.getByRole("heading", { name: "System Check" }),
    ).toBeVisible();
    await expect(page.getByText("Admin authorization")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Feature flags" }),
    ).toBeVisible();
  });

  test("authenticated API reads use the standard success envelope", async ({
    page,
  }) => {
    const response = await page.request.get("/api/customers");

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      error: null,
      meta: expect.any(Object),
    });
    expect(Array.isArray(body.data.customers)).toBe(true);
  });
});
