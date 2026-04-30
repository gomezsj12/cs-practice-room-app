/**
 * Admin-only calendar event tags.
 *
 * Tags are private to one admin user and decorate shared calendar events
 * without mutating Google Calendar or Notion data.
 */

import { getSupabaseAdmin } from "@/lib/supabase";

export const ADMIN_EVENT_TAG_OPTIONS = [
  {
    value: "amber",
    label: "Amber",
    color: "#f59e0b",
    overlayColor: "rgba(245, 158, 11, 0.18)",
  },
  {
    value: "rose",
    label: "Rose",
    color: "#fb7185",
    overlayColor: "rgba(251, 113, 133, 0.18)",
  },
  {
    value: "emerald",
    label: "Emerald",
    color: "#34d399",
    overlayColor: "rgba(52, 211, 153, 0.18)",
  },
  {
    value: "orange",
    label: "Orange",
    color: "#f97316",
    overlayColor: "rgba(249, 115, 22, 0.18)",
  },
  {
    value: "lime",
    label: "Lime",
    color: "#a3e635",
    overlayColor: "rgba(163, 230, 53, 0.18)",
  },
] as const;

const ADMIN_EVENT_TAG_OPTION_MAP = new Map(
  ADMIN_EVENT_TAG_OPTIONS.map((option) => [option.value, option]),
);

export type AdminEventTagKey = (typeof ADMIN_EVENT_TAG_OPTIONS)[number]["value"];
export type AdminEventTaggableEventType = "practice" | "jam";

export type AdminEventTagRow = {
  id: string;
  admin_email: string;
  event_type: AdminEventTaggableEventType;
  google_event_id: string;
  event_title: string;
  event_start: string;
  event_end: string;
  tag_key: AdminEventTagKey;
  created_at: string;
  updated_at: string;
};

export function isAdminEventTaggableEventType(
  value: string | null | undefined,
): value is AdminEventTaggableEventType {
  return value === "practice" || value === "jam";
}

export function isAdminEventTagKey(
  value: string | null | undefined,
): value is AdminEventTagKey {
  if (!value) {
    return false;
  }
  return ADMIN_EVENT_TAG_OPTION_MAP.has(value as AdminEventTagKey);
}

export function getAdminEventTagOption(
  value: string | null | undefined,
) {
  if (!value) {
    return null;
  }
  return ADMIN_EVENT_TAG_OPTION_MAP.get(value as AdminEventTagKey) ?? null;
}

export function getAdminEventTagLookupKey(
  eventType: AdminEventTaggableEventType,
  googleEventId: string,
) {
  return `${eventType}:${googleEventId}`;
}

export async function getAdminEventTagsForEvents(
  adminEmail: string,
  events: Array<{
    eventType: AdminEventTaggableEventType;
    googleEventId: string;
  }>,
): Promise<Map<string, AdminEventTagRow>> {
  const dedupedIds = [...new Set(events.map((event) => event.googleEventId))];
  if (dedupedIds.length === 0) {
    return new Map();
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("admin_event_tags")
    .select(
      "id, admin_email, event_type, google_event_id, event_title, event_start, event_end, tag_key, created_at, updated_at",
    )
    .eq("admin_email", adminEmail.trim().toLowerCase())
    .in("event_type", ["practice", "jam"])
    .in("google_event_id", dedupedIds);

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as AdminEventTagRow[];
  const map = new Map<string, AdminEventTagRow>();
  for (const row of rows) {
    map.set(
      getAdminEventTagLookupKey(row.event_type, row.google_event_id),
      row,
    );
  }
  return map;
}

export async function upsertAdminEventTag(input: {
  adminEmail: string;
  eventType: AdminEventTaggableEventType;
  googleEventId: string;
  eventTitle: string;
  eventStart: string;
  eventEnd: string;
  tagKey: AdminEventTagKey;
}) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("admin_event_tags").upsert(
    {
      admin_email: input.adminEmail.trim().toLowerCase(),
      event_type: input.eventType,
      google_event_id: input.googleEventId,
      event_title: input.eventTitle,
      event_start: input.eventStart,
      event_end: input.eventEnd,
      tag_key: input.tagKey,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "admin_email,event_type,google_event_id" },
  );

  if (error) {
    throw error;
  }
}

export async function deleteAdminEventTag(input: {
  adminEmail: string;
  eventType: AdminEventTaggableEventType;
  googleEventId: string;
}) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("admin_event_tags")
    .delete()
    .eq("admin_email", input.adminEmail.trim().toLowerCase())
    .eq("event_type", input.eventType)
    .eq("google_event_id", input.googleEventId);

  if (error) {
    throw error;
  }
}
