/**
 * @file Admin Friday-exception CRUD endpoint (`POST` / `DELETE /api/friday-exceptions`).
 *
 * **POST** opens the practice room on a specific Friday:
 * 1. Auth: requires admin session.
 * 2. Inserts a row into `friday_exceptions` for the given date.
 *
 * **DELETE** re-closes a previously-opened Friday:
 * 1. Auth: requires admin session.
 * 2. Removes the `friday_exceptions` row for the given date.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAppAdmin } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const email = session?.user?.email;

    if (!email || !(await isAppAdmin(email))) {
      return NextResponse.json(
        { error: "Admin access required." },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { date } = body;

    if (!date || typeof date !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid date." },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("friday_exceptions")
      .upsert(
        { exception_date: date, created_by: email.toLowerCase() },
        { onConflict: "exception_date" },
      );

    if (error) {
      console.error("[friday-exceptions] Supabase insert failed:", error);
      return NextResponse.json(
        { error: "Failed to save Friday exception." },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, date });
  } catch (error) {
    console.error("[friday-exceptions] Error creating exception:", error);
    return NextResponse.json(
      { error: "Failed to create Friday exception." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    const email = session?.user?.email;

    if (!email || !(await isAppAdmin(email))) {
      return NextResponse.json(
        { error: "Admin access required." },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { date } = body;

    if (!date || typeof date !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid date." },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("friday_exceptions")
      .delete()
      .eq("exception_date", date);

    if (error) {
      console.error("[friday-exceptions] Supabase delete failed:", error);
      return NextResponse.json(
        { error: "Failed to remove Friday exception." },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[friday-exceptions] Error deleting exception:", error);
    return NextResponse.json(
      { error: "Failed to delete Friday exception." },
      { status: 500 },
    );
  }
}
