import { expect, test } from "@playwright/test";

test.describe("public and authentication surfaces", () => {
  test("home page renders primary navigation", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "Sign in to QuoteBase." }),
    ).toBeVisible();
    await expect(
      page.getByText("Approved users only"),
    ).toBeVisible();
    await expect(
      page.getByText("Tenant-scoped data access"),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Send magic link" }),
    ).toBeVisible();
  });

  test("login page exposes magic-link form without public email examples", async ({
    page,
  }) => {
    await page.goto("/login");

    await expect(
      page.getByRole("heading", { name: "Sign in to QuoteBase." }),
    ).toBeVisible();
    await expect(page.getByLabel("Work email")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Send magic link" }),
    ).toBeVisible();
    await expect(page.getByText("Approved users only")).toBeVisible();
    await expect(page.getByText("Tenant-scoped data access")).toBeVisible();
    await expect(page.getByText("Audited quote workflow")).toBeVisible();
    await expect(page.getByText("owner@demo-distributor.test")).toHaveCount(0);
    await expect(page.getByText("admin@demo-distributor.test")).toHaveCount(0);
  });

  test("protected dashboard redirects anonymous users to login", async ({
    page,
  }) => {
    await page.goto("/dashboard");

    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole("heading", { name: "Sign in to QuoteBase." }),
    ).toBeVisible();
  });

  test("unknown public quote token returns not found", async ({ page }) => {
    const response = await page.goto("/q/not-a-real-token");

    expect(response?.status()).toBe(404);
    await expect(page.getByText(/404|not found/i)).toBeVisible();
  });
});
