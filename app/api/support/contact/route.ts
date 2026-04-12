/**
 * @file Support thread creation endpoint (`POST /api/support/contact`).
 *
 * Creates a new support thread with the user's first message, then forwards
 * the message to the admin's Telegram chat. Steps:
 *
 * 1. **Auth** — requires a signed-in session.
 * 2. **Rate limit** — in-memory per-email window (`RATE_LIMIT_WINDOW_MS`).
 * 3. **Validation** — message length between 10 and 1 200 characters.
 * 4. **Supabase insert** — creates a `support_threads` row + first
 *    `support_messages` row (author_type = "user").
 * 5. **Telegram topic** — creates a forum topic named like the support
 *    inbox row (`formatSupportConversationName` from `created_at`), then
 *    sends the notification into that topic. Persists topic ID, message id,
 *    and chat id on success.
 *
 * @see {@link @/lib/support} — `toSupportThreadKey` (human-readable thread ID)
 * @see {@link @/app/api/support/telegram-webhook/route} — inbound Telegram replies
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  formatSupportConversationName,
  toSupportThreadKey,
  truncateForTelegramForumTopic,
} from "@/lib/support";
import { getSupabaseAdmin } from "@/lib/supabase";

const MIN_MESSAGE_LENGTH = 10;
const MAX_MESSAGE_LENGTH = 1200;
const RATE_LIMIT_WINDOW_MS = 20_000;

// In-memory map — resets on serverless cold start, which is acceptable
// because the window is short (20 s) and the worst case is one extra message.
const lastContactRequestByEmail = new Map<string, number>();

/** Normalise CRLF → LF and trim whitespace for Telegram delivery. */
function cleanForTelegram(value: string) {
  return value.replace(/\r\n/g, "\n").trim();
}

/**
 * Returns the number of seconds the caller must wait before sending again,
 * or `0` if the rate-limit window has elapsed.
 */
function getRateLimitRemainingSeconds(email: string, nowMs: number) {
  const previousRequestMs = lastContactRequestByEmail.get(email);
  if (!previousRequestMs) {
    return 0;
  }

  const elapsedMs = nowMs - previousRequestMs;
  if (elapsedMs >= RATE_LIMIT_WINDOW_MS) {
    return 0;
  }

  const remainingMs = RATE_LIMIT_WINDOW_MS - elapsedMs;
  return Math.ceil(remainingMs / 1000);
}

/**
 * Handles `POST /api/support/contact`.
 *
 * Accepts `{ message }` and creates a new support thread + Telegram notification.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const userEmail = session?.user?.email?.trim();
    const userName = session?.user?.name?.trim() || "Unknown user";

    if (!userEmail) {
      return NextResponse.json(
        { error: "You must sign in to send a support request." },
        { status: 401 },
      );
    }

    const normalizedUserEmail = userEmail.toLowerCase();
    const nowMs = Date.now();
    const remainingSeconds = getRateLimitRemainingSeconds(
      normalizedUserEmail,
      nowMs,
    );

    if (remainingSeconds > 0) {
      return NextResponse.json(
        {
          error: `Please wait ${remainingSeconds}s before sending another message.`,
        },
        { status: 429 },
      );
    }

    const body = (await request.json()) as { message?: string };
    const message = cleanForTelegram(body.message || "");

    if (message.length < MIN_MESSAGE_LENGTH) {
      return NextResponse.json(
        { error: `Message must be at least ${MIN_MESSAGE_LENGTH} characters.` },
        { status: 400 },
      );
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        { error: `Message must be at most ${MAX_MESSAGE_LENGTH} characters.` },
        { status: 400 },
      );
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const adminChatId = process.env.TELEGRAM_SUPPORT_ADMIN_CHAT_ID;

    let supportThreadId = "";
    let threadCreatedAt = "";

    try {
      const supabase = getSupabaseAdmin();
      const { data: newThread, error: newThreadError } = await supabase
        .from("support_threads")
        .insert({
          user_email: normalizedUserEmail,
          user_name: userName,
          status: "open",
          unread_for_user: false,
          unread_for_admin: true,
        })
        .select("id, created_at")
        .single();

      if (newThreadError || !newThread?.id || !newThread.created_at) {
        throw newThreadError || new Error("Could not create support thread.");
      }

      supportThreadId = String(newThread.id);
      threadCreatedAt = newThread.created_at;

      const { error: messageInsertError } = await supabase
        .from("support_messages")
        .insert({
          thread_id: supportThreadId,
          author_type: "user",
          body: message,
          source: "app",
        });

      if (messageInsertError) {
        throw messageInsertError;
      }
    } catch (supabaseError) {
      console.error("Support thread persistence failed:", supabaseError);
      return NextResponse.json(
        {
          error:
            "Support inbox storage is not configured yet. Please finish Supabase setup first.",
        },
        { status: 500 },
      );
    }

    if (!botToken || !adminChatId) {
      return NextResponse.json(
        { error: "Support chat is not configured yet." },
        { status: 500 },
      );
    }

    const threadKey = toSupportThreadKey(supportThreadId);
    const primaryLocale =
      request.headers.get("accept-language")?.split(",")[0]?.split(";")[0]?.trim() ||
      undefined;
    const topicTitle = truncateForTelegramForumTopic(
      formatSupportConversationName(threadCreatedAt, primaryLocale),
    );
    let topicId: number | undefined;

    // Create a dedicated forum topic for this support thread so all
    // messages stay grouped in the admin supergroup.
    try {
      const topicResponse = await fetch(
        `https://api.telegram.org/bot${botToken}/createForumTopic`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: adminChatId,
            name: topicTitle,
          }),
        },
      );

      if (topicResponse.ok) {
        const topicPayload = (await topicResponse.json()) as {
          ok?: boolean;
          result?: { message_thread_id?: number };
        };
        topicId = topicPayload.result?.message_thread_id;
      } else {
        console.warn(
          "createForumTopic failed (topics may not be enabled):",
          await topicResponse.text(),
        );
      }
    } catch (topicError) {
      console.warn("createForumTopic request failed:", topicError);
    }

    const telegramText = [
      "New support request",
      `Thread: ${threadKey}`,
      `From: ${userName}`,
      `Email: ${userEmail}`,
      "",
      message,
    ].join("\n");

    const sendPayload: Record<string, unknown> = {
      chat_id: adminChatId,
      text: telegramText,
      disable_web_page_preview: true,
    };

    if (topicId) {
      sendPayload.message_thread_id = topicId;
    }

    let telegramResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sendPayload),
      },
    );

    // When the group has Topics enabled, sendMessage without a topic may
    // fail.  Retry once targeting the General topic (thread ID 1).
    if (!telegramResponse.ok && !sendPayload.message_thread_id) {
      console.warn(
        "sendMessage failed without topic, retrying with General topic:",
        await telegramResponse.text(),
      );

      sendPayload.message_thread_id = 1;
      telegramResponse = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sendPayload),
        },
      );
    }

    if (!telegramResponse.ok) {
      const telegramError = await telegramResponse.text();
      console.error("Telegram sendMessage failed:", telegramError);

      return NextResponse.json(
        { error: "Could not send your request right now. Please try again." },
        { status: 502 },
      );
    }

    try {
      const telegramPayload = (await telegramResponse.json()) as {
        ok?: boolean;
        result?: {
          message_id?: number;
          chat?: { id?: number | string };
        };
      };

      const rootMessageId = telegramPayload.result?.message_id;
      const telegramChatId = telegramPayload.result?.chat?.id;

      if (rootMessageId && telegramChatId !== undefined) {
        const supabase = getSupabaseAdmin();
        const { error: telegramThreadLinkError } = await supabase
          .from("support_threads")
          .update({
            telegram_chat_id: String(telegramChatId),
            telegram_root_message_id: rootMessageId,
            ...(topicId ? { telegram_topic_id: topicId } : {}),
            updated_at: new Date().toISOString(),
          })
          .eq("id", supportThreadId);

        if (telegramThreadLinkError) {
          console.error(
            "Failed to save telegram thread link:",
            telegramThreadLinkError,
          );
        }
      }
    } catch (telegramParseError) {
      console.error("Failed to parse Telegram sendMessage response:", telegramParseError);
    }

    lastContactRequestByEmail.set(normalizedUserEmail, nowMs);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Support contact route failed:", error);

    return NextResponse.json(
      { error: "Could not send your request right now. Please try again." },
      { status: 500 },
    );
  }
}
