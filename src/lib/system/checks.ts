import type { AppUser } from "@/lib/auth/current-user";
import { isRetiredFeature } from "@/lib/features/flags";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type FeatureFlagSummary = {
  feature_name: string;
  is_enabled: boolean;
};

export type DashboardSummary = {
  featureFlags: FeatureFlagSummary[];
  sessionStatus: "active" | "missing";
  supabaseStatus: "configured" | "missing";
};

export type SystemCheck = {
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
};

export type SystemCheckSummary = {
  counts: {
    organizations: number;
    invitedUsers: number;
    appUsers: number;
    featureFlags: number;
  };
  checks: SystemCheck[];
  featureFlags: FeatureFlagSummary[];
};

export async function getDashboardSummary(
  user: AppUser,
): Promise<DashboardSummary> {
  const supabase = await createClient();

  if (!supabase) {
    return {
      featureFlags: [],
      sessionStatus: "missing",
      supabaseStatus: "missing",
    };
  }

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  const { data: featureFlags } = await supabase
    .from("feature_flags")
    .select("feature_name, is_enabled")
    .eq("organization_id", user.organization_id)
    .order("feature_name", { ascending: true })
    .returns<FeatureFlagSummary[]>();

  return {
    featureFlags: featureFlags ?? [],
    sessionStatus: authUser ? "active" : "missing",
    supabaseStatus: "configured",
  };
}

export async function getSystemCheckSummary(
  user: AppUser,
): Promise<SystemCheckSummary> {
  const supabase = await createClient();
  const admin = createAdminClient();
  const checks: SystemCheck[] = [];

  if (!supabase) {
    return {
      counts: {
        organizations: 0,
        invitedUsers: 0,
        appUsers: 0,
        featureFlags: 0,
      },
      checks: [
        {
          label: "Supabase environment",
          status: "fail",
          detail: "Missing local Supabase environment values.",
        },
      ],
      featureFlags: [],
    };
  }

  checks.push({
    label: "Supabase environment",
    status: "pass",
    detail: "Local Supabase URL and anon key are configured.",
  });

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  checks.push({
    label: "Authenticated session",
    status: authUser ? "pass" : "fail",
    detail: authUser
      ? `Session is active for ${authUser.email ?? user.email}.`
      : "No Supabase session was found.",
  });

  checks.push({
    label: "Admin authorization",
    status: user.role === "admin" ? "pass" : "fail",
    detail:
      user.role === "admin"
        ? "Current user can access admin-only checks."
        : "Current user is not an admin.",
  });

  const { data: visibleFlags } = await supabase
    .from("feature_flags")
    .select("feature_name, is_enabled")
    .eq("organization_id", user.organization_id)
    .order("feature_name", { ascending: true })
    .returns<FeatureFlagSummary[]>();
  const currentVisibleFlags =
    visibleFlags?.filter((flag) => !isRetiredFeature(flag.feature_name)) ?? [];

  checks.push({
    label: "Feature flag visibility",
    status: currentVisibleFlags.length ? "pass" : "warn",
    detail: currentVisibleFlags.length
      ? `${currentVisibleFlags.length} feature flags are visible to the current org.`
      : "No feature flags were visible to this user session.",
  });

  const { data: mapboxIntegration } = await supabase
    .from("organization_integrations")
    .select("is_enabled, credentials_last4")
    .eq("organization_id", user.organization_id)
    .eq("provider", "mapbox")
    .maybeSingle<{
      is_enabled: boolean;
      credentials_last4: Record<string, unknown> | null;
    }>();
  const mapboxConfigured = Boolean(
    mapboxIntegration?.is_enabled &&
      typeof mapboxIntegration.credentials_last4?.public_access_token === "string",
  );

  checks.push({
    label: "Mapbox location services",
    status: mapboxConfigured ? "pass" : "warn",
    detail:
      mapboxConfigured
        ? "Mapbox is configured for address search, fallback geocoding, and route distance."
        : "Mapbox is not configured; address search and route distances will use manual or local fallback where available.",
  });

  const slackEnabled =
    visibleFlags?.some(
      (flag) => flag.feature_name === "slack_notifications" && flag.is_enabled,
    ) ?? false;
  const { data: slackIntegration } = await supabase
    .from("organization_integrations")
    .select("is_enabled, credentials_last4")
    .eq("organization_id", user.organization_id)
    .eq("provider", "slack")
    .maybeSingle<{
      is_enabled: boolean;
      credentials_last4: Record<string, unknown> | null;
    }>();
  const slackConfigured = Boolean(
    slackIntegration?.is_enabled &&
      slackIntegration.credentials_last4?.webhook_url &&
      slackIntegration.credentials_last4?.signing_secret,
  );

  checks.push({
    label: "Slack notifications",
    status:
      slackEnabled && !slackConfigured
        ? "warn"
        : slackEnabled
          ? "pass"
          : "warn",
    detail:
      slackEnabled && slackConfigured
        ? "Slack quote workflow notifications are enabled and configured for this organization."
        : slackEnabled
          ? "Slack notifications are enabled, but this organization has not completed Slack integration settings."
          : "Slack notifications are disabled for this organization.",
  });

  const emailAutomationEnabled =
    visibleFlags?.some(
      (flag) => flag.feature_name === "email_sms_automation" && flag.is_enabled,
    ) ?? false;
  const { data: gmailIntegration } = await supabase
    .from("user_integrations")
    .select("is_enabled, credentials_last4")
    .eq("organization_id", user.organization_id)
    .eq("user_id", user.id)
    .eq("provider", "gmail")
    .maybeSingle<{
      is_enabled: boolean;
      credentials_last4: Record<string, unknown> | null;
    }>();
  const emailConfigured = Boolean(
    gmailIntegration?.is_enabled && gmailIntegration.credentials_last4?.email,
  );

  checks.push({
    label: "Email delivery",
    status:
      emailAutomationEnabled && !emailConfigured
        ? "warn"
        : emailAutomationEnabled
          ? "pass"
          : "warn",
    detail:
      emailAutomationEnabled && emailConfigured
        ? "Quote email delivery is enabled and Gmail is connected for your user account."
        : emailAutomationEnabled
          ? "Quote email delivery is enabled, but your user account has not connected Gmail."
          : "Email automation is disabled for this organization; local sends will create links and skip provider delivery.",
  });

  const { data: hiddenInvites, error: inviteError } = await supabase
    .from("user_invites")
    .select("id")
    .limit(1);

  checks.push({
    label: "RLS invite-table probe",
    status: !inviteError && hiddenInvites?.length === 0 ? "pass" : "fail",
    detail:
      !inviteError && hiddenInvites?.length === 0
        ? "Client session cannot read seed invite records."
        : "Client session could read invite records or hit an unexpected RLS error.",
  });

  if (!admin) {
    checks.push({
      label: "Service role client",
      status: "warn",
      detail: "Service role key is missing, so admin counts are unavailable.",
    });

    return {
      counts: {
        organizations: 0,
        invitedUsers: 0,
        appUsers: 0,
        featureFlags: currentVisibleFlags.length,
      },
      checks,
      featureFlags: currentVisibleFlags,
    };
  }

  const [organizations, invitedUsers, appUsers] = await Promise.all([
    admin.from("organizations").select("id", { count: "exact", head: true }),
    admin.from("user_invites").select("id", { count: "exact", head: true }),
    admin.from("users").select("id", { count: "exact", head: true }),
  ]);

  checks.push({
    label: "Service role client",
    status: "pass",
    detail: "Service role can read admin-only setup counts on the server.",
  });

  return {
    counts: {
      organizations: organizations.count ?? 0,
      invitedUsers: invitedUsers.count ?? 0,
      appUsers: appUsers.count ?? 0,
      featureFlags: currentVisibleFlags.length,
    },
    checks,
    featureFlags: currentVisibleFlags,
  };
}
