/**
 * Support-thread identifier helpers shared by the app UI and Telegram bot.
 *
 * Every support thread is referenced externally by a key of the form
 * `SR-<uuid>`. These helpers build, extract, and parse those keys
 * and the `/reply` and `/close` slash commands used in the Telegram admin group.
 *
 * Conversation titles in the support inbox and Telegram forum topics use the
 * same human-readable pattern derived from `created_at`.
 *
 * @module
 */

/** Telegram `createForumTopic` name length limit. */
export const TELEGRAM_FORUM_TOPIC_NAME_MAX = 128;

/**
 * Human-readable conversation title shown in the support inbox and as the
 * Telegram forum topic name (e.g. `Issue Apr 11, 9:04 AM`).
 *
 * @param isoString - Thread `created_at` from the database (ISO 8601).
 * @param locales - Optional `Intl` locale(s); pass `Accept-Language` primary tag
 *   from the HTTP request so server output matches the user's browser.
 */
export function formatSupportConversationName(
  isoString: string,
  locales?: Intl.LocalesArgument,
) {
  const date = new Date(isoString);
  return `Issue ${date.toLocaleString(locales, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

/** Truncates a string for Telegram forum topic `name` (max 128 chars). */
export function truncateForTelegramForumTopic(
  name: string,
  maxLen = TELEGRAM_FORUM_TOPIC_NAME_MAX,
) {
  if (name.length <= maxLen) {
    return name;
  }
  return name.slice(0, Math.max(0, maxLen - 1)).trimEnd() + "…";
}

/** Prefix used for all human-visible support thread identifiers. */
export const SUPPORT_THREAD_PREFIX = "SR-";

/**
 * Build the canonical external key for a thread (e.g. `SR-abc123`).
 * @param threadId - Raw thread UUID from the database.
 */
export function toSupportThreadKey(threadId: string) {
  return `${SUPPORT_THREAD_PREFIX}${threadId}`;
}

/**
 * Extract the first `SR-<id>` token from arbitrary text.
 * Returns the raw thread ID (without the prefix) or an empty string.
 */
export function extractSupportThreadIdFromText(text: string) {
  const match = text.match(/SR-([a-zA-Z0-9-]+)/);
  return match?.[1] ?? "";
}

/**
 * Parse a `/reply SR-<id> <body>` Telegram command.
 * Returns `{ threadId, replyBody }` or `null` if the format is invalid.
 */
export function parseReplyCommand(text: string) {
  const trimmed = text.trim();
  const match = trimmed.match(/^\/reply\s+SR-([a-zA-Z0-9-]+)\s+([\s\S]+)$/i);

  if (!match) {
    return null;
  }

  const threadId = match[1] || "";
  const replyBody = (match[2] || "").trim();

  if (!threadId || !replyBody) {
    return null;
  }

  return { threadId, replyBody };
}

/**
 * Parse a `/close [SR-<id>] [reason]` Telegram command.
 * Both the thread ID and the reason are optional; returns `null`
 * only when the text does not start with `/close`.
 */
export function parseCloseCommand(text: string) {
  const trimmed = text.trim();
  const match = trimmed.match(/^\/close(?:\s+SR-([a-zA-Z0-9-]+))?(?:\s+([\s\S]+))?$/i);

  if (!match) {
    return null;
  }

  const threadId = (match[1] || "").trim();
  const reason = (match[2] || "").trim();
  return { threadId, reason };
}

/**
 * Calls Telegram `closeForumTopic` for a support thread’s forum topic.
 * No-op when ids are missing, `TELEGRAM_BOT_TOKEN` is unset, or (when
 * `threadStatus` is passed) the thread is already `"closed"` in the DB.
 * Webhook `/close` should omit `threadStatus` so the topic is always closed
 * when the command runs.
 */
export async function closeTelegramSupportForumTopic(params: {
  telegram_chat_id: string | null;
  telegram_topic_id: number | null;
  threadStatus?: string;
}): Promise<void> {
  if (params.threadStatus === "closed") {
    return;
  }
  if (!params.telegram_chat_id || params.telegram_topic_id == null) {
    return;
  }
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return;
  }
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/closeForumTopic`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: params.telegram_chat_id,
        message_thread_id: params.telegram_topic_id,
      }),
    });
  } catch (closeTopicError) {
    console.warn("closeForumTopic failed:", closeTopicError);
  }
}
