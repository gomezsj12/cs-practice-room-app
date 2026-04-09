/**
 * @file Mark-read endpoint (`POST /api/support/mark-read`).
 *
 * Clears the `unread_for_user` flag on one or all of the signed-in user's
 * support threads. When `{ threadId }` is provided, only that thread is
 * updated; otherwise every thread owned by the user is marked read.
 *
 * @see {@link @/app/api/support/unread/route} — reads the unread flag
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * Handles `POST /api/support/mark-read`.
 *
 * Accepts optional `{ threadId }`. Marks one or all threads as read.
 */
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

    const supabase = getSupabaseAdmin();
    const body = (await request.json().catch(() => ({}))) as {
      threadId?: string;
    };
    const threadId = body.threadId?.trim() || "";

    const updateQuery = supabase.from("support_threads").update({
      unread_for_user: false,
      updated_at: new Date().toISOString(),
    });

    const { error } = threadId
      ? await updateQuery.eq("user_email", userEmail).eq("id", threadId)
      : await updateQuery.eq("user_email", userEmail);

    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Support mark-read failed:", error);
    return NextResponse.json({ error: "Could not mark as read." }, { status: 500 });
  }
}
