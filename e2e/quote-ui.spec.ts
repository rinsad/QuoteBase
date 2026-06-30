import { expect, test } from "@playwright/test";

import { signInWithMagicLink } from "./helpers/auth";
import { getQuoteFixtureData, waitForAuditAction } from "./helpers/db";

const ESTIMATOR_EMAIL = "dispatch@demo-distributor.test";

test.describe("quote creation UI", () => {
  test("estimator can create a draft quote from the browser form", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    await signInWithMagicLink(page, ESTIMATOR_EMAIL);

    const fixture = await getQuoteFixtureData(ESTIMATOR_EMAIL);
    const uniqueSuffix = Date.now().toString();
    const customerName = `E2E UI Customer ${uniqueSuffix}`;
    const siteName = `E2E UI Site ${uniqueSuffix}`;

    await page.goto("/quotes/new");
    await expect(
      page.getByRole("heading", { name: "New Draft Quote" }),
    ).toBeVisible();

    await page.locator('[name="company_name"]').fill(customerName);
    await page.locator('[name="customer_name"]').fill(customerName);
    await page.locator('[name="contact_name"]').fill("E2E UI Contact");
    await page
      .locator('[name="contact_email"]')
      .fill(`quote-ui-${uniqueSuffix}@example.test`);
    await page.locator('[name="contact_phone"]').fill("555-0101");
    await page.locator('[name="customer_address"]').fill("100 UI Test Yard");
    await page.locator('[name="payment_terms"]').fill("Net 30");

    await page.locator('[name="site_name"]').fill(siteName);
    await page.locator('[name="site_address"]').fill("200 UI Test Site");
    await page.locator('[name="site_city"]').fill(fixture.siteCity);
    await page.locator('[name="site_county"]').fill(fixture.siteCounty);
    await page.locator('[name="site_state"]').fill(fixture.siteState);
    await page.locator('[name="site_latitude"]').fill("34.0522");
    await page.locator('[name="site_longitude"]').fill("-118.2437");

    await page.locator('[name="material_id"]').selectOption(fixture.materialId);
    await page.locator('[name="quantity"]').fill("12");
    await page.locator('[name="manual_route_distance_miles"]').fill("12");
    await page.locator('[name="manual_deadhead_distance_miles"]').fill("4");
    await page.locator('[name="tax_rate_id"]').selectOption(fixture.taxRateId);
    await page
      .locator('[name="notes"]')
      .fill("Created by Playwright UI quote workflow test.");

    await expect(page.getByText("Draft quote total")).toBeVisible();

    await page.getByRole("button", { name: "Save draft quote" }).click();
    await expect(page).toHaveURL(/\/quotes\/[0-9a-f-]+\?created=QB-/i, {
      timeout: 30_000,
    });

    const quoteId = new URL(page.url()).pathname.split("/").at(-1);

    if (!quoteId) {
      throw new Error("Quote detail URL did not include a quote id.");
    }

    await expect(
      page.getByText(/Draft quote QB-.* was saved and logged\./),
    ).toBeVisible();
    await expect(page.getByText("Draft", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(customerName)).toBeVisible();
    await expect(page.getByText(siteName)).toBeVisible();
    await expect(page.getByText("Line Items")).toBeVisible();
    await expect(page.getByText("Audit")).toBeVisible();
    await expect(page.getByText("Quote Draft Created")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Submit for approval" }),
    ).toBeVisible();

    const audit = await waitForAuditAction({
      targetId: quoteId,
      action: "quote.draft_created",
    });

    expect(audit.after_value).toMatchObject({
      status: "draft",
    });
    expect(audit.metadata).toMatchObject({
      new_customer: true,
      manual_route_distance_miles: 12,
      manual_deadhead_distance_miles: 4,
    });
  });
});
