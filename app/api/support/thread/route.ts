import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

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

    const supabase = getSupabaseAdmin();
    const baseThreadQuery = supabase
      .from("support_threads")
      .select(
        "id, user_email, user_name, status, unread_for_user, telegram_chat_id, telegram_root_message_id, created_at, updated_at",
      )
      .eq("user_email", userEmail);

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
