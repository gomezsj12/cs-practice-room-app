/**
 * @file Temporary hold release endpoint (`POST /api/holds/release`).
 *
 * Allows the hold owner or the admin to explicitly delete a pending hold
 * before its TTL expires (e.g. when the user closes the reservation dialog
 * without booking).
 *
 * Ownership check: the signed-in user's email must match either the hold's
 * `owner_email` or the `ADMIN_EMAIL` env var. If the hold no longer exists
 * (already expired or already released) the endpoint returns `{ success: true }`
 * to keep the client idempotent.
 *
 * When `ENABLE_TEMP_HOLDS` is not `"true"`, the route short-circuits with
 * a success response because there's nothing to release.
 *
 * @see {@link @/app/api/holds/create/route}: creates the hold
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { HoldRow } from "@/lib/types";

/**
 * Handles `POST /api/holds/release`.
 *
 * Accepts `{ holdId }` and deletes the matching Supabase row after verifying
 * ownership or admin privilege.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const currentUserEmail = session?.user?.email?.toLowerCase();
    const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();

    if (!currentUserEmail) {
      return NextResponse.json(
        { error: "You must sign in to release a hold." },
        { status: 401 },
      );
    }

    if (process.env.ENABLE_TEMP_HOLDS !== "true") {
      return NextResponse.json({ success: true });
    }

    const body = await request.json();
    const holdId = body.holdId?.trim();

    if (!holdId) {
      return NextResponse.json(
        { error: "Missing holdId." },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: hold, error: fetchError } = await supabase
      .from("reservation_holds")
      .select("id, owner_email")
      .eq("id", holdId)
      .maybeSingle();

    if (fetchError) {
      throw fetchError;
    }

    if (!hold) {
      return NextResponse.json({ success: true });
    }

    const typedHold = hold as HoldRow;
    const ownerEmail = typedHold.owner_email.toLowerCase();

    const canRelease =
      currentUserEmail === adminEmail || currentUserEmail === ownerEmail;

    if (!canRelease) {
      return NextResponse.json(
        { error: "You cannot release another user's hold." },
        { status: 403 },
      );
    }

    const { error: deleteError } = await supabase
      .from("reservation_holds")
      .delete()
      .eq("id", holdId);

    if (deleteError) {
      throw deleteError;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error releasing hold:", error);

    return NextResponse.json(
      { error: "Failed to release hold." },
      { status: 500 },
    );
  }
}