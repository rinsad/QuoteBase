import { expect, type Page } from "@playwright/test";

const TEST_ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "rinsad@gmail.com";
const MAILPIT_MESSAGES_URL =
  process.env.E2E_MAILPIT_MESSAGES_URL ??
  "http://127.0.0.1:55024/api/v1/messages";

type MailpitMessageSummary = {
  ID: string;
  To: Array<{ Address: string }>;
  Subject: string;
  Created: string;
};

type MailpitMessagesResponse = {
  messages: MailpitMessageSummary[];
};

type MailpitMessageDetail = {
  HTML: string;
  Text: string;
};

export async function signInAsLocalAdmin(page: Page): Promise<void> {
  await signInWithMagicLink(page, TEST_ADMIN_EMAIL);
}

export async function signInWithMagicLink(
  page: Page,
  email: string,
): Promise<void> {
  const requestedAt = Date.now();

  await page.goto("/login");
  await page.getByLabel("Work email").fill(email);
  await page.getByRole("button", { name: "Send magic link" }).click();
  await expect(page.getByText("Magic link sent.")).toBeVisible();

  const magicLink = await getMagicLink(page, email, requestedAt);
  const verifyUrl = new URL(magicLink);
  const appOrigin = new URL(page.url()).origin;

  verifyUrl.searchParams.set("redirect_to", `${appOrigin}/auth/callback`);

  await page.goto(verifyUrl.toString());
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("heading", { name: /Welcome,/ }),
  ).toBeVisible();
}

async function getMagicLink(
  page: Page,
  email: string,
  requestedAt: number,
): Promise<string> {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    const response = await page.request.get(MAILPIT_MESSAGES_URL);
    const mailbox = (await response.json()) as MailpitMessagesResponse;
    const message = mailbox.messages
      .filter((item) =>
        item.To.some(
          (recipient) =>
            recipient.Address.toLowerCase() === email.toLowerCase(),
        ),
      )
      .filter((item) => item.Subject === "Your Magic Link")
      .filter((item) => new Date(item.Created).getTime() >= requestedAt - 1000)
      .sort(
        (first, second) =>
          new Date(second.Created).getTime() - new Date(first.Created).getTime(),
      )[0];

    if (message) {
      const detailResponse = await page.request.get(
        `${MAILPIT_MESSAGES_URL.replace(/s$/, "")}/${message.ID}`,
      );
      const detail = (await detailResponse.json()) as MailpitMessageDetail;
      const link = extractMagicLink(detail);

      if (link) {
        return link;
      }
    }

    await page.waitForTimeout(500);
  }

  throw new Error(`Magic link email was not received for ${email}.`);
}

function extractMagicLink(message: MailpitMessageDetail): string | null {
  const htmlMatch = message.HTML.match(/href="([^"]+)"/);

  if (htmlMatch?.[1]) {
    return htmlMatch[1].replaceAll("&amp;", "&");
  }

  const textMatch = message.Text.match(/\(\s*(http[^)]+)\s*\)/);

  return textMatch?.[1] ?? null;
}
