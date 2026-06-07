import { describe, expect, it } from "vitest";
import {
  buildPracticeCustomEventIdCandidatesFromGoogleEvent,
  buildPracticeCustomEventIdFromGoogleEvent,
  customEventIdCandidateStrings,
  extractPracticeCustomEventIdMetadataFromDescription,
  notionCustomEventIdMatchesAnyCandidate,
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
      "example@example.com",
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

  it("includes equals + starts_with candidates in utc and room time", () => {
    expect(
      buildPracticeCustomEventIdCandidatesFromGoogleEvent(
        event,
        "America/Los_Angeles",
      ),
    ).toEqual([
      {
        id: "GOOGLECALidentifier-may62026415am(utc)-may62026615am(utc)155555501006",
        matchMode: "equals",
      },
      {
        id: "GOOGLECALidentifier-may52026915pm(utc)-may520261115pm(utc)155555501006",
        matchMode: "equals",
      },
      {
        id: "GOOGLECALidentifier-may62026415am(utc)-may62026615am(utc)",
        matchMode: "starts_with",
      },
      {
        id: "GOOGLECALidentifier-may52026915pm(utc)-may520261115pm(utc)",
        matchMode: "starts_with",
      },
    ]);
  });

  it("dedups candidate id strings while keeping order", () => {
    expect(
      customEventIdCandidateStrings([
        { id: "a", matchMode: "equals" },
        { id: "a", matchMode: "starts_with" },
        { id: "b", matchMode: "starts_with" },
      ]),
    ).toEqual(["a", "b"]);
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

  describe("description without a 10+ digit phone", () => {
    // Regression case from the live UI: a contact phone that is only 9 digits
    // (e.g. "555550100") doesn't satisfy `PHONE_RE`'s 10+ digit requirement,
    // so metadata extraction returns null and the app can only build the
    // time-only candidate strings.
    //
    // BUT the Notion-side ID generation (Fillout / backfill script) appends
    // the rollup phone + attendee count without any length guard, so the
    // stored ID looks like `<prefix>5555501009`. Without a `starts_with`
    // candidate, the equals lookup misses every time and the modal silently
    // shows no Notion link.
    const shortPhoneEvent: GoogleApiEvent = {
      summary: "Spring Jam  - Example Booker",
      description: [
        "Contact Person:",
        "",
        "Example Booker",
        "example.booker@example.com",
        "555550100",
        "https://t.me/example/",
        "",
        "Session Attendees: 9",
      ].join("\n"),
      start: { dateTime: "2026-05-03T20:15:00-07:00" },
      end: { dateTime: "2026-05-03T22:15:00-07:00" },
    };

    it("returns null metadata when phone is shorter than 10 digits", () => {
      expect(
        extractPracticeCustomEventIdMetadataFromDescription(
          shortPhoneEvent.description,
        ),
      ).toBeNull();
    });

    it("emits only starts_with candidates so a suffixed Notion id still matches", () => {
      const candidates = buildPracticeCustomEventIdCandidatesFromGoogleEvent(
        shortPhoneEvent,
        "America/Los_Angeles",
      );
      // No `equals` candidates because metadata is missing — only the
      // time-only prefixes, which must be queried with `starts_with`.
      expect(candidates.every((c) => c.matchMode === "starts_with")).toBe(true);
      expect(candidates.map((c) => c.id)).toEqual([
        "GOOGLECALidentifier-may42026315am(utc)-may42026515am(utc)",
        "GOOGLECALidentifier-may32026815pm(utc)-may320261015pm(utc)",
      ]);
    });

    it("matches the Notion-stored id with the appended phone+attendees suffix", () => {
      const candidates = buildPracticeCustomEventIdCandidatesFromGoogleEvent(
        shortPhoneEvent,
        "America/Los_Angeles",
      );
      const storedInNotion =
        "GOOGLECALidentifier-may42026315am(utc)-may42026515am(utc)5555501009";
      expect(
        notionCustomEventIdMatchesAnyCandidate(storedInNotion, candidates),
      ).toBe(true);
    });

    it("does NOT match a Notion id whose time prefix is different", () => {
      const candidates = buildPracticeCustomEventIdCandidatesFromGoogleEvent(
        shortPhoneEvent,
        "America/Los_Angeles",
      );
      const otherEventStoredInNotion =
        "GOOGLECALidentifier-may42026400pm(utc)-may42026600pm(utc)5555501009";
      expect(
        notionCustomEventIdMatchesAnyCandidate(
          otherEventStoredInNotion,
          candidates,
        ),
      ).toBe(false);
    });
  });

  describe("notionCustomEventIdMatchesAnyCandidate", () => {
    it("matches case-insensitively for both equals and starts_with", () => {
      const candidates = [
        {
          id: "GOOGLECALidentifier-may62026200am(utc)-may62026400am(utc)5555501009",
          matchMode: "equals" as const,
        },
        {
          id: "GOOGLECALidentifier-may62026200am(utc)-may62026400am(utc)",
          matchMode: "starts_with" as const,
        },
      ];
      expect(
        notionCustomEventIdMatchesAnyCandidate(
          "googlecalidentifier-may62026200am(utc)-may62026400am(utc)5555501009",
          candidates,
        ),
      ).toBe(true);
    });

    it("rejects empty stored ids", () => {
      expect(
        notionCustomEventIdMatchesAnyCandidate("", [
          { id: "anything", matchMode: "equals" },
        ]),
      ).toBe(false);
      expect(
        notionCustomEventIdMatchesAnyCandidate("   ", [
          { id: "anything", matchMode: "starts_with" },
        ]),
      ).toBe(false);
    });

    it("does not silently match an empty candidate id (would prefix-match anything)", () => {
      expect(
        notionCustomEventIdMatchesAnyCandidate("anything", [
          { id: "", matchMode: "starts_with" },
        ]),
      ).toBe(false);
    });
  });
});
