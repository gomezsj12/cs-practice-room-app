/**
 * @file Single support thread endpoint (`GET /api/support/thread`).
 *
 * Returns one thread and all of its messages for the signed-in user.
 * When `?threadId=<id>` is provided the specific thread is fetched;
 * otherwise the most recently updated thread is returned (useful for the
 * initial "open inbox → show latest conversation" flow).
 *
 * Ownership is enforced: the query filters by `user_email` so a user can
 * never read another user's thread.
 *
 * @see {@link @/app/api/support/threads/route} — list of thread summaries
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * Handles `GET /api/support/thread`.
 *
 * Accepts optional `?threadId=<uuid>`. Returns `{ thread, messages }` where
 * `thread` may be `null` if the user has no threads.
 */
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

    const isAdmin = isAdminEmail(userEmail);
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

    const { data: thread, error: threadError } = await threadQuery.maybeSingle();

    if (threadError) {
      throw threadError;
    }

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
