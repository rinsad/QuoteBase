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
  notes: string | null;
  is_active: boolean;
  updated_at: string;
  supplier_plants:
    | Array<{
        id: string;
        name: string;
        is_active: boolean;
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
      "id, name, notes, is_active, updated_at, supplier_plants(id, name, is_active, materials(id, name, description, tier, unit, cost_per_unit, last_price_update, minimum_order_quantity, special_notes, is_active))",
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
      plants:
        supplier.supplier_plants?.map((plant) => ({
          ...plant,
          materials:
            plant.materials?.map((material) => ({
              ...material,
              cost_per_unit: Number(material.cost_per_unit),
              minimum_order_quantity:
                material.minimum_order_quantity === null
                  ? null
                  : Number(material.minimum_order_quantity),
            })) ?? [],
        })) ?? [],
    },
  });
}
