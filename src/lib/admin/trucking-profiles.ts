import { normalizeTruckingProfile, type TruckingProfile } from "@/lib/quotes/trucking";
import { createClient } from "@/lib/supabase/server";

export type AdminTruckingProfile = TruckingProfile & {
  isActive: boolean;
  assignmentId: string | null;
  assignmentScope: "tenant" | "supplier" | "plant" | null;
  assignmentTargetId: string | null;
  assignmentLabel: string;
};

export type TruckingProfileOption = { id: string; name: string };

export async function getAdminTruckingProfiles(
  organizationId: string,
): Promise<{
  profiles: AdminTruckingProfile[];
  suppliers: TruckingProfileOption[];
  plants: Array<TruckingProfileOption & { supplierId: string }>;
}> {
  const supabase = await createClient();

  if (!supabase) {
    return { profiles: [], suppliers: [], plants: [] };
  }

  const [profilesResult, assignmentsResult, suppliersResult, plantsResult] =
    await Promise.all([
      supabase
        .from("trucking_profiles")
        .select("id, name, average_speed_mph, hourly_rate, round_trip_factor, time_adjustment_bands, is_active")
        .eq("organization_id", organizationId)
        .order("name"),
      supabase
        .from("trucking_profile_assignments")
        .select("id, trucking_profile_id, supplier_id, plant_id")
        .eq("organization_id", organizationId)
        .eq("is_active", true),
      supabase
        .from("suppliers")
        .select("id, name")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("supplier_plants")
        .select("id, supplier_id, name")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("name"),
    ]);

  const suppliers = (suppliersResult.data ?? []).map((supplier) => ({
    id: supplier.id,
    name: supplier.name,
  }));
  const plants = (plantsResult.data ?? []).map((plant) => ({
    id: plant.id,
    supplierId: plant.supplier_id,
    name: plant.name,
  }));
  const supplierNames = new Map(suppliers.map((supplier) => [supplier.id, supplier.name]));
  const plantNames = new Map(plants.map((plant) => [plant.id, plant.name]));

  return {
    profiles: (profilesResult.data ?? []).map((record) => {
      const profile = normalizeTruckingProfile(record);
      const assignment = (assignmentsResult.data ?? []).find(
        (candidate) => candidate.trucking_profile_id === record.id,
      );
      const assignmentScope = assignment?.plant_id
        ? "plant"
        : assignment?.supplier_id
          ? "supplier"
          : assignment
            ? "tenant"
            : null;
      const assignmentTargetId = assignment?.plant_id ?? assignment?.supplier_id ?? null;
      const assignmentLabel = assignment?.plant_id
        ? `Plant: ${plantNames.get(assignment.plant_id) ?? "Unknown plant"}`
        : assignment?.supplier_id
          ? `Supplier: ${supplierNames.get(assignment.supplier_id) ?? "Unknown supplier"}`
          : assignment
            ? "Tenant default"
            : "Not assigned";

      return {
        ...profile,
        isActive: Boolean(record.is_active),
        assignmentId: assignment?.id ?? null,
        assignmentScope,
        assignmentTargetId,
        assignmentLabel,
      };
    }),
    suppliers,
    plants,
  };
}
