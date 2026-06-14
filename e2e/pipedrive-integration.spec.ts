import http, { type IncomingMessage, type ServerResponse } from "node:http";

import { expect, test } from "@playwright/test";

import { signInWithMagicLink } from "./helpers/auth";
import {
  createE2EAdminClient,
  disablePipedriveIntegration,
  enablePipedriveIntegration,
  getOrganizationIdForEmail,
  waitForAuditAction,
  waitForCustomerByPipedrivePersonId,
} from "./helpers/db";

const ADMIN_EMAIL = "rinsad@gmail.com";

type FakePipedriveRequest = {
  method: string;
  path: string;
  query: URLSearchParams;
  body: Record<string, unknown> | null;
};

test.describe("Pipedrive integration", () => {
  test.afterEach(async () => {
    await disablePipedriveIntegration(ADMIN_EMAIL);
  });

  test("admin can save Pipedrive settings without exposing the token", async ({
    page,
  }) => {
    await signInWithMagicLink(page, ADMIN_EMAIL);

    const fakeServer = await startFakePipedriveServer();
    const apiToken = `ui-token-${Date.now()}`;

    try {
      await page.goto("/admin/integrations/pipedrive");
      await expect(
        page.getByRole("heading", { name: "Pipedrive", exact: true }),
      ).toBeVisible();

      await page.locator('[name="is_enabled"]').check();
      await page.locator('[name="sync_interval_minutes"]').fill("15");
      await page.locator('[name="api_base_url"]').fill(fakeServer.baseUrl);
      await page.locator('[name="api_token"]').fill(apiToken);
      await page.getByRole("button", { name: "Save Pipedrive settings" }).click();

      await expect(page).toHaveURL(/\/admin\/integrations\/pipedrive\?saved=1$/);
      await expect(
        page.getByText("Pipedrive integration settings saved"),
      ).toBeVisible();
      await expect(page.locator('[name="api_token"]')).toHaveValue("");
      await expect(page.locator('[name="api_token"]')).toHaveAttribute(
        "placeholder",
        "API token saved; leave blank to keep it",
      );
      await expect(page.getByText(apiToken)).toHaveCount(0);

      const integration = await getPipedriveIntegrationRecord();

      expect(integration).toMatchObject({
        is_enabled: true,
      });
      expect(integration.config).toMatchObject({
        api_base_url: fakeServer.baseUrl,
        sync_interval_minutes: 15,
        source_of_truth: "pipedrive",
      });
      expect(integration.credentials_last4).toEqual({
        api_token: true,
      });
      expect(integration.credentials_encrypted).toBeTruthy();
      expect(integration.credentials_encrypted).not.toContain(apiToken);

      await waitForAuditAction({
        targetId: integration.id,
        action: "integration.pipedrive.updated",
      });
    } finally {
      await fakeServer.close();
    }
  });

  test("customer creation pushes scoped contact data to Pipedrive", async ({
    page,
  }) => {
    const suffix = Date.now().toString();
    const pipedriveOrganizationId = `pd-org-${suffix}`;
    const pipedrivePersonId = `pd-person-${suffix}`;
    const fakeServer = await startFakePipedriveServer({
      organizationId: pipedriveOrganizationId,
      personId: pipedrivePersonId,
    });

    try {
      await enablePipedriveIntegration({
        email: ADMIN_EMAIL,
        apiBaseUrl: fakeServer.baseUrl,
      });
      await signInWithMagicLink(page, ADMIN_EMAIL);

      const response = await page.request.post("/api/customers", {
        data: {
          name: `E2E Pipedrive Push ${suffix}`,
          company_name: `E2E Pipedrive Company ${suffix}`,
          contact_name: "E2E Pipedrive Contact",
          email: `pipedrive-push-${suffix}@example.test`,
          phone: "555-1313",
          address: "100 Pipedrive Push Way",
          payment_terms: "Net 30",
          pricing_notes: "These QuoteBase-only notes must not be sent.",
        },
      });
      const body = await response.json();

      expect(response.status()).toBe(201);
      expect(body.error).toBeNull();

      const organizationRequest = fakeServer.requests.find(
        (request) => request.method === "POST" && request.path === "/organizations",
      );
      const personRequest = fakeServer.requests.find(
        (request) => request.method === "POST" && request.path === "/persons",
      );

      expect(organizationRequest?.query.get("api_token")).toBe(
        "e2e-pipedrive-token",
      );
      expect(organizationRequest?.body).toMatchObject({
        name: `E2E Pipedrive Company ${suffix}`,
        address: "100 Pipedrive Push Way",
      });
      expect(personRequest?.body).toMatchObject({
        name: "E2E Pipedrive Contact",
        org_id: pipedriveOrganizationId,
        email: [
          {
            value: `pipedrive-push-${suffix}@example.test`,
            primary: true,
          },
        ],
        phone: [
          {
            value: "555-1313",
            primary: true,
          },
        ],
      });
      expect(JSON.stringify(personRequest?.body)).not.toContain("payment_terms");
      expect(JSON.stringify(personRequest?.body)).not.toContain("pricing_notes");

      const organizationId = await getOrganizationIdForEmail(ADMIN_EMAIL);
      const syncedCustomer = await waitForCustomerByPipedrivePersonId({
        organizationId,
        pipedrivePersonId,
      });

      expect(syncedCustomer).toMatchObject({
        id: body.data.customer.id,
        pipedrive_organization_id: pipedriveOrganizationId,
        sync_source: "wm",
      });
      expect(syncedCustomer.pipedrive_synced_at).toBeTruthy();

      await waitForAuditAction({
        targetId: body.data.customer.id,
        action: "customer.pipedrive_pushed",
      });
    } finally {
      await fakeServer.close();
    }
  });

  test("cron sync imports Pipedrive customers idempotently", async ({ page }) => {
    const suffix = Date.now().toString();
    const pipedrivePersonId = `pd-cron-${suffix}`;
    const fakeServer = await startFakePipedriveServer({
      people: [
        {
          id: pipedrivePersonId,
          name: "E2E Cron Contact",
          org_id: {
            value: `pd-cron-org-${suffix}`,
            name: `E2E Cron Company ${suffix}`,
          },
          email: [{ value: `pipedrive-cron-${suffix}@example.test`, primary: true }],
          phone: [{ value: "555-1414", primary: true }],
          active_flag: true,
          update_time: "2026-06-12 10:00:00",
        },
      ],
    });

    try {
      await enablePipedriveIntegration({
        email: ADMIN_EMAIL,
        apiBaseUrl: fakeServer.baseUrl,
      });

      if (process.env.CRON_SECRET?.trim()) {
        const forbidden = await page.request.get("/api/cron/pipedrive-sync", {
          headers: {
            authorization: "Bearer wrong-secret",
          },
        });
        const forbiddenBody = await forbidden.json();

        expect(forbidden.status()).toBe(403);
        expect(forbiddenBody.error).toMatchObject({
          code: "forbidden",
        });
      }

      const headers = process.env.CRON_SECRET?.trim()
        ? {
            authorization: `Bearer ${process.env.CRON_SECRET.trim()}`,
          }
        : undefined;
      const firstSync = await page.request.get("/api/cron/pipedrive-sync", {
        headers,
      });
      const firstBody = await firstSync.json();

      expect(firstSync.status()).toBe(200);
      expect(firstBody.error).toBeNull();
      expect(firstBody.data.imported).toBeGreaterThanOrEqual(1);

      const secondSync = await page.request.get("/api/cron/pipedrive-sync", {
        headers,
      });
      const secondBody = await secondSync.json();

      expect(secondSync.status()).toBe(200);
      expect(secondBody.error).toBeNull();

      const organizationId = await getOrganizationIdForEmail(ADMIN_EMAIL);
      const importedCustomer = await waitForCustomerByPipedrivePersonId({
        organizationId,
        pipedrivePersonId,
      });

      expect(importedCustomer).toMatchObject({
        name: `E2E Cron Company ${suffix}`,
        company_name: `E2E Cron Company ${suffix}`,
        contact_name: "E2E Cron Contact",
        email: `pipedrive-cron-${suffix}@example.test`,
        phone: "555-1414",
        pipedrive_organization_id: `pd-cron-org-${suffix}`,
        sync_source: "pipedrive",
      });
      expect(importedCustomer.pipedrive_synced_at).toBeTruthy();

      await waitForAuditAction({
        targetId: null,
        action: "customer.pipedrive_cron_synced",
      });
    } finally {
      await fakeServer.close();
    }
  });
});

async function getPipedriveIntegrationRecord(): Promise<{
  id: string;
  is_enabled: boolean;
  config: Record<string, unknown>;
  credentials_encrypted: string | null;
  credentials_last4: Record<string, unknown>;
}> {
  const supabase = createE2EAdminClient();
  const organizationId = await getOrganizationIdForEmail(ADMIN_EMAIL);
  const { data, error } = await supabase
    .from("organization_integrations")
    .select("id, is_enabled, config, credentials_encrypted, credentials_last4")
    .eq("organization_id", organizationId)
    .eq("provider", "pipedrive")
    .single<{
      id: string;
      is_enabled: boolean;
      config: Record<string, unknown>;
      credentials_encrypted: string | null;
      credentials_last4: Record<string, unknown>;
    }>();

  if (error || !data) {
    throw new Error(error?.message ?? "Pipedrive integration was not found.");
  }

  return data;
}

async function startFakePipedriveServer(options?: {
  organizationId?: string;
  personId?: string;
  people?: Array<Record<string, unknown>>;
}): Promise<{
  baseUrl: string;
  requests: FakePipedriveRequest[];
  close: () => Promise<void>;
}> {
  const requests: FakePipedriveRequest[] = [];
  const server = http.createServer(
    async (request: IncomingMessage, response: ServerResponse) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const body = await readJsonBody(request);

      requests.push({
        method: request.method ?? "GET",
        path: url.pathname,
        query: url.searchParams,
        body,
      });

      if (request.method === "POST" && url.pathname === "/organizations") {
        sendJson(response, {
          success: true,
          data: {
            id: options?.organizationId ?? "pd-org-1",
          },
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/persons") {
        sendJson(response, {
          success: true,
          data: {
            id: options?.personId ?? "pd-person-1",
          },
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/persons") {
        sendJson(response, {
          success: true,
          data: options?.people ?? [],
          additional_data: {
            pagination: {
              more_items_in_collection: false,
              next_start: null,
            },
          },
        });
        return;
      }

      sendJson(response, { success: false, error: "Unexpected request." }, 404);
    },
  );

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Fake Pipedrive server did not start.");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
  };
}

async function readJsonBody(
  request: IncomingMessage,
): Promise<Record<string, unknown> | null> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (!chunks.length) {
    return null;
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<
    string,
    unknown
  >;
}

function sendJson(
  response: ServerResponse,
  payload: Record<string, unknown>,
  status = 200,
): void {
  response.writeHead(status, {
    "content-type": "application/json",
  });
  response.end(JSON.stringify(payload));
}
