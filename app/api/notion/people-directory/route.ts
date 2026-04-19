/**
 * @file GET /api/notion/people-directory
 *
 * Admin-only. Returns the People directory as assignee summaries for the
 * calendar assignee picker. Backed by server-side cached Notion pagination
 * (~15 min revalidate via {@link getCachedPeopleDirectorySummaries}).
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAppAdmin } from "@/lib/admin";
import { getCachedPeopleDirectorySummaries } from "@/lib/notion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await auth();
    const email = session?.user?.email;

    if (!email || !(await isAppAdmin(email))) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const people = await getCachedPeopleDirectorySummaries();
    return NextResponse.json({ people });
  } catch (error) {
    console.error("[notion/people-directory] Error:", error);
    return NextResponse.json(
      { error: "Failed to load people directory." },
      { status: 500 },
    );
  }
}
