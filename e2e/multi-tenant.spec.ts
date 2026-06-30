import { expect, test, type APIResponse, type Page } from "@playwright/test";

import { signInWithMagicLink } from "./helpers/auth";
import {
  ensureSecondTenantFixtures,
  getActiveMaterialFixture,
  getActiveSupplierFixture,
  getMaterialPrice,
  getQuoteFixtureData,
  SECOND_TENANT_ADMIN_EMAIL,
  SECOND_TENANT_ORG_ID,
  waitForLatestQuoteDocument,
  waitForQuoteStatus,
} from "./helpers/db";

const PRIMARY_ADMIN_EMAIL = "admin@demo-distributor.test";

test.describe("multi-tenant isolation", () => {
  test("second tenant cannot read or mutate primary tenant records", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await ensureSecondTenantFixtures();
    await signInWithMagicLink(page, PRIMARY_ADMIN_EMAIL);

    const suffix = Date.now().toString();
    const primaryCustomer = await createCustomer(page, `E2E Tenant A ${suffix}`);
    const primaryQuote = await createDraftQuote(page, suffix);
    const primarySupplier = await getActiveSupplierFixture(PRIMARY_ADMIN_EMAIL);
    const primaryMaterial = await getActiveMaterialFixture(PRIMARY_ADMIN_EMAIL);
    const originalMaterialPrice = await getMaterialPrice(primaryMaterial.materialId);

    await submitAndApproveQuote(page, primaryQuote.id);
    await page.goto(`/quotes/${primaryQuote.id}`);
    await page.getByRole("button", { name: "Generate document" }).click();
    const primaryDocument = await waitForLatestQuoteDocument({
      quoteId: primaryQuote.id,
    });

    await signOut(page);
    await signInWithMagicLink(page, SECOND_TENANT_ADMIN_EMAIL);

    const tenantBCustomer = await createCustomer(page, `E2E Tenant B ${suffix}`);
    const customerList = await page.request.get("/api/customers?active=false&limit=100");
    const customerListBody = await customerList.json();
    const customerIds = customerListBody.data.customers.map(
      (customer: { id: string }) => customer.id,
    );

    expect(customerList.status()).toBe(200);
    expect(customerIds).toContain(tenantBCustomer.id);
    expect(customerIds).not.toContain(primaryCustomer.id);

    await expectApiError(
      page.request.get(`/api/customers/${primaryCustomer.id}`),
      404,
      "not_found",
    );
    await expectApiError(
      page.request.patch(`/api/customers/${primaryCustomer.id}`, {
        data: {
          phone: "555-9999",
        },
      }),
      404,
      "not_found",
    );
    await expectApiError(
      page.request.get(`/api/quotes/${primaryQuote.id}`),
      404,
      "not_found",
    );
    await expectApiError(
      page.request.patch(`/api/quotes/${primaryQuote.id}/status`, {
        data: {
          action: "send",
          note: "Cross-tenant mutation attempt.",
        },
      }),
      404,
      "not_found",
    );
    await expectApiError(
      page.request.get(`/api/suppliers/${primarySupplier.supplierId}`),
      404,
      "not_found",
    );
    await expectApiError(
      page.request.post("/api/materials/price", {
        data: {
          material_id: primaryMaterial.materialId,
          new_price: originalMaterialPrice + 11,
          price_date: "2026-06-12",
          notes: "Cross-tenant mutation attempt.",
        },
      }),
      400,
      "bad_request",
    );
    await expect(getMaterialPrice(primaryMaterial.materialId)).resolves.toBe(
      originalMaterialPrice,
    );
    await expectApiError(
      page.request.get(`/api/quote-documents/${primaryDocument.id}/download`, {
        maxRedirects: 0,
      }),
      404,
      "not_found",
    );

    const tenantBQuoteFixture = await getQuoteFixtureData(SECOND_TENANT_ADMIN_EMAIL);

    expect(tenantBQuoteFixture.organizationId).toBe(SECOND_TENANT_ORG_ID);
    expect(tenantBQuoteFixture.materialId).not.toBe(primaryMaterial.materialId);
  });
});

async function createCustomer(
  page: Page,
  name: string,
): Promise<{ id: string; name: string }> {
  const response = await page.request.post("/api/customers", {
    data: {
      name,
      company_name: name,
      contact_name: "E2E Isolation Contact",
      email: `${name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}@example.test`,
      phone: "555-0100",
      address: "100 Tenant Isolation Way",
      payment_terms: "Net 30",
      pricing_notes: "Created by multi-tenant isolation test.",
    },
  });
  const body = await response.json();

  expect(response.status()).toBe(201);
  expect(body.error).toBeNull();

  return {
    id: body.data.customer.id,
    name: body.data.customer.name,
  };
}

async function createDraftQuote(
  page: Page,
  suffix: string,
): Promise<{ id: string; quoteNumber: string }> {
  const fixture = await getQuoteFixtureData(PRIMARY_ADMIN_EMAIL);
  const response = await page.request.post("/api/quotes", {
    data: {
      customer_name: `E2E Isolation Quote Customer ${suffix}`,
      company_name: `E2E Isolation Quote Customer ${suffix}`,
      contact_name: "E2E Isolation Quote Contact",
      contact_email: `isolation-quote-${suffix}@example.test`,
      contact_phone: "555-0200",
      customer_address: "200 Tenant A Yard",
      payment_terms: "Net 30",
      site_name: `E2E Isolation Quote Site ${suffix}`,
      site_address: "300 Tenant A Site",
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
      notes: "Created by Playwright multi-tenant isolation test.",
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
  const submit = await page.request.patch(`/api/quotes/${quoteId}/status`, {
    data: {
      action: "submit",
    },
  });

  expect(submit.status()).toBe(200);
  await waitForQuoteStatus({ quoteId, status: "pending_approval" });

  const approve = await page.request.patch(`/api/quotes/${quoteId}/status`, {
    data: {
      action: "approve",
    },
  });

  expect(approve.status()).toBe(200);
  await waitForQuoteStatus({ quoteId, status: "approved" });
}

async function expectApiError(
  responsePromise: Promise<APIResponse>,
  status: number,
  code: string,
): Promise<void> {
  const response = await responsePromise;
  const body = await response.json();

  expect(response.status()).toBe(status);
  expect(body.data).toBeNull();
  expect(body.error).toMatchObject({ code });
}

async function signOut(page: Page): Promise<void> {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
}
