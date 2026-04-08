import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCalendarClient } from "@/lib/google";
import { getSupabaseAdmin } from "@/lib/supabase";
import type {
  ApiCalendarEvent,
  GoogleApiEvent,
  HoldRow,
} from "@/lib/types";

function isNotNull<T>(value: T | null): value is T {
  return value !== null;
}

function mapGoogleEventToApiEvent(
  event: GoogleApiEvent,
  eventType: "practice" | "jam",
  currentUserEmail?: string,
  adminEmail?: string,
): ApiCalendarEvent | null {
  const start = event.start?.dateTime || event.start?.date;
  const end = event.end?.dateTime || event.end?.date;

  if (!event.id || !start || !end) {
    return null;
  }

  const ownerEmail =
    event.extendedProperties?.private?.ownerEmail?.toLowerCase() || "";
  const currentEmail = currentUserEmail?.toLowerCase() || "";
  const admin = adminEmail?.toLowerCase() || "";

  const canCancel =
    eventType === "jam" &&
    !!currentEmail &&
    (currentEmail === admin || (!!ownerEmail && currentEmail === ownerEmail));

  return {
    id: `${eventType}-${event.id}`,
    googleEventId: event.id,
    eventType,
    title:
      event.summary ||
      (eventType === "practice" ? "Practice booking" : "Jam hold"),
    start,
    end,
    color: eventType === "practice" ? "#767676" : "#3f56c9",
    textColor: "#ffffff",
    canCancel,
  };
}

function mapHoldToApiEvent(row: HoldRow): ApiCalendarEvent {
  return {
    id: `hold-${row.id}`,
    holdId: row.id,
    eventType: "hold",
    title: "Pending hold",
    start: row.start_at,
    end: row.end_at,
    color: "rgba(255, 255, 255, 0.14)",
    textColor: "#f5f5f5",
    canCancel: false,
    classNames: ["pending-hold-event"],
  };
}

export async function GET() {
  try {
    const session = await auth();
    const currentUserEmail = session?.user?.email || undefined;
    const adminEmail = process.env.ADMIN_EMAIL;

    const practiceCalendarId = process.env.PRACTICE_CALENDAR_ID;
    const jamCalendarId = process.env.JAM_CALENDAR_ID;

    if (!practiceCalendarId || !jamCalendarId) {
      return NextResponse.json(
        { error: "Missing calendar IDs in environment variables." },
        { status: 500 },
      );
    }

    const calendar = getCalendarClient();

    const timeMin = new Date();
    timeMin.setDate(timeMin.getDate() - 7);

    const timeMax = new Date();
    timeMax.setDate(timeMax.getDate() + 30);

    const [practiceResponse, jamResponse] = await Promise.all([
      calendar.events.list({
        calendarId: practiceCalendarId,
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
      }),
      calendar.events.list({
        calendarId: jamCalendarId,
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
      }),
    ]);

    const practiceEvents = (practiceResponse.data.items ?? [])
      .map((event) =>
        mapGoogleEventToApiEvent(
          event as GoogleApiEvent,
          "practice",
          currentUserEmail,
          adminEmail,
        ),
      )
      .filter(isNotNull);

    const jamEvents = (jamResponse.data.items ?? [])
      .map((event) =>
        mapGoogleEventToApiEvent(
          event as GoogleApiEvent,
          "jam",
          currentUserEmail,
          adminEmail,
        ),
      )
      .filter(isNotNull);

    let holdEvents: ApiCalendarEvent[] = [];

    if (process.env.ENABLE_TEMP_HOLDS === "true") {
      try {
        const supabase = getSupabaseAdmin();
        const nowIso = new Date().toISOString();

        const { data, error } = await supabase
          .from("reservation_holds")
          .select(
            "id, start_at, end_at, expires_at, owner_email, owner_name, status",
          )
          .eq("status", "pending")
          .gt("expires_at", nowIso)
          .order("start_at", { ascending: true });

        if (error) {
          throw error;
        }

        holdEvents = (data ?? []).map((row) => mapHoldToApiEvent(row as HoldRow));
      } catch (holdError) {
        console.error("Supabase hold loading failed:", holdError);
      }
    }

    return NextResponse.json([...practiceEvents, ...jamEvents, ...holdEvents]);
  } catch (error) {
    console.error("Error loading calendar events:", error);

    return NextResponse.json(
      { error: "Failed to load calendar events." },
      { status: 500 },
    );
  }
}