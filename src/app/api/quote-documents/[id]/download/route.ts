import { NextResponse } from "next/server";

import { badRequest, notFound, serverError, unauthorized } from "@/lib/api/responses";
import { isUuid } from "@/lib/api/validation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createQuoteDocumentSignedUrl } from "@/lib/quotes/documents";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();

  if (!user) {
    return unauthorized();
  }

  const { id } = await params;

  if (!isUuid(id)) {
    return badRequest("id must be a valid UUID.");
  }

  const supabase = await createClient();

  if (!supabase) {
    return serverError("Supabase is not configured.");
  }

  const signedUrl = await createQuoteDocumentSignedUrl({
    supabase,
    organizationId: user.organization_id,
    documentId: id,
  });

  if (!signedUrl) {
    return notFound("Quote document not found.");
  }

  return NextResponse.redirect(signedUrl);
}
