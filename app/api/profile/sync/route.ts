/**
 * @file `POST /api/profile/sync`: re-sync the current user's Notion data.
 *
 * Looks up the user's current WWU email in the Notion people database and
 * patches the Supabase profile with fresh department flags, sj_band, type,
 * notion_page_id, display_name (Notion **Name** if set, else Google name,
 * else `"Unknown"`), and
 * is_admin mirror. Returns `sessionBookingAccess` and
 * `sessionIsAdmin` so the client can refresh the session when they change.
 *
 * Returns the updated profile row. If no profile exists, returns 404.
 *
 * @see {@link @/hooks/useProfileSync}: client-side hook that calls this
 * @see {@link @/lib/notion}: Notion lookup helpers
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
  syncProfileCreationLogToNotion,
  emptyDepartments,
} from "@/lib/notion";
import type { DepartmentFlags } from "@/lib/notion";

export async function POST() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const currentProfile = await getProfileByGoogleEmail(session.user.email);
  if (!currentProfile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  let notionPageId: string | null = null;
  let departments: DepartmentFlags = emptyDepartments();
  let sjBand: string | null = null;
  let type: string | null = null;
  let notionDisplayName: string | null = null;

  try {
    const result = await findNotionPersonByWWUEmail(
      currentProfile.walla_walla_email,
    );
    if (result) {
      notionPageId = result.pageId;
      notionDisplayName = result.displayName;
      departments = result.departments;
      sjBand = result.sjBand;
      type = result.type;
    }
  } catch (err) {
    console.error("[profile/sync] Notion people lookup failed:", err);
  }

  const supabase = getSupabaseAdmin();

  const displayName = resolveProfileDisplayName(
    notionDisplayName,
    session.user.name,
  );
  const { data: profile, error: updateError } = await supabase
    .from("profiles")
    .update({
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
    console.error("[profile/sync] Supabase update failed:", updateError);
    return NextResponse.json(
      { error: "Failed to sync profile" },
      { status: 500 },
    );
  }

  syncProfileCreationLogToNotion(
    {
      displayName: profile.display_name,
      googleEmail: profile.google_email,
      wwuEmail: profile.walla_walla_email,
      foundInNotion: !!profile.notion_page_id,
      notionPageId: profile.notion_page_id,
    },
    "metadataOnly",
  ).catch((err) => {
    console.error("[profile/sync] Notion audit log sync failed:", err);
  });

  return NextResponse.json({
    profile,
    sessionBookingAccess: profileHasBookingAccess(
      profile.notion_page_id,
      profile.type,
    ),
    sessionIsAdmin: isEffectiveAppAdmin(session.user.email, profile.type),
  });
}
