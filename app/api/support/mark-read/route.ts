import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST() {
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
    const { error } = await supabase
      .from("support_threads")
      .update({
        unread_for_user: false,
        updated_at: new Date().toISOString(),
      })
      .eq("user_email", userEmail);

    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Support mark-read failed:", error);
    return NextResponse.json({ error: "Could not mark as read." }, { status: 500 });
  }
}
