import { describe, expect, it } from "vitest";
import {
  buildPracticeCustomEventIdCandidatesFromGoogleEvent,
  buildPracticeCustomEventIdFromGoogleEvent,
  extractPracticeCustomEventIdMetadataFromDescription,
  parsePracticeCustomEventId,
} from "@/lib/practice-custom-event-id";
import type { GoogleApiEvent } from "@/lib/types";

describe("practice custom event ids", () => {
  const event: GoogleApiEvent = {
    summary: "Practice - Example Booker",
    description: [
      "Contact Person:",
      "Example Booker",
      "+1 (555) 555-0100",
      "example@wallawalla.edu",
      "",
      "Session Attendees: 6",
    ].join("\n"),
    start: {
      dateTime: "2026-05-05T21:15:00-07:00",
    },
    end: {
      dateTime: "2026-05-05T23:15:00-07:00",
    },
  };

  it("extracts phone digits and attendee count from the description", () => {
    expect(
      extractPracticeCustomEventIdMetadataFromDescription(event.description),
    ).toEqual({
      phoneDigits: "15555550100",
      attendeeCount: 6,
    });
  });

  it("builds the canonical id with phone digits before attendee count", () => {
    expect(buildPracticeCustomEventIdFromGoogleEvent(event)).toBe(
      "GOOGLECALidentifier-may62026415am(utc)-may62026615am(utc)155555501006",
    );
  });

  it("includes canonical and legacy candidates in utc and room time", () => {
    expect(
      buildPracticeCustomEventIdCandidatesFromGoogleEvent(
        event,
        "America/Los_Angeles",
      ),
    ).toEqual([
      "GOOGLECALidentifier-may62026415am(utc)-may62026615am(utc)155555501006",
      "GOOGLECALidentifier-may52026915pm(utc)-may520261115pm(utc)155555501006",
      "GOOGLECALidentifier-may62026415am(utc)-may62026615am(utc)",
      "GOOGLECALidentifier-may52026915pm(utc)-may520261115pm(utc)",
    ]);
  });

  it("parses the time range from ids with the metadata suffix", () => {
    expect(
      parsePracticeCustomEventId(
        "GOOGLECALidentifier-may62026415am(utc)-may62026615am(utc)155555501006",
      ),
    ).toEqual({
      start: new Date("2026-05-06T04:15:00.000Z"),
      end: new Date("2026-05-06T06:15:00.000Z"),
    });
  });
});
