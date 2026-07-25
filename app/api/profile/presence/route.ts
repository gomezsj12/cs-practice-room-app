/**
 * @file `POST /api/profile/presence`: updates App Profile Creation Logs
 * presence fields (Is Active, Last Active At) for the signed-in user.
 *
 * @see {@link @/hooks/useProfilePresence}: client caller
 * @see {@link @/lib/notion}: `syncProfileLogPresenceToNotion`
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { syncProfileLogPresenceToNotion } from "@/lib/notion";

export async function POST(req: Request) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!process.env.NOTION_PROFILE_LOG_DB_ID) {
    console.warn("[profile/presence] NOTION_PROFILE_LOG_DB_ID not set; skipping");
    return NextResponse.json({ ok: false, skipped: true }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || !("active" in body)) {
    return NextResponse.json({ error: "Missing active boolean" }, { status: 400 });
  }

  const active = (body as { active?: unknown }).active;
  if (typeof active !== "boolean") {
    return NextResponse.json({ error: "active must be a boolean" }, { status: 400 });
  }

  try {
    await syncProfileLogPresenceToNotion(email, active);
  } catch (err) {
    console.error("[profile/presence] Notion update failed:", err);
    return NextResponse.json({ error: "Presence sync failed" }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
