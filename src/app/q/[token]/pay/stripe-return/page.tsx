import Link from "next/link";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { completePublicStripeQuotePayment } from "@/lib/quotes/delivery";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function StripeQuotePaymentReturnPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ attempt?: string; session_id?: string }>;
}) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const attemptId = query.attempt ?? "";
  const sessionId = query.session_id ?? "";

  if (
    !TOKEN_PATTERN.test(token) ||
    !UUID_PATTERN.test(attemptId) ||
    !sessionId.startsWith("cs_")
  ) {
    notFound();
  }

  const result = await completePublicStripeQuotePayment({
    token,
    attemptId,
    sessionId,
    requestMetadata: publicRequestMetadata(await headers()),
  });

  if (result) {
    redirect(`/q/${token}?responded=accepted&payment=paid`);
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#f8fbff_0%,#eef5fb_46%,#e9f6f3_100%)] px-4 py-8 text-slate-950">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-[18px] border border-rose-100 bg-white p-6 shadow-[0_24px_80px_rgba(59,91,152,0.14)]">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-1 size-5 text-rose-600" />
            <div>
              <h1 className="text-2xl font-semibold">
                Payment could not be confirmed
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Stripe did not confirm a paid Checkout Session for this quote.
                You can return to the quote and try again.
              </p>
              <Link
                href={`/q/${token}`}
                className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-full bg-slate-950 px-5 text-sm font-semibold text-white"
              >
                <CheckCircle2 className="size-4" />
                Back to quote
              </Link>
              <p className="mt-4 inline-flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="size-3.5" />
                Payment status is verified server-side before a quote is marked
                won.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function publicRequestMetadata(headerList: Headers) {
  const forwardedFor = headerList.get("x-forwarded-for");
  const requestIp =
    forwardedFor?.split(",")[0]?.trim() ||
    headerList.get("x-real-ip") ||
    null;

  return {
    requestIp,
    userAgent: headerList.get("user-agent"),
  };
}
