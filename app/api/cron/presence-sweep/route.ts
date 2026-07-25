/**
 * @file `POST /api/cron/presence-sweep`: marks stale Notion profile-log rows
 * as inactive (Is Active = false) when Last Active At is older than ~2 minutes.
 *
 * Called every minute by a Supabase pg_cron + pg_net job (stale threshold stays
 * 2 minutes so active users are not cleared between 60s heartbeats).
 * Authorized via `CRON_SECRET` Bearer token (same as quarter sync).
 */
import { NextRequest, NextResponse } from "next/server";
import { sweepStalePresenceInNotion } from "@/lib/notion";

const STALE_AFTER_MS = 120_000;

function authorizeCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function POST(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const swept = await sweepStalePresenceInNotion(STALE_AFTER_MS);
    return NextResponse.json({ ok: true, swept });
  } catch (e) {
    console.error("[cron/presence-sweep]", e);
    const message = e instanceof Error ? e.message : "Sweep failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
