/**
 * Notion webhook branch: when a calendar-linked page's status is set to
 * **Cancelled**, delete the matching Google Calendar event (unless the cancel
 * was stamped by `/api/cancel` via {@link NOTION_CSPR_CANCEL_ORIGIN_CALENDAR_APP}).
 *
 * Handles both:
 * - **Jam** rows (parent = `NOTION_DATA_SOURCE_ID`) keyed by **Google Event ID**.
 * - **Practice / Fillout** rows (parent = `NOTION_FILLOUT_MASTER_DATA_SOURCE_ID`)
 *   keyed by **Custom Event ID** (parsed to start/end, then matched against the
 *   practice Google Calendar).
 */
import { deleteGoogleCalendarEventIdempotent } from "@/lib/google-calendar-webhook-delete";
import { getCalendarClient } from "@/lib/google";
import { getEventEnd, getEventStart } from "@/lib/calendar-helpers";
import { getNotionClientForRealm } from "@/lib/notion-clients";
import { getNotionPageParentIds } from "@/lib/notion";
import {
  NOTION_CSPR_CANCEL_ORIGIN_CALENDAR_APP,
  NOTION_CSPR_CANCEL_ORIGIN_PROPERTY,
} from "@/lib/notion-sync-constants";
import {
  parsePracticeCustomEventId,
  parsePracticeCustomEventIdAsRoomWallClock,
} from "@/lib/practice-custom-event-id";
import type { GoogleApiEvent } from "@/lib/types";

const JAM_STATUS_PROP = "Status";
const JAM_GOOGLE_EVENT_ID_PROP = "Google Event ID";
const PRACTICE_SESSION_STATUS_PROP = "Session Status";
const PRACTICE_CUSTOM_EVENT_ID_PROP = "Custom Event ID";

type CalendarCancelPageProp = {
  type: string;
  rich_text?: Array<{ plain_text?: string }>;
  title?: Array<{ plain_text?: string }>;
  select?: { name?: string | null } | null;
  status?: { name?: string | null } | null;
  formula?:
    | { type: "string"; string?: string | null }
    | { type: "number"; number?: number | null }
    | { type: "boolean"; boolean?: boolean | null }
    | { type: "date"; date?: unknown }
    | null;
};

function notionPlainTextProperty(
  props: Record<string, CalendarCancelPageProp>,
  name: string,
): string | null {
  const p = props[name];
  if (!p) {
    return null;
  }
  if (p.type === "rich_text" && p.rich_text?.length) {
    const text = p.rich_text
      .map((c) => c.plain_text ?? "")
      .join("")
      .trim();
    return text || null;
  }
  if (p.type === "title" && p.title?.length) {
    const text = p.title
      .map((c) => c.plain_text ?? "")
      .join("")
      .trim();
    return text || null;
  }
  if (p.type === "formula" && p.formula?.type === "string") {
    const s = p.formula.string?.trim();
    return s || null;
  }
  return null;
}

/** Notion "Status" columns are often `status` (board column), not `select`. */
function selectOrStatusName(
  prop: CalendarCancelPageProp | undefined,
): string | null {
  if (!prop) {
    return null;
  }
  if (prop.type === "select") {
    return prop.select?.name?.trim() ?? null;
  }
  if (prop.type === "status") {
    return prop.status?.name?.trim() ?? null;
  }
  return null;
}

function isCancelledNotionStatus(name: string | null): boolean {
  if (!name) {
    return false;
  }
  const n = name.trim().toLowerCase();
  return n === "cancelled" || n === "canceled";
}

function calendarWebhookDebugEnabled() {
  return process.env.NOTION_WEBHOOK_CALENDAR_DEBUG === "1";
}

export type NotionCalendarCancelWebhookResult =
  | { outcome: "not_calendar_page" }
  | { outcome: "skipped_app_cancelled" }
  | { outcome: "noop_missing_fields" }
  | { outcome: "deleted_jam"; eventId: string }
  | { outcome: "deleted_practice"; eventId: string }
  | { outcome: "error"; message: string };

type NotionPageForCalendarCancel = Parameters<
  typeof getNotionPageParentIds
>[0] & {
  id?: string;
  properties?: Record<string, CalendarCancelPageProp>;
};

/**
 * If this page is a jam or practice row marked Cancelled (and not app-stamped),
 * delete the matching Google Calendar event. Uses an already-retrieved page
 * (no extra `pages.retrieve`).
 */
export async function processNotionCalendarCancellationFromPage(
  page: NotionPageForCalendarCancel,
): Promise<NotionCalendarCancelWebhookResult> {
  const jamDs = process.env.NOTION_DATA_SOURCE_ID?.trim();
  const practiceDs = process.env.NOTION_FILLOUT_MASTER_DATA_SOURCE_ID?.trim();

  if (!jamDs && !practiceDs) {
    return { outcome: "not_calendar_page" };
  }

  if (!("properties" in page) || !page.properties) {
    return { outcome: "not_calendar_page" };
  }

  const parentIds = getNotionPageParentIds(page);
  const props = page.properties as Record<string, CalendarCancelPageProp>;

  const origin = notionPlainTextProperty(props, NOTION_CSPR_CANCEL_ORIGIN_PROPERTY);
  const stampedByApp = origin === NOTION_CSPR_CANCEL_ORIGIN_CALENDAR_APP;

  const isJamPage = Boolean(jamDs && parentIds.includes(jamDs));
  const isPracticePage = Boolean(practiceDs && parentIds.includes(practiceDs));

  if (calendarWebhookDebugEnabled()) {
    console.info("[notion webhook] calendar debug", {
      pageId: page.id,
      parent: page.parent,
      parentIds,
      jamDsConfigured: Boolean(jamDs),
      practiceDsConfigured: Boolean(practiceDs),
      isJamPage,
      isPracticePage,
      jamStatus: selectOrStatusName(props[JAM_STATUS_PROP]),
      practiceStatus: selectOrStatusName(props[PRACTICE_SESSION_STATUS_PROP]),
    });
  }

  /* ---- Jam branch (keyed by Google Event ID) ---- */

  if (isJamPage && jamDs) {
    const statusName = selectOrStatusName(props[JAM_STATUS_PROP]);
    if (!isCancelledNotionStatus(statusName)) {
      return { outcome: "not_calendar_page" };
    }
    if (stampedByApp) {
      return { outcome: "skipped_app_cancelled" };
    }
    const eventId = notionPlainTextProperty(props, JAM_GOOGLE_EVENT_ID_PROP);
    if (!eventId) {
      return { outcome: "noop_missing_fields" };
    }
    const jamCalendarId = process.env.JAM_CALENDAR_ID;
    if (!jamCalendarId) {
      return { outcome: "error", message: "Missing JAM_CALENDAR_ID" };
    }
    try {
      await deleteGoogleCalendarEventIdempotent(
        getCalendarClient(),
        jamCalendarId,
        eventId,
      );
      return { outcome: "deleted_jam", eventId };
    } catch (err) {
      console.error("[notion webhook] Jam calendar delete failed:", err);
      return {
        outcome: "error",
        message: err instanceof Error ? err.message : "calendar delete failed",
      };
    }
  }

  /* ---- Practice / Fillout branch (keyed by Custom Event ID → time match) ---- */

  if (isPracticePage && practiceDs) {
    const statusName = selectOrStatusName(props[PRACTICE_SESSION_STATUS_PROP]);
    if (!isCancelledNotionStatus(statusName)) {
      return { outcome: "not_calendar_page" };
    }
    if (stampedByApp) {
      return { outcome: "skipped_app_cancelled" };
    }

    const customEventId = notionPlainTextProperty(props, PRACTICE_CUSTOM_EVENT_ID_PROP);
    if (!customEventId) {
      return { outcome: "noop_missing_fields" };
    }

    const practiceCalendarId = process.env.PRACTICE_CALENDAR_ID;
    if (!practiceCalendarId) {
      return { outcome: "error", message: "Missing PRACTICE_CALENDAR_ID" };
    }

    const roomTz = process.env.ROOM_TIME_ZONE || "America/Los_Angeles";
    const parsed =
      parsePracticeCustomEventId(customEventId) ??
      parsePracticeCustomEventIdAsRoomWallClock(customEventId, roomTz);

    if (!parsed) {
      console.warn("[notion webhook] Could not parse Custom Event ID.", {
        customEventId,
        pageId: page.id,
      });
      return { outcome: "noop_missing_fields" };
    }

    try {
      const matchedEventId = await findPracticeCalendarEventByTimeRange(
        practiceCalendarId,
        parsed.start,
        parsed.end,
      );
      if (!matchedEventId) {
        console.warn(
          "[notion webhook] No practice calendar event matched parsed times.",
          {
            customEventId,
            start: parsed.start.toISOString(),
            end: parsed.end.toISOString(),
          },
        );
        return { outcome: "noop_missing_fields" };
      }

      await deleteGoogleCalendarEventIdempotent(
        getCalendarClient(),
        practiceCalendarId,
        matchedEventId,
      );
      console.info("[notion webhook] Deleted practice calendar event.", {
        eventId: matchedEventId,
        customEventId,
      });
      return { outcome: "deleted_practice", eventId: matchedEventId };
    } catch (err) {
      console.error("[notion webhook] Practice calendar delete failed:", err);
      return {
        outcome: "error",
        message: err instanceof Error ? err.message : "calendar delete failed",
      };
    }
  }

  return { outcome: "not_calendar_page" };
}

/**
 * Search the practice Google Calendar for an event whose start/end match the
 * given UTC instants (within a 2-minute tolerance window). Returns the Google
 * Calendar event ID on match, or `null`.
 */
async function findPracticeCalendarEventByTimeRange(
  calendarId: string,
  start: Date,
  end: Date,
): Promise<string | null> {
  const calendar = getCalendarClient();

  const searchWindowStart = new Date(start.getTime() - 2 * 60 * 1000);
  const searchWindowEnd = new Date(end.getTime() + 2 * 60 * 1000);

  const response = await calendar.events.list({
    calendarId,
    timeMin: searchWindowStart.toISOString(),
    timeMax: searchWindowEnd.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 20,
  });

  const events = response.data.items ?? [];
  const targetStartMs = start.getTime();
  const targetEndMs = end.getTime();

  for (const event of events) {
    const typed = event as GoogleApiEvent;
    if (!typed.id) continue;
    const evStart = getEventStart(typed);
    const evEnd = getEventEnd(typed);
    if (!evStart || !evEnd) continue;

    const evStartMs = new Date(evStart).getTime();
    const evEndMs = new Date(evEnd).getTime();

    if (
      Math.abs(evStartMs - targetStartMs) < 90_000 &&
      Math.abs(evEndMs - targetEndMs) < 90_000
    ) {
      return typed.id;
    }
  }

  return null;
}

/**
 * If this page is a jam or practice row marked Cancelled (and not app-stamped),
 * delete the Google Calendar event. Safe to call for any page id.
 */
export async function processNotionCalendarCancellationWebhook(
  pageId: string,
): Promise<NotionCalendarCancelWebhookResult> {
  const notion = getNotionClientForRealm("calendar");
  const page = await notion.pages.retrieve({ page_id: pageId });
  return processNotionCalendarCancellationFromPage(
    page as NotionPageForCalendarCancel,
  );
}
