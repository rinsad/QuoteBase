"use client";

import { useActionState } from "react";
import { Mail } from "lucide-react";

import { sendMagicLink, type LoginState } from "@/app/(auth)/login/actions";
import { Button } from "@/components/ui/button";

const initialState: LoginState = {
  message: "",
  status: "idle",
};

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(
    sendMagicLink,
    initialState,
  );

  return (
    <form action={formAction} className="mt-8 space-y-4">
      <div>
        <label
          htmlFor="email"
          className="text-sm font-medium text-muted-foreground"
        >
          Work email
        </label>
        <div className="mt-2 flex min-h-12 items-center gap-3 rounded-2xl border border-white/70 bg-white/70 px-4 shadow-sm">
          <Mail className="size-4 text-muted-foreground" />
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="john@westernmaterials.net"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            required
          />
        </div>
      </div>

      <Button
        type="submit"
        disabled={isPending}
        className="h-11 w-full rounded-2xl"
      >
        {isPending ? "Sending..." : "Send magic link"}
      </Button>

      {state.message ? (
        <p
          className={`rounded-2xl px-4 py-3 text-sm ${
            state.status === "success"
              ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
              : "bg-rose-50 text-rose-700 ring-1 ring-rose-100"
          }`}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

