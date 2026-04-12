/**
 * @file Single support thread endpoint (`GET /api/support/thread`).
 *
 * Returns one thread and messages. Falls back to a legacy query if soft-delete
 * columns are not migrated yet.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAppAdmin } from "@/lib/admin";
import { isMissingSupportSoftDeleteColumnsError } from "@/lib/support-schema";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { SupportThreadRow } from "@/lib/types";

function normalizeThread(row: Record<string, unknown> | null): SupportThreadRow | null {
  if (!row?.id) {
    return null;
  }
  return {
    id: String(row.id),
    user_email: String(row.user_email),
    user_name: (row.user_name as string | null) ?? null,
    status: String(row.status),
    unread_for_user: Boolean(row.unread_for_user),
    unread_for_admin: Boolean(row.unread_for_admin),
    hidden_from_user: Boolean(row.hidden_from_user),
    hidden_from_admin: Boolean(row.hidden_from_admin),
    staff_replied_from_app: Boolean(row.staff_replied_from_app),
    telegram_chat_id: (row.telegram_chat_id as string | null) ?? null,
    telegram_root_message_id: (row.telegram_root_message_id as number | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    telegram_topic_id: (row.telegram_topic_id as number | null) ?? null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const userEmail = session?.user?.email?.toLowerCase();

    if (!userEmail) {
      return NextResponse.json(
        { error: "You must sign in to view support messages." },
        { status: 401 },
      );
    }

    const url = new URL(request.url);
    const requestedThreadId = url.searchParams.get("threadId")?.trim() || "";

    const isAdmin = await isAppAdmin(userEmail);
    const supabase = getSupabaseAdmin();

    let baseThreadQuery = supabase
      .from("support_threads")
      .select(
        "id, user_email, user_name, status, unread_for_user, unread_for_admin, hidden_from_user, hidden_from_admin, staff_replied_from_app, telegram_chat_id, telegram_root_message_id, created_at, updated_at",
      );

    if (!isAdmin) {
      baseThreadQuery = baseThreadQuery
        .eq("user_email", userEmail)
        .eq("hidden_from_user", false);
    } else {
      baseThreadQuery = baseThreadQuery.eq("hidden_from_admin", false);
    }

    const threadQuery = requestedThreadId
      ? baseThreadQuery.eq("id", requestedThreadId).limit(1)
      : baseThreadQuery.order("updated_at", { ascending: false }).limit(1);

    let { data: threadRow, error: threadError } =
      await threadQuery.maybeSingle();

    if (threadError && isMissingSupportSoftDeleteColumnsError(threadError)) {
      console.warn(
        "support_threads: soft-delete columns missing; using legacy thread fetch. Apply supabase/migrations/20260412120000_support_soft_delete_and_admin_unread.sql",
      );
      let legacyBase = supabase
        .from("support_threads")
        .select(
          "id, user_email, user_name, status, unread_for_user, telegram_chat_id, telegram_root_message_id, telegram_topic_id, created_at, updated_at",
        );
      if (!isAdmin) {
        legacyBase = legacyBase.eq("user_email", userEmail);
      }
      const legacyQuery = requestedThreadId
        ? legacyBase.eq("id", requestedThreadId).limit(1)
        : legacyBase.order("updated_at", { ascending: false }).limit(1);
      const legacy = await legacyQuery.maybeSingle();
      threadRow = legacy.data as typeof threadRow;
      threadError = legacy.error;
    }

    if (threadError) {
      throw threadError;
    }

    const thread = normalizeThread(threadRow as Record<string, unknown> | null);

    if (!thread?.id) {
      return NextResponse.json({
        thread: null,
        messages: [],
      });
    }

    const { data: messages, error: messagesError } = await supabase
      .from("support_messages")
      .select("id, thread_id, author_type, body, source, telegram_update_id, created_at")
      .eq("thread_id", thread.id)
      .order("created_at", { ascending: true });

    if (messagesError) {
      throw messagesError;
    }

    return NextResponse.json({
      thread,
      messages: messages ?? [],
    });
  } catch (error) {
    console.error("Support thread fetch failed:", error);
    return NextResponse.json(
      { error: "Could not load support thread." },
      { status: 500 },
    );
  }
}
