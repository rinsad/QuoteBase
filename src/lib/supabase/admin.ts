import { createClient } from "@supabase/supabase-js";

import { getSupabaseBrowserConfig } from "@/lib/env";

export function createAdminClient() {
  const config = getSupabaseBrowserConfig();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!config || !serviceRoleKey) {
    return null;
  }

  return createClient(config.supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

