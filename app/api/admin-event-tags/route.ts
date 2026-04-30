/**
 * @file Admin-private calendar tag endpoint.
 *
 * `PUT /api/admin-event-tags`
 * Upserts a private tag for one admin on one event.
 *
 * `DELETE /api/admin-event-tags`
 * Removes that private tag.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAppAdmin } from "@/lib/admin";
import {
  deleteAdminEventTag,
  getAdminEventTagOption,
  isAdminEventTagKey,
  isAdminEventTaggableEventType,
  upsertAdminEventTag,
} from "@/lib/admin-event-tags";

export async function PUT(request: NextRequest) {
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
    const {
      eventType,
      googleEventId,
      eventTitle,
      eventStart,
      eventEnd,
      tagKey,
    } = body ?? {};

    if (!isAdminEventTaggableEventType(eventType)) {
      return NextResponse.json(
        { error: "Invalid event type." },
        { status: 400 },
      );
    }
    if (!googleEventId || typeof googleEventId !== "string") {
      return NextResponse.json(
        { error: "Missing Google event ID." },
        { status: 400 },
      );
    }
    if (!eventTitle || typeof eventTitle !== "string") {
      return NextResponse.json(
        { error: "Missing event title." },
        { status: 400 },
      );
    }
    if (!eventStart || typeof eventStart !== "string") {
      return NextResponse.json(
        { error: "Missing event start time." },
        { status: 400 },
      );
    }
    if (!eventEnd || typeof eventEnd !== "string") {
      return NextResponse.json(
        { error: "Missing event end time." },
        { status: 400 },
      );
    }
    if (!isAdminEventTagKey(tagKey)) {
      return NextResponse.json(
        { error: "Invalid private tag color." },
        { status: 400 },
      );
    }

    await upsertAdminEventTag({
      adminEmail: email,
      eventType,
      googleEventId,
      eventTitle,
      eventStart,
      eventEnd,
      tagKey,
    });

    const option = getAdminEventTagOption(tagKey);
    return NextResponse.json({
      success: true,
      tag: option,
    });
  } catch (error) {
    console.error("[admin-event-tags] Failed to save tag:", error);
    return NextResponse.json(
      { error: "Failed to save private tag." },
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
    const { eventType, googleEventId } = body ?? {};

    if (!isAdminEventTaggableEventType(eventType)) {
      return NextResponse.json(
        { error: "Invalid event type." },
        { status: 400 },
      );
    }
    if (!googleEventId || typeof googleEventId !== "string") {
      return NextResponse.json(
        { error: "Missing Google event ID." },
        { status: 400 },
      );
    }

    await deleteAdminEventTag({
      adminEmail: email,
      eventType,
      googleEventId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[admin-event-tags] Failed to delete tag:", error);
    return NextResponse.json(
      { error: "Failed to clear private tag." },
      { status: 500 },
    );
  }
}
