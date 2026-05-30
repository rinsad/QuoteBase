import { createAdminClient } from "@/lib/supabase/admin";

export type AdminSupplier = {
  id: string;
  name: string;
  parent_company: string | null;
  address: Record<string, unknown>;
  is_active: boolean;
  materials: {
    id: string;
    name: string;
    tier: "R1" | "R2" | "R3" | "R4";
    unit: string;
    cost_per_unit: number;
    is_active: boolean;
  }[];
};

export type AdminPlantsSummary = {
  suppliers: AdminSupplier[];
  counts: {
    suppliers: number;
    materials: number;
    vehicleTypes: number;
    yards: number;
    taxRates: number;
    auditEntries: number;
  };
};

type SupplierRecord = Omit<AdminSupplier, "materials"> & {
  materials: AdminSupplier["materials"] | null;
};

export async function getAdminPlantsSummary(
  organizationId: string,
): Promise<AdminPlantsSummary> {
  const admin = createAdminClient();

  if (!admin) {
    return {
      suppliers: [],
      counts: {
        suppliers: 0,
        materials: 0,
        vehicleTypes: 0,
        yards: 0,
        taxRates: 0,
        auditEntries: 0,
      },
    };
  }

  const [
    suppliersResult,
    suppliersCount,
    materialsCount,
    vehicleTypesCount,
    yardsCount,
    taxRatesCount,
    auditEntriesCount,
  ] = await Promise.all([
    admin
      .from("suppliers")
      .select(
        "id, name, parent_company, address, is_active, materials(id, name, tier, unit, cost_per_unit, is_active)",
      )
      .eq("organization_id", organizationId)
      .order("name", { ascending: true })
      .returns<SupplierRecord[]>(),
    admin
      .from("suppliers")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    admin
      .from("materials")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    admin
      .from("vehicle_types")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    admin
      .from("yards")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    admin
      .from("sales_tax_rates")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    admin
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
  ]);

  return {
    suppliers:
      suppliersResult.data?.map((supplier) => ({
        ...supplier,
        materials: supplier.materials ?? [],
      })) ?? [],
    counts: {
      suppliers: suppliersCount.count ?? 0,
      materials: materialsCount.count ?? 0,
      vehicleTypes: vehicleTypesCount.count ?? 0,
      yards: yardsCount.count ?? 0,
      taxRates: taxRatesCount.count ?? 0,
      auditEntries: auditEntriesCount.count ?? 0,
    },
  };
}

