import { describe, expect, it } from "vitest";
import { eventHoverDetails } from "./event-hover-details";

const start = new Date(2026, 9, 14, 15, 0);

describe("eventHoverDetails", () => {
  it("joins the day and time range", () => {
    const details = eventHoverDetails({
      eventType: "jam",
      title: "Band night",
      color: "#3f56c9",
      start,
      timeText: "3:00 - 4:00 PM",
    });
    expect(details).toEqual({
      title: "Band night",
      when: "Wed, Oct 14 · 3:00 - 4:00 PM",
      kind: "Jam reservation",
      dotColor: "#3f56c9",
    });
  });

  it("gives translucent types a solid dot and a fallback title", () => {
    const details = eventHoverDetails({
      eventType: "blocked",
      title: "  ",
      color: "rgba(239,68,68,0.16)",
      start,
      timeText: "3:00 - 4:00 PM",
    });
    expect(details.title).toBe("Practice Room Closed");
    expect(details.kind).toBe("Blocked time");
    expect(details.dotColor).toBe("#ef4444");
  });

  it("includes the private tag only when the event carries one", () => {
    const tagged = eventHoverDetails({
      eventType: "practice",
      title: "Alex - Drums",
      start,
      timeText: "",
      adminTagColor: "#34d399",
    });
    expect(tagged.tagColor).toBe("#34d399");
    expect(tagged.tagLabel).toBe("Private tag");
    expect(tagged.when).toBe("Wed, Oct 14");

    const untagged = eventHoverDetails({
      title: "Alex - Drums",
      start: null,
      timeText: "",
      adminTagLabel: "Follow up",
    });
    expect(untagged.tagLabel).toBeUndefined();
    expect(untagged.kind).toBe("Practice booking");
    expect(untagged.when).toBe("");
  });
});
