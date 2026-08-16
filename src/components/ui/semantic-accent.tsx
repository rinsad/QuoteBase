import type { LucideIcon } from "lucide-react";

export type SemanticTone =
  | "blue"
  | "emerald"
  | "violet"
  | "amber"
  | "rose"
  | "cyan"
  | "indigo";

export const semanticToneClasses: Record<
  SemanticTone,
  { accent: string; icon: string; label: string }
> = {
  blue: {
    accent: "border-l-blue-500 dark:border-l-blue-400",
    icon: "border-blue-100 bg-blue-50 text-blue-600 dark:border-blue-900/70 dark:bg-blue-950/50 dark:text-blue-300",
    label: "text-blue-600 dark:text-blue-300",
  },
  emerald: {
    accent: "border-l-emerald-500 dark:border-l-emerald-400",
    icon: "border-emerald-100 bg-emerald-50 text-emerald-600 dark:border-emerald-900/70 dark:bg-emerald-950/50 dark:text-emerald-300",
    label: "text-emerald-600 dark:text-emerald-300",
  },
  violet: {
    accent: "border-l-violet-500 dark:border-l-violet-400",
    icon: "border-violet-100 bg-violet-50 text-violet-600 dark:border-violet-900/70 dark:bg-violet-950/50 dark:text-violet-300",
    label: "text-violet-600 dark:text-violet-300",
  },
  amber: {
    accent: "border-l-amber-500 dark:border-l-amber-400",
    icon: "border-amber-100 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/50 dark:text-amber-300",
    label: "text-amber-700 dark:text-amber-300",
  },
  rose: {
    accent: "border-l-rose-500 dark:border-l-rose-400",
    icon: "border-rose-100 bg-rose-50 text-rose-600 dark:border-rose-900/70 dark:bg-rose-950/50 dark:text-rose-300",
    label: "text-rose-600 dark:text-rose-300",
  },
  cyan: {
    accent: "border-l-cyan-500 dark:border-l-cyan-400",
    icon: "border-cyan-100 bg-cyan-50 text-cyan-700 dark:border-cyan-900/70 dark:bg-cyan-950/50 dark:text-cyan-300",
    label: "text-cyan-700 dark:text-cyan-300",
  },
  indigo: {
    accent: "border-l-indigo-500 dark:border-l-indigo-400",
    icon: "border-indigo-100 bg-indigo-50 text-indigo-600 dark:border-indigo-900/70 dark:bg-indigo-950/50 dark:text-indigo-300",
    label: "text-indigo-600 dark:text-indigo-300",
  },
};

export function SemanticIcon({
  icon: Icon,
  tone,
  size = "md",
}: {
  icon: LucideIcon;
  tone: SemanticTone;
  size?: "sm" | "md";
}): React.JSX.Element {
  const sizeClasses = size === "sm" ? "size-9" : "size-10";
  const iconSizeClasses = size === "sm" ? "size-4" : "size-5";

  return (
    <div
      className={`flex ${sizeClasses} shrink-0 items-center justify-center rounded-lg border ${semanticToneClasses[tone].icon}`}
    >
      <Icon className={iconSizeClasses} />
    </div>
  );
}
