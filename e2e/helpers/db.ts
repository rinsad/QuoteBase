import { loadEnvConfig } from "@next/env";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

import { encryptedPipedriveCredentials } from "../../src/lib/integrations/pipedrive";

loadEnvConfig(process.cwd());

type DatabaseRecord = Record<string, unknown>;

type FixtureData = {
  organizationId: string;
  materialId: string;
  taxRateId: string;
  siteCity: string;
  siteCounty: string;
  siteState: string;
};

type MaterialFixtureData = {
  organizationId: string;
  materialId: string;
  name: string;
  costPerUnit: number;
  lastPriceUpdate: string | null;
};

type SupplierFixtureData = {
  organizationId: string;
  supplierId: string;
  name: string;
};

type PricingConfigFixture = {
  id: string;
  organizationId: string;
  tierR1Min: number;
  tierR1Max: number;
  tierR2Min: number;
  tierR2Max: number;
  tierR3Min: number;
  tierR3Max: number;
  tierR4Min: number;
  tierR4Max: number;
  truckFloorRate: number;
  truckStandardRate: number;
  truckTargetRate: number;
  truckPremiumRate: number;
  truckStretchRate: number;
  defaultTruckRate: string;
  materialMinimum: number;
  truckingMinimum: number;
  fuelSurchargePerLoad: number;
  environmentalFeePerLoad: number;
  ccSurchargePct: number;
  overheadPerTon: number;
};

type IntegrationRecord = {
  id: string;
  is_enabled: boolean;
  config: Record<string, unknown>;
  credentials_encrypted: string | null;
  credentials_last4: Record<string, unknown>;
};

export const SECOND_TENANT_ORG_ID = "00000000-0000-0000-0000-000000000002";
export const SECOND_TENANT_ADMIN_EMAIL = "john@westernmaterials.net";

export function createE2EAdminClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase test environment is not configured.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function getOrganizationIdForEmail(email: string): Promise<string> {
  const supabase = createE2EAdminClient();
  const { data: invite, error } = await supabase
    .from("user_invites")
    .select("organization_id")
    .eq("email", email)
    .eq("is_active", true)
    .single<{ organization_id: string }>();

  if (error || !invite) {
    throw new Error(`No active invite found for ${email}.`);
  }

  return invite.organization_id;
}

export async function ensureSecondTenantFixtures(): Promise<{
  organizationId: string;
  email: string;
  supplierId: string;
  materialId: string;
  taxRateId: string;
}> {
  const supabase = createE2EAdminClient();

  await assertNoError(
    supabase.from("organizations").upsert(
      {
        id: SECOND_TENANT_ORG_ID,
        name: "E2E Tenant B",
        slug: "e2e-tenant-b",
        industry: "construction_materials",
        is_active: true,
      },
      { onConflict: "id" },
    ),
    "Could not seed the second test organization.",
  );

  await assertNoError(
    supabase.from("user_invites").upsert(
      {
        organization_id: SECOND_TENANT_ORG_ID,
        email: SECOND_TENANT_ADMIN_EMAIL,
        full_name: "John Tenant B",
        role: "admin",
        is_active: true,
      },
      { onConflict: "email" },
    ),
    "Could not seed the second tenant invite.",
  );

  await syncExistingAuthUserToSecondTenant(supabase);

  await assertNoError(
    supabase.from("feature_flags").upsert(
      [
        {
          organization_id: SECOND_TENANT_ORG_ID,
          feature_name: "pricing_engine",
          is_enabled: true,
          config: null,
        },
        {
          organization_id: SECOND_TENANT_ORG_ID,
          feature_name: "quote_creation",
          is_enabled: true,
          config: null,
        },
        {
          organization_id: SECOND_TENANT_ORG_ID,
          feature_name: "approval_workflow",
          is_enabled: true,
          config: null,
        },
        {
          organization_id: SECOND_TENANT_ORG_ID,
          feature_name: "quoter_integration",
          is_enabled: true,
          config: null,
        },
      ],
      { onConflict: "organization_id,feature_name" },
    ),
    "Could not seed second tenant feature flags.",
  );

  await assertNoError(
    supabase
      .from("pricing_config")
      .upsert({ organization_id: SECOND_TENANT_ORG_ID }, { onConflict: "organization_id" }),
    "Could not seed second tenant pricing config.",
  );

  await assertNoError(
    supabase.from("vehicle_types").upsert(
      {
        organization_id: SECOND_TENANT_ORG_ID,
        name: "E2E Tenant B Super-10",
        capacity_tons: 17,
        capacity_cy: null,
        is_active: true,
      },
      { onConflict: "organization_id,name" },
    ),
    "Could not seed second tenant vehicle type.",
  );

  const taxRateResult = await supabase
    .from("sales_tax_rates")
    .upsert(
      {
        organization_id: SECOND_TENANT_ORG_ID,
        city: "Pasadena",
        county: "Los Angeles",
        state: "CA",
        rate: 0.1025,
      },
      { onConflict: "organization_id,city,county,state,effective_date" },
    )
    .select("id")
    .single<{ id: string }>();

  if (taxRateResult.error || !taxRateResult.data) {
    throw new Error("Could not seed second tenant sales tax rate.");
  }

  const supplierResult = await supabase
    .from("suppliers")
    .upsert(
      {
        organization_id: SECOND_TENANT_ORG_ID,
        name: "E2E Tenant B Quarry",
        parent_company: "E2E Tenant B",
        address: { city: "Pasadena", state: "CA" },
        notes: "Second tenant fixture for isolation testing.",
        is_active: true,
      },
      { onConflict: "organization_id,name" },
    )
    .select("id")
    .single<{ id: string }>();

  if (supplierResult.error || !supplierResult.data) {
    throw new Error("Could not seed second tenant supplier.");
  }

  const materialResult = await supabase
    .from("materials")
    .upsert(
      {
        organization_id: SECOND_TENANT_ORG_ID,
        supplier_id: supplierResult.data.id,
        name: "E2E Tenant B Base",
        tier: "R1",
        unit: "ton",
        cost_per_unit: 21.5,
        last_price_update: "2026-01-01",
        minimum_order_quantity: 1,
        is_active: true,
      },
      { onConflict: "organization_id,supplier_id,name,unit" },
    )
    .select("id")
    .single<{ id: string }>();

  if (materialResult.error || !materialResult.data) {
    throw new Error("Could not seed second tenant material.");
  }

  return {
    organizationId: SECOND_TENANT_ORG_ID,
    email: SECOND_TENANT_ADMIN_EMAIL,
    supplierId: supplierResult.data.id,
    materialId: materialResult.data.id,
    taxRateId: taxRateResult.data.id,
  };
}

export async function getQuoteFixtureData(
  email: string,
): Promise<FixtureData> {
  const supabase = createE2EAdminClient();
  const organizationId = await getOrganizationIdForEmail(email);

  const [materialResult, taxRateResult] = await Promise.all([
    supabase
      .from("materials")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .limit(1)
      .single<{ id: string }>(),
    supabase
      .from("sales_tax_rates")
      .select("id, city, county, state")
      .eq("organization_id", organizationId)
      .limit(1)
      .single<{ id: string; city: string; county: string; state: string }>(),
  ]);

  if (materialResult.error || !materialResult.data) {
    throw new Error("No active material fixture is available.");
  }

  if (taxRateResult.error || !taxRateResult.data) {
    throw new Error("No sales tax fixture is available.");
  }

  return {
    organizationId,
    materialId: materialResult.data.id,
    taxRateId: taxRateResult.data.id,
    siteCity: taxRateResult.data.city,
    siteCounty: taxRateResult.data.county,
    siteState: taxRateResult.data.state,
  };
}

export async function getActiveSupplierFixture(
  email: string,
): Promise<SupplierFixtureData> {
  const supabase = createE2EAdminClient();
  const organizationId = await getOrganizationIdForEmail(email);
  const { data: supplier, error } = await supabase
    .from("suppliers")
    .select("id, name")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .limit(1)
    .single<{ id: string; name: string }>();

  if (error || !supplier) {
    throw new Error("No active supplier fixture is available.");
  }

  return {
    organizationId,
    supplierId: supplier.id,
    name: supplier.name,
  };
}

export async function getActiveMaterialFixture(
  email: string,
): Promise<MaterialFixtureData> {
  const supabase = createE2EAdminClient();
  const organizationId = await getOrganizationIdForEmail(email);
  const { data: material, error } = await supabase
    .from("materials")
    .select("id, name, cost_per_unit, last_price_update")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .limit(1)
    .single<{
      id: string;
      name: string;
      cost_per_unit: number;
      last_price_update: string | null;
    }>();

  if (error || !material) {
    throw new Error("No active material fixture is available.");
  }

  return {
    organizationId,
    materialId: material.id,
    name: material.name,
    costPerUnit: Number(material.cost_per_unit),
    lastPriceUpdate: material.last_price_update,
  };
}

export async function getMaterialPrice(materialId: string): Promise<number> {
  const supabase = createE2EAdminClient();
  const { data, error } = await supabase
    .from("materials")
    .select("cost_per_unit")
    .eq("id", materialId)
    .single<{ cost_per_unit: number }>();

  if (error || !data) {
    throw new Error(`Material ${materialId} was not found.`);
  }

  return Number(data.cost_per_unit);
}

export async function enablePipedriveIntegration({
  email,
  apiBaseUrl,
  apiToken = "e2e-pipedrive-token",
}: {
  email: string;
  apiBaseUrl: string;
  apiToken?: string;
}): Promise<IntegrationRecord> {
  const supabase = createE2EAdminClient();
  const organizationId = await getOrganizationIdForEmail(email);

  await assertNoError(
    supabase.from("feature_flags").upsert(
      {
        organization_id: organizationId,
        feature_name: "pipedrive_sync",
        is_enabled: true,
        config: null,
      },
      { onConflict: "organization_id,feature_name" },
    ),
    "Could not enable the Pipedrive feature flag.",
  );

  const { data, error } = await supabase
    .from("organization_integrations")
    .upsert(
      {
        organization_id: organizationId,
        provider: "pipedrive",
        is_enabled: true,
        config: {
          api_base_url: apiBaseUrl,
          sync_interval_minutes: 30,
          source_of_truth: "pipedrive",
        },
        credentials_encrypted: encryptedPipedriveCredentials({ apiToken }),
        credentials_last4: {
          api_token: true,
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,provider" },
    )
    .select("id, is_enabled, config, credentials_encrypted, credentials_last4")
    .single<IntegrationRecord>();

  if (error || !data) {
    throw new Error(error?.message ?? "Could not seed Pipedrive integration.");
  }

  return data;
}

export async function disablePipedriveIntegration(email: string): Promise<void> {
  const supabase = createE2EAdminClient();
  const organizationId = await getOrganizationIdForEmail(email);

  await assertNoError(
    supabase
      .from("organization_integrations")
      .upsert(
        {
          organization_id: organizationId,
          provider: "pipedrive",
          is_enabled: false,
          config: {
            api_base_url: "https://api.pipedrive.com/v1",
            sync_interval_minutes: 30,
            source_of_truth: "pipedrive",
          },
          credentials_encrypted: null,
          credentials_last4: {},
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organization_id,provider" },
      ),
    "Could not disable the Pipedrive integration.",
  );
}

export async function waitForCustomerByPipedrivePersonId({
  organizationId,
  pipedrivePersonId,
}: {
  organizationId: string;
  pipedrivePersonId: string;
}): Promise<DatabaseRecord> {
  const supabase = createE2EAdminClient();
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    const { data, error } = await supabase
      .from("customers")
      .select(
        "id, name, company_name, contact_name, email, phone, pipedrive_person_id, pipedrive_organization_id, pipedrive_synced_at, sync_source",
      )
      .eq("organization_id", organizationId)
      .eq("pipedrive_person_id", pipedrivePersonId)
      .maybeSingle<DatabaseRecord>();

    if (error) {
      throw new Error(error.message);
    }

    if (data) {
      return data;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(
    `Pipedrive customer ${pipedrivePersonId} was not imported.`,
  );
}

export async function waitForMaterialPrice({
  materialId,
  expectedPrice,
}: {
  materialId: string;
  expectedPrice: number;
}): Promise<DatabaseRecord> {
  const supabase = createE2EAdminClient();
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    const { data, error } = await supabase
      .from("materials")
      .select("id, name, cost_per_unit, last_price_update")
      .eq("id", materialId)
      .maybeSingle<DatabaseRecord>();

    if (error) {
      throw new Error(error.message);
    }

    if (data && Number(data.cost_per_unit) === expectedPrice) {
      return data;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(
    `Material ${materialId} did not reach price ${expectedPrice}.`,
  );
}

export async function waitForMaterialPriceHistory({
  materialId,
  expectedPrice,
}: {
  materialId: string;
  expectedPrice: number;
}): Promise<DatabaseRecord> {
  const supabase = createE2EAdminClient();
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    const { data, error } = await supabase
      .from("material_price_history")
      .select("id, material_id, old_price, new_price, notes")
      .eq("material_id", materialId)
      .eq("new_price", expectedPrice)
      .order("changed_at", { ascending: false })
      .limit(1)
      .maybeSingle<DatabaseRecord>();

    if (error) {
      throw new Error(error.message);
    }

    if (data) {
      return data;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(
    `Material price history for ${materialId} at ${expectedPrice} was not found.`,
  );
}

export async function getPricingConfigFixture(
  email: string,
): Promise<PricingConfigFixture> {
  const supabase = createE2EAdminClient();
  const organizationId = await getOrganizationIdForEmail(email);
  const { data, error } = await supabase
    .from("pricing_config")
    .select(
      "id, tier_r1_min, tier_r1_max, tier_r2_min, tier_r2_max, tier_r3_min, tier_r3_max, tier_r4_min, tier_r4_max, truck_floor_rate, truck_standard_rate, truck_target_rate, truck_premium_rate, truck_stretch_rate, default_truck_rate, material_minimum, trucking_minimum, fuel_surcharge_per_load, environmental_fee_per_load, cc_surcharge_pct, overhead_per_ton",
    )
    .eq("organization_id", organizationId)
    .single<{
      id: string;
      tier_r1_min: number;
      tier_r1_max: number;
      tier_r2_min: number;
      tier_r2_max: number;
      tier_r3_min: number;
      tier_r3_max: number;
      tier_r4_min: number;
      tier_r4_max: number;
      truck_floor_rate: number;
      truck_standard_rate: number;
      truck_target_rate: number;
      truck_premium_rate: number;
      truck_stretch_rate: number;
      default_truck_rate: string;
      material_minimum: number;
      trucking_minimum: number;
      fuel_surcharge_per_load: number;
      environmental_fee_per_load: number;
      cc_surcharge_pct: number;
      overhead_per_ton: number;
    }>();

  if (error || !data) {
    throw new Error("Pricing configuration fixture is not available.");
  }

  return {
    id: data.id,
    organizationId,
    tierR1Min: Number(data.tier_r1_min),
    tierR1Max: Number(data.tier_r1_max),
    tierR2Min: Number(data.tier_r2_min),
    tierR2Max: Number(data.tier_r2_max),
    tierR3Min: Number(data.tier_r3_min),
    tierR3Max: Number(data.tier_r3_max),
    tierR4Min: Number(data.tier_r4_min),
    tierR4Max: Number(data.tier_r4_max),
    truckFloorRate: Number(data.truck_floor_rate),
    truckStandardRate: Number(data.truck_standard_rate),
    truckTargetRate: Number(data.truck_target_rate),
    truckPremiumRate: Number(data.truck_premium_rate),
    truckStretchRate: Number(data.truck_stretch_rate),
    defaultTruckRate: data.default_truck_rate,
    materialMinimum: Number(data.material_minimum),
    truckingMinimum: Number(data.trucking_minimum),
    fuelSurchargePerLoad: Number(data.fuel_surcharge_per_load),
    environmentalFeePerLoad: Number(data.environmental_fee_per_load),
    ccSurchargePct: Number(data.cc_surcharge_pct),
    overheadPerTon: Number(data.overhead_per_ton),
  };
}

export async function waitForPricingOverhead({
  organizationId,
  expectedOverhead,
}: {
  organizationId: string;
  expectedOverhead: number;
}): Promise<DatabaseRecord> {
  const supabase = createE2EAdminClient();
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    const { data, error } = await supabase
      .from("pricing_config")
      .select("id, overhead_per_ton")
      .eq("organization_id", organizationId)
      .maybeSingle<DatabaseRecord>();

    if (error) {
      throw new Error(error.message);
    }

    if (data && Number(data.overhead_per_ton) === expectedOverhead) {
      return data;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Pricing overhead did not reach ${expectedOverhead}.`);
}

export async function waitForTaxRateByCity({
  organizationId,
  city,
}: {
  organizationId: string;
  city: string;
}): Promise<DatabaseRecord> {
  const supabase = createE2EAdminClient();
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    const { data, error } = await supabase
      .from("sales_tax_rates")
      .select("id, city, county, state, rate, effective_date")
      .eq("organization_id", organizationId)
      .eq("city", city)
      .maybeSingle<DatabaseRecord>();

    if (error) {
      throw new Error(error.message);
    }

    if (data) {
      return data;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Tax rate for ${city} was not found.`);
}

export async function waitForCustomerByName({
  organizationId,
  name,
}: {
  organizationId: string;
  name: string;
}): Promise<DatabaseRecord> {
  const supabase = createE2EAdminClient();
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    const { data, error } = await supabase
      .from("customers")
      .select("id, name, company_name, contact_name, email, phone, is_active")
      .eq("organization_id", organizationId)
      .eq("name", name)
      .maybeSingle<DatabaseRecord>();

    if (error) {
      throw new Error(error.message);
    }

    if (data) {
      return data;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Customer ${name} was not found.`);
}

export async function waitForJobSiteByName({
  organizationId,
  name,
}: {
  organizationId: string;
  name: string;
}): Promise<DatabaseRecord> {
  const supabase = createE2EAdminClient();
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    const { data, error } = await supabase
      .from("job_sites")
      .select("id, name, customer_id, city, county, state, is_active")
      .eq("organization_id", organizationId)
      .eq("name", name)
      .maybeSingle<DatabaseRecord>();

    if (error) {
      throw new Error(error.message);
    }

    if (data) {
      return data;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Job site ${name} was not found.`);
}

export async function waitForAuditAction({
  targetId,
  action,
}: {
  targetId: string | null;
  action: string;
}): Promise<DatabaseRecord> {
  const supabase = createE2EAdminClient();
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    let query = supabase
      .from("audit_log")
      .select("id, action, target_table, target_id, before_value, after_value, metadata")
      .eq("action", action)
      .order("created_at", { ascending: false })
      .limit(1);

    query =
      targetId === null ? query.is("target_id", null) : query.eq("target_id", targetId);

    const { data, error } = await query.maybeSingle<DatabaseRecord>();

    if (error) {
      throw new Error(error.message);
    }

    if (data) {
      return data;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Audit action ${action} was not found for ${targetId}.`);
}

export async function waitForQuoteStatus({
  quoteId,
  status,
}: {
  quoteId: string;
  status: string;
}): Promise<DatabaseRecord> {
  const supabase = createE2EAdminClient();
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    const { data, error } = await supabase
      .from("quotes")
      .select("id, quote_number, status, notes")
      .eq("id", quoteId)
      .maybeSingle<DatabaseRecord>();

    if (error) {
      throw new Error(error.message);
    }

    if (data?.status === status) {
      return data;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Quote ${quoteId} did not reach status ${status}.`);
}

export async function waitForLatestPublicLink({
  quoteId,
}: {
  quoteId: string;
}): Promise<DatabaseRecord> {
  const supabase = createE2EAdminClient();
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    const { data, error } = await supabase
      .from("quote_public_links")
      .select("id, quote_id, expires_at, last_viewed_at, revoked_at")
      .eq("quote_id", quoteId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<DatabaseRecord>();

    if (error) {
      throw new Error(error.message);
    }

    if (data) {
      return data;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Public link for quote ${quoteId} was not found.`);
}

export async function waitForLatestQuoteDocument({
  quoteId,
}: {
  quoteId: string;
}): Promise<DatabaseRecord> {
  const supabase = createE2EAdminClient();
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    const { data, error } = await supabase
      .from("quote_documents")
      .select("id, quote_id, version, document_type, storage_bucket, storage_path, status")
      .eq("quote_id", quoteId)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle<DatabaseRecord>();

    if (error) {
      throw new Error(error.message);
    }

    if (data) {
      return data;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Quote document for quote ${quoteId} was not found.`);
}

async function assertNoError(
  resultPromise: PromiseLike<{ error: { message: string } | null }>,
  message: string,
): Promise<void> {
  const result = await resultPromise;

  if (result.error) {
    throw new Error(`${message} ${result.error.message}`);
  }
}

async function syncExistingAuthUserToSecondTenant(
  supabase: SupabaseClient,
): Promise<void> {
  const { data, error } = await supabase.auth.admin.listUsers();

  if (error) {
    throw new Error(`Could not inspect test auth users. ${error.message}`);
  }

  const authUser = data.users.find(
    (user: User) =>
      user.email?.toLowerCase() === SECOND_TENANT_ADMIN_EMAIL.toLowerCase(),
  );

  if (!authUser) {
    return;
  }

  await assertNoError(
    supabase.from("users").upsert(
      {
        organization_id: SECOND_TENANT_ORG_ID,
        auth_user_id: authUser.id,
        email: SECOND_TENANT_ADMIN_EMAIL,
        full_name: "John Tenant B",
        role: "admin",
        is_active: true,
      },
      { onConflict: "auth_user_id" },
    ),
    "Could not sync existing auth user to the second tenant.",
  );
}
