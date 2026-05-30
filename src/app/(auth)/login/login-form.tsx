"use client";

import { useActionState } from "react";
import { Mail } from "lucide-react";

import {
  devSignInAsRinsad,
  sendMagicLink,
  type LoginState,
} from "@/app/(auth)/login/actions";
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
        <div className="soft-input mt-2">
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
        className="h-11 w-full rounded-full"
      >
        {isPending ? "Sending..." : "Send magic link"}
      </Button>

      <div className="relative py-1">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-white/70" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-white/70 px-3 text-xs font-medium text-muted-foreground">
            local development
          </span>
        </div>
      </div>

      <Button
        formAction={devSignInAsRinsad}
        type="submit"
        variant="outline"
        className="h-11 w-full rounded-full bg-white/70"
      >
        Continue as Rinsad
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
