"use client";

import { useFormStatus } from "react-dom";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

export function SyncNowForm({
  action,
}: {
  action: () => Promise<void>;
}) {
  return (
    <form action={action} className="mt-3 flex justify-end">
      <SyncButton />
    </form>
  );
}

function SyncButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant="outline"
      className="h-11 min-w-40 rounded-full"
      disabled={pending}
      aria-live="polite"
    >
      <RefreshCw className={`size-4 ${pending ? "animate-spin" : ""}`} />
      {pending ? "Synchronizing..." : "Sync now"}
    </Button>
  );
}
