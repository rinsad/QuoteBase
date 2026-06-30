"use server";

import { headers } from "next/headers";

import {
  completePublicQuotePayment,
  type PublicQuotePaymentResponse,
} from "@/lib/quotes/delivery";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function completeAuthorizeNetQuotePayment({
  token,
  attemptId,
  response,
}: {
  token: string;
  attemptId: string;
  response: PublicQuotePaymentResponse;
}) {
  if (!TOKEN_PATTERN.test(token) || !UUID_PATTERN.test(attemptId)) {
    throw new Error("Invalid payment session.");
  }

  const result = await completePublicQuotePayment({
    token,
    attemptId,
    response,
    requestMetadata: publicRequestMetadata(await headers()),
  });

  if (!result) {
    throw new Error(
      "Payment was not approved. Please try again or contact the quoting team.",
    );
  }

  return { status: "accepted" as const };
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
