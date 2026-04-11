/**
 * Parses Fillout-style "Session Attendees: N" lines out of event descriptions.
 */

/** Tailwind classes for the attendee count pill (see support thread status badges). */
export function sessionAttendeePillClass(count: number): string {
  if (count <= 5) {
    return "bg-emerald-500/20 text-emerald-200";
  }
  if (count <= 9) {
    return "bg-amber-500/20 text-amber-200";
  }
  return "bg-red-500/20 text-red-200";
}

export function extractSessionAttendeesLine(text: string): {
  count: number;
  rest: string;
} | null {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let matchIndex = -1;
  let count = 0;

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].trim().match(/^Session Attendees:\s*(\d+)\s*$/i);
    if (m) {
      matchIndex = i;
      count = Number.parseInt(m[1], 10);
      break;
    }
  }

  if (matchIndex < 0 || !Number.isFinite(count)) {
    return null;
  }

  const rest = lines
    .filter((_, i) => i !== matchIndex)
    .join("\n")
    .trim();

  return { count, rest };
}
