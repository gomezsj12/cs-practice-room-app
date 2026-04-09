import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  try {
    const session = await auth();
    const userEmail = session?.user?.email?.toLowerCase();

    if (!userEmail) {
      return NextResponse.json({ unread: false });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("support_threads")
      .select("unread_for_user")
      .eq("user_email", userEmail)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return NextResponse.json({ unread: Boolean(data?.unread_for_user) });
  } catch (error) {
    console.error("Support unread check failed:", error);
    return NextResponse.json({ unread: false });
  }
}
