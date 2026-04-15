/**
 * @file POST /api/profile/setup — first-time account setup endpoint.
 *
 * Validates the submitted Walla Walla University email, looks up the
 * user in the Notion people database, creates a profile row in Supabase,
 * and logs the event to the Notion audit database (fire-and-forget).
 *
 * @see {@link @/lib/notion} — Notion lookup + log helpers
 * @see {@link @/lib/supabase} — Supabase admin client
 * @see {@link @/components/AccountSetupModal} — client-side caller
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isEffectiveAppAdmin } from "@/lib/admin";
import {
  findNotionPersonByWWUEmail,
  logProfileCreationToNotion,
  emptyDepartments,
} from "@/lib/notion";
import type { DepartmentFlags } from "@/lib/notion";
import { getSupabaseAdmin } from "@/lib/supabase";
import { resolveProfileDisplayName } from "@/lib/profile-helpers";
import { WWU_EMAIL_RE } from "@/lib/validation";

export async function POST(req: Request) {
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
    .select("id")
    .eq("google_email", session.user.email)
    .single();

  if (existing) {
    return NextResponse.json(
      { error: "Profile already exists" },
      { status: 409 },
    );
  }

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
    console.error("[profile/setup] Notion people lookup failed:", err);
  }

  const displayName = resolveProfileDisplayName(
    notionDisplayName,
    session.user.name,
  );

  const { data: profile, error: insertError } = await supabase
    .from("profiles")
    .insert({
      google_email: session.user.email,
      display_name: displayName,
      walla_walla_email: wwuEmail,
      google_image: session.user.image ?? null,
      notion_page_id: notionPageId,
      sj_band: sjBand,
      type,
      is_admin: isEffectiveAppAdmin(session.user.email, type),
      ...departments,
    })
    .select()
    .single();

  if (insertError) {
    console.error("[profile/setup] Supabase insert failed:", insertError);
    return NextResponse.json(
      { error: "Failed to create profile" },
      { status: 500 },
    );
  }

  // Fire-and-forget: log to Notion audit DB
  logProfileCreationToNotion({
    displayName,
    googleEmail: session.user.email,
    wwuEmail,
    foundInNotion: !!notionPageId,
    notionPageId,
  }).catch((err) => {
    console.error("[profile/setup] Notion audit log failed:", err);
  });

  return NextResponse.json({ profile });
}
