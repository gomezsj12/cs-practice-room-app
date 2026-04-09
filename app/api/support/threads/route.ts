import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

type ThreadSummary = {
  id: string;
  user_email: string;
  user_name: string | null;
  status: string;
  unread_for_user: boolean;
  created_at: string;
  updated_at: string;
  latest_message_body: string | null;
  latest_message_author_type: "user" | "admin" | null;
  latest_message_created_at: string | null;
  user_message_count: number;
  admin_message_count: number;
};

export async function GET() {
  try {
    const session = await auth();
    const userEmail = session?.user?.email?.toLowerCase();

    if (!userEmail) {
      return NextResponse.json(
        { error: "You must sign in to view support threads." },
        { status: 401 },
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: threads, error: threadError } = await supabase
      .from("support_threads")
      .select(
        "id, user_email, user_name, status, unread_for_user, created_at, updated_at",
      )
      .eq("user_email", userEmail)
      .order("updated_at", { ascending: false });

    if (threadError) {
      throw threadError;
    }

    const threadRows = threads ?? [];
    if (!threadRows.length) {
      return NextResponse.json({ threads: [] });
    }

    const threadIds = threadRows.map((t) => t.id);
    const { data: messages, error: messagesError } = await supabase
      .from("support_messages")
      .select("thread_id, author_type, body, created_at")
      .in("thread_id", threadIds)
      .order("created_at", { ascending: false });

    if (messagesError) {
      throw messagesError;
    }

    const latestByThread = new Map<string, (typeof messages)[number]>();
    const countsByThread = new Map<
      string,
      { userMessageCount: number; adminMessageCount: number }
    >();
    for (const message of messages ?? []) {
      if (!latestByThread.has(message.thread_id)) {
        latestByThread.set(message.thread_id, message);
      }

      const current = countsByThread.get(message.thread_id) || {
        userMessageCount: 0,
        adminMessageCount: 0,
      };
      if (message.author_type === "user") {
        current.userMessageCount += 1;
      } else if (message.author_type === "admin") {
        current.adminMessageCount += 1;
      }
      countsByThread.set(message.thread_id, current);
    }

    const summaries: ThreadSummary[] = threadRows.map((thread) => {
      const latest = latestByThread.get(thread.id);
      const counts = countsByThread.get(thread.id) || {
        userMessageCount: 0,
        adminMessageCount: 0,
      };
      return {
        ...thread,
        latest_message_body: latest?.body ?? null,
        latest_message_author_type: latest?.author_type ?? null,
        latest_message_created_at: latest?.created_at ?? null,
        user_message_count: counts.userMessageCount,
        admin_message_count: counts.adminMessageCount,
      };
    });

    return NextResponse.json({ threads: summaries });
  } catch (error) {
    console.error("Support thread list fetch failed:", error);
    return NextResponse.json(
      { error: "Could not load support conversations." },
      { status: 500 },
    );
  }
}
