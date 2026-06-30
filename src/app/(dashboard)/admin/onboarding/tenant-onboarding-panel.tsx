import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  Import,
  MailPlus,
  Route,
  Settings2,
  X,
} from "lucide-react";

import {
  finishHermesOnboarding,
  updateHermesOnboardingDismissed,
} from "@/app/(dashboard)/dashboard/actions";
import type { HermesOnboardingSummary, HermesStep } from "@/lib/system/hermes";

const STEP_ICONS = {
  import: Import,
  markup: Settings2,
  contacts: MailPlus,
  first_quote: Route,
};

export function TenantOnboardingPanel({
  summary,
}: {
  summary: HermesOnboardingSummary;
}) {
  const allDone = summary.progress === 100;

  if (summary.isDismissed && !allDone) {
    return (
      <form action={restartHermes} className="mb-6">
        <button
          type="submit"
          className="mac-link h-10 rounded-full text-xs"
        >
          Restart tenant onboarding
        </button>
      </form>
    );
  }

  if (!summary.steps.length) {
    return null;
  }

  return (
    <section className="mb-6 overflow-hidden rounded-lg border border-border bg-card">
      <div className="grid gap-4 border-b border-border bg-muted/60 p-4 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <p className="text-sm font-semibold uppercase text-muted-foreground">
            Tenant onboarding
          </p>
          <h2 className="mt-1 text-2xl font-semibold">
            Guided new-workspace setup
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Import starting data, review pricing, confirm contacts, then create
            the first quote for this tenant.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-md border border-border bg-background px-4 py-3">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Progress
            </p>
            <p className="mt-1 font-mono text-2xl font-semibold">
              {summary.progress}%
            </p>
          </div>
          <form action={dismissHermes}>
            <button
              type="submit"
              className="mac-link size-10 rounded-md px-0"
              aria-label="Dismiss tenant onboarding"
              title="Dismiss tenant onboarding"
            >
              <X className="size-4" />
            </button>
          </form>
        </div>
      </div>

      <div className="grid gap-4 p-4 xl:grid-cols-[1fr_320px]">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {summary.steps.map((step, index) => (
            <HermesStepCard key={step.key} step={step} index={index} />
          ))}
        </div>

        <aside className="rounded-md border border-border bg-background p-4">
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            Next step
          </p>
          {summary.nextStep ? (
            <>
              <h3 className="mt-2 text-lg font-semibold">
                {summary.nextStep.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {summary.nextStep.detail}
              </p>
              <Link
                href={summary.nextStep.href}
                className="mac-button-primary mt-4 h-10 w-full rounded-md"
              >
                {summary.nextStep.cta}
              </Link>
              {summary.nextStep.secondaryHref && summary.nextStep.secondaryCta ? (
                <Link
                  href={summary.nextStep.secondaryHref}
                  className="mac-link mt-2 h-10 w-full rounded-md"
                >
                  {summary.nextStep.secondaryCta}
                </Link>
              ) : null}
              <div className="mt-4 rounded-md border border-border bg-muted/50 p-3">
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Playbook
                </p>
                <ul className="mt-2 space-y-2">
                  {summary.nextStep.checklist.map((item) => (
                    <li
                      key={item}
                      className="flex gap-2 text-xs leading-5 text-muted-foreground"
                    >
                      <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-primary" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : (
            <>
              <h3 className="mt-2 text-lg font-semibold">
                {summary.completedAt ? "Onboarding complete" : "Ready to operate"}
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {summary.completedAt
                  ? "This tenant has completed the first-run setup flow."
                  : "The minimal setup is complete. Finish onboarding to save the completed state."}
              </p>
              {summary.completedAt ? null : (
                <form action={finishHermes}>
                  <button
                    type="submit"
                    className="mac-button-primary mt-4 h-10 w-full rounded-md"
                  >
                    Finish onboarding
                  </button>
                </form>
              )}
            </>
          )}
        </aside>
      </div>
    </section>
  );
}

function HermesStepCard({
  step,
  index,
}: {
  step: HermesStep;
  index: number;
}) {
  const Icon = STEP_ICONS[step.key];
  const StatusIcon = step.isComplete ? CheckCircle2 : Circle;

  return (
    <Link
      href={step.href}
      className={`rounded-md border p-4 transition hover:border-input hover:bg-secondary/70 ${
        step.isComplete
          ? "border-primary/30 bg-primary/10"
          : "border-border bg-background"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="icon-well text-primary">
          <Icon className="size-4" />
        </div>
        <StatusIcon
          className={`size-4 ${
            step.isComplete ? "text-primary" : "text-muted-foreground"
          }`}
        />
      </div>
      <p className="mt-4 text-xs font-semibold uppercase text-muted-foreground">
        Step {index + 1}: {step.label}
      </p>
      <h3 className="mt-1 text-sm font-semibold">{step.title}</h3>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        {step.metric}
      </p>
    </Link>
  );
}

async function dismissHermes() {
  "use server";

  await updateHermesOnboardingDismissed(true);
}

async function restartHermes() {
  "use server";

  await updateHermesOnboardingDismissed(false);
}

async function finishHermes() {
  "use server";

  await finishHermesOnboarding();
}
