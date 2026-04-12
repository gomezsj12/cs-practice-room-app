/**
 * @file User follow-up reply endpoint (`POST /api/support/reply`).
 *
 * Adds a new message to an existing support thread and forwards it to
 * the admin's Telegram chat. Closed threads cannot receive new messages.
 * Falls back to legacy thread fetch/update when soft-delete columns are absent.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAppAdmin } from "@/lib/admin";
import { isMissingSupportSoftDeleteColumnsError } from "@/lib/support-schema";
import { toSupportThreadKey } from "@/lib/support";
import { getSupabaseAdmin } from "@/lib/supabase";

const MIN_MESSAGE_LENGTH = 1;
const MAX_MESSAGE_LENGTH = 1200;

function cleanMessage(value: string) {
  return value.replace(/\r\n/g, "\n").trim();
}

type ThreadForReply = {
  id: string;
  telegram_chat_id: string | null;
  telegram_root_message_id: number | null;
  telegram_topic_id: number | null;
  status: string;
  staff_replied_from_app: boolean;
};

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const userEmail = session?.user?.email?.toLowerCase();
    const userName = session?.user?.name?.trim() || "Unknown user";

    if (!userEmail) {
      return NextResponse.json(
        { error: "You must sign in to reply in support." },
        { status: 401 },
      );
    }

    const body = (await request.json()) as { threadId?: string; message?: string };
    const threadId = body.threadId?.trim() || "";
    const message = cleanMessage(body.message || "");

    if (!threadId) {
      return NextResponse.json({ error: "Missing thread id." }, { status: 400 });
    }

    if (message.length < MIN_MESSAGE_LENGTH || message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        { error: `Message must be between ${MIN_MESSAGE_LENGTH} and ${MAX_MESSAGE_LENGTH} characters.` },
        { status: 400 },
      );
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const defaultAdminChatId = process.env.TELEGRAM_SUPPORT_ADMIN_CHAT_ID;

    if (!botToken || !defaultAdminChatId) {
      return NextResponse.json(
        { error: "Support chat is not configured yet." },
        { status: 500 },
      );
    }

    const isAdmin = await isAppAdmin(userEmail);
    const supabase = getSupabaseAdmin();

    let threadQuery = supabase
      .from("support_threads")
      .select(
        "id, user_email, telegram_chat_id, telegram_root_message_id, telegram_topic_id, unread_for_user, status, staff_replied_from_app",
      )
      .eq("id", threadId);

    if (!isAdmin) {
      threadQuery = threadQuery.eq("user_email", userEmail).eq("hidden_from_user", false);
    } else {
      threadQuery = threadQuery.eq("hidden_from_admin", false);
    }

    let { data: threadRaw, error: threadError } = await threadQuery.maybeSingle();

    if (threadError && isMissingSupportSoftDeleteColumnsError(threadError)) {
      let legacyQuery = supabase
        .from("support_threads")
        .select(
          "id, user_email, telegram_chat_id, telegram_root_message_id, telegram_topic_id, unread_for_user, status",
        )
        .eq("id", threadId);
      if (!isAdmin) {
        legacyQuery = legacyQuery.eq("user_email", userEmail);
      }
      const legacy = await legacyQuery.maybeSingle();
      threadRaw = legacy.data as typeof threadRaw;
      threadError = legacy.error;
    }

    if (threadError) {
      throw threadError;
    }

    const row = threadRaw as Record<string, unknown> | null;
    if (!row?.id) {
      return NextResponse.json(
        { error: "Could not find this support conversation." },
        { status: 404 },
      );
    }

    const thread: ThreadForReply = {
      id: String(row.id),
      telegram_chat_id: (row.telegram_chat_id as string | null) ?? null,
      telegram_root_message_id: (row.telegram_root_message_id as number | null) ?? null,
      telegram_topic_id: (row.telegram_topic_id as number | null) ?? null,
      status: String(row.status),
      staff_replied_from_app: Boolean(row.staff_replied_from_app),
    };

    if (thread.status === "closed") {
      return NextResponse.json(
        { error: "This conversation is closed. You cannot send new messages." },
        { status: 403 },
      );
    }

    const authorType = isAdmin ? "admin" : "user";

    let adminMessageCount = 0;
    if (!isAdmin) {
      const { count, error: countError } = await supabase
        .from("support_messages")
        .select("id", { count: "exact", head: true })
        .eq("thread_id", thread.id)
        .eq("author_type", "admin");

      if (countError) {
        throw countError;
      }
      adminMessageCount = count ?? 0;
    }

    const { error: userMessageError } = await supabase.from("support_messages").insert({
      thread_id: thread.id,
      author_type: authorType,
      body: message,
      source: "app",
    });

    if (userMessageError) {
      throw userMessageError;
    }

    const chatId = thread.telegram_chat_id || defaultAdminChatId;

    const telegramText = [
      isAdmin ? "Staff reply (via app)" : "User follow-up message",
      `Thread: ${toSupportThreadKey(thread.id)}`,
      `From: ${userName}`,
      `Email: ${userEmail}`,
      "",
      message,
    ].join("\n");

    const telegramPayload: Record<string, unknown> = {
      chat_id: chatId,
      text: telegramText,
      disable_web_page_preview: true,
    };

    if (thread.telegram_topic_id) {
      telegramPayload.message_thread_id = thread.telegram_topic_id;
    }

    if (thread.telegram_root_message_id) {
      telegramPayload.reply_to_message_id = thread.telegram_root_message_id;
      telegramPayload.allow_sending_without_reply = true;
    }

    let telegramResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(telegramPayload),
      },
    );

    if (!telegramResponse.ok && !telegramPayload.message_thread_id) {
      console.warn(
        "sendMessage failed without topic, retrying with General topic:",
        await telegramResponse.text(),
      );

      telegramPayload.message_thread_id = 1;
      telegramResponse = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(telegramPayload),
        },
      );
    }

    if (!telegramResponse.ok) {
      const telegramError = await telegramResponse.text();
      console.error("Telegram sendMessage failed for user reply:", telegramError);

      return NextResponse.json(
        { error: "Could not send your follow-up right now. Please try again." },
        { status: 502 },
      );
    }

    const threadPatch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (isAdmin) {
      threadPatch.unread_for_user = true;
      threadPatch.staff_replied_from_app = true;
    } else {
      threadPatch.unread_for_user = false;
      const notifyAdmin =
        adminMessageCount === 0 || Boolean(thread.staff_replied_from_app);
      threadPatch.unread_for_admin = notifyAdmin;
    }

    let { error: threadUpdateError } = await supabase
      .from("support_threads")
      .update(threadPatch)
      .eq("id", thread.id);

    if (threadUpdateError && isMissingSupportSoftDeleteColumnsError(threadUpdateError)) {
      const legacyPatch: Record<string, unknown> = {
        updated_at: threadPatch.updated_at,
        unread_for_user: threadPatch.unread_for_user,
      };
      const leg = await supabase
        .from("support_threads")
        .update(legacyPatch)
        .eq("id", thread.id);
      threadUpdateError = leg.error;
    }

    if (threadUpdateError) {
      throw threadUpdateError;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Support reply route failed:", error);
    return NextResponse.json(
      { error: "Could not send your follow-up right now. Please try again." },
      { status: 500 },
    );
  }
}
