import { apiOk, serverError, unauthorized } from "@/lib/api/responses";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getMapboxIntegration } from "@/lib/integrations/mapbox";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return unauthorized();
  }

  const supabase = await createClient();

  if (!supabase) {
    return serverError("Supabase is not configured for this workspace.");
  }

  const integration = await getMapboxIntegration({
    supabase,
    organizationId: user.organization_id,
  });

  return apiOk({
    enabled: Boolean(integration?.isEnabled && integration.publicAccessToken),
    accessToken:
      integration?.isEnabled && integration.publicAccessToken
        ? integration.publicAccessToken
        : null,
  });
}
