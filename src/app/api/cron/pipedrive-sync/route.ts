import { apiOk, forbidden, serverError } from "@/lib/api/responses";
import { runFollowUpScheduler } from "@/lib/quotes/follow-up-agent";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret) {
    const authorization = request.headers.get("authorization");

    if (authorization !== `Bearer ${cronSecret}`) {
      return forbidden("Invalid cron secret.");
    }
  }

  try {
    const result = await runFollowUpScheduler();

    return apiOk({ result });
  } catch (error) {
    console.error("Follow-up scheduler failed.", error);

    return serverError("Follow-up scheduler failed.");
  }
}
