"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { completeAuthorizeNetQuotePayment } from "@/app/q/[token]/pay/actions";

type AuthorizeNetHostedFormProps = {
  token: string;
  attemptId: string;
  hostedPaymentToken: string;
  hostedPaymentUrl: string;
  amountLabel: string;
};

type AuthorizeNetMessage = {
  source?: unknown;
  payload?: unknown;
};

export function AuthorizeNetHostedForm({
  token,
  attemptId,
  hostedPaymentToken,
  hostedPaymentUrl,
  amountLabel,
}: AuthorizeNetHostedFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [frameHeight, setFrameHeight] = useState(680);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    formRef.current?.submit();
  }, []);

  useEffect(() => {
    function handleMessage(event: MessageEvent<AuthorizeNetMessage>) {
      if (event.origin !== window.location.origin) {
        return;
      }

      if (event.data?.source !== "authorize-net-iframe") {
        return;
      }

      const payload =
        typeof event.data.payload === "string" ? event.data.payload : "";
      const params = new URLSearchParams(payload);
      const action = params.get("action");

      if (action === "resizeWindow") {
        const height = Number(params.get("height"));

        if (Number.isFinite(height) && height > 320) {
          setFrameHeight(Math.min(Math.ceil(height), 1100));
        }
      }

      if (action === "cancel") {
        window.location.href = `/q/${token}?payment=cancelled`;
      }

      if (action === "transactResponse") {
        const responseValue = params.get("response");

        if (!responseValue) {
          setError("Authorize.net did not return a payment response.");
          return;
        }

        let response: Record<string, unknown>;

        try {
          response = JSON.parse(responseValue) as Record<string, unknown>;
        } catch {
          setError("Authorize.net returned an unreadable payment response.");
          return;
        }

        startTransition(async () => {
          try {
            await completeAuthorizeNetQuotePayment({
              token,
              attemptId,
              response,
            });
            window.location.href = `/q/${token}?responded=accepted&payment=paid`;
          } catch (completeError) {
            setError(
              completeError instanceof Error
                ? completeError.message
                : "Could not complete payment acceptance.",
            );
          }
        });
      }
    }

    window.addEventListener("message", handleMessage);

    return () => window.removeEventListener("message", handleMessage);
  }, [attemptId, token]);

  return (
    <div className="overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(59,91,152,0.14)]">
      <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-slate-500">Secure checkout</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">
            Pay {amountLabel} to accept quote
          </h1>
        </div>
        {isPending ? (
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
            <Loader2 className="size-4 animate-spin" />
            Finalizing
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="m-5 rounded-md border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <form
        ref={formRef}
        method="post"
        action={hostedPaymentUrl}
        target="authorize-net-payment-frame"
        className="hidden"
      >
        <input type="hidden" name="token" value={hostedPaymentToken} />
      </form>

      <iframe
        name="authorize-net-payment-frame"
        title="Authorize.net secure payment form"
        className="block w-full border-0"
        style={{ height: frameHeight }}
      />
    </div>
  );
}
