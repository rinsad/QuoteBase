import crypto from "node:crypto";

import { revalidatePath } from "next/cache";

import { apiOk, forbidden, serverError } from "@/lib/api/responses";
import { syncEnabledPipedriveCustomers } from "@/lib/integrations/pipedrive";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return forbidden("Cron authorization failed.");
  }

  const admin = createAdminClient();

  if (!admin) {
    return serverError("Supabase admin client is not configured.");
  }

  try {
    const result = await syncEnabledPipedriveCustomers({ supabase: admin });

    revalidatePath("/customers");
    revalidatePath("/quotes/new");

    return apiOk(result, {
      meta: {
        source_of_truth: "pipedrive",
        schedule: "*/30 * * * *",
      },
    });
  } catch (error) {
    return serverError(
      error instanceof Error ? error.message : "Pipedrive sync failed.",
    );
  }
}

function isAuthorizedCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;

  if (!secret?.trim()) {
    return process.env.NODE_ENV !== "production";
  }

  const received = getBearerToken(request.headers.get("authorization"));

  if (!received) {
    return false;
  }

  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(secret.trim());

  return (
    receivedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

function getBearerToken(value: string | null): string | null {
  if (!value?.startsWith("Bearer ")) {
    return null;
  }

  return value.slice("Bearer ".length).trim() || null;
}
