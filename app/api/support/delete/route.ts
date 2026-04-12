/**
 * @file Delete support thread endpoint (`POST /api/support/delete`).
 *
 * Soft-delete when migration columns exist; otherwise legacy hard-delete.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAppAdmin } from "@/lib/admin";
import { isMissingSupportSoftDeleteColumnsError } from "@/lib/support-schema";
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
    const isAdmin = await isAppAdmin(userEmail);

    type ThreadDeleteRow = {
      id: string;
      user_email: string;
      status: string;
      telegram_chat_id: string | null;
      telegram_topic_id: number | null;
      hidden_from_user?: boolean;
      hidden_from_admin?: boolean;
    };

    let threadQuery = supabase
      .from("support_threads")
      .select(
        "id, user_email, status, telegram_chat_id, telegram_topic_id, hidden_from_user, hidden_from_admin",
      )
      .eq("id", threadId);

    if (!isAdmin) {
      threadQuery = threadQuery.eq("user_email", userEmail);
    }

    let thread: ThreadDeleteRow | null = null;
    let { data: fetchedThread, error: fetchError } = await threadQuery.maybeSingle();
    thread = fetchedThread as ThreadDeleteRow | null;
    let useLegacyHardDelete = false;

    if (fetchError && isMissingSupportSoftDeleteColumnsError(fetchError)) {
      useLegacyHardDelete = true;
      let legacyQuery = supabase
        .from("support_threads")
        .select("id, user_email, status, telegram_chat_id, telegram_topic_id")
        .eq("id", threadId);
      if (!isAdmin) {
        legacyQuery = legacyQuery.eq("user_email", userEmail);
      }
      const legacy = await legacyQuery.maybeSingle();
      thread = legacy.data as ThreadDeleteRow | null;
      fetchError = legacy.error;
    }

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

    if (useLegacyHardDelete) {
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

    const hardDelete = isAdmin
      ? Boolean(thread.hidden_from_user)
      : Boolean(thread.hidden_from_admin);

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
