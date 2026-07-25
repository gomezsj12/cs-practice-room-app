/**
 * @file Unread support check endpoint (`GET /api/support/unread`).
 *
 * Lightweight query used by the nav badge to show/hide an "unread" indicator.
 * Returns `{ unread: true }` if the user has at least one thread with
 * `unread_for_user = true`, otherwise `{ unread: false }`.
 *
 * On error or when the user is not signed in, defaults to `{ unread: false }`
 * to avoid showing a stale badge.
 *
 * @see {@link @/app/api/support/mark-read/route}: clears the unread flag
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isMissingSupportSoftDeleteColumnsError } from "@/lib/support-schema";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * Handles `GET /api/support/unread`.
 *
 * Returns `{ unread: boolean }`, set to `true` when any thread has unread admin replies.
 */
export async function GET() {
  try {
    const session = await auth();
    const userEmail = session?.user?.email?.toLowerCase();

    if (!userEmail) {
      return NextResponse.json({ unread: false });
    }

    const supabase = getSupabaseAdmin();
    let query = supabase
      .from("support_threads")
      .select("unread_for_user")
      .eq("user_email", userEmail)
      .eq("hidden_from_user", false)
      .eq("unread_for_user", true)
      .limit(1);

    let { data, error } = await query;

    if (error && isMissingSupportSoftDeleteColumnsError(error)) {
      const legacy = await supabase
        .from("support_threads")
        .select("unread_for_user")
        .eq("user_email", userEmail)
        .eq("unread_for_user", true)
        .limit(1);
      data = legacy.data;
      error = legacy.error;
    }

    if (error) {
      throw error;
    }

    return NextResponse.json({ unread: Boolean(data?.length) });
  } catch (error) {
    console.error("Support unread check failed:", error);
    return NextResponse.json({ unread: false });
  }
}
