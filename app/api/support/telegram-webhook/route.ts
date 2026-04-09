/**
 * @file Telegram webhook handler (`POST /api/support/telegram-webhook`).
 *
 * Receives inbound Telegram updates (admin replies / close commands) and
 * persists them as `support_messages` rows. The handler supports three
 * resolution strategies for mapping a Telegram message to a support thread,
 * tried in priority order:
 *
 * 1. **`/close SR-<id>` command** — parsed by `parseCloseCommand`.
 * 2. **Native Telegram reply** — if the message is a reply-to a message
 *    whose `message_id` + `chat.id` match a `support_threads` row's
 *    `telegram_root_message_id` / `telegram_chat_id`.
 * 3. **`/reply SR-<id> <body>` command** or thread-ID mention in text —
 *    parsed by `parseReplyCommand` / `extractSupportThreadIdFromText`.
 *
 * Idempotency: every message includes the Telegram `update_id`. Before
 * inserting, the handler checks for a duplicate `telegram_update_id` in
 * `support_messages` and returns early if one exists.
 *
 * Authorization: the optional `TELEGRAM_WEBHOOK_SECRET` env var is matched
 * against the `X-Telegram-Bot-Api-Secret-Token` header.
 *
 * @see {@link @/lib/support} — parsing helpers (`parseReplyCommand`, `parseCloseCommand`, `extractSupportThreadIdFromText`)
 * @see {@link @/app/api/support/contact/route} — stores the outbound root message ID
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  extractSupportThreadIdFromText,
  parseCloseCommand,
  parseReplyCommand,
} from "@/lib/support";

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

/**
 * Attempts to extract a thread ID and reply body from a Telegram message
 * using multiple strategies (command, in-text mention, quoted-reply context).
 *
 * @returns `{ threadId, replyBody }` or `null` if no thread could be resolved.
 */
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

/**
 * Validates the `X-Telegram-Bot-Api-Secret-Token` header against the
 * `TELEGRAM_WEBHOOK_SECRET` env var. Returns `true` when the secret is
 * not configured (opt-in security).
 */
function isWebhookAuthorized(request: NextRequest) {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expectedSecret) {
    return true;
  }

  const headerSecret = request.headers.get("x-telegram-bot-api-secret-token");
  return headerSecret === expectedSecret;
}

/**
 * Handles `POST /api/support/telegram-webhook`.
 *
 * Processes a Telegram update: resolves the target thread via the reply
 * resolution chain, deduplicates by `update_id`, then inserts an admin
 * message (or closes the thread on `/close`).
 */
export async function POST(request: NextRequest) {
  try {
    if (!isWebhookAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized webhook." }, { status: 401 });
    }

    const payload = (await request.json()) as TelegramWebhookPayload;
    const updateId = payload.update_id;
    const message = payload.message;
    const reply = resolveSupportReply(message);
    const closeCommand = parseCloseCommand(message?.text || "");

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

    // Priority: explicit /close command > native reply link > text-based match.
    const threadId =
      closeCommand?.threadId || threadIdFromNativeReply || reply?.threadId || "";
    const replyBody = reply?.replyBody || message?.text || message?.caption || "";

    if (!threadId) {
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

    if (closeCommand) {
      const closeNote = closeCommand.reason
        ? `Staff closed this request: ${closeCommand.reason}`
        : "Staff closed this request.";

      if (updateId) {
        const { data: existingCloseMessage, error: existingCloseMessageError } =
          await supabase
            .from("support_messages")
            .select("id")
            .eq("telegram_update_id", String(updateId))
            .limit(1)
            .maybeSingle();

        if (existingCloseMessageError) {
          throw existingCloseMessageError;
        }

        if (existingCloseMessage?.id) {
          return NextResponse.json({ ok: true, duplicate: true });
        }
      }

      const { error: closeInsertError } = await supabase
        .from("support_messages")
        .insert({
          thread_id: thread.id,
          author_type: "admin",
          body: closeNote,
          source: "telegram",
          telegram_update_id: updateId ? String(updateId) : null,
        });

      if (closeInsertError) {
        throw closeInsertError;
      }

      const { error: closeUpdateError } = await supabase
        .from("support_threads")
        .update({
          status: "closed",
          unread_for_user: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", thread.id);

      if (closeUpdateError) {
        throw closeUpdateError;
      }

      return NextResponse.json({ ok: true, closed: true });
    }

    if (!replyBody.trim()) {
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
