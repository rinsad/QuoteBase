import {
  apiOk,
  badRequest,
  notFound,
  serverError,
  unauthorized,
} from "@/lib/api/responses";
import { isUuid } from "@/lib/api/validation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

type SupplierDetailRecord = {
  id: string;
  name: string;
  parent_company: string | null;
  address: Record<string, unknown>;
  latitude: number | null;
  longitude: number | null;
  hours: string | null;
  primary_contact_name: string | null;
  primary_contact_phone: string | null;
  notes: string | null;
  is_active: boolean;
  updated_at: string;
  materials:
    | Array<{
        id: string;
        name: string;
        description: string | null;
        tier: "R1" | "R2" | "R3" | "R4";
        unit: string;
        cost_per_unit: number;
        last_price_update: string | null;
        minimum_order_quantity: number | null;
        special_notes: string | null;
        is_active: boolean;
      }>
    | null;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();

  if (!user) {
    return unauthorized();
  }

  const { id } = await params;

  if (!isUuid(id)) {
    return badRequest("id must be a valid UUID.");
  }

  const supabase = await createClient();

  if (!supabase) {
    return serverError("Supabase is not configured.");
  }

  const { data: supplier, error } = await supabase
    .from("suppliers")
    .select(
      "id, name, parent_company, address, latitude, longitude, hours, primary_contact_name, primary_contact_phone, notes, is_active, updated_at, materials(id, name, description, tier, unit, cost_per_unit, last_price_update, minimum_order_quantity, special_notes, is_active)",
    )
    .eq("organization_id", user.organization_id)
    .eq("id", id)
    .single<SupplierDetailRecord>();

  if (error || !supplier) {
    return notFound("Supplier not found.");
  }

  return apiOk({
    supplier: {
      ...supplier,
      latitude: supplier.latitude === null ? null : Number(supplier.latitude),
      longitude:
        supplier.longitude === null ? null : Number(supplier.longitude),
      materials:
        supplier.materials?.map((material) => ({
          ...material,
          cost_per_unit: Number(material.cost_per_unit),
          minimum_order_quantity:
            material.minimum_order_quantity === null
              ? null
              : Number(material.minimum_order_quantity),
        })) ?? [],
    },
  });
}
