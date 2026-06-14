import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/current-user";
import { createGmailAuthorizationUrl } from "@/lib/integrations/gmail";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin") {
    redirect("/admin/integrations/gmail?error=unauthorized");
  }

  const supabase = await createClient();

  if (!supabase) {
    redirect("/admin/integrations/gmail?error=google_not_configured");
  }

  let authorizationUrl: string | null = null;

  try {
    authorizationUrl = await createGmailAuthorizationUrl({
      supabase,
      organizationId: user.organization_id,
      userId: user.id,
    });
  } catch (error) {
    console.error("Gmail authorization URL could not be created.", error);
    redirect("/admin/integrations/gmail?error=oauth_settings_unreadable");
  }

  if (!authorizationUrl) {
    redirect("/admin/integrations/gmail?error=google_not_configured");
  }

  redirect(authorizationUrl);
}
