import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { parseReplyCommand } from "@/lib/support";

type TelegramWebhookPayload = {
  update_id?: number;
  message?: {
    text?: string;
  };
};

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
    const text = payload.message?.text || "";
    const reply = parseReplyCommand(text);

    if (!reply) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const supabase = getSupabaseAdmin();

    const { data: thread, error: threadError } = await supabase
      .from("support_threads")
      .select("id, user_email")
      .eq("id", reply.threadId)
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
      body: reply.replyBody,
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
