/**
 * @file `GET /api/profile/me` — returns the current user's Supabase profile.
 *
 * Used by client components (e.g. the booking page) that need reactive access
 * to profile data without a full page refresh.
 *
 * Returns 401 if unauthenticated, 404 if no profile row exists.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("google_email", session.user.email)
    .single();

  if (error || !profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  return NextResponse.json({ profile });
}
