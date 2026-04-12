/**
 * @file `POST /api/profile/sync` — re-sync the current user's Notion data.
 *
 * Looks up the user's current WWU email in the Notion people database and
 * patches the Supabase profile with fresh department flags, sj_band, type,
 * and notion_page_id. Used by the manual refresh button, auto-sync interval,
 * and page-load sync in the client.
 *
 * Returns the updated profile row. If no profile exists, returns 404.
 *
 * @see {@link @/hooks/useProfileSync} — client-side hook that calls this
 * @see {@link @/lib/notion} — Notion lookup helpers
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getProfileByGoogleEmail } from "@/lib/profile-helpers";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  findNotionPersonByWWUEmail,
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

  try {
    const result = await findNotionPersonByWWUEmail(
      currentProfile.walla_walla_email,
    );
    if (result) {
      notionPageId = result.pageId;
      departments = result.departments;
      sjBand = result.sjBand;
      type = result.type;
    }
  } catch (err) {
    console.error("[profile/sync] Notion people lookup failed:", err);
  }

  const supabase = getSupabaseAdmin();

  const { data: profile, error: updateError } = await supabase
    .from("profiles")
    .update({
      notion_page_id: notionPageId,
      sj_band: sjBand,
      type,
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

  return NextResponse.json({ profile });
}
