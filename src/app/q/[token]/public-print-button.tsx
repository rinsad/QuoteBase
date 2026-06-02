"use client";

import { Printer } from "lucide-react";

export function PublicPrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="mac-link">
      <Printer className="size-4" />
      Print
    </button>
  );
}
