"use client";

import { useFormStatus } from "react-dom";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

export function SyncSubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  const isDisabled = disabled || pending;

  return (
    <Button
      type="submit"
      disabled={isDisabled}
      aria-busy={pending}
      className="mt-4 h-11 w-full rounded-md bg-[#3d6652] px-5 text-white hover:bg-[#345845]"
    >
      <RefreshCw className={`size-4 ${pending ? "animate-spin" : ""}`} />
      {pending ? "Syncing..." : "Sync"}
    </Button>
  );
}
