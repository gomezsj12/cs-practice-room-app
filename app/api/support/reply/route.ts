import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { toSupportThreadKey } from "@/lib/support";
import { getSupabaseAdmin } from "@/lib/supabase";

const MIN_MESSAGE_LENGTH = 1;
const MAX_MESSAGE_LENGTH = 1200;

function cleanMessage(value: string) {
  return value.replace(/\r\n/g, "\n").trim();
}

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

    const supabase = getSupabaseAdmin();
    const { data: thread, error: threadError } = await supabase
      .from("support_threads")
      .select(
        "id, user_email, telegram_chat_id, telegram_root_message_id, unread_for_user",
      )
      .eq("id", threadId)
      .eq("user_email", userEmail)
      .maybeSingle();

    if (threadError) {
      throw threadError;
    }

    if (!thread?.id) {
      return NextResponse.json(
        { error: "Could not find this support conversation." },
        { status: 404 },
      );
    }

    const { error: userMessageError } = await supabase.from("support_messages").insert({
      thread_id: thread.id,
      author_type: "user",
      body: message,
      source: "app",
    });

    if (userMessageError) {
      throw userMessageError;
    }

    const chatId = thread.telegram_chat_id || defaultAdminChatId;
    const telegramText = [
      "User follow-up message",
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

    if (thread.telegram_root_message_id) {
      telegramPayload.reply_to_message_id = thread.telegram_root_message_id;
      telegramPayload.allow_sending_without_reply = true;
    }

    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(telegramPayload),
      },
    );

    if (!telegramResponse.ok) {
      const telegramError = await telegramResponse.text();
      console.error("Telegram sendMessage failed for user reply:", telegramError);

      return NextResponse.json(
        { error: "Could not send your follow-up right now. Please try again." },
        { status: 502 },
      );
    }

    const { error: threadUpdateError } = await supabase
      .from("support_threads")
      .update({
        unread_for_user: false,
        status: "open",
        updated_at: new Date().toISOString(),
      })
      .eq("id", thread.id);

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
