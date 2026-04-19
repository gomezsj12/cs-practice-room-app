/**
 * Practice session status options, colors, and grouping for the admin
 * status dropdown. Mirrors the Notion "Session Status" status property
 * on the Fillout Form Master Database (Form Submissions data source).
 *
 * "Cancelled" and "CHANGE TO A STATUS" are excluded from the dropdown;
 * cancellation uses the existing cancel-booking flow.
 */

export type PracticeSessionStatusOption = {
  name: string;
  color: string;
  /** Darker variant used for calendar event outlines. */
  outlineColor: string;
  group: string | null;
};

export const PRACTICE_SESSION_STATUSES: PracticeSessionStatusOption[] = [
  { name: "Session Scheduled", color: "#8b8b8b", outlineColor: "#8b8b8b", group: null },
  { name: "Session Being Planned", color: "#4a90d9", outlineColor: "#2a5f9e", group: "In progress" },
  {
    name: "[V/M] Assignee(s) Scheduled",
    color: "#c4a84b",
    outlineColor: "#8a7530",
    group: "In progress",
  },
  { name: "Done", color: "#4e8a5c", outlineColor: "#2f5e3a", group: "Complete" },
];

const STATUS_COLOR_MAP = new Map(
  PRACTICE_SESSION_STATUSES.map((s) => [s.name, s.color]),
);

const STATUS_OUTLINE_COLOR_MAP = new Map(
  PRACTICE_SESSION_STATUSES.map((s) => [s.name, s.outlineColor]),
);

/** Fallback neutral color for unknown statuses. */
const DEFAULT_STATUS_COLOR = "#767676";
const DEFAULT_OUTLINE_COLOR = "#767676";

export function getStatusColor(statusName: string | null | undefined): string {
  if (!statusName) return DEFAULT_STATUS_COLOR;
  return STATUS_COLOR_MAP.get(statusName) ?? DEFAULT_STATUS_COLOR;
}

export function getStatusOutlineColor(statusName: string | null | undefined): string {
  if (!statusName) return DEFAULT_OUTLINE_COLOR;
  return STATUS_OUTLINE_COLOR_MAP.get(statusName) ?? DEFAULT_OUTLINE_COLOR;
}

export function isKnownPracticeStatus(
  name: string | null | undefined,
): boolean {
  if (!name) return false;
  return STATUS_COLOR_MAP.has(name);
}
