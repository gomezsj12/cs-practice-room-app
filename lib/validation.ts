/**
 * @file Shared validation constants.
 *
 * Centralises patterns and limits that are used in both client components
 * and server-side API routes so they stay in sync.
 */

/** Enforces `First.Last@wallawalla.edu` format (hyphens allowed in names). */
export const WWU_EMAIL_RE = /^[A-Za-z-]+\.[A-Za-z-]+@wallawalla\.edu$/;

/** Upper bound on a single support message body (characters). */
export const MAX_SUPPORT_MESSAGE_LENGTH = 1200;

/**
 * Normalise CRLF line endings to LF and trim surrounding whitespace.
 * Used before persisting user messages and sending to Telegram.
 */
export function normalizeMessageText(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}
