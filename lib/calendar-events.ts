import type { CalendarEventAttendee, GoogleApiEvent } from "@/lib/types";

/** User-facing label used in the calendar UI for a cancelable event type. */
export function getCalendarEventKindLabel(
  eventType?: "practice" | "jam" | "hold",
) {
  if (eventType === "practice") {
    return "practice booking";
  }
  if (eventType === "jam") {
    return "jam reservation";
  }
  return "calendar event";
}

/** Remove the Fillout footer line while preserving the rest of the text. */
export function cleanCalendarEventDescription(
  description?: string | null,
): string | undefined {
  if (!description) {
    return undefined;
  }

  const filteredLines = description
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => !/^Powered by Fillout\.com\b/i.test(line.trim()));

  while (
    filteredLines.length > 0 &&
    filteredLines[filteredLines.length - 1]?.trim() === ""
  ) {
    filteredLines.pop();
  }

  const cleaned = filteredLines.join("\n").trim();
  return cleaned || undefined;
}

/** Keep only attendee fields the app actually uses and trims blank values. */
export function sanitizeCalendarEventAttendees(
  attendees?: GoogleApiEvent["attendees"],
): CalendarEventAttendee[] | undefined {
  if (!attendees?.length) {
    return undefined;
  }

  const cleaned = attendees
    .map((attendee) => ({
      email: attendee.email?.trim() || undefined,
      displayName: attendee.displayName?.trim() || undefined,
    }))
    .filter((attendee) => attendee.email || attendee.displayName);

  return cleaned.length > 0 ? cleaned : undefined;
}

/** Extract the booker's display name from titles like `Ministry 4/11 - Gabe Torres`. */
export function getPracticeBookerNameFromTitle(
  title?: string | null,
): string | undefined {
  const trimmedTitle = title?.trim();
  if (!trimmedTitle) {
    return undefined;
  }

  const parts = trimmedTitle.split(" - ");
  if (parts.length < 2) {
    return undefined;
  }

  const candidate = parts[parts.length - 1]?.trim();
  return candidate || undefined;
}

/** Jam events remain cancellable by their owner or the configured admin. */
export function canUserCancelJamEvent(
  event: Pick<GoogleApiEvent, "extendedProperties">,
  currentUserEmail?: string | null,
  adminEmail?: string | null,
) {
  const ownerEmail =
    event.extendedProperties?.private?.ownerEmail?.trim().toLowerCase() || "";
  const currentEmail = currentUserEmail?.trim().toLowerCase() || "";
  const admin = adminEmail?.trim().toLowerCase() || "";

  return (
    !!currentEmail &&
    (currentEmail === admin || (!!ownerEmail && currentEmail === ownerEmail))
  );
}

/**
 * Practice cancellations require both:
 * 1. the linked WWU email to appear in attendees
 * 2. the current user's name to match the title segment after the hyphen
 */
export function canUserCancelPracticeEvent(
  event: Pick<GoogleApiEvent, "summary" | "attendees">,
  currentUserWwuEmail?: string | null,
  userDisplayNames: Array<string | null | undefined> = [],
) {
  const normalizedWwuEmail = normalizeEmail(currentUserWwuEmail);
  if (!normalizedWwuEmail) {
    return false;
  }

  const attendees = sanitizeCalendarEventAttendees(event.attendees);
  const attendeeMatch = attendees?.some(
    (attendee) => normalizeEmail(attendee.email) === normalizedWwuEmail,
  );

  if (!attendeeMatch) {
    return false;
  }

  const bookerName = normalizeNameForComparison(
    getPracticeBookerNameFromTitle(event.summary),
  );

  if (!bookerName) {
    return false;
  }

  const normalizedUserNames = new Set(
    [
      ...userDisplayNames,
      getNameCandidateFromWwuEmail(currentUserWwuEmail),
    ]
      .map((name) => normalizeNameForComparison(name))
      .filter(Boolean),
  );

  return normalizedUserNames.has(bookerName);
}

function normalizeEmail(email?: string | null) {
  return email?.trim().toLowerCase() || "";
}

function getNameCandidateFromWwuEmail(email?: string | null) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail.includes("@")) {
    return "";
  }

  return normalizedEmail
    .split("@")[0]
    .split(".")
    .join(" ");
}

function normalizeNameForComparison(name?: string | null) {
  if (!name) {
    return "";
  }

  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
