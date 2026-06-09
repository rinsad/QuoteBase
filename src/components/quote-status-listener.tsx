"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

type QuoteStatusListenerProps = {
  quoteId: string;
  currentStatus: string;
};

const POLL_INTERVAL_MS = 5000;

export function QuoteStatusListener({
  quoteId,
  currentStatus,
}: QuoteStatusListenerProps) {
  const router = useRouter();
  const refreshedRef = useRef(false);

  useEffect(() => {
    if (currentStatus !== "pending_approval") {
      return;
    }

    const supabase = createClient();
    const refreshIfChanged = (nextStatus: string | null | undefined) => {
      if (
        refreshedRef.current ||
        !nextStatus ||
        nextStatus === currentStatus
      ) {
        return;
      }

      refreshedRef.current = true;
      router.refresh();
    };
    const channel = supabase
      .channel(`quote-status-${quoteId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "quotes",
          filter: `id=eq.${quoteId}`,
        },
        (payload) => {
          const nextStatus =
            typeof payload.new.status === "string"
              ? payload.new.status
              : null;

          refreshIfChanged(nextStatus);
        },
      )
      .subscribe();
    const interval = window.setInterval(async () => {
      const { data } = await supabase
        .from("quotes")
        .select("status")
        .eq("id", quoteId)
        .single<{ status: string }>();

      refreshIfChanged(data?.status);
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [currentStatus, quoteId, router]);

  return null;
}
