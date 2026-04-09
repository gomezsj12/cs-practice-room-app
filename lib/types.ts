/** Shared types used across API routes, client components, and hooks. */

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

export type HoldRow = {
  id: string;
  start_at: string;
  end_at: string;
  expires_at: string;
  owner_email: string;
  owner_name: string | null;
  status: string;
};

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

export type PendingSelection = {
  start: Date;
  end: Date;
  holdId?: string;
  expiresAt?: string | null;
  mode: "securing" | "hold" | "fallback";
  requestId: number;
};

export type ToastState = {
  isOpen: boolean;
  message: string;
  type: "success" | "error" | "info";
};

export type DragMirrorState = {
  top: number;
  left: number;
  width: number;
  height: number;
  label: string;
};

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

export type SupportMessageRow = {
  id: string;
  thread_id: string;
  author_type: "user" | "admin";
  body: string;
  source: "app" | "telegram";
  telegram_update_id: string | null;
  created_at: string;
};
