import Link from "next/link";
import { AlertCircle, LockKeyhole } from "lucide-react";
import { notFound, redirect } from "next/navigation";

import { AuthorizeNetHostedForm } from "@/app/q/[token]/pay/authorize-net-hosted-form";
import { getBaseUrl } from "@/lib/env";
import { createAuthorizeNetHostedPayment } from "@/lib/integrations/authorizenet";
import { createStripeCheckoutSession } from "@/lib/integrations/stripe";
import {
  getPublicQuotePaymentSession,
  markPublicQuoteStripeCheckoutStarted,
  markPublicQuotePaymentTokenized,
} from "@/lib/quotes/delivery";
import { createAdminClient } from "@/lib/supabase/admin";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function PublicQuotePaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ attempt?: string }>;
}) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const attemptId = query.attempt ?? "";

  if (!TOKEN_PATTERN.test(token) || !UUID_PATTERN.test(attemptId)) {
    notFound();
  }

  const session = await getPublicQuotePaymentSession({ token, attemptId });

  if (!session) {
    notFound();
  }

  const supabase = createAdminClient();

  if (!supabase) {
    return (
      <PaymentShell>
        <PaymentError
          title="Payment setup is unavailable"
          detail="The secure payment service is not configured for this deployment."
          token={token}
        />
      </PaymentShell>
    );
  }

  const baseUrl = getBaseUrl();

  if (session.provider === "stripe") {
    let checkoutUrl: string;

    try {
      const checkout = await createStripeCheckoutSession({
        supabase,
        organizationId: session.organizationId,
        quoteNumber: session.quoteNumber,
        amount: session.amount,
        customerEmail: session.customerEmail,
        successUrl: `${baseUrl}/q/${token}/pay/stripe-return?attempt=${attemptId}&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${baseUrl}/q/${token}?payment=cancelled`,
      });

      await markPublicQuoteStripeCheckoutStarted({
        token,
        attemptId,
        sessionId: checkout.id,
      });

      checkoutUrl = checkout.url;
    } catch (error) {
      return (
        <PaymentShell>
          <PaymentError
            title="Payment setup needs attention"
            detail={
              error instanceof Error
                ? error.message
                : "Stripe could not start the hosted checkout."
            }
            token={token}
          />
        </PaymentShell>
      );
    }

    redirect(checkoutUrl);
  }

  try {
    const hostedPayment = await createAuthorizeNetHostedPayment({
      supabase,
      organizationId: session.organizationId,
      quoteNumber: session.quoteNumber,
      amount: session.amount,
      customerEmail: session.customerEmail,
      returnUrl: `${baseUrl}/q/${token}?payment=return`,
      cancelUrl: `${baseUrl}/q/${token}?payment=cancelled`,
      communicatorUrl: `${baseUrl}/authorize-net-iframe-communicator.html`,
    });

    await markPublicQuotePaymentTokenized({ token, attemptId });

    return (
      <PaymentShell>
        <div className="mb-4 flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-white/80">
          <LockKeyhole className="size-4 text-emerald-700" />
          Card entry is hosted securely by Authorize.net.
        </div>
        <AuthorizeNetHostedForm
          token={token}
          attemptId={attemptId}
          hostedPaymentToken={hostedPayment.token}
          hostedPaymentUrl={hostedPayment.hostedPaymentUrl}
          amountLabel={formatCurrency(session.amount)}
        />
      </PaymentShell>
    );
  } catch (error) {
    return (
      <PaymentShell>
        <PaymentError
          title="Payment setup needs attention"
          detail={
            error instanceof Error
              ? error.message
              : "Authorize.net could not start the hosted checkout."
          }
          token={token}
        />
      </PaymentShell>
    );
  }
}

function PaymentShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#f8fbff_0%,#eef5fb_46%,#e9f6f3_100%)] px-4 py-8 text-slate-950">
      <div className="mx-auto max-w-5xl">{children}</div>
    </main>
  );
}

function PaymentError({
  title,
  detail,
  token,
}: {
  title: string;
  detail: string;
  token: string;
}) {
  return (
    <div className="rounded-[18px] border border-rose-100 bg-white p-6 shadow-[0_24px_80px_rgba(59,91,152,0.14)]">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-1 size-5 text-rose-600" />
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">{detail}</p>
          <Link
            href={`/q/${token}`}
            className="mt-5 inline-flex h-10 items-center justify-center rounded-full bg-slate-950 px-5 text-sm font-semibold text-white"
          >
            Back to quote
          </Link>
        </div>
      </div>
    </div>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}
