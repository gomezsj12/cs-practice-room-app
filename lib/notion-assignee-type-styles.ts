/**
 * Notion People "Type" select colors (dark mode) for assignee pills and verify badges.
 * Keys are normalized lowercase; match on exact known labels from the workspace.
 */

export type NotionTypeVisual = {
  /** Pill: background + text (Tailwind classes) */
  pillClass: string;
  /** Verify badge disk fill (hex) */
  verifyFill: string;
};

const DEFAULT_VISUAL: NotionTypeVisual = {
  pillClass: "bg-neutral-700 text-neutral-200",
  verifyFill: "#6b7280",
};

/** Ordered so longer phrases match before shorter ones where needed. */
const NOTION_TYPE_ENTRIES: Array<{ match: string; visual: NotionTypeVisual }> = [
  {
    match: "dept sound leader",
    visual: {
      pillClass: "bg-[#5c4030] text-[#f2e4d9]",
      verifyFill: "#c45c28",
    },
  },
  {
    match: "dept manager",
    visual: {
      pillClass: "bg-[#4c3d6b] text-[#e8e2f4]",
      verifyFill: "#7c5cff",
    },
  },
  {
    match: "contact person",
    visual: {
      pillClass: "bg-[#5c5348] text-[#ede8e0]",
      verifyFill: "#a89472",
    },
  },
  {
    match: "leadership",
    visual: {
      pillClass: "bg-[#6b5a2e] text-[#f5edd2]",
      verifyFill: "#e3b429",
    },
  },
  {
    match: "scheduler",
    visual: {
      pillClass: "bg-[#6b3a32] text-[#f5ded9]",
      verifyFill: "#e0583a",
    },
  },
  {
    match: "training",
    visual: {
      pillClass: "bg-[#1e4a2f] text-[#d4ecdd]",
      verifyFill: "#22c55e",
    },
  },
  {
    match: "tech",
    visual: {
      pillClass: "bg-[#334155] text-[#e2e8f0]",
      verifyFill: "#4f9eff",
    },
  },
  {
    match: "tbd",
    visual: {
      pillClass: "bg-[#404040] text-[#e5e5e5]",
      verifyFill: "#6b7280",
    },
  },
];

export function notionTypeVisualForLabel(type: string | null): NotionTypeVisual {
  const key = (type ?? "").trim().toLowerCase();
  if (!key) return DEFAULT_VISUAL;
  for (const { match, visual } of NOTION_TYPE_ENTRIES) {
    if (key === match) return visual;
  }
  return DEFAULT_VISUAL;
}

export function notionTypePillClass(type: string | null): string {
  return notionTypeVisualForLabel(type).pillClass;
}
