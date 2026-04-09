/** Shared types used across API routes, client components, and hooks. */

/**
 * Minimal shape of a Google Calendar event as returned by `calendar.events.list`.
 * Only the fields the app actually reads are typed; everything else is ignored.
 */
export type GoogleApiEvent = {
  id?: string | null;
  summary?: string | null;
  start?: {
    dateTime?: string | null;
    date?: string | null;
  } | null;
  end?: {
    dateTime?: string | null;
    date?: string | null;
  } | null;
  extendedProperties?: {
    private?: Record<string, string> | null;
  } | null;
};

/** A row from the `holds` Supabase table representing a temporary time-slot reservation. */
export type HoldRow = {
  id: string;
  start_at: string;
  end_at: string;
  expires_at: string;
  owner_email: string;
  owner_name: string | null;
  status: string;
};

/** Server → client calendar event payload returned by the events API. */
export type ApiCalendarEvent = {
  id: string;
  googleEventId?: string;
  holdId?: string;
  eventType: "practice" | "jam" | "hold";
  title: string;
  start: string;
  end: string;
  color: string;
  textColor: string;
  canCancel: boolean;
  classNames?: string[];
};

/**
 * Client-side calendar event used by FullCalendar and the booking UI.
 * A superset of {@link ApiCalendarEvent} with optional fields for local-only state.
 */
export type CalendarEvent = {
  id: string;
  googleEventId?: string;
  holdId?: string;
  eventType?: "practice" | "jam" | "hold";
  title: string;
  start: string;
  end: string;
  color?: string;
  textColor?: string;
  canCancel?: boolean;
  classNames?: string[];
};

/**
 * Transient state for a drag selection moving through the hold/booking pipeline.
 * `mode` tracks which phase the request is in ("securing" → "hold" → form open,
 * or "fallback" if the hold could not be created).
 */
export type PendingSelection = {
  start: Date;
  end: Date;
  holdId?: string;
  expiresAt?: string | null;
  mode: "securing" | "hold" | "fallback";
  requestId: number;
};

/** Shape of the global toast notification state. */
export type ToastState = {
  isOpen: boolean;
  message: string;
  type: "success" | "error" | "info";
};

/** Viewport-relative position and label of the drag-selection mirror overlay. */
export type DragMirrorState = {
  top: number;
  left: number;
  width: number;
  height: number;
  label: string;
};

/** A row from the `support_threads` Supabase table. */
export type SupportThreadRow = {
  id: string;
  user_email: string;
  user_name: string | null;
  status: string;
  unread_for_user: boolean;
  telegram_chat_id: string | null;
  telegram_root_message_id: number | null;
  created_at: string;
  updated_at: string;
};

/** Enriched thread view returned by the threads-list API (includes latest message and counts). */
export type ThreadSummary = {
  id: string;
  user_email: string;
  user_name: string | null;
  status: string;
  unread_for_user: boolean;
  created_at: string;
  updated_at: string;
  latest_message_body: string | null;
  latest_message_author_type: "user" | "admin" | null;
  latest_message_created_at: string | null;
  user_message_count: number;
  admin_message_count: number;
};

/** A row from the `support_messages` Supabase table (one message within a thread). */
export type SupportMessageRow = {
  id: string;
  thread_id: string;
  author_type: "user" | "admin";
  body: string;
  source: "app" | "telegram";
  telegram_update_id: string | null;
  created_at: string;
};
