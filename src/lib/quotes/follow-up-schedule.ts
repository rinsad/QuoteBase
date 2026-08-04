import type { SupabaseClient } from "@supabase/supabase-js";

import type { QuoteAccountType } from "@/lib/quotes/create-draft";

type FollowUpScheduleQuote = {
  account_type: QuoteAccountType | string | null;
  project_status: string | null;
  job_start_date: string | null;
  followup_attempt_count: number | string | null;
  followup_max_attempts: number | string | null;
};

type FollowUpScheduleSettings = {
  defaultFollowupMaxAttempts?: number | string | null;
  jobsStartingSoonDays?: number | string | null;
};

const DEFAULT_JOBS_STARTING_SOON_DAYS = 14;
const DEFAULT_FOLLOWUP_MAX_ATTEMPTS = 5;
const STARTING_SOON_DELAYS = [1, 3, 5, 7, 10] as const;
const CONTRACTOR_EXISTING_JOB_DELAYS = [2, 5, 10, 15, 20] as const;
const CONTRACTOR_BID_DELAYS = [14, 30, 60, 90, 120] as const;
const NON_CONTRACTOR_DELAYS = [3, 7, 14, 21, 30] as const;

export function nextFollowUpDelayDays({
  quote,
  settings,
  now = new Date(),
}: {
  quote: FollowUpScheduleQuote;
  settings: FollowUpScheduleSettings;
  now?: Date;
}): number | null {
  const attemptCount = normalizedInteger(quote.followup_attempt_count, 0);
  const maxAttempts = effectiveMaxAttempts({ quote, settings });

  if (maxAttempts <= 0 || attemptCount >= maxAttempts) {
    return null;
  }

  const schedule = followUpDelaySchedule({ quote, settings, now });

  return schedule[attemptCount] ?? null;
}

export function nextFollowUpDateForQuote({
  quote,
  settings,
  now = new Date(),
}: {
  quote: FollowUpScheduleQuote;
  settings: FollowUpScheduleSettings;
  now?: Date;
}): string | null {
  const delayDays = nextFollowUpDelayDays({ quote, settings, now });

  if (delayDays === null) {
    return null;
  }

  const next = new Date(now);
  next.setUTCDate(next.getUTCDate() + delayDays);

  return isoDate(next);
}

export async function scheduleNextFollowUpForQuote({
  supabase,
  organizationId,
  quoteId,
  now = new Date(),
}: {
  supabase: SupabaseClient;
  organizationId: string;
  quoteId: string;
  now?: Date;
}): Promise<string | null> {
  const { data: quote } = await supabase
    .from("quotes")
    .select(
      "id, account_type, project_status, job_start_date, followup_attempt_count, followup_max_attempts",
    )
    .eq("organization_id", organizationId)
    .eq("id", quoteId)
    .eq("is_active", true)
    .single<
      FollowUpScheduleQuote & {
        id: string;
      }
    >();

  if (!quote) {
    return null;
  }

  const { data: config } = await supabase
    .from("pricing_config")
    .select("default_followup_max_attempts, jobs_starting_soon_days")
    .eq("organization_id", organizationId)
    .maybeSingle<{
      default_followup_max_attempts: number | string | null;
      jobs_starting_soon_days: number | string | null;
    }>();

  const followupDate = nextFollowUpDateForQuote({
    quote,
    settings: {
      defaultFollowupMaxAttempts: config?.default_followup_max_attempts,
      jobsStartingSoonDays: config?.jobs_starting_soon_days,
    },
    now,
  });

  await supabase
    .from("quotes")
    .update({ followup_date: followupDate })
    .eq("organization_id", organizationId)
    .eq("id", quoteId)
    .eq("is_active", true);

  return followupDate;
}

function followUpDelaySchedule({
  quote,
  settings,
  now,
}: {
  quote: FollowUpScheduleQuote;
  settings: FollowUpScheduleSettings;
  now: Date;
}): readonly number[] {
  if (isJobStartingSoon(quote.job_start_date, settings, now)) {
    return STARTING_SOON_DELAYS;
  }

  if (quote.account_type === "contractor") {
    return isBidProjectStatus(quote.project_status)
      ? CONTRACTOR_BID_DELAYS
      : CONTRACTOR_EXISTING_JOB_DELAYS;
  }

  return NON_CONTRACTOR_DELAYS;
}

export function isFollowUpJobStartingSoon({
  quote,
  settings,
  now = new Date(),
}: {
  quote: Pick<FollowUpScheduleQuote, "job_start_date">;
  settings: FollowUpScheduleSettings;
  now?: Date;
}): boolean {
  return isJobStartingSoon(quote.job_start_date, settings, now);
}

export function effectiveMaxFollowUpAttempts({
  quote,
  settings,
}: {
  quote: Pick<FollowUpScheduleQuote, "followup_max_attempts">;
  settings: FollowUpScheduleSettings;
}): number {
  return effectiveMaxAttempts({ quote, settings });
}

function isJobStartingSoon(
  jobStartDate: string | null,
  settings: FollowUpScheduleSettings,
  now: Date,
): boolean {
  if (!jobStartDate) {
    return false;
  }

  const start = new Date(`${jobStartDate}T00:00:00.000Z`);

  if (Number.isNaN(start.getTime())) {
    return false;
  }

  const today = new Date(`${isoDate(now)}T00:00:00.000Z`);
  const daysUntilStart = Math.ceil(
    (start.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
  );
  const soonWindow = normalizedInteger(
    settings.jobsStartingSoonDays,
    DEFAULT_JOBS_STARTING_SOON_DAYS,
  );

  return daysUntilStart <= soonWindow;
}

function isBidProjectStatus(projectStatus: string | null): boolean {
  const normalized = (projectStatus ?? "").trim().toLowerCase();

  return (
    normalized === "bid" ||
    normalized.includes("bid") ||
    normalized.includes("tender") ||
    normalized.includes("proposal")
  );
}

function normalizedInteger(value: number | string | null | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);

  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : fallback;
}

function effectiveMaxAttempts({
  quote,
  settings,
}: {
  quote: Pick<FollowUpScheduleQuote, "followup_max_attempts">;
  settings: FollowUpScheduleSettings;
}): number {
  const configured = normalizedInteger(
    settings.defaultFollowupMaxAttempts,
    normalizedInteger(quote.followup_max_attempts, DEFAULT_FOLLOWUP_MAX_ATTEMPTS),
  );

  return Math.min(5, Math.max(1, configured));
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
