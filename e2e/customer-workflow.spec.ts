import { expect, test } from "@playwright/test";

import { signInWithMagicLink } from "./helpers/auth";
import {
  getOrganizationIdForEmail,
  waitForAuditAction,
  waitForCustomerByName,
  waitForJobSiteByName,
} from "./helpers/db";

const ACCOUNT_MANAGER_EMAIL = "estimate@westernmaterials.net";

test.describe("customer and job site workflow", () => {
  test("account manager can create a customer and job site from the browser", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    await signInWithMagicLink(page, ACCOUNT_MANAGER_EMAIL);

    const organizationId = await getOrganizationIdForEmail(
      ACCOUNT_MANAGER_EMAIL,
    );
    const uniqueSuffix = Date.now().toString();
    const customerName = `E2E CRM Customer ${uniqueSuffix}`;
    const jobSiteName = `E2E CRM Site ${uniqueSuffix}`;

    await page.goto("/customers");
    await expect(
      page.getByRole("heading", { name: "Customers and job sites" }),
    ).toBeVisible();

    await page.getByText("Add customer", { exact: true }).click();
    const customerForm = page.locator("form").filter({
      has: page.getByRole("button", { name: "Save customer" }),
    });

    await customerForm.locator('[name="name"]').fill(customerName);
    await customerForm.locator('[name="company_name"]').fill(customerName);
    await customerForm.locator('[name="contact_name"]').fill("E2E CRM Contact");
    await customerForm
      .locator('[name="email"]')
      .fill(`crm-${uniqueSuffix}@example.test`);
    await customerForm.locator('[name="phone"]').fill("555-0202");
    await customerForm.locator('[name="address"]').fill("300 CRM Test Yard");
    await customerForm.locator('[name="payment_terms"]').fill("Net 15");
    await customerForm
      .locator('[name="pricing_notes"]')
      .fill("Created by Playwright customer workflow test.");
    await customerForm.getByRole("button", { name: "Save customer" }).click();

    const customer = await waitForCustomerByName({
      organizationId,
      name: customerName,
    });

    await waitForAuditAction({
      targetId: String(customer.id),
      action: "customer.saved",
    });

    await page.goto(`/customers?q=${encodeURIComponent(customerName)}`);
    await expect(
      page.locator(".soft-row").filter({ hasText: customerName }).first(),
    ).toBeVisible();

    const jobSiteForm = page.locator("form").filter({
      has: page.getByRole("button", { name: "Save job site" }),
    });

    await page.getByText("Add job site", { exact: true }).click();
    await jobSiteForm.locator('[name="customer_id"]').selectOption({
      label: customerName,
    });
    await jobSiteForm.locator('[name="name"]').fill(jobSiteName);
    await jobSiteForm.locator('[name="line1"]').fill("400 CRM Test Site");
    await jobSiteForm.locator('[name="city"]').fill("Los Angeles");
    await jobSiteForm.locator('[name="county"]').fill("Los Angeles");
    await jobSiteForm.locator('[name="state"]').fill("CA");
    await jobSiteForm.locator('[name="latitude"]').fill("34.0522");
    await jobSiteForm.locator('[name="longitude"]').fill("-118.2437");
    await jobSiteForm.getByRole("button", { name: "Save job site" }).click();

    const jobSite = await waitForJobSiteByName({
      organizationId,
      name: jobSiteName,
    });

    expect(jobSite.customer_id).toBe(customer.id);
    await waitForAuditAction({
      targetId: String(jobSite.id),
      action: "job_site.saved",
    });

    await page.goto(`/customers?q=${encodeURIComponent(jobSiteName)}`);
    const customerResult = page.locator("details").filter({
      hasText: customerName,
    });

    await expect(customerResult).toBeVisible();
    await customerResult.locator("summary").click();
    await expect(customerResult.getByText(jobSiteName)).toBeVisible();
  });

  test("customer API validates updates, soft-disables, and writes audit history", async ({
    page,
  }) => {
    await signInWithMagicLink(page, ACCOUNT_MANAGER_EMAIL);

    const uniqueSuffix = Date.now().toString();
    const createResponse = await page.request.post("/api/customers", {
      data: {
        name: `E2E API Customer ${uniqueSuffix}`,
        company_name: `E2E API Customer ${uniqueSuffix}`,
        contact_name: "API Contact",
        email: `customer-api-${uniqueSuffix}@example.test`,
        phone: "555-0303",
        address: "500 API Test Yard",
        payment_terms: "Net 10",
      },
    });
    const createBody = await createResponse.json();

    expect(createResponse.status()).toBe(201);
    expect(createBody.error).toBeNull();

    const customerId = createBody.data.customer.id;

    await waitForAuditAction({
      targetId: customerId,
      action: "customer.saved",
    });

    const invalidResponse = await page.request.patch(
      `/api/customers/${customerId}`,
      {
        data: {
          email: "not-an-email",
        },
      },
    );
    const invalidBody = await invalidResponse.json();

    expect(invalidResponse.status()).toBe(400);
    expect(invalidBody.error).toMatchObject({
      code: "bad_request",
    });

    const updateResponse = await page.request.patch(
      `/api/customers/${customerId}`,
      {
        data: {
          contact_name: "Updated API Contact",
          email: null,
          is_active: false,
        },
      },
    );
    const updateBody = await updateResponse.json();

    expect(updateResponse.status()).toBe(200);
    expect(updateBody.error).toBeNull();
    expect(updateBody.data.customer).toMatchObject({
      id: customerId,
      contact_name: "Updated API Contact",
      email: null,
      is_active: false,
    });

    const updateAudit = await waitForAuditAction({
      targetId: customerId,
      action: "customer.updated",
    });

    expect(updateAudit.before_value).toMatchObject({
      is_active: true,
    });
    expect(updateAudit.after_value).toMatchObject({
      contact_name: "Updated API Contact",
      email: null,
      is_active: false,
    });

    const activeListResponse = await page.request.get("/api/customers");
    const activeListBody = await activeListResponse.json();

    expect(activeListResponse.status()).toBe(200);
    expect(
      activeListBody.data.customers.some(
        (customer: { id: string }) => customer.id === customerId,
      ),
    ).toBe(false);

    const fullListResponse = await page.request.get("/api/customers?active=false");
    const fullListBody = await fullListResponse.json();

    expect(fullListResponse.status()).toBe(200);
    expect(
      fullListBody.data.customers.some(
        (customer: { id: string }) => customer.id === customerId,
      ),
    ).toBe(true);
  });
});
