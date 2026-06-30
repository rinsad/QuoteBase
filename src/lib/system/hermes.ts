import type { SupabaseClient } from "@supabase/supabase-js";

import type { AppUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

export type HermesStepKey = "import" | "markup" | "contacts" | "first_quote";

export type HermesStep = {
  key: HermesStepKey;
  label: string;
  title: string;
  detail: string;
  href: string;
  cta: string;
  checklist: string[];
  secondaryHref?: string;
  secondaryCta?: string;
  isComplete: boolean;
  metric: string;
};

export type HermesOnboardingSummary = {
  isDismissed: boolean;
  completedAt: string | null;
  progress: number;
  nextStep: HermesStep | null;
  steps: HermesStep[];
};

type OnboardingRecord = {
  is_dismissed: boolean;
  completed_at: string | null;
};

export async function getHermesOnboardingSummary(
  user: AppUser,
): Promise<HermesOnboardingSummary> {
  const supabase = await createClient();

  if (!supabase) {
    return emptySummary();
  }

  const [
    onboardingResult,
    leadCaptureCount,
    crmCompanyCount,
    materialCount,
    pricingConfigCount,
    contactCount,
    customerCount,
    quoteCount,
  ] = await Promise.all([
    supabase
      .from("organization_onboarding")
      .select("is_dismissed, completed_at")
      .eq("organization_id", user.organization_id)
      .maybeSingle<OnboardingRecord>(),
    countRows({ supabase, table: "crm_lead_captures", organizationId: user.organization_id }),
    countRows({ supabase, table: "crm_companies", organizationId: user.organization_id }),
    countRows({ supabase, table: "materials", organizationId: user.organization_id }),
    countRows({ supabase, table: "pricing_config", organizationId: user.organization_id }),
    countRows({ supabase, table: "crm_contacts", organizationId: user.organization_id }),
    countRows({ supabase, table: "customers", organizationId: user.organization_id }),
    countRows({ supabase, table: "quotes", organizationId: user.organization_id }),
  ]);
  const importedLeads = leadCaptureCount + crmCompanyCount;
  const configuredMaterials = materialCount;
  const configuredPricing = pricingConfigCount;
  const contactRows = contactCount + customerCount;
  const quoteRows = quoteCount;
  const steps: HermesStep[] = [
    {
      key: "import",
      label: "Import",
      title: "Bring in starting data",
      detail:
        "Import CSV leads or starting customer/company records so Hermes has a pipeline to work with.",
      href: "/customers",
      cta: "Open import",
      checklist: [
        "Upload the starting CSV lead list.",
        "Confirm companies appear in CRM-lite.",
        "Review imported deal cards before quoting.",
      ],
      isComplete: importedLeads > 0,
      metric: `${importedLeads} lead record${importedLeads === 1 ? "" : "s"}`,
    },
    {
      key: "markup",
      label: "Markup",
      title: "Review pricing rules",
      detail:
        "Confirm markup, material, trucking, fees, and tax setup before creating production quotes.",
      href: "/admin/pricing",
      cta: "Review markup",
      checklist: [
        "Review R1-R4 markup bands.",
        "Confirm trucking defaults.",
        "Check fees and tax rules.",
      ],
      secondaryHref: "/admin/material-prices",
      secondaryCta: "Review materials",
      isComplete: configuredPricing > 0 && configuredMaterials > 0,
      metric: `${configuredMaterials} material${configuredMaterials === 1 ? "" : "s"}`,
    },
    {
      key: "contacts",
      label: "Contacts",
      title: "Add contacts",
      detail:
        "Create or import the contacts and companies the first quote will be sent to.",
      href: "/customers",
      cta: "Open contacts",
      checklist: [
        "Confirm decision-maker names.",
        "Add email or phone details.",
        "Connect Gmail if outbound email is needed.",
      ],
      secondaryHref: "/admin/integrations/gmail",
      secondaryCta: "Open integrations",
      isComplete: contactRows > 0,
      metric: `${contactRows} contact/customer record${contactRows === 1 ? "" : "s"}`,
    },
    {
      key: "first_quote",
      label: "First Quote",
      title: "Create first quote",
      detail:
        "Use the configured data to build and save the first customer quote.",
      href: "/quotes/new",
      cta: "Start quote",
      checklist: [
        "Pick the customer and job site.",
        "Add at least one material line.",
        "Save the quote into the pipeline.",
      ],
      secondaryHref: "/quotes",
      secondaryCta: "View pipeline",
      isComplete: quoteRows > 0,
      metric: `${quoteRows} quote${quoteRows === 1 ? "" : "s"}`,
    },
  ];
  const completedCount = steps.filter((step) => step.isComplete).length;
  const progress = Math.round((completedCount / steps.length) * 100);

  return {
    isDismissed: onboardingResult.data?.is_dismissed ?? false,
    completedAt: onboardingResult.data?.completed_at ?? null,
    progress,
    nextStep: steps.find((step) => !step.isComplete) ?? null,
    steps,
  };
}

async function countRows({
  supabase,
  table,
  organizationId,
}: {
  supabase: SupabaseClient;
  table: string;
  organizationId: string;
}): Promise<number> {
  let query = supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);

  if (table !== "pricing_config" && table !== "crm_lead_captures") {
    query = query.eq("is_active", true);
  }

  const result = await query;

  return result.count ?? 0;
}

function emptySummary(): HermesOnboardingSummary {
  return {
    isDismissed: false,
    completedAt: null,
    progress: 0,
    nextStep: null,
    steps: [],
  };
}
