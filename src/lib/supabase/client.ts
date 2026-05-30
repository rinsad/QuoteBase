"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseBrowserConfig } from "@/lib/env";

export function createClient() {
  const config = getSupabaseBrowserConfig();

  if (!config) {
    throw new Error("Supabase environment variables are not configured.");
  }

  return createBrowserClient(config.supabaseUrl, config.supabaseAnonKey);
}

