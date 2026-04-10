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
import { getProfileByGoogleEmail } from "@/lib/profile-helpers";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const profile = await getProfileByGoogleEmail(session.user.email);
    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    return NextResponse.json({ profile });
  } catch (error) {
    console.error("[profile/me] Failed to load profile:", error);
    return NextResponse.json(
      { error: "Failed to load profile." },
      { status: 500 },
    );
  }
}
