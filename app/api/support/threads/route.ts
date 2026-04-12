/**
 * @file List support threads endpoint (`GET /api/support/threads`).
 *
 * Returns support threads with message summaries. Uses soft-delete filters when
 * the DB migration is present; falls back to a legacy query otherwise.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAppAdmin } from "@/lib/admin";
import { isMissingSupportSoftDeleteColumnsError } from "@/lib/support-schema";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { ThreadSummary } from "@/lib/types";

type ThreadRow = Record<string, unknown> & {
  id: string;
  user_email: string;
  user_name: string | null;
  status: string;
  unread_for_user: boolean;
  created_at: string;
  updated_at: string;
};

function toSummary(
  thread: ThreadRow,
  latest: { body: string; author_type: string; created_at: string } | undefined,
  counts: { userMessageCount: number; adminMessageCount: number },
): ThreadSummary {
  return {
    id: thread.id,
    user_email: thread.user_email,
    user_name: thread.user_name,
    status: thread.status,
    unread_for_user: thread.unread_for_user,
    unread_for_admin: Boolean(thread.unread_for_admin),
    created_at: thread.created_at,
    updated_at: thread.updated_at,
    latest_message_body: latest?.body ?? null,
    latest_message_author_type:
      (latest?.author_type as "user" | "admin" | undefined) ?? null,
    latest_message_created_at: latest?.created_at ?? null,
    user_message_count: counts.userMessageCount,
    admin_message_count: counts.adminMessageCount,
  };
}

export async function GET() {
  try {
    const session = await auth();
    const userEmail = session?.user?.email?.toLowerCase();

    if (!userEmail) {
      return NextResponse.json(
        { error: "You must sign in to view support threads." },
        { status: 401 },
      );
    }

    const isAdmin = await isAppAdmin(userEmail);
    const supabase = getSupabaseAdmin();

    let threadQuery = supabase
      .from("support_threads")
      .select(
        "id, user_email, user_name, status, unread_for_user, unread_for_admin, created_at, updated_at",
      )
      .order("updated_at", { ascending: false });

    if (!isAdmin) {
      threadQuery = threadQuery.eq("user_email", userEmail).eq("hidden_from_user", false);
    } else {
      threadQuery = threadQuery.eq("hidden_from_admin", false);
    }

    let { data: threads, error: threadError } = await threadQuery;

    if (threadError && isMissingSupportSoftDeleteColumnsError(threadError)) {
      console.warn(
        "support_threads: soft-delete columns missing; using legacy list query. Apply supabase/migrations/20260412120000_support_soft_delete_and_admin_unread.sql",
      );
      let legacyQuery = supabase
        .from("support_threads")
        .select(
          "id, user_email, user_name, status, unread_for_user, created_at, updated_at",
        )
        .order("updated_at", { ascending: false });
      if (!isAdmin) {
        legacyQuery = legacyQuery.eq("user_email", userEmail);
      }
      const legacy = await legacyQuery;
      threads = legacy.data as typeof threads;
      threadError = legacy.error;
    }

    if (threadError) {
      throw threadError;
    }

    const threadRows = (threads ?? []) as ThreadRow[];
    if (!threadRows.length) {
      return NextResponse.json({ threads: [] });
    }

    const threadIds = threadRows.map((t) => t.id);
    const { data: messages, error: messagesError } = await supabase
      .from("support_messages")
      .select("thread_id, author_type, body, created_at")
      .in("thread_id", threadIds)
      .order("created_at", { ascending: false });

    if (messagesError) {
      throw messagesError;
    }

    const latestByThread = new Map<string, (typeof messages)[number]>();
    const countsByThread = new Map<
      string,
      { userMessageCount: number; adminMessageCount: number }
    >();
    for (const message of messages ?? []) {
      if (!latestByThread.has(message.thread_id)) {
        latestByThread.set(message.thread_id, message);
      }

      const current = countsByThread.get(message.thread_id) || {
        userMessageCount: 0,
        adminMessageCount: 0,
      };
      if (message.author_type === "user") {
        current.userMessageCount += 1;
      } else if (message.author_type === "admin") {
        current.adminMessageCount += 1;
      }
      countsByThread.set(message.thread_id, current);
    }

    const summaries: ThreadSummary[] = threadRows.map((thread) => {
      const latest = latestByThread.get(thread.id);
      const counts = countsByThread.get(thread.id) || {
        userMessageCount: 0,
        adminMessageCount: 0,
      };
      return toSummary(thread, latest, counts);
    });

    return NextResponse.json({ threads: summaries });
  } catch (error) {
    console.error("Support thread list fetch failed:", error);
    return NextResponse.json(
      { error: "Could not load support conversations." },
      { status: 500 },
    );
  }
}
