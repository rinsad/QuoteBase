import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  apiOk,
  badRequest,
  forbidden,
  serverError,
  unauthorized,
} from "@/lib/api/responses";
import { UUID_PATTERN } from "@/lib/api/validation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { updateMaterialPrices } from "@/lib/materials/price-updates";
import { createClient } from "@/lib/supabase/server";

const bulkPriceUpdateSchema = z.object({
  updates: z
    .array(
      z.object({
        material_id: z.string().regex(UUID_PATTERN),
        new_price: z.coerce.number().positive().max(1000000),
        price_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        notes: z.string().trim().max(1000).nullable().optional(),
      }),
    )
    .min(1)
    .max(100),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return unauthorized();
  }

  if (user.role !== "admin" && user.role !== "account_manager") {
    return forbidden("Only admins and account managers can update material prices.");
  }

  const supabase = await createClient();

  if (!supabase) {
    return serverError("Supabase is not configured.");
  }

  const parsed = await parseBody(request);

  if (!parsed.ok) {
    return badRequest(parsed.message);
  }

  try {
    const updates = await updateMaterialPrices({
      supabase,
      user,
      updates: parsed.value.updates.map((update) => ({
        materialId: update.material_id,
        newPrice: roundMoney(update.new_price),
        priceDate: update.price_date,
        notes: update.notes?.trim() || null,
      })),
    });

    revalidateMaterialPaths();

    return apiOk({ updates }, { status: 201 });
  } catch (error) {
    return mapMaterialPriceError(error);
  }
}

async function parseBody(
  request: Request,
): Promise<
  | { ok: true; value: z.infer<typeof bulkPriceUpdateSchema> }
  | { ok: false; message: string }
> {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return { ok: false, message: "Request body must be valid JSON." };
  }

  const result = bulkPriceUpdateSchema.safeParse(payload);

  if (!result.success) {
    return {
      ok: false,
      message: result.error.issues.map((issue) => issue.message).join(" "),
    };
  }

  return { ok: true, value: result.data };
}

function mapMaterialPriceError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Could not update material prices.";

  if (
    message.includes("not found") ||
    message.includes("different") ||
    message.includes("required") ||
    message.includes("Only admins") ||
    message.includes("updated once")
  ) {
    return badRequest(message);
  }

  return serverError("Could not update material prices.");
}

function revalidateMaterialPaths(): void {
  revalidatePath("/admin/material-prices");
  revalidatePath("/admin/plants");
  revalidatePath("/quotes/new");
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
