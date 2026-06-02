"use server";

import { redirect } from "next/navigation";

import { respondToPublicQuote } from "@/lib/quotes/delivery";

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
  const result = await respondToPublicQuote({
    token,
    response,
    note,
  });

  if (!result) {
    throw new Error("This quote cannot be updated from this link.");
  }

  redirect(`/q/${token}?responded=${result.status}`);
}
