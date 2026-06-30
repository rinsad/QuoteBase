export function getBaseUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return "http://localhost:3000";
}

export function getSupabaseBrowserConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return {
    supabaseUrl,
    supabaseAnonKey,
  };
}

export function isLocalSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  return Boolean(
    supabaseUrl?.startsWith("http://127.0.0.1:") ||
      supabaseUrl?.startsWith("http://localhost:"),
  );
}

export function isDevLoginEnabled() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.ENABLE_DEV_LOGIN === "true" &&
    isLocalSupabase()
  );
}

export async function isSupabaseReachable(): Promise<boolean> {
  const config = getSupabaseBrowserConfig();

  if (!config) {
    return false;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);

  try {
    const response = await fetch(`${config.supabaseUrl}/auth/v1/health`, {
      cache: "no-store",
      signal: controller.signal,
    });

    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
