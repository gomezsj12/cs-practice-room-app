/**
 * @file Scheduled + manual sync: Notion **WWU Quarters** → Supabase `wwu_quarters`.
 *
 * Vercel Cron invokes **GET** with `Authorization: Bearer ${CRON_SECRET}` when
 * `CRON_SECRET` is set on the project. **POST** is supported for manual runs
 * with the same header.
 */
import { NextRequest, NextResponse } from "next/server";

import { syncWwuQuartersFromNotion } from "@/lib/notion-quarters-sync";

function authorizeCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return false;
  }
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

async function handleSync() {
  try {
    const result = await syncWwuQuartersFromNotion();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[cron/sync-quarters]", e);
    const message = e instanceof Error ? e.message : "Sync failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET?.trim()) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured." },
      { status: 500 },
    );
  }
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  return handleSync();
}

export async function POST(request: NextRequest) {
  if (!process.env.CRON_SECRET?.trim()) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured." },
      { status: 500 },
    );
  }
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  return handleSync();
}
