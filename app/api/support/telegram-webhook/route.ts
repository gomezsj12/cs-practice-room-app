import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { extractSupportThreadIdFromText, parseReplyCommand } from "@/lib/support";

type TelegramWebhookPayload = {
  update_id?: number;
  message?: {
    message_id?: number;
    chat?: {
      id?: number | string;
    };
    text?: string;
    caption?: string;
    quote?: {
      text?: string;
    };
    reply_to_message?: {
      message_id?: number;
      text?: string;
      caption?: string;
    };
  };
};

function resolveSupportReply(message?: TelegramWebhookPayload["message"]) {
  const text = (message?.text || message?.caption || "").trim();
  if (!text) {
    return null;
  }

  const commandReply = parseReplyCommand(text);
  if (commandReply) {
    return commandReply;
  }

  const threadIdFromQuotedReply = extractSupportThreadIdFromText(text);
  if (threadIdFromQuotedReply) {
    const cleanedReplyBody = text
      .replace(new RegExp(`^.*?SR-${threadIdFromQuotedReply}\\s*`, "i"), "")
      .trim();

    if (cleanedReplyBody) {
      return {
        threadId: threadIdFromQuotedReply,
        replyBody: cleanedReplyBody,
      };
    }
  }

  const repliedToText =
    message?.reply_to_message?.text || message?.reply_to_message?.caption || "";
  const quotedText = message?.quote?.text || "";
  const threadId =
    extractSupportThreadIdFromText(repliedToText) ||
    extractSupportThreadIdFromText(quotedText);

  if (threadId) {
    // Treat plain reply text as the support response body when replying
    // directly to a bot message that includes SR-<thread-id>.
    return {
      threadId,
      replyBody: text,
    };
  }

  return null;
}

function isWebhookAuthorized(request: NextRequest) {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expectedSecret) {
    return true;
  }

  const headerSecret = request.headers.get("x-telegram-bot-api-secret-token");
  return headerSecret === expectedSecret;
}

export async function POST(request: NextRequest) {
  try {
    if (!isWebhookAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized webhook." }, { status: 401 });
    }

    const payload = (await request.json()) as TelegramWebhookPayload;
    const updateId = payload.update_id;
    const message = payload.message;
    const reply = resolveSupportReply(message);

    const supabase = getSupabaseAdmin();
    const replyToMessageId = message?.reply_to_message?.message_id;
    const chatId = message?.chat?.id;
    let threadIdFromNativeReply = "";

    if (replyToMessageId && chatId !== undefined) {
      const { data: linkedThread, error: linkedThreadError } = await supabase
        .from("support_threads")
        .select("id")
        .eq("telegram_chat_id", String(chatId))
        .eq("telegram_root_message_id", replyToMessageId)
        .maybeSingle();

      if (linkedThreadError) {
        throw linkedThreadError;
      }

      if (linkedThread?.id) {
        threadIdFromNativeReply = linkedThread.id;
      }
    }

    const threadId = threadIdFromNativeReply || reply?.threadId || "";
    const replyBody = reply?.replyBody || message?.text || message?.caption || "";

    if (!threadId || !replyBody.trim()) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const { data: thread, error: threadError } = await supabase
      .from("support_threads")
      .select("id, user_email")
      .eq("id", threadId)
      .maybeSingle();

    if (threadError) {
      throw threadError;
    }

    if (!thread?.id) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    if (updateId) {
      const { data: existingMessage, error: existingMessageError } = await supabase
        .from("support_messages")
        .select("id")
        .eq("telegram_update_id", String(updateId))
        .limit(1)
        .maybeSingle();

      if (existingMessageError) {
        throw existingMessageError;
      }

      if (existingMessage?.id) {
        return NextResponse.json({ ok: true, duplicate: true });
      }
    }

    const { error: insertError } = await supabase.from("support_messages").insert({
      thread_id: thread.id,
      author_type: "admin",
      body: replyBody.trim(),
      source: "telegram",
      telegram_update_id: updateId ? String(updateId) : null,
    });

    if (insertError) {
      throw insertError;
    }

    const { error: threadUpdateError } = await supabase
      .from("support_threads")
      .update({
        unread_for_user: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", thread.id);

    if (threadUpdateError) {
      throw threadUpdateError;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telegram support webhook failed:", error);
    return NextResponse.json({ error: "Webhook handling failed." }, { status: 500 });
  }
}
