import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { signInWithMagicLink } from "./helpers/auth";
import {
  getQuoteFixtureData,
  waitForAuditAction,
  waitForLatestPublicLink,
  waitForLatestQuoteDocument,
  waitForQuoteStatus,
} from "./helpers/db";

const ADMIN_EMAIL = "admin@demo-distributor.test";
const ESTIMATOR_EMAIL = "dispatch@demo-distributor.test";

test.describe("public quote links and documents", () => {
  test("sent quote public link can be viewed and accepted without authentication", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await signInWithMagicLink(page, ESTIMATOR_EMAIL);

    const quote = await createDraftQuote(page, ESTIMATOR_EMAIL);

    await submitApproveAndSendQuote(page, quote.id);
    await page.goto(`/quotes/${quote.id}`);
    await page.getByRole("button", { name: "Create customer link" }).click();
    await expect(page).toHaveURL(/public_link=/, { timeout: 30_000 });

    const publicUrl = new URL(page.url()).searchParams.get("public_link");
    const publicLink = await waitForLatestPublicLink({ quoteId: quote.id });

    expect(publicUrl).toContain("/q/");
    expect(publicLink.revoked_at).toBeNull();

    await signOut(page);
    await page.goto(publicUrl ?? "");

    await expect(page.getByRole("heading", { name: "Quote" })).toBeVisible();
    await expect(page.getByText(quote.quoteNumber)).toBeVisible();
    await expect(page.getByRole("button", { name: "Accept quote" })).toBeVisible();

    await waitForQuoteStatus({
      quoteId: quote.id,
      status: "viewed",
    });
    await waitForAuditAction({
      targetId: quote.id,
      action: "quote.customer_viewed",
    });

    await page
      .locator('[name="response_note"]')
      .fill("E2E public customer accepted.");
    await page.getByRole("button", { name: "Accept quote" }).click();
    await expect(page).toHaveURL(/responded=accepted/, { timeout: 30_000 });
    await expect(page.getByText("Your response has been recorded.")).toBeVisible();

    const acceptedQuote = await waitForQuoteStatus({
      quoteId: quote.id,
      status: "accepted",
    });
    await waitForAuditAction({
      targetId: quote.id,
      action: "quote.customer_accepted",
    });

    expect(String(acceptedQuote.notes)).toContain(
      "E2E public customer accepted.",
    );
  });

  test("approved quote document generation is authenticated and downloadable", async ({
    page,
    request,
  }) => {
    test.setTimeout(90_000);

    await signInWithMagicLink(page, ESTIMATOR_EMAIL);

    const quote = await createDraftQuote(page, ESTIMATOR_EMAIL);

    await submitAndApproveQuote(page, quote.id);
    await page.goto(`/quotes/${quote.id}`);
    await page.getByRole("button", { name: "Generate document" }).click();
    await expect(page).toHaveURL(/document_created=1/, { timeout: 30_000 });

    const document = await waitForLatestQuoteDocument({ quoteId: quote.id });

    expect(document).toMatchObject({
      quote_id: quote.id,
      version: 1,
      document_type: "html",
      status: "generated",
    });

    await waitForAuditAction({
      targetId: quote.id,
      action: "quote.document_created",
    });

    const anonymousDownload = await request.get(
      `/api/quote-documents/${document.id}/download`,
      {
        maxRedirects: 0,
      },
    );

    expect(anonymousDownload.status()).toBe(401);

    const authenticatedDownload = await page.request.get(
      `/api/quote-documents/${document.id}/download`,
      {
        maxRedirects: 0,
      },
    );

    expect(authenticatedDownload.status()).toBe(307);
    expect(authenticatedDownload.headers().location).toContain(
      "quote-documents",
    );
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
      customer_name: `E2E Public Customer ${uniqueSuffix}`,
      company_name: `E2E Public Customer ${uniqueSuffix}`,
      contact_name: "E2E Public Contact",
      contact_email: `public-${uniqueSuffix}@example.test`,
      contact_phone: "555-0505",
      customer_address: "800 Public Yard",
      payment_terms: "Net 30",
      site_name: `E2E Public Site ${uniqueSuffix}`,
      site_address: "900 Public Site",
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
      notes: "Created by Playwright public quote test.",
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

async function submitAndApproveQuote(page: Page, quoteId: string): Promise<void> {
  await transitionQuote(page.request, quoteId, "submit");
  await waitForQuoteStatus({ quoteId, status: "pending_approval" });
  await signOut(page);
  await signInWithMagicLink(page, ADMIN_EMAIL);
  await transitionQuote(page.request, quoteId, "approve");
  await waitForQuoteStatus({ quoteId, status: "approved" });
}

async function submitApproveAndSendQuote(
  page: Page,
  quoteId: string,
): Promise<void> {
  await submitAndApproveQuote(page, quoteId);
  await transitionQuote(page.request, quoteId, "send", "E2E public link send.");
  await waitForQuoteStatus({ quoteId, status: "sent" });
}

async function transitionQuote(
  request: APIRequestContext,
  quoteId: string,
  action: "submit" | "approve" | "send",
  note?: string,
): Promise<void> {
  const response = await request.patch(`/api/quotes/${quoteId}/status`, {
    data: {
      action,
      note,
    },
  });
  const body = await response.json();

  expect(response.status()).toBe(200);
  expect(body.error).toBeNull();
}

async function signOut(page: Page): Promise<void> {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
}
