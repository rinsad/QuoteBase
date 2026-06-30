"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Bot, Check, Loader2, MessageSquare, Send, X } from "lucide-react";

import {
  askQuoteBaseAssistant,
  confirmAssistantAction,
  type AssistantMessage,
  type AssistantProposedAction,
} from "@/app/(dashboard)/dashboard/actions";
import { Button } from "@/components/ui/button";

const starterPrompts = [
  "Which hot quote should I call first?",
  "Show large open quotes over $10k",
  "Run the follow-up agent",
];
const MAX_ASSISTANT_CONTEXT_MESSAGES = 12;
const MAX_STORED_MESSAGES = 40;
const ASSISTANT_STORAGE_KEY = "quotebase.ask-assistant.messages.v1";
const initialAssistantMessages: AssistantMessage[] = [
  {
    role: "assistant",
    content: "Ask me about quotes, follow-ups, win rate, or big open deals.",
  },
];

export function AssistantBox() {
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>(
    initialAssistantMessages,
  );
  const [draft, setDraft] = useState("");
  const [proposedAction, setProposedAction] =
    useState<AssistantProposedAction | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const savedMessages = readStoredMessages();

    if (savedMessages.length > 0) {
      setMessages(savedMessages);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      ASSISTANT_STORAGE_KEY,
      JSON.stringify(messages.slice(-MAX_STORED_MESSAGES)),
    );
  }, [messages]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    messageEndRef.current?.scrollIntoView({
      block: "end",
      behavior: "smooth",
    });
  }, [isOpen, messages, proposedAction, isPending]);

  function submitPrompt(prompt: string): void {
    const content = prompt.trim();

    if (!content || isPending) {
      return;
    }

    const nextMessages: AssistantMessage[] = [
      ...messages,
      { role: "user", content },
    ];

    setMessages(nextMessages);
    setDraft("");
    setProposedAction(null);

    startTransition(async () => {
      const reply = await askQuoteBaseAssistant({
        messages: nextMessages.slice(-MAX_ASSISTANT_CONTEXT_MESSAGES),
      });

      if (!reply.ok) {
        setMessages((current) => [
          ...current,
          { role: "assistant", content: reply.message },
        ]);
        return;
      }

      setMessages((current) => [
        ...current,
        { role: "assistant", content: reply.message },
      ]);
      setProposedAction(reply.proposedAction);
    });
  }

  function confirmAction(): void {
    if (!proposedAction || isPending) {
      return;
    }

    const action = proposedAction;

    startTransition(async () => {
      const result = await confirmAssistantAction({ action });

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: result.message,
        },
      ]);
      setProposedAction(null);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-5 right-5 z-40 inline-flex h-14 items-center gap-3 rounded-full border border-border bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-[0_18px_48px_rgba(0,0,0,0.24)] transition hover:translate-y-[-1px] hover:shadow-[0_22px_54px_rgba(0,0,0,0.28)] focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
        aria-label="Open Ask QuoteBase"
      >
        <MessageSquare className="size-5" />
        <span className="hidden sm:inline">Ask QuoteBase</span>
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 cursor-default bg-background/55 backdrop-blur-sm"
            aria-label="Close Ask QuoteBase"
            onClick={() => setIsOpen(false)}
          />
          <aside
            className="absolute bottom-0 right-0 top-0 flex w-full max-w-[440px] flex-col border-l border-border bg-card shadow-[0_24px_80px_rgba(0,0,0,0.34)]"
            aria-label="Ask QuoteBase assistant"
          >
            <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="icon-well text-primary">
                  <Bot className="size-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-muted-foreground">
                    Ask QuoteBase
                  </p>
                  <h2 className="truncate text-xl font-semibold">Assistant</h2>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-md border border-border bg-background p-2 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                aria-label="Close Ask QuoteBase"
              >
                <X className="size-4" />
              </button>
            </header>

            <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-md border border-border bg-background p-3">
                {messages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={`rounded-md px-3 py-2 text-sm leading-6 ${
                      message.role === "user"
                        ? "ml-8 bg-primary text-primary-foreground"
                        : "mr-8 bg-secondary text-secondary-foreground"
                    }`}
                  >
                    {message.content}
                  </div>
                ))}
                {isPending ? (
                  <div className="mr-8 flex items-center gap-2 rounded-md bg-secondary px-3 py-2 text-sm text-secondary-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Thinking
                  </div>
                ) : null}
                <div ref={messageEndRef} aria-hidden="true" />
              </div>

              {proposedAction ? (
                <div className="rounded-md border border-primary/40 bg-primary/10 p-3">
                  <p className="text-sm font-semibold">Confirm action</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {proposedAction.label}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button
                      type="button"
                      onClick={confirmAction}
                      disabled={isPending}
                      className="h-9 rounded-md"
                    >
                      <Check className="size-4" />
                      Confirm
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setProposedAction(null)}
                      disabled={isPending}
                      className="h-9 rounded-md"
                    >
                      <X className="size-4" />
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  submitPrompt(draft);
                }}
                className="rounded-md border border-border bg-background p-3"
              >
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  className="min-h-24 w-full resize-none bg-transparent text-sm outline-none"
                  placeholder="Ask about hot quotes, follow-ups, win rate, or large open deals."
                />
                <div className="mt-3 flex flex-col gap-3">
                  <div className="flex flex-wrap gap-2">
                    {starterPrompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => submitPrompt(prompt)}
                        disabled={isPending}
                        className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-60"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                  <Button
                    type="submit"
                    disabled={isPending || !draft.trim()}
                    className="h-10 w-full rounded-md"
                  >
                    <Send className="size-4" />
                    Ask
                  </Button>
                </div>
              </form>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}

function readStoredMessages(): AssistantMessage[] {
  try {
    const stored = window.localStorage.getItem(ASSISTANT_STORAGE_KEY);
    const parsed = stored ? (JSON.parse(stored) as unknown) : null;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((message): message is AssistantMessage => {
        if (!message || typeof message !== "object" || Array.isArray(message)) {
          return false;
        }

        const record = message as Record<string, unknown>;

        return (
          (record.role === "user" || record.role === "assistant") &&
          typeof record.content === "string" &&
          record.content.trim().length > 0
        );
      })
      .map((message) => ({
        role: message.role,
        content: message.content.trim().slice(0, 4000),
      }))
      .slice(-MAX_STORED_MESSAGES);
  } catch {
    return [];
  }
}
