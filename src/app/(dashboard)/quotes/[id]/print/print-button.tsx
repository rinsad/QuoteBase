"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="mac-button-primary h-9"
    >
      <Printer className="size-4" />
      Print
    </button>
  );
}
