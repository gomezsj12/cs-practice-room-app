/**
 * @file Mark-read endpoint (`POST /api/support/mark-read`).
 *
 * Users: clears `unread_for_user` on owned thread(s). Admins: clears
 * `unread_for_admin` on one thread only (`threadId` required).
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAppAdmin } from "@/lib/admin";
import { isMissingSupportSoftDeleteColumnsError } from "@/lib/support-schema";
import { getSupabaseAdmin } from "@/lib/supabase";

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

    const isAdmin = await isAppAdmin(userEmail);
    const supabase = getSupabaseAdmin();
    const body = (await request.json().catch(() => ({}))) as {
      threadId?: string;
    };
    const threadId = body.threadId?.trim() || "";

    if (isAdmin) {
      if (!threadId) {
        return NextResponse.json(
          { error: "threadId is required for staff mark-read." },
          { status: 400 },
        );
      }
      const { error } = await supabase
        .from("support_threads")
        .update({
          unread_for_admin: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", threadId)
        .eq("hidden_from_admin", false);

      if (error && isMissingSupportSoftDeleteColumnsError(error)) {
        return NextResponse.json({ ok: true });
      }
      if (error) {
        throw error;
      }
      return NextResponse.json({ ok: true });
    }

    const updateQuery = supabase.from("support_threads").update({
      unread_for_user: false,
      updated_at: new Date().toISOString(),
    });

    const finalQuery = threadId
      ? updateQuery.eq("user_email", userEmail).eq("id", threadId)
      : updateQuery.eq("user_email", userEmail);

    const { error } = await finalQuery;

    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Support mark-read failed:", error);
    return NextResponse.json({ error: "Could not mark as read." }, { status: 500 });
  }
}
