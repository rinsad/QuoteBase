import { expect, test } from "@playwright/test";

test.describe("public and authentication surfaces", () => {
  test("home page renders primary navigation", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", {
        name: "A command center for quoting, pricing, approvals, and follow-up.",
      }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Open login" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "View dashboard" }),
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
    await expect(page.getByText("Approved roles")).toBeVisible();
    await expect(page.getByText("Operations admin")).toBeVisible();
    await expect(page.getByText("john@westernmaterials.net")).toHaveCount(0);
    await expect(page.getByText("rinsad@gmail.com")).toHaveCount(0);
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
