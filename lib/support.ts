export const SUPPORT_THREAD_PREFIX = "SR-";

export function toSupportThreadKey(threadId: string) {
  return `${SUPPORT_THREAD_PREFIX}${threadId}`;
}

export function extractSupportThreadIdFromText(text: string) {
  const match = text.match(/SR-([a-zA-Z0-9-]+)/);
  return match?.[1] ?? "";
}

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
