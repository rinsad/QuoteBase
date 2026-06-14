import { expect, test } from "@playwright/test";

const protectedGetRoutes = [
  "/api/customers",
  "/api/quotes",
  "/api/suppliers",
  "/api/quotes/not-a-uuid",
  "/api/customers/not-a-uuid",
  "/api/suppliers/not-a-uuid",
  "/api/quote-documents/not-a-uuid/download",
];

test.describe("API authentication guardrails", () => {
  for (const route of protectedGetRoutes) {
    test(`GET ${route} rejects anonymous requests`, async ({ request }) => {
      const response = await request.get(route);

      expect(response.status()).toBe(401);
      await expect(response.json()).resolves.toEqual({
        data: null,
        error: {
          code: "unauthorized",
          message: "Authentication is required.",
        },
        meta: null,
      });
    });
  }

  test("quote calculation rejects anonymous POST requests before validation details leak", async ({
    request,
  }) => {
    const response = await request.post("/api/quotes/calculate", {
      data: {},
    });

    expect(response.status()).toBe(401);
    await expect(response.json()).resolves.toEqual({
      data: null,
      error: {
        code: "unauthorized",
        message: "Authentication is required.",
      },
      meta: null,
    });
  });
});
