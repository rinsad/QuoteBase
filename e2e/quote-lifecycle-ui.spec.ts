import { expect, test, type Page } from "@playwright/test";

import { signInWithMagicLink } from "./helpers/auth";
import {
  getQuoteFixtureData,
  waitForAuditAction,
  waitForQuoteStatus,
} from "./helpers/db";

const ADMIN_EMAIL = "rinsad@gmail.com";
const ACCOUNT_MANAGER_EMAIL = "estimate@westernmaterials.net";
const ESTIMATOR_EMAIL = "dispatch@westernmaterials.net";

test.describe("quote lifecycle UI", () => {
  test("draft quote can move through submit, approve, sent, and accepted states", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await signInWithMagicLink(page, ESTIMATOR_EMAIL);

    const quote = await createDraftQuote(page, ESTIMATOR_EMAIL);

    await page.goto(`/quotes/${quote.id}`);
    await expect(page.getByText("Draft", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Submit for approval" }).click();

    await waitForQuoteStatus({
      quoteId: quote.id,
      status: "pending_approval",
    });
    await waitForAuditAction({
      targetId: quote.id,
      action: "quote.submitted_for_approval",
    });

    await page.goto(`/quotes/${quote.id}`);
    await expect(
      page.getByText("Pending Approval", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Approve quote" }),
    ).toHaveCount(0);

    await signOut(page);
    await signInWithMagicLink(page, ADMIN_EMAIL);

    await page.goto(`/quotes/${quote.id}`);
    await expect(
      page.getByRole("button", { name: "Approve quote" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Approve quote" }).click();

    await waitForQuoteStatus({
      quoteId: quote.id,
      status: "approved",
    });
    await waitForAuditAction({
      targetId: quote.id,
      action: "quote.approved",
    });

    await signOut(page);
    await signInWithMagicLink(page, ACCOUNT_MANAGER_EMAIL);

    await page.goto(`/quotes/${quote.id}`);
    await expect(
      page.getByText("Approved", { exact: true }).first(),
    ).toBeVisible();
    await page
      .locator('[name="send_note"]')
      .fill("E2E lifecycle marked sent.");
    await page.getByRole("button", { name: "Mark quote sent" }).click();

    const sentQuote = await waitForQuoteStatus({
      quoteId: quote.id,
      status: "sent",
    });
    await waitForAuditAction({
      targetId: quote.id,
      action: "quote.sent",
    });

    expect(String(sentQuote.notes)).toContain("E2E lifecycle marked sent.");

    await page.goto(`/quotes/${quote.id}`);
    await expect(page.getByText("Sent", { exact: true }).first()).toBeVisible();
    await page
      .locator('[name="customer_response_note"]')
      .first()
      .fill("E2E customer accepted.");
    await page.getByRole("button", { name: "Mark accepted" }).click();

    const acceptedQuote = await waitForQuoteStatus({
      quoteId: quote.id,
      status: "accepted",
    });
    await waitForAuditAction({
      targetId: quote.id,
      action: "quote.accepted",
    });

    expect(String(acceptedQuote.notes)).toContain("E2E customer accepted.");

    await page.goto(`/quotes/${quote.id}`);
    await expect(
      page.getByText("Accepted", { exact: true }).first(),
    ).toBeVisible();
  });

  test("admin can request changes and estimator can resubmit from changes requested", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await signInWithMagicLink(page, ESTIMATOR_EMAIL);

    const quote = await createDraftQuote(page, ESTIMATOR_EMAIL);

    await page.goto(`/quotes/${quote.id}`);
    await page.getByRole("button", { name: "Submit for approval" }).click();
    await waitForQuoteStatus({
      quoteId: quote.id,
      status: "pending_approval",
    });

    await signOut(page);
    await signInWithMagicLink(page, ADMIN_EMAIL);

    await page.goto(`/quotes/${quote.id}`);
    await page
      .locator('[name="change_request_comment"]')
      .fill("E2E needs a revised delivery note.");
    await page.getByRole("button", { name: "Request changes" }).click();

    const changesRequestedQuote = await waitForQuoteStatus({
      quoteId: quote.id,
      status: "changes_requested",
    });
    await waitForAuditAction({
      targetId: quote.id,
      action: "quote.changes_requested",
    });

    expect(String(changesRequestedQuote.notes)).toContain(
      "E2E needs a revised delivery note.",
    );

    await signOut(page);
    await signInWithMagicLink(page, ESTIMATOR_EMAIL);

    await page.goto(`/quotes/${quote.id}`);
    await expect(
      page.getByText("Changes Requested", { exact: true }).first(),
    ).toBeVisible();
    await page.getByRole("button", { name: "Submit for approval" }).click();

    await waitForQuoteStatus({
      quoteId: quote.id,
      status: "pending_approval",
    });
    await waitForAuditAction({
      targetId: quote.id,
      action: "quote.submitted_for_approval",
    });
  });
});

async function createDraftQuote(
  page: Page,
  email: string,
): Promise<{ id: string; quoteNumber: string }> {
  const fixture = await getQuoteFixtureData(email);
  const uniqueSuffix = Date.now().toString();
  const response = await page.request.post("/api/quotes", {
    data: {
      customer_name: `E2E Lifecycle Customer ${uniqueSuffix}`,
      company_name: `E2E Lifecycle Customer ${uniqueSuffix}`,
      contact_name: "E2E Lifecycle Contact",
      contact_email: `lifecycle-${uniqueSuffix}@example.test`,
      contact_phone: "555-0404",
      customer_address: "600 Lifecycle Yard",
      payment_terms: "Net 30",
      site_name: `E2E Lifecycle Site ${uniqueSuffix}`,
      site_address: "700 Lifecycle Site",
      site_city: fixture.siteCity,
      site_county: fixture.siteCounty,
      site_state: fixture.siteState,
      site_latitude: 34.0522,
      site_longitude: -118.2437,
      manual_route_distance_miles: 12,
      manual_deadhead_distance_miles: 4,
      material_id: fixture.materialId,
      tax_rate_id: fixture.taxRateId,
      quantity: 12,
      notes: "Created by Playwright quote lifecycle UI test.",
      use_selected_plant: true,
    },
  });
  const body = await response.json();

  expect(response.status()).toBe(201);
  expect(body.error).toBeNull();

  return {
    id: body.data.quote.id,
    quoteNumber: body.data.quote.quote_number,
  };
}

async function signOut(page: Page): Promise<void> {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
}
