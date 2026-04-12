/**
 * @file Staff unread support check (`GET /api/support/unread-admin`).
 *
 * Returns whether any visible thread has `unread_for_admin` for triage.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAppAdmin } from "@/lib/admin";
import { isMissingSupportSoftDeleteColumnsError } from "@/lib/support-schema";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  try {
    const session = await auth();
    const userEmail = session?.user?.email;

    if (!userEmail || !(await isAppAdmin(userEmail))) {
      return NextResponse.json({ unread: false });
    }

    const supabase = getSupabaseAdmin();
    let { data, error } = await supabase
      .from("support_threads")
      .select("unread_for_admin")
      .eq("hidden_from_admin", false)
      .eq("unread_for_admin", true)
      .limit(1);

    if (error && isMissingSupportSoftDeleteColumnsError(error)) {
      return NextResponse.json({ unread: false });
    }

    if (error) {
      throw error;
    }

    return NextResponse.json({ unread: Boolean(data?.length) });
  } catch (error) {
    console.error("Support admin unread check failed:", error);
    return NextResponse.json({ unread: false });
  }
}
