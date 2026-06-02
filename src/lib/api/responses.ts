import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "server_error";

export function apiOk<T>(
  data: T,
  init?: { status?: number; meta?: Record<string, unknown> },
) {
  return NextResponse.json(
    {
      data,
      error: null,
      meta: init?.meta ?? null,
    },
    { status: init?.status ?? 200 },
  );
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  status: number,
) {
  return NextResponse.json(
    {
      data: null,
      error: {
        code,
        message,
      },
      meta: null,
    },
    { status },
  );
}

export function badRequest(message: string) {
  return apiError("bad_request", message, 400);
}

export function unauthorized() {
  return apiError("unauthorized", "Authentication is required.", 401);
}

export function forbidden(message = "You do not have permission.") {
  return apiError("forbidden", message, 403);
}

export function notFound(message = "Resource not found.") {
  return apiError("not_found", message, 404);
}

export function serverError(message = "Something went wrong.") {
  return apiError("server_error", message, 500);
}
