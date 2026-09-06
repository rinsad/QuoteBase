import { createAdminClient } from "@/lib/supabase/admin";

export type AdminSupplier = {
  id: string;
  supplier_id: string;
  supplier_name: string;
  name: string;
  address: Record<string, unknown>;
  latitude: number | null;
  longitude: number | null;
  hours: string | null;
  primary_contact_name: string | null;
  primary_contact_phone: string | null;
  notes: string | null;
  is_active: boolean;
  materials: {
    id: string;
    name: string;
    tier: "R1" | "R2" | "R3" | "R4";
    unit: string;
    cost_per_unit: number;
    last_price_update: string | null;
    is_active: boolean;
  }[];
};

export type AdminPlantsSummary = {
  suppliers: AdminSupplier[];
  parentSuppliers: { id: string; name: string }[];
  counts: {
    suppliers: number;
    materials: number;
    yards: number;
    taxRates: number;
    auditEntries: number;
  };
};

type SupplierRecord = Omit<AdminSupplier, "materials"> & {
  materials: AdminSupplier["materials"] | null;
  suppliers: { name: string } | { name: string }[] | null;
};

export async function getAdminPlantsSummary(
  organizationId: string,
): Promise<AdminPlantsSummary> {
  const admin = createAdminClient();

  if (!admin) {
    return {
      suppliers: [],
      parentSuppliers: [],
      counts: {
        suppliers: 0,
        materials: 0,
        yards: 0,
        taxRates: 0,
        auditEntries: 0,
      },
    };
  }

  const [
    suppliersResult,
    parentSuppliersResult,
    suppliersCount,
    materialsCount,
    yardsCount,
    taxRatesCount,
    auditEntriesCount,
  ] = await Promise.all([
    admin
      .from("supplier_plants")
      .select(
        "id, supplier_id, name, address, latitude, longitude, hours, primary_contact_name, primary_contact_phone, notes, is_active, suppliers(name), materials(id, name, tier, unit, cost_per_unit, last_price_update, is_active)",
      )
      .eq("organization_id", organizationId)
      .order("name", { ascending: true })
      .returns<SupplierRecord[]>(),
    admin
      .from("suppliers")
      .select("id, name")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("name", { ascending: true })
      .returns<{ id: string; name: string }[]>(),
    admin
      .from("supplier_plants")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    admin
      .from("materials")
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
      suppliersResult.data?.map((supplier) => {
        const parent = Array.isArray(supplier.suppliers)
          ? supplier.suppliers[0]
          : supplier.suppliers;

        return {
          ...supplier,
          supplier_name: parent?.name ?? "Unknown supplier",
          latitude: supplier.latitude === null ? null : Number(supplier.latitude),
          longitude:
            supplier.longitude === null ? null : Number(supplier.longitude),
          materials: (supplier.materials ?? []).filter(
            (material) => material.is_active,
          ),
        };
      }) ?? [],
    parentSuppliers: parentSuppliersResult.data ?? [],
    counts: {
      suppliers: suppliersCount.count ?? 0,
      materials: materialsCount.count ?? 0,
      yards: yardsCount.count ?? 0,
      taxRates: taxRatesCount.count ?? 0,
      auditEntries: auditEntriesCount.count ?? 0,
    },
  };
}
