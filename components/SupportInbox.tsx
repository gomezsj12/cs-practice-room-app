"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Toast from "@/components/Toast";
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
  user_message_count: number;
  admin_message_count: number;
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

function formatConversationName(isoString: string) {
  const date = new Date(isoString);
  return `Issue ${date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

function formatThreadStatus(status: string) {
  return status.toLowerCase() === "open" ? "Open" : "Closed";
}

function threadStatusClass(status: string) {
  return status.toLowerCase() === "open"
    ? "bg-emerald-500/20 text-emerald-200"
    : "bg-red-500/20 text-red-200";
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
  const [toastOpen, setToastOpen] = useState(false);
  const [lastLengthToastAtMax, setLastLengthToastAtMax] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  const [pendingScrollThreadId, setPendingScrollThreadId] = useState("");
  const [isConversationLoading, setIsConversationLoading] = useState(false);
  const [menu, setMenu] = useState<{
    threadId: string;
    x: number;
    y: number;
  } | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);

  const loadThreads = useCallback(async () => {
    try {
      const response = await fetch("/api/support/threads", {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        threads?: ThreadSummary[];
        error?: string;
      };

      if (!response.ok) {
        setError(payload.error || "Could not load conversations.");
        return;
      }

      const list = payload.threads || [];
      setThreads(list);

      if (!selectedThreadId && list[0]?.id) {
        setSelectedThreadId(list[0].id);
        setPendingScrollThreadId(list[0].id);
      }

      if (
        selectedThreadId &&
        !list.some((supportThread) => supportThread.id === selectedThreadId)
      ) {
        const fallbackThreadId = list[0]?.id || "";
        setSelectedThreadId(fallbackThreadId);
        setPendingScrollThreadId(fallbackThreadId);
      }
    } catch {
      setError("Could not load conversations.");
    } finally {
      setIsLoading(false);
    }
  }, [selectedThreadId]);

  const loadThread = useCallback(
    async (options?: { showConversationLoader?: boolean }) => {
      const showConversationLoader = options?.showConversationLoader ?? false;
      if (!selectedThreadId) {
        setThread(null);
        setMessages([]);
        if (showConversationLoader) {
          setIsConversationLoading(false);
        }
        return;
      }

      setError("");
      if (showConversationLoader) {
        setIsConversationLoading(true);
      }

      try {
        const response = await fetch(`/api/support/thread?threadId=${selectedThreadId}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as SupportThreadPayload;

        if (!response.ok) {
          setError(payload.error || "Could not load your support thread.");
          return;
        }

        setThread(payload.thread);
        setMessages(payload.messages || []);
      } catch {
        setError("Could not load your support thread.");
      } finally {
        if (showConversationLoader) {
          setIsConversationLoading(false);
        }
      }
    },
    [selectedThreadId],
  );

  useEffect(() => {
    if (status !== "authenticated") {
      if (status === "unauthenticated") {
        setIsLoading(false);
      }
      return;
    }

    void loadThreads();
    const interval = window.setInterval(() => {
      void loadThreads();
      void loadThread();
    }, 20_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [loadThread, loadThreads, status]);

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }
    if (!selectedThreadId) {
      return;
    }
    setThread(null);
    setMessages([]);
    void loadThread({ showConversationLoader: true });
  }, [loadThread, selectedThreadId, status]);

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
  const selectedThreadSummary = useMemo(() => {
    return threads.find((supportThread) => supportThread.id === selectedThreadId) ?? null;
  }, [threads, selectedThreadId]);
  const sortedMessages = useMemo(() => {
    return [...messages].sort((a, b) => {
      return (
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    });
  }, [messages]);

  function initialsFromThread(threadSummary: ThreadSummary) {
    const source =
      threadSummary.user_name?.trim() ||
      threadSummary.user_email.split("@")[0] ||
      "U";
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return source.slice(0, 2).toUpperCase();
  }

  useEffect(() => {
    const dismissMenu = () => setMenu(null);
    window.addEventListener("click", dismissMenu);
    return () => {
      window.removeEventListener("click", dismissMenu);
    };
  }, []);

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
        setLastLengthToastAtMax(false);
        if (composerRef.current) {
          composerRef.current.style.height = "40px";
          composerRef.current.scrollTop = 0;
        }
        await loadThreads();
        await loadThread();
      }
    } catch {
      setReplyError("Could not send follow-up message.");
    } finally {
      setIsReplySubmitting(false);
    }
  }

  async function handleDeleteThreadById(threadId: string) {
    if (!threadId || isDeletingThread) {
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
        body: JSON.stringify({ threadId }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setDeleteError(payload.error || "Could not delete conversation.");
      } else {
        setReplyDraft("");
        if (selectedThreadId === threadId) {
          setThread(null);
          setMessages([]);
          setSelectedThreadId("");
        }
        await loadThreads();
      }
    } catch {
      setDeleteError("Could not delete conversation.");
    } finally {
      setIsDeletingThread(false);
    }
  }

  function openThreadMenu(threadId: string, x: number, y: number) {
    setMenu({ threadId, x, y });
  }

  function clearLongPressTimer() {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  useEffect(() => {
    const el = composerRef.current;
    if (!el) {
      return;
    }

    const computed = window.getComputedStyle(el);
    const lineHeight = Number.parseFloat(computed.lineHeight) || 20;
    const maxHeight = lineHeight * 4;

    el.style.height = "40px";
    const nextHeight = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${nextHeight}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
    el.scrollTop = el.scrollHeight;
  }, [replyDraft]);

  useLayoutEffect(() => {
    if (
      !selectedThreadId ||
      pendingScrollThreadId !== selectedThreadId ||
      thread?.id !== selectedThreadId
    ) {
      return;
    }
    const el = messageListRef.current;
    if (!el) {
      return;
    }
    window.requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
      window.setTimeout(() => {
        el.scrollTop = el.scrollHeight;
        setPendingScrollThreadId("");
      }, 0);
    });
  }, [pendingScrollThreadId, selectedThreadId, thread?.id, messages]);

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

  if (!selectedThreadId && threads.length === 0) {
    return (
      <p className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-neutral-300">
        No support thread yet. Submit your first request on the homepage.
      </p>
    );
  }

  const showMobileList = mobileView === "list";
  const showMobileChat = mobileView === "chat";

  return (
    <section className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside
          className={`relative rounded-3xl border border-white/10 bg-black/20 p-3 ${
            showMobileChat ? "hidden lg:block" : "block"
          } h-[calc(100dvh-5rem)] overflow-y-auto md:h-[66vh] lg:h-[74vh]`}
        >
          <div className="mb-2 px-2">
            <p className="text-sm font-semibold text-neutral-100">Your support inbox</p>
            <p className="mt-1 text-xs text-neutral-400">
              Pick a conversation and reply to staff directly here.
            </p>
          </div>
          {threads.length ? (
            threads.map((supportThread) => {
              const isSelected = supportThread.id === selectedThreadId;
              return (
                <button
                  key={supportThread.id}
                  type="button"
                  onClick={() => {
                    setSelectedThreadId(supportThread.id);
                    setPendingScrollThreadId(supportThread.id);
                    setMenu(null);
                    setMobileView("chat");
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    openThreadMenu(
                      supportThread.id,
                      event.clientX,
                      event.clientY,
                    );
                  }}
                  onTouchStart={(event) => {
                    clearLongPressTimer();
                    const touch = event.touches[0];
                    longPressTimerRef.current = window.setTimeout(() => {
                      openThreadMenu(
                        supportThread.id,
                        touch?.clientX ?? window.innerWidth / 2,
                        touch?.clientY ?? window.innerHeight / 2,
                      );
                    }, 550);
                  }}
                  onTouchEnd={clearLongPressTimer}
                  onTouchCancel={clearLongPressTimer}
                  className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                    isSelected
                      ? "border-white/25 bg-white/10"
                      : "border-white/10 bg-black/20 hover:border-white/20 hover:bg-white/5"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-neutral-200">
                      {initialsFromThread(supportThread)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium text-neutral-100">
                          {formatConversationName(supportThread.created_at)}
                        </p>
                      </div>
                      <p className="mt-1 truncate text-xs text-neutral-400">
                        {supportThread.latest_message_body || "No messages yet"}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${threadStatusClass(
                            supportThread.status,
                          )}`}
                        >
                          {formatThreadStatus(supportThread.status)}
                        </span>
                        <span className="text-[10px] text-neutral-400">
                          You {supportThread.user_message_count} • Staff{" "}
                          {supportThread.admin_message_count}
                        </span>
                        {supportThread.unread_for_user ? (
                          <span className="inline-flex h-2 w-2 rounded-full bg-amber-400" />
                        ) : null}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          ) : (
            <p className="rounded-xl border border-white/10 px-3 py-2 text-xs text-neutral-400">
              No conversations yet.
            </p>
          )}
        </aside>

        <div
          className={`rounded-3xl border border-white/10 bg-black/20 p-3 ${
            showMobileList ? "hidden lg:flex" : "flex"
          } h-[calc(100dvh-5rem)] flex-col md:h-[66vh] lg:h-[74vh]`}
        >
          <div className="relative mb-3 flex items-start gap-2 border-b border-white/10 pb-2 lg:hidden">
            <button
              type="button"
              onClick={() => setMobileView("list")}
              className="absolute left-0 top-0 inline-flex h-10 w-10 items-center justify-center text-3xl font-semibold leading-none text-neutral-200 transition hover:text-white"
              aria-label="Back to conversations"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-7 w-7"
                fill="none"
              >
                <path
                  d="M15 6L9 12L15 18"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <div className="px-12 text-center">
              <p className="truncate text-sm font-semibold text-neutral-100">
                {selectedThreadSummary
                  ? formatConversationName(selectedThreadSummary.created_at)
                  : "Support chat"}
              </p>
              {selectedThreadSummary ? (
                <div className="mt-1 flex items-center justify-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${threadStatusClass(
                      selectedThreadSummary.status,
                    )}`}
                  >
                    {formatThreadStatus(selectedThreadSummary.status)}
                  </span>
                  <p className="truncate text-xs text-neutral-400">
                    You {selectedThreadSummary.user_message_count} • Staff{" "}
                    {selectedThreadSummary.admin_message_count}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
          <div ref={messageListRef} className="min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="flex min-h-full flex-col justify-end space-y-2 pb-1">
              {!isConversationLoading && !hasThread ? (
                <div className="flex min-h-[180px] items-center justify-center">
                  <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-300">
                    Select a conversation to view messages.
                  </p>
                </div>
              ) : null}
              {!isConversationLoading &&
                hasThread &&
                sortedMessages.map((message) => {
                  const isAdmin = message.author_type === "admin";
                  return (
                    <div
                      key={message.id}
                      className={`flex ${isAdmin ? "justify-start" : "justify-end"}`}
                    >
                      <article
                        className={`w-fit max-w-[88%] rounded-2xl border px-4 py-3 text-sm ${
                          isAdmin
                            ? "border-white/15 bg-white/5 text-neutral-100"
                            : "border-white/10 bg-black/30 text-neutral-100"
                        }`}
                      >
                        <p className="text-xs font-medium uppercase tracking-wide text-neutral-300">
                          {isAdmin ? "Staff reply" : "You"}
                        </p>
                        <p className="mt-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-5">
                          {message.body}
                        </p>
                        <p className="mt-1 text-right text-xs text-neutral-400">
                          {formatMessageTime(message.created_at)}
                        </p>
                      </article>
                    </div>
                  );
                })}
            </div>
          </div>

          <form onSubmit={handleReplySubmit} className="mt-3 space-y-2">
            <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-black/30 px-3 py-2">
              <textarea
                ref={composerRef}
                value={replyDraft}
                disabled={isConversationLoading}
                onChange={(event) => {
                  const nextValue = event.target.value.slice(0, 1200);
                  setReplyDraft(nextValue);

                  if (nextValue.length < 1200 && lastLengthToastAtMax) {
                    setLastLengthToastAtMax(false);
                  }

                  if (nextValue.length >= 1200 && !lastLengthToastAtMax) {
                    setLastLengthToastAtMax(true);
                    setToastOpen(true);
                  }
                }}
                rows={1}
                maxLength={1200}
                placeholder={isConversationLoading ? "Loading conversation..." : "Write a message..."}
                className="max-h-[88px] min-h-[40px] w-full resize-none bg-transparent py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none"
              />
              {isConversationLoading ? (
                <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-black/40">
                  <span
                    className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/25 border-t-blue-400"
                    aria-label="Loading conversation"
                  />
                </div>
              ) : (
                <button
                  type="submit"
                  disabled={isReplySubmitting || !replyDraft.trim() || !thread?.id}
                  className="inline-flex h-9 shrink-0 items-center rounded-full bg-blue-500 px-3 text-sm font-medium text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Send follow-up"
                >
                  {isReplySubmitting ? "..." : "Send"}
                </button>
              )}
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
      <Toast
        isOpen={toastOpen}
        message="Message limit reached (1200 characters)."
        type="info"
        onClose={() => setToastOpen(false)}
      />
      {menu ? (
        <div
          className="fixed z-[90] min-w-[170px] rounded-xl border border-white/15 bg-black/90 p-1 shadow-2xl backdrop-blur"
          style={{ left: menu.x, top: menu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-left text-sm text-red-200 transition hover:border-red-400/40 hover:bg-red-500/10"
            onClick={() => {
              setMenu(null);
              void handleDeleteThreadById(menu.threadId);
            }}
          >
            Delete conversation
          </button>
        </div>
      ) : null}
    </section>
  );
}
