/**
 * @file Delete support thread endpoint (`POST /api/support/delete`).
 *
 * Soft-delete: sets `hidden_from_user` or `hidden_from_admin`, marks the
 * thread closed, and closes the Telegram forum topic when applicable.
 * Hard-delete: when the other side has already hidden the thread, removes
 * the row and messages (cascade).
 *
 * Owners may only act on their threads; admins may act on any thread.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { closeTelegramSupportForumTopic } from "@/lib/support";
import { getSupabaseAdmin } from "@/lib/supabase";

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
      .select(
        "id, user_email, status, telegram_chat_id, telegram_topic_id, hidden_from_user, hidden_from_admin",
      )
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

    const hardDelete =
      isAdmin ? thread.hidden_from_user : thread.hidden_from_admin;

    await closeTelegramSupportForumTopic({
      telegram_chat_id: thread.telegram_chat_id,
      telegram_topic_id: thread.telegram_topic_id,
      threadStatus: thread.status,
    });

    if (hardDelete) {
      let deleteQuery = supabase.from("support_threads").delete().eq("id", thread.id);
      if (!isAdmin) {
        deleteQuery = deleteQuery.eq("user_email", userEmail);
      }
      const { error: deleteError } = await deleteQuery;
      if (deleteError) {
        throw deleteError;
      }
      return NextResponse.json({ ok: true, deleted: true });
    }

    const patch: Record<string, unknown> = {
      status: "closed",
      updated_at: new Date().toISOString(),
    };
    if (isAdmin) {
      patch.hidden_from_admin = true;
    } else {
      patch.hidden_from_user = true;
    }

    let updateQuery = supabase.from("support_threads").update(patch).eq("id", thread.id);
    if (!isAdmin) {
      updateQuery = updateQuery.eq("user_email", userEmail);
    }

    const { error: updateError } = await updateQuery;
    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({ ok: true, archived: true });
  } catch (error) {
    console.error("Support delete failed:", error);
    return NextResponse.json(
      { error: "Could not delete conversation right now." },
      { status: 500 },
    );
  }
}
