import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/current-user";
import { createSalesforceTestContacts } from "@/lib/integrations/crm-sync";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url), 303);
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });

  try {
    const result = await createSalesforceTestContacts({ user, supabase });
    const redirectUrl = new URL("/admin/integrations/crm", request.url);
    redirectUrl.searchParams.set("seeded", String(result.created));
    redirectUrl.searchParams.set("skipped", String(result.skipped));
    return NextResponse.redirect(redirectUrl, 303);
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      message: "Salesforce test contact creation failed",
      organizationId: user.organization_id,
      error: error instanceof Error ? error.message : "Unknown error",
    }));
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create Salesforce test contacts." }, { status: 502 });
  }
}
