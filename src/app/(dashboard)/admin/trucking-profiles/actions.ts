"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { logAction } from "@/lib/audit/log-action";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function saveTruckingProfile(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") throw new Error("Only admins can manage trucking profiles.");

  const supabase = await createClient();
  if (!supabase) throw new Error("Supabase is not configured for this workspace.");

  const profileId = optionalUuid(formData, "profile_id");
  const { scope, targetId } = requiredAssignment(formData);
  const payload = {
    organization_id: user.organization_id,
    name: requiredText(formData, "name"),
    average_speed_mph: requiredPositiveNumber(formData, "average_speed_mph", 100),
    hourly_rate: requiredNonNegativeNumber(formData, "hourly_rate", 10000),
    round_trip_factor: requiredPositiveNumber(formData, "round_trip_factor", 10),
    is_active: true,
  };

  await validateAssignmentTarget({ supabase, organizationId: user.organization_id, scope, targetId });

  const { data: before } = profileId
    ? await supabase.from("trucking_profiles").select("*")
        .eq("organization_id", user.organization_id).eq("id", profileId)
        .maybeSingle<Record<string, unknown>>()
    : { data: null };
  const profileQuery = profileId
    ? supabase.from("trucking_profiles").update(payload)
        .eq("organization_id", user.organization_id).eq("id", profileId)
    : supabase.from("trucking_profiles").insert(payload);
  const { data: profile, error: profileError } = await profileQuery
    .select("id, name, average_speed_mph, hourly_rate, round_trip_factor, is_active")
    .single<Record<string, unknown>>();
  if (profileError || typeof profile?.id !== "string") {
    throw new Error(profileError?.message ?? "Could not save trucking profile.");
  }

  const assignmentMatch = assignmentColumns(scope, targetId);
  let existingQuery = supabase.from("trucking_profile_assignments").select("*")
    .eq("organization_id", user.organization_id).eq("is_active", true);
  existingQuery = assignmentMatch.supplier_id
    ? existingQuery.eq("supplier_id", assignmentMatch.supplier_id).is("plant_id", null)
    : existingQuery.is("supplier_id", null);
  existingQuery = assignmentMatch.plant_id
    ? existingQuery.eq("plant_id", assignmentMatch.plant_id)
    : existingQuery.is("plant_id", null);
  const { data: previousAssignments, error: previousAssignmentsError } = await existingQuery;
  if (previousAssignmentsError) throw new Error(previousAssignmentsError.message);

  if ((previousAssignments ?? []).length) {
    const assignmentIds = (previousAssignments ?? []).map((assignment) => assignment.id);
    const { error } = await supabase.from("trucking_profile_assignments")
      .update({ is_active: false }).eq("organization_id", user.organization_id)
      .in("id", assignmentIds);
    if (error) throw new Error(error.message);
  }

  const { data: assignment, error: assignmentError } = await supabase
    .from("trucking_profile_assignments")
    .insert({ organization_id: user.organization_id, trucking_profile_id: profile.id, ...assignmentMatch })
    .select("id, trucking_profile_id, supplier_id, plant_id, is_active")
    .single<Record<string, unknown>>();
  if (assignmentError || !assignment) {
    throw new Error(assignmentError?.message ?? "Could not assign trucking profile.");
  }

  await logAction({
    user,
    action: profileId ? "trucking_profile.updated" : "trucking_profile.created",
    targetTable: "trucking_profiles",
    targetId: profile.id,
    before: { profile: before, assignments: previousAssignments ?? [] },
    after: { profile, assignment },
  });

  revalidatePath("/admin/trucking-profiles");
  revalidatePath("/admin/pricing");
  revalidatePath("/quotes/new");
  redirect("/admin/trucking-profiles?saved=1");
}

function assignmentColumns(scope: "tenant" | "supplier" | "plant", targetId: string | null) {
  return { supplier_id: scope === "supplier" ? targetId : null, plant_id: scope === "plant" ? targetId : null };
}

async function validateAssignmentTarget({ supabase, organizationId, scope, targetId }: {
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>;
  organizationId: string;
  scope: "tenant" | "supplier" | "plant";
  targetId: string | null;
}): Promise<void> {
  if (scope === "tenant") return;
  const table = scope === "supplier" ? "suppliers" : "supplier_plants";
  const { data } = await supabase.from(table).select("id")
    .eq("organization_id", organizationId).eq("id", targetId).eq("is_active", true)
    .maybeSingle<{ id: string }>();
  if (!data) throw new Error(`The selected ${scope} is not available to this tenant.`);
}

function requiredAssignment(formData: FormData): {
  scope: "tenant" | "supplier" | "plant";
  targetId: string | null;
} {
  const value = formData.get("assignment");
  if (value === "tenant") return { scope: "tenant", targetId: null };
  if (typeof value !== "string") throw new Error("Assignment is required.");
  const [scope, targetId] = value.split(":");
  if ((scope !== "supplier" && scope !== "plant") || !targetId) {
    throw new Error("Assignment is invalid.");
  }
  return { scope, targetId: validateUuid(targetId, "assignment") };
}

function requiredText(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required.`);
  return value.trim().slice(0, 120);
}

function optionalUuid(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" && value ? validateUuid(value, key) : null;
}

function validateUuid(value: string, key: string): string {
  if (!UUID_PATTERN.test(value)) throw new Error(`${key} is invalid.`);
  return value;
}

function requiredPositiveNumber(formData: FormData, key: string, maximum: number): number {
  const value = requiredNonNegativeNumber(formData, key, maximum);
  if (value <= 0) throw new Error(`${key} must be greater than zero.`);
  return value;
}

function requiredNonNegativeNumber(formData: FormData, key: string, maximum: number): number {
  const rawValue = formData.get(key);
  const value = typeof rawValue === "string" ? Number(rawValue) : NaN;
  if (!Number.isFinite(value) || value < 0 || value > maximum) throw new Error(`${key} must be between 0 and ${maximum}.`);
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
