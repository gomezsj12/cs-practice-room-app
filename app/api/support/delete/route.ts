/**
 * @file Delete support thread endpoint (`POST /api/support/delete`).
 *
 * Permanently removes a support thread and its messages (via Supabase
 * cascade). The thread owner can delete their own thread; admins
 * (`ADMIN_EMAILS`) can delete any thread by id. Before deletion, if the
 * thread has a Telegram forum topic and is not already marked closed, the
 * bot calls `closeForumTopic` (failures are logged; delete still proceeds).
 *
 * Returns 404 if the thread doesn't exist or doesn't belong to the caller
 * (non-admin).
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { closeTelegramSupportForumTopic } from "@/lib/support";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * Handles `POST /api/support/delete`.
 *
 * Accepts `{ threadId }` and deletes the matching thread after verifying
 * access (owner or admin).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const userEmail = session?.user?.email?.toLowerCase();

    if (!userEmail) {
      return NextResponse.json(
        { error: "You must sign in first." },
        { status: 401 },
      );
    }

    const body = (await request.json()) as { threadId?: string };
    const threadId = body.threadId?.trim() || "";

    if (!threadId) {
      return NextResponse.json({ error: "Missing thread id." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const isAdmin = isAdminEmail(userEmail);

    let threadQuery = supabase
      .from("support_threads")
      .select("id, user_email, status, telegram_chat_id, telegram_topic_id")
      .eq("id", threadId);

    if (!isAdmin) {
      threadQuery = threadQuery.eq("user_email", userEmail);
    }

    const { data: thread, error: fetchError } = await threadQuery.maybeSingle();

    if (fetchError) {
      throw fetchError;
    }

    if (!thread?.id) {
      return NextResponse.json(
        { error: "Could not find this support conversation." },
        { status: 404 },
      );
    }

    await closeTelegramSupportForumTopic({
      telegram_chat_id: thread.telegram_chat_id,
      telegram_topic_id: thread.telegram_topic_id,
      threadStatus: thread.status,
    });

    let deleteQuery = supabase.from("support_threads").delete().eq("id", thread.id);
    if (!isAdmin) {
      deleteQuery = deleteQuery.eq("user_email", userEmail);
    }

    const { error: deleteError } = await deleteQuery;

    if (deleteError) {
      throw deleteError;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Support delete failed:", error);
    return NextResponse.json(
      { error: "Could not delete conversation right now." },
      { status: 500 },
    );
  }
}
