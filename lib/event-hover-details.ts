import { getCalendarEventKindLabel } from "@/lib/calendar-events";

/** What the desktop hover card shows for one calendar event. */
export type EventHoverDetails = {
  title: string;
  when: string;
  kind: string;
  dotColor: string;
  tagLabel?: string;
  tagColor?: string;
};

type EventType = "practice" | "jam" | "hold" | "blocked";

/** Solid dots for the types whose card fill is translucent. */
const DOT_COLORS: Partial<Record<EventType, string>> = {
  hold: "#a3a3a3",
  blocked: "#ef4444",
};

const FALLBACK_TITLES: Partial<Record<EventType, string>> = {
  hold: "Pending hold",
  blocked: "Practice Room Closed",
};

/** Builds the hover card's lines from a FullCalendar event's fields. */
export function eventHoverDetails(input: {
  eventType?: EventType;
  title: string;
  color?: string;
  start: Date | null;
  timeText: string;
  adminTagLabel?: string;
  adminTagColor?: string;
}): EventHoverDetails {
  const type = input.eventType ?? "practice";
  const day = input.start
    ? input.start.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    : "";
  return {
    title: input.title.trim() || FALLBACK_TITLES[type] || "(No title)",
    when: [day, input.timeText].filter(Boolean).join(" · "),
    kind: type === "hold" ? "Temporary hold" : capitalize(getCalendarEventKindLabel(type)),
    dotColor: DOT_COLORS[type] ?? input.color ?? "#767676",
    ...(input.adminTagColor
      ? {
          tagColor: input.adminTagColor,
          tagLabel: input.adminTagLabel || "Private tag",
        }
      : {}),
  };
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
