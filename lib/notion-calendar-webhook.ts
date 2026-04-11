/**
 * Notion webhook branch: when **Status** (jam) or **Session Status** (practice) is
 * **Cancelled**, delete the matching Google Calendar event unless
 * {@link NOTION_CSPR_CANCEL_ORIGIN_CALENDAR_APP} was stamped by `/api/cancel`.
 */
import {
  deleteGoogleCalendarEventIdempotent,
  deletePracticeCalendarEventsMatchingCustomId,
} from "@/lib/google-calendar-webhook-delete";
import { getCalendarClient } from "@/lib/google";
import {
  getNotionClient,
  getNotionPageParentIds,
} from "@/lib/notion";
import {
  NOTION_CSPR_CANCEL_ORIGIN_CALENDAR_APP,
  NOTION_CSPR_CANCEL_ORIGIN_PROPERTY,
} from "@/lib/notion-sync-constants";

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
  | {
      outcome: "deleted_practice";
      customEventId: string;
      deletedCount: number;
      alreadyGoneCount: number;
    }
  | { outcome: "error"; message: string };

/**
 * If this page is a jam or practice row marked Cancelled (and not app-stamped),
 * delete the Google Calendar event(s). Safe to call for any page id.
 */
export async function processNotionCalendarCancellationWebhook(
  pageId: string,
): Promise<NotionCalendarCancelWebhookResult> {
  const jamDs = process.env.NOTION_DATA_SOURCE_ID;
  const practiceDs = process.env.NOTION_FILLOUT_MASTER_DATA_SOURCE_ID;

  if (!jamDs && !practiceDs) {
    return { outcome: "not_calendar_page" };
  }

  const notion = getNotionClient();
  const page = await notion.pages.retrieve({ page_id: pageId });

  if (!("properties" in page)) {
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
      pageId,
      parent: page.parent,
      parentIds,
      jamDsConfigured: Boolean(jamDs),
      practiceDsConfigured: Boolean(practiceDs),
      isJamPage,
      isPracticePage,
      jamStatus: selectOrStatusName(props[JAM_STATUS_PROP]),
      practiceSession: selectOrStatusName(props[PRACTICE_SESSION_STATUS_PROP]),
    });
  }

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

  if (isPracticePage && practiceDs) {
    const sessionName = selectOrStatusName(props[PRACTICE_SESSION_STATUS_PROP]);
    if (!isCancelledNotionStatus(sessionName)) {
      return { outcome: "not_calendar_page" };
    }
    if (stampedByApp) {
      return { outcome: "skipped_app_cancelled" };
    }
    const customEventId = notionPlainTextProperty(
      props,
      PRACTICE_CUSTOM_EVENT_ID_PROP,
    );
    if (!customEventId) {
      return { outcome: "noop_missing_fields" };
    }
    const practiceCalendarId = process.env.PRACTICE_CALENDAR_ID;
    if (!practiceCalendarId) {
      return { outcome: "error", message: "Missing PRACTICE_CALENDAR_ID" };
    }
    try {
      const { deletedCount, alreadyGoneCount } =
        await deletePracticeCalendarEventsMatchingCustomId(
          getCalendarClient(),
          practiceCalendarId,
          customEventId,
        );
      if (deletedCount === 0 && alreadyGoneCount === 0) {
        console.warn(
          "[notion webhook] No practice calendar event matched Custom Event ID:",
          customEventId,
        );
      }
      return {
        outcome: "deleted_practice",
        customEventId,
        deletedCount,
        alreadyGoneCount,
      };
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
