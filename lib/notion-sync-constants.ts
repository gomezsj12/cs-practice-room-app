/**
 * Shared Notion property names and values for calendar ↔ Notion cancellation sync.
 *
 * When the app cancels from Google Calendar first, it stamps {@link NOTION_CSPR_CANCEL_ORIGIN_PROPERTY}
 * so the Notion webhook can skip redundant `events.delete` calls.
 */
export const NOTION_CSPR_CANCEL_ORIGIN_PROPERTY = "CSPR Cancel origin";

/** Value written by {@link /api/cancel} when updating Notion after deleting the Google event. */
export const NOTION_CSPR_CANCEL_ORIGIN_CALENDAR_APP = "calendar_app";
