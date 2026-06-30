import { expect, test } from "@playwright/test";

import { signInWithMagicLink } from "./helpers/auth";
import {
  getActiveMaterialFixture,
  getOrganizationIdForEmail,
  getPricingConfigFixture,
  waitForAuditAction,
  waitForMaterialPrice,
  waitForMaterialPriceHistory,
  waitForPricingOverhead,
  waitForTaxRateByCity,
} from "./helpers/db";

const ADMIN_EMAIL = "admin@demo-distributor.test";
const ACCOUNT_MANAGER_EMAIL = "sales@demo-distributor.test";
const ESTIMATOR_EMAIL = "dispatch@demo-distributor.test";

test.describe("admin configuration workflows", () => {
  test("material price admin UI is available only to operational roles", async ({
    page,
  }) => {
    await signInWithMagicLink(page, ACCOUNT_MANAGER_EMAIL);

    await page.goto("/admin/material-prices");
    await expect(
      page.getByRole("heading", { name: "Material Prices" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Update price" }),
    ).toBeVisible();
    await expect(page.getByText("Recent price changes")).toBeVisible();

    await signOut(page);
    await signInWithMagicLink(page, ESTIMATOR_EMAIL);

    await page.goto("/admin/material-prices");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();
  });

  test("account manager can update a material price through the API with history and audit", async ({
    page,
  }) => {
    await signInWithMagicLink(page, ACCOUNT_MANAGER_EMAIL);

    const material = await getActiveMaterialFixture(ACCOUNT_MANAGER_EMAIL);
    const newPrice = roundMoney(material.costPerUnit + 1.37);
    const priceDate = "2026-06-11";
    const notes = `E2E material price update ${Date.now()}`;

    const response = await page.request.post("/api/materials/price", {
      data: {
        material_id: material.materialId,
        new_price: newPrice,
        price_date: priceDate,
        notes,
      },
    });
    const body = await response.json();

    expect(response.status()).toBe(201);
    expect(body.error).toBeNull();
    expect(body.data.updates).toEqual([
      expect.objectContaining({
        id: material.materialId,
        old_price: material.costPerUnit,
        new_price: newPrice,
        last_price_update: priceDate,
      }),
    ]);

    const updatedMaterial = await waitForMaterialPrice({
      materialId: material.materialId,
      expectedPrice: newPrice,
    });

    expect(updatedMaterial.last_price_update).toBe(priceDate);

    const history = await waitForMaterialPriceHistory({
      materialId: material.materialId,
      expectedPrice: newPrice,
    });

    expect(history).toMatchObject({
      old_price: material.costPerUnit,
      new_price: newPrice,
      notes,
    });

    const audit = await waitForAuditAction({
      targetId: material.materialId,
      action: "material.price_updated",
    });

    expect(audit.target_table).toBe("materials");
    expect(audit.before_value).toEqual([
      {
        material_id: material.materialId,
        price: material.costPerUnit,
      },
    ]);
    expect(audit.after_value).toEqual([
      {
        material_id: material.materialId,
        price: newPrice,
        last_price_update: priceDate,
      },
    ]);
  });

  test("material price APIs reject invalid, duplicate, and underprivileged updates", async ({
    page,
  }) => {
    await signInWithMagicLink(page, ACCOUNT_MANAGER_EMAIL);

    const material = await getActiveMaterialFixture(ACCOUNT_MANAGER_EMAIL);

    const invalidResponse = await page.request.post("/api/materials/price", {
      data: {
        material_id: material.materialId,
        new_price: -1,
        price_date: "2026-06-11",
      },
    });
    const invalidBody = await invalidResponse.json();

    expect(invalidResponse.status()).toBe(400);
    expect(invalidBody.error).toMatchObject({
      code: "bad_request",
    });

    const duplicateResponse = await page.request.post(
      "/api/materials/bulk-price-update",
      {
        data: {
          updates: [
            {
              material_id: material.materialId,
              new_price: roundMoney(material.costPerUnit + 2.11),
              price_date: "2026-06-11",
            },
            {
              material_id: material.materialId,
              new_price: roundMoney(material.costPerUnit + 3.22),
              price_date: "2026-06-11",
            },
          ],
        },
      },
    );
    const duplicateBody = await duplicateResponse.json();

    expect(duplicateResponse.status()).toBe(400);
    expect(duplicateBody.error).toMatchObject({
      code: "bad_request",
    });
    expect(duplicateBody.error.message).toContain(
      "Each material can only be updated once",
    );

    await signOut(page);
    await signInWithMagicLink(page, ESTIMATOR_EMAIL);

    const forbiddenResponse = await page.request.post("/api/materials/price", {
      data: {
        material_id: material.materialId,
        new_price: roundMoney(material.costPerUnit + 4.44),
        price_date: "2026-06-11",
      },
    });
    const forbiddenBody = await forbiddenResponse.json();

    expect(forbiddenResponse.status()).toBe(403);
    expect(forbiddenBody.error).toMatchObject({
      code: "forbidden",
    });
  });

  test("admin can create a sales tax rate from the browser with audit history", async ({
    page,
  }) => {
    await signInWithMagicLink(page, ADMIN_EMAIL);

    const organizationId = await getOrganizationIdForEmail(ADMIN_EMAIL);
    const uniqueSuffix = Date.now().toString().slice(-6);
    const city = `E2E Tax City ${uniqueSuffix}`;
    const county = `E2E County ${uniqueSuffix}`;
    const rate = 8.765;
    const effectiveDate = "2026-06-11";

    await page.goto("/admin/tax-rates");
    await expect(page.getByRole("heading", { name: "Tax Rates" })).toBeVisible();

    await page.locator('[name="city"]').fill(city);
    await page.locator('[name="county"]').fill(county);
    await page.locator('[name="state"]').fill("CA");
    await page.locator('[name="rate_percent"]').fill(rate.toString());
    await page.locator('[name="effective_date"]').fill(effectiveDate);
    await page.getByRole("button", { name: "Save tax rate" }).click();

    const taxRate = await waitForTaxRateByCity({
      organizationId,
      city,
    });

    expect(taxRate).toMatchObject({
      city,
      county,
      state: "CA",
      effective_date: effectiveDate,
    });
    expect(Number(taxRate.rate)).toBe(roundFourDecimals(rate / 100));

    const audit = await waitForAuditAction({
      targetId: String(taxRate.id),
      action: "sales_tax_rate.created",
    });

    expect(audit.target_table).toBe("sales_tax_rates");
    expect(audit.after_value).toMatchObject({
      city,
      county,
      state: "CA",
      rate: roundFourDecimals(rate / 100),
      effective_date: effectiveDate,
    });

    await page.goto("/admin/tax-rates");
    await expect(
      page.locator(".soft-row").filter({ hasText: city }).first(),
    ).toBeVisible();
  });

  test("admin can update pricing rules from the browser with audit history", async ({
    page,
  }) => {
    await signInWithMagicLink(page, ADMIN_EMAIL);

    const pricing = await getPricingConfigFixture(ADMIN_EMAIL);
    const nextOverhead = roundMoney(pricing.overheadPerTon + 0.01);

    await page.goto("/admin/pricing");
    await expect(
      page.getByRole("heading", { name: "Pricing Rules", level: 1 }),
    ).toBeVisible();

    await page.locator('[name="tier_r1_min"]').fill(String(pricing.tierR1Min));
    await page.locator('[name="tier_r1_max"]').fill(String(pricing.tierR1Max));
    await page.locator('[name="tier_r2_min"]').fill(String(pricing.tierR2Min));
    await page.locator('[name="tier_r2_max"]').fill(String(pricing.tierR2Max));
    await page.locator('[name="tier_r3_min"]').fill(String(pricing.tierR3Min));
    await page.locator('[name="tier_r3_max"]').fill(String(pricing.tierR3Max));
    await page.locator('[name="tier_r4_min"]').fill(String(pricing.tierR4Min));
    await page.locator('[name="tier_r4_max"]').fill(String(pricing.tierR4Max));
    await page
      .locator('[name="truck_floor_rate"]')
      .fill(String(pricing.truckFloorRate));
    await page
      .locator('[name="truck_standard_rate"]')
      .fill(String(pricing.truckStandardRate));
    await page
      .locator('[name="truck_target_rate"]')
      .fill(String(pricing.truckTargetRate));
    await page
      .locator('[name="truck_premium_rate"]')
      .fill(String(pricing.truckPremiumRate));
    await page
      .locator('[name="truck_stretch_rate"]')
      .fill(String(pricing.truckStretchRate));
    await page
      .locator('[name="default_truck_rate"]')
      .selectOption(pricing.defaultTruckRate);
    await page
      .locator('[name="material_minimum"]')
      .fill(String(pricing.materialMinimum));
    await page
      .locator('[name="trucking_minimum"]')
      .fill(String(pricing.truckingMinimum));
    await page
      .locator('[name="fuel_surcharge_per_load"]')
      .fill(String(pricing.fuelSurchargePerLoad));
    await page
      .locator('[name="environmental_fee_per_load"]')
      .fill(String(pricing.environmentalFeePerLoad));
    await page
      .locator('[name="cc_surcharge_pct"]')
      .fill(String(pricing.ccSurchargePct));
    await page.locator('[name="overhead_per_ton"]').fill(String(nextOverhead));
    await page.getByRole("button", { name: "Save pricing" }).click();

    const updatedPricing = await waitForPricingOverhead({
      organizationId: pricing.organizationId,
      expectedOverhead: nextOverhead,
    });

    const audit = await waitForAuditAction({
      targetId: String(updatedPricing.id),
      action: "pricing_config.updated",
    });

    expect(audit.target_table).toBe("pricing_config");
    expect(audit.before_value).toMatchObject({
      overhead_per_ton: pricing.overheadPerTon,
    });
    expect(audit.after_value).toMatchObject({
      overhead_per_ton: nextOverhead,
    });

    await page.goto("/admin/pricing");
    await expect(page.locator('[name="overhead_per_ton"]')).toHaveValue(
      String(nextOverhead),
    );
  });
});

async function signOut(page: Parameters<typeof signInWithMagicLink>[0]) {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundFourDecimals(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}
