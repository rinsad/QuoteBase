"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";

type CopyTextMessageButtonProps = {
  message: string;
};

export function CopyTextMessageButton({ message }: CopyTextMessageButtonProps) {
  const [copied, setCopied] = useState(false);

  async function copyMessage() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(message);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = message;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }

      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="h-10 w-full rounded-full bg-white/80"
      onClick={copyMessage}
    >
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      {copied ? "Copied" : "Copy text message"}
    </Button>
  );
}
