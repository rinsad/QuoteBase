import { expect, test } from "@playwright/test";

import { getQuoteFixtureData, waitForAuditAction } from "./helpers/db";
import { signInWithMagicLink } from "./helpers/auth";

const ADMIN_EMAIL = "admin@demo-distributor.test";
const ACCOUNT_MANAGER_EMAIL = "sales@demo-distributor.test";
const ESTIMATOR_EMAIL = "dispatch@demo-distributor.test";

test.describe("quote calculation and draft workflow", () => {
  test.describe.configure({ mode: "serial" });

  test("estimator can calculate, create, and submit a quote for admin approval", async ({
    page,
  }) => {
    await signInWithMagicLink(page, ESTIMATOR_EMAIL);

    const fixture = await getQuoteFixtureData(ESTIMATOR_EMAIL);
    const uniqueSuffix = Date.now().toString();
    const payload = {
      customer_name: `E2E Customer ${uniqueSuffix}`,
      company_name: `E2E Customer ${uniqueSuffix}`,
      contact_name: "E2E Contact",
      contact_email: `quote-${uniqueSuffix}@example.test`,
      contact_phone: "555-0101",
      customer_address: "100 Test Yard",
      payment_terms: "Net 30",
      site_name: `E2E Site ${uniqueSuffix}`,
      site_address: "200 Test Site",
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
      notes: "Created by Playwright E2E quote workflow test.",
      use_selected_plant: true,
    };

    const calculationResponse = await page.request.post("/api/quotes/calculate", {
      data: payload,
    });

    expect(calculationResponse.status()).toBe(200);
    const calculationBody = await calculationResponse.json();
    expect(calculationBody.error).toBeNull();
    expect(calculationBody.data.calculation.total).toBeGreaterThan(0);
    expect(calculationBody.data.calculation.selected_material_id).toBeTruthy();
    expect(calculationBody.data.calculation.tax_rate.id).toBe(fixture.taxRateId);

    const createResponse = await page.request.post("/api/quotes", {
      data: payload,
    });

    expect(createResponse.status()).toBe(201);
    const createBody = await createResponse.json();
    expect(createBody.error).toBeNull();
    expect(createBody.data.quote.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(createBody.data.quote.quote_number).toMatch(/^QB-/);

    const quoteListResponse = await page.request.get("/api/quotes?status=draft");
    const quoteListBody = await quoteListResponse.json();

    expect(quoteListResponse.status()).toBe(200);
    expect(
      quoteListBody.data.quotes.some(
        (quote: { id: string }) => quote.id === createBody.data.quote.id,
      ),
    ).toBe(true);

    const audit = await waitForAuditAction({
      targetId: createBody.data.quote.id,
      action: "quote.draft_created",
    });

    expect(audit.target_table).toBe("quotes");
    expect(audit.after_value).toMatchObject({
      status: "draft",
      quote_number: createBody.data.quote.quote_number,
    });
    expect(audit.metadata).toMatchObject({
      new_customer: true,
      manual_route_distance_miles: 12,
      manual_deadhead_distance_miles: 4,
    });

    const submitResponse = await page.request.patch(
      `/api/quotes/${createBody.data.quote.id}/status`,
      {
        data: {
          action: "submit",
        },
      },
    );
    const submitBody = await submitResponse.json();

    expect(submitResponse.status()).toBe(200);
    expect(submitBody.error).toBeNull();
    expect(submitBody.data.quote).toMatchObject({
      from: "draft",
      to: "pending_approval",
    });

    await waitForAuditAction({
      targetId: createBody.data.quote.id,
      action: "quote.submitted_for_approval",
    });

    await signOut(page);
    await signInWithMagicLink(page, ACCOUNT_MANAGER_EMAIL);

    const forbiddenApprovalResponse = await page.request.patch(
      `/api/quotes/${createBody.data.quote.id}/status`,
      {
        data: {
          action: "approve",
        },
      },
    );
    const forbiddenApprovalBody = await forbiddenApprovalResponse.json();

    expect(forbiddenApprovalResponse.status()).toBe(403);
    expect(forbiddenApprovalBody.error).toMatchObject({
      code: "forbidden",
    });

    await signOut(page);
    await signInWithMagicLink(page, ADMIN_EMAIL);

    const approvalResponse = await page.request.patch(
      `/api/quotes/${createBody.data.quote.id}/status`,
      {
        data: {
          action: "approve",
        },
      },
    );
    const approvalBody = await approvalResponse.json();

    expect(approvalResponse.status()).toBe(200);
    expect(approvalBody.error).toBeNull();
    expect(approvalBody.data.quote).toMatchObject({
      from: "pending_approval",
      to: "approved",
    });

    const approvalAudit = await waitForAuditAction({
      targetId: createBody.data.quote.id,
      action: "quote.approved",
    });

    expect(approvalAudit.before_value).toMatchObject({
      status: "pending_approval",
    });
    expect(approvalAudit.after_value).toMatchObject({
      status: "approved",
    });
  });
});

async function signOut(page: Parameters<typeof signInWithMagicLink>[0]) {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
}
