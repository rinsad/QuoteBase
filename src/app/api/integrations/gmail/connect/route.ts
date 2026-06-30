import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/current-user";
import { createGmailAuthorizationUrl } from "@/lib/integrations/gmail";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const supabase = createAdminClient();

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
