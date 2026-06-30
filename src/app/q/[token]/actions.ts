"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";

import {
  respondToPublicQuote,
  startPublicQuoteAcceptance,
} from "@/lib/quotes/delivery";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;

export async function submitPublicQuoteResponse(
  token: string,
  formData: FormData,
) {
  if (!TOKEN_PATTERN.test(token)) {
    throw new Error("Invalid quote link.");
  }

  const responseValue = formData.get("response");
  const response =
    responseValue === "accepted" || responseValue === "declined"
      ? responseValue
      : null;

  if (!response) {
    throw new Error("Select a quote response.");
  }

  const noteValue = formData.get("response_note");
  const note =
    typeof noteValue === "string" ? noteValue.trim().slice(0, 1000) : "";
  const signerNameValue = formData.get("signer_name");
  const signerName =
    typeof signerNameValue === "string"
      ? signerNameValue.trim().slice(0, 160)
      : "";
  const requestMetadata = publicRequestMetadata(await headers(), signerName);
  const result =
    response === "accepted"
      ? await startPublicQuoteAcceptance({ token, note, requestMetadata })
      : await respondToPublicQuote({
          token,
          response,
          note,
          requestMetadata,
        });

  if (!result) {
    throw new Error("This quote cannot be updated from this link.");
  }

  if (result.status === "payment_required") {
    redirect(`/q/${token}/pay?attempt=${result.paymentAttemptId}`);
  }

  redirect(`/q/${token}?responded=${result.status}`);
}

function publicRequestMetadata(headerList: Headers, signerName: string) {
  const forwardedFor = headerList.get("x-forwarded-for");
  const requestIp =
    forwardedFor?.split(",")[0]?.trim() ||
    headerList.get("x-real-ip") ||
    null;

  return {
    requestIp,
    userAgent: headerList.get("user-agent"),
    signerName: signerName || null,
  };
}
