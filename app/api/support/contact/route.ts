import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { toSupportThreadKey } from "@/lib/support";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { SupportThreadRow } from "@/lib/types";

const MIN_MESSAGE_LENGTH = 10;
const MAX_MESSAGE_LENGTH = 1200;
const RATE_LIMIT_WINDOW_MS = 20_000;
const lastContactRequestByEmail = new Map<string, number>();

function cleanForTelegram(value: string) {
  return value.replace(/\r\n/g, "\n").trim();
}

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

    try {
      const supabase = getSupabaseAdmin();
      const { data: existingThread, error: existingThreadError } = await supabase
        .from("support_threads")
        .select("id, status, unread_for_user")
        .eq("user_email", normalizedUserEmail)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingThreadError) {
        throw existingThreadError;
      }

      const typedExisting = existingThread as Pick<
        SupportThreadRow,
        "id" | "status" | "unread_for_user"
      > | null;

      if (typedExisting?.id) {
        supportThreadId = typedExisting.id;
        const { error: threadUpdateError } = await supabase
          .from("support_threads")
          .update({
            user_name: userName,
            status: "open",
            updated_at: new Date().toISOString(),
          })
          .eq("id", supportThreadId);

        if (threadUpdateError) {
          throw threadUpdateError;
        }
      } else {
        const { data: newThread, error: newThreadError } = await supabase
          .from("support_threads")
          .insert({
            user_email: normalizedUserEmail,
            user_name: userName,
            status: "open",
            unread_for_user: false,
          })
          .select("id")
          .single();

        if (newThreadError || !newThread?.id) {
          throw newThreadError || new Error("Could not create support thread.");
        }

        supportThreadId = String(newThread.id);
      }

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

    const telegramText = [
      "New support request",
      `Thread: ${toSupportThreadKey(supportThreadId)}`,
      `From: ${userName}`,
      `Email: ${userEmail}`,
      "",
      message,
    ].join("\n");

    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: adminChatId,
          text: telegramText,
          disable_web_page_preview: true,
        }),
      },
    );

    if (!telegramResponse.ok) {
      const telegramError = await telegramResponse.text();
      console.error("Telegram sendMessage failed:", telegramError);

      return NextResponse.json(
        { error: "Could not send your request right now. Please try again." },
        { status: 502 },
      );
    }

    // Persist the outbound Telegram message identity so admins can simply
    // reply to that message and we can map the response back to the thread.
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
