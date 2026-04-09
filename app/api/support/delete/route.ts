/**
 * @file Delete support thread endpoint (`POST /api/support/delete`).
 *
 * Permanently removes a support thread and its messages (via Supabase
 * cascade). Only the thread owner can delete; the query filters by both
 * `id` and `user_email` so no cross-user deletion is possible.
 *
 * Returns 404 if the thread doesn't exist or doesn't belong to the caller.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * Handles `POST /api/support/delete`.
 *
 * Accepts `{ threadId }` and deletes the matching thread after verifying
 * the caller owns it.
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

    const body = (await request.json()) as { threadId?: string };
    const threadId = body.threadId?.trim() || "";

    if (!threadId) {
      return NextResponse.json({ error: "Missing thread id." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: thread, error: fetchError } = await supabase
      .from("support_threads")
      .select("id, user_email")
      .eq("id", threadId)
      .eq("user_email", userEmail)
      .maybeSingle();

    if (fetchError) {
      throw fetchError;
    }

    if (!thread?.id) {
      return NextResponse.json(
        { error: "Could not find this support conversation." },
        { status: 404 },
      );
    }

    const { error: deleteError } = await supabase
      .from("support_threads")
      .delete()
      .eq("id", thread.id)
      .eq("user_email", userEmail);

    if (deleteError) {
      throw deleteError;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Support delete failed:", error);
    return NextResponse.json(
      { error: "Could not delete conversation right now." },
      { status: 500 },
    );
  }
}
