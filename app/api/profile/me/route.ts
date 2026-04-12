/**
 * @file Profile API — read and update the current user's Supabase profile.
 *
 * - `GET  /api/profile/me` — returns the full profile row.
 * - `PATCH /api/profile/me` — updates the WWU email, re-runs the Notion
 *   people-DB lookup, and patches the profile with fresh Notion-derived
 *   fields (departments, sj_band, type, notion_page_id, display_name from
 *   Notion **Name** or Google name, is_admin mirror).
 *
 * Returns 401 if unauthenticated, 404 if no profile row exists.
 *
 * @see {@link @/components/EditProfileModal} — client-side caller for PATCH
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isEffectiveAppAdmin } from "@/lib/admin";
import {
  getProfileByGoogleEmail,
  resolveProfileDisplayName,
} from "@/lib/profile-helpers";
import { profileHasBookingAccess } from "@/lib/profile-access";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  findNotionPersonByWWUEmail,
  emptyDepartments,
} from "@/lib/notion";
import type { DepartmentFlags } from "@/lib/notion";

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

/** Enforces `First.Last@wallawalla.edu` format. */
const WWU_EMAIL_RE = /^[A-Za-z]+\.[A-Za-z]+@wallawalla\.edu$/;

/**
 * Update the authenticated user's WWU email and re-sync Notion-derived fields.
 *
 * Requires a valid, non-empty WWU email. Returns the updated profile along
 * with previous and new booking-access flags so the UI can communicate the
 * change to the user.
 */
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await req.json()) as { wwuEmail?: string };
  const wwuEmail = body.wwuEmail?.trim();

  if (!wwuEmail || !WWU_EMAIL_RE.test(wwuEmail)) {
    return NextResponse.json(
      { error: "Must be in First.Last@wallawalla.edu format" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();

  const { data: existing } = await supabase
    .from("profiles")
    .select("id, notion_page_id, type")
    .eq("google_email", session.user.email)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const previousBookingAccess = profileHasBookingAccess(
    existing.notion_page_id,
    existing.type,
  );

  let notionPageId: string | null = null;
  let departments: DepartmentFlags = emptyDepartments();
  let sjBand: string | null = null;
  let type: string | null = null;
  let notionDisplayName: string | null = null;

  try {
    const result = await findNotionPersonByWWUEmail(wwuEmail);
    if (result) {
      notionPageId = result.pageId;
      notionDisplayName = result.displayName;
      departments = result.departments;
      sjBand = result.sjBand;
      type = result.type;
    }
  } catch (err) {
    console.error("[profile/me PATCH] Notion people lookup failed:", err);
  }

  const displayName = resolveProfileDisplayName(
    notionDisplayName,
    session.user.name,
  );
  const { data: profile, error: updateError } = await supabase
    .from("profiles")
    .update({
      walla_walla_email: wwuEmail,
      notion_page_id: notionPageId,
      sj_band: sjBand,
      type,
      is_admin: isEffectiveAppAdmin(session.user.email, type),
      display_name: displayName,
      ...departments,
    })
    .eq("google_email", session.user.email)
    .select()
    .single();

  if (updateError) {
    console.error("[profile/me PATCH] Supabase update failed:", updateError);
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    profile,
    previousBookingAccess,
    newBookingAccess: profileHasBookingAccess(notionPageId, type),
  });
}
