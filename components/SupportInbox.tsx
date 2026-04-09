"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import type { SupportMessageRow, SupportThreadRow } from "@/lib/types";

type SupportThreadPayload = {
  thread: SupportThreadRow | null;
  messages: SupportMessageRow[];
  error?: string;
};

type ThreadSummary = {
  id: string;
  user_email: string;
  user_name: string | null;
  status: string;
  unread_for_user: boolean;
  created_at: string;
  updated_at: string;
  latest_message_body: string | null;
  latest_message_author_type: "user" | "admin" | null;
  latest_message_created_at: string | null;
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
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState("");
  const [thread, setThread] = useState<SupportThreadRow | null>(null);
  const [messages, setMessages] = useState<SupportMessageRow[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [replyDraft, setReplyDraft] = useState("");
  const [isReplySubmitting, setIsReplySubmitting] = useState(false);
  const [replyError, setReplyError] = useState("");
  const [isDeletingThread, setIsDeletingThread] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const loadThreads = useCallback(async () => {
    const response = await fetch("/api/support/threads", {
      cache: "no-store",
    });
    const payload = (await response.json()) as {
      threads?: ThreadSummary[];
      error?: string;
    };

    if (!response.ok) {
      throw new Error(payload.error || "Could not load conversations.");
    }

    const list = payload.threads || [];
    setThreads(list);

    if (!selectedThreadId && list[0]?.id) {
      setSelectedThreadId(list[0].id);
    }

    if (
      selectedThreadId &&
      !list.some((supportThread) => supportThread.id === selectedThreadId)
    ) {
      setSelectedThreadId(list[0]?.id || "");
    }
  }, [selectedThreadId]);

  const loadThread = useCallback(async () => {
    if (!selectedThreadId) {
      setThread(null);
      setMessages([]);
      setIsLoading(false);
      return;
    }

    setError("");
    setIsLoading(true);

    try {
      const response = await fetch(`/api/support/thread?threadId=${selectedThreadId}`, {
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
  }, [selectedThreadId]);

  useEffect(() => {
    if (status !== "authenticated") {
      setIsLoading(false);
      return;
    }

    void loadThreads();
    void loadThread();
    const interval = window.setInterval(() => {
      void loadThreads();
      void loadThread();
    }, 20_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [loadThread, loadThreads, status]);

  useEffect(() => {
    if (status !== "authenticated" || !thread?.id || !thread?.unread_for_user) {
      return;
    }

    void fetch("/api/support/mark-read", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ threadId: thread.id }),
    });
  }, [status, thread?.id, thread?.unread_for_user]);

  const hasThread = Boolean(thread?.id);
  const sortedMessages = useMemo(() => {
    return [...messages].sort((a, b) => {
      return (
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    });
  }, [messages]);

  async function handleReplySubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!thread?.id || isReplySubmitting) {
      return;
    }

    const message = replyDraft.trim();
    if (!message) {
      return;
    }

    setIsReplySubmitting(true);
    setReplyError("");

    try {
      const response = await fetch("/api/support/reply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          threadId: thread.id,
          message,
        }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setReplyError(payload.error || "Could not send follow-up message.");
      } else {
        setReplyDraft("");
        await loadThreads();
        await loadThread();
      }
    } catch {
      setReplyError("Could not send follow-up message.");
    } finally {
      setIsReplySubmitting(false);
    }
  }

  async function handleDeleteThread() {
    if (!thread?.id || isDeletingThread) {
      return;
    }

    const confirmed = window.confirm(
      "Delete this conversation? This removes all messages in this thread.",
    );
    if (!confirmed) {
      return;
    }

    setIsDeletingThread(true);
    setDeleteError("");

    try {
      const response = await fetch("/api/support/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ threadId: thread.id }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setDeleteError(payload.error || "Could not delete conversation.");
      } else {
        setReplyDraft("");
        setThread(null);
        setMessages([]);
        setSelectedThreadId("");
        await loadThreads();
      }
    } catch {
      setDeleteError("Could not delete conversation.");
    } finally {
      setIsDeletingThread(false);
    }
  }

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
        <p className="text-sm font-medium text-blue-200">Your support inbox</p>
        <p className="mt-1 text-xs text-neutral-400">
          Pick a conversation and reply to staff directly here.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="space-y-2 rounded-2xl border border-white/10 bg-black/20 p-2">
          {threads.length ? (
            threads.map((supportThread) => {
              const isSelected = supportThread.id === selectedThreadId;
              return (
                <button
                  key={supportThread.id}
                  type="button"
                  onClick={() => setSelectedThreadId(supportThread.id)}
                  className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                    isSelected
                      ? "border-blue-500/40 bg-blue-500/15"
                      : "border-white/10 bg-black/20 hover:border-white/20"
                  }`}
                >
                  <p className="text-xs font-medium text-neutral-200">
                    {supportThread.status === "open" ? "Open" : "Closed"}
                  </p>
                  <p className="mt-1 truncate text-sm text-white">
                    {supportThread.latest_message_body || "No messages yet"}
                  </p>
                  <p className="mt-1 text-xs text-neutral-400">
                    {supportThread.latest_message_created_at
                      ? formatMessageTime(supportThread.latest_message_created_at)
                      : formatMessageTime(supportThread.updated_at)}
                    {supportThread.unread_for_user ? " • Unread" : ""}
                  </p>
                </button>
              );
            })
          ) : (
            <p className="rounded-xl border border-white/10 px-3 py-2 text-xs text-neutral-400">
              No conversations yet.
            </p>
          )}
        </aside>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
            <p className="text-xs text-neutral-300">Conversation actions</p>
            <button
              type="button"
              onClick={handleDeleteThread}
              disabled={isDeletingThread || !thread?.id}
              className="rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isDeletingThread ? "Deleting..." : "Delete conversation"}
            </button>
          </div>

          <div className="space-y-2">
            {sortedMessages.map((message) => {
              const isAdmin = message.author_type === "admin";
              return (
                <article
                  key={message.id}
                  className={`rounded-2xl border px-4 py-3 text-sm ${
                    isAdmin
                      ? "ml-8 border-blue-500/30 bg-blue-500/10 text-blue-100"
                      : "mr-8 border-white/10 bg-black/20 text-neutral-100"
                  }`}
                >
                  <p
                    className={`text-xs font-medium uppercase tracking-wide ${
                      isAdmin ? "text-blue-200/80" : "text-neutral-300"
                    }`}
                  >
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

          <form onSubmit={handleReplySubmit} className="space-y-2">
            <textarea
              value={replyDraft}
              onChange={(event) => setReplyDraft(event.target.value)}
              rows={3}
              maxLength={1200}
              placeholder="Send a follow-up to staff..."
              className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-neutral-500 focus:border-blue-400/80 focus:outline-none"
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-neutral-400">
                {replyDraft.trim().length}/1200
              </p>
              <button
                type="submit"
                disabled={isReplySubmitting || !replyDraft.trim() || !thread?.id}
                className="rounded-full bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isReplySubmitting ? "Sending..." : "Send follow-up"}
              </button>
            </div>
            {replyError ? (
              <p className="rounded-xl border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {replyError}
              </p>
            ) : null}
            {deleteError ? (
              <p className="rounded-xl border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {deleteError}
              </p>
            ) : null}
          </form>
        </div>
      </div>
    </section>
  );
}
