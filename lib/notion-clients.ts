/**
 * Dual Notion internal integrations: separate API tokens for **calendar**
 * (jam, practice / Fillout) vs **profile** (people, profile creation log, presence).
 *
 * Each realm falls back to `NOTION_TOKEN` during migration when split env vars
 * are not set yet.
 *
 * @see {@link https://developers.notion.com/reference/request-limits} — ~3 rps per integration.
 */

import { Client } from "@notionhq/client";

/** Pinned Notion API version to avoid breaking changes from upstream. */
const NOTION_VERSION = "2026-03-11";

export type NotionRealm = "calendar" | "profile";

const clients = new Map<NotionRealm, Client>();

function tokenForRealm(realm: NotionRealm): string {
  const trimmed =
    realm === "calendar"
      ? (process.env.NOTION_TOKEN_CALENDAR || process.env.NOTION_TOKEN || "")
          .trim()
      : (process.env.NOTION_TOKEN_PROFILE || process.env.NOTION_TOKEN || "")
          .trim();
  return trimmed;
}

/**
 * Shared Notion SDK client for the given realm (lazy singleton per process).
 *
 * - **calendar** — `NOTION_TOKEN_CALENDAR` or `NOTION_TOKEN` fallback.
 * - **profile** — `NOTION_TOKEN_PROFILE` or `NOTION_TOKEN` fallback.
 */
export function getNotionClientForRealm(realm: NotionRealm): Client {
  const token = tokenForRealm(realm);
  if (!token) {
    throw new Error(
      realm === "calendar"
        ? "Missing NOTION_TOKEN_CALENDAR (or NOTION_TOKEN fallback) environment variable."
        : "Missing NOTION_TOKEN_PROFILE (or NOTION_TOKEN fallback) environment variable.",
    );
  }

  let client = clients.get(realm);
  if (!client) {
    client = new Client({
      auth: token,
      notionVersion: NOTION_VERSION,
    });
    clients.set(realm, client);
  }
  return client;
}

/**
 * Default Notion client for jam / practice / quarters / people directory
 * (assignee picker) paths — same as `getNotionClientForRealm("calendar")`.
 *
 * Prefer {@link getNotionClientForRealm} with an explicit realm in new code.
 */
export function getNotionClient(): Client {
  return getNotionClientForRealm("calendar");
}
