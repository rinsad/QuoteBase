import { getCurrentUser } from "@/lib/auth/current-user";
import { badRequest, apiOk, notFound, unauthorized } from "@/lib/api/responses";
import { isUuid } from "@/lib/api/validation";
import { getQuoteDetail } from "@/lib/quotes/quotes";

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

  const quote = await getQuoteDetail(user, id);

  if (!quote) {
    return notFound("Quote not found.");
  }

  return apiOk({ quote });
}
