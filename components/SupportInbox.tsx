"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import type { SupportMessageRow, SupportThreadRow } from "@/lib/types";

type SupportThreadPayload = {
  thread: SupportThreadRow | null;
  messages: SupportMessageRow[];
  error?: string;
};

function formatMessageTime(isoString: string) {
  const date = new Date(isoString);
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function SupportInbox() {
  const { status } = useSession();
  const [thread, setThread] = useState<SupportThreadRow | null>(null);
  const [messages, setMessages] = useState<SupportMessageRow[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const loadThread = useCallback(async () => {
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/support/thread", {
        cache: "no-store",
      });
      const payload = (await response.json()) as SupportThreadPayload;

      if (!response.ok) {
        setError(payload.error || "Could not load your support thread.");
        setIsLoading(false);
        return;
      }

      setThread(payload.thread);
      setMessages(payload.messages || []);
      setIsLoading(false);
    } catch {
      setError("Could not load your support thread.");
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status !== "authenticated") {
      setIsLoading(false);
      return;
    }

    void loadThread();
    const interval = window.setInterval(() => {
      void loadThread();
    }, 20_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [loadThread, status]);

  useEffect(() => {
    if (status !== "authenticated" || !thread?.unread_for_user) {
      return;
    }

    void fetch("/api/support/mark-read", {
      method: "POST",
    });
  }, [status, thread?.unread_for_user]);

  const hasThread = Boolean(thread?.id);
  const sortedMessages = useMemo(() => {
    return [...messages].sort((a, b) => {
      return (
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    });
  }, [messages]);

  if (status === "loading" || isLoading) {
    return (
      <p className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-neutral-300">
        Loading support thread...
      </p>
    );
  }

  if (status !== "authenticated") {
    return (
      <p className="rounded-2xl border border-dashed border-white/15 px-4 py-3 text-sm text-neutral-400">
        Sign in to view your support inbox.
      </p>
    );
  }

  if (error) {
    return (
      <p className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
        {error}
      </p>
    );
  }

  if (!hasThread) {
    return (
      <p className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-neutral-300">
        No support thread yet. Submit your first request on the homepage.
      </p>
    );
  }

  return (
    <section className="space-y-3">
      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
        <p className="text-sm font-medium text-blue-200">Your support thread</p>
        <p className="mt-1 text-xs text-neutral-400">
          Replies from staff appear here. This view refreshes automatically.
        </p>
      </div>

      <div className="space-y-2">
        {sortedMessages.map((message) => {
          const isAdmin = message.author_type === "admin";
          return (
            <article
              key={message.id}
              className={`rounded-2xl border px-4 py-3 text-sm ${
                isAdmin
                  ? "border-blue-500/30 bg-blue-500/10 text-blue-100"
                  : "border-white/10 bg-black/20 text-neutral-100"
              }`}
            >
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-300">
                {isAdmin ? "Staff reply" : "You"}
              </p>
              <p className="mt-2 whitespace-pre-wrap leading-6">{message.body}</p>
              <p className="mt-2 text-xs text-neutral-400">
                {formatMessageTime(message.created_at)}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
