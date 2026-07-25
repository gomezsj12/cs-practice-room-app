/**
 * Exact `process.env` keys for dual Notion integrations: do not rename these
 * string literals (Vercel / `.env.local` must match exactly).
 */
export const NOTION_TOKEN_CALENDAR = "NOTION_TOKEN_CALENDAR" as const;
export const NOTION_TOKEN_PROFILE = "NOTION_TOKEN_PROFILE" as const;
export const NOTION_WEBHOOK_VERIFICATION_TOKEN_CALENDAR =
  "NOTION_WEBHOOK_VERIFICATION_TOKEN_CALENDAR" as const;
export const NOTION_WEBHOOK_VERIFICATION_TOKEN_PROFILE =
  "NOTION_WEBHOOK_VERIFICATION_TOKEN_PROFILE" as const;
