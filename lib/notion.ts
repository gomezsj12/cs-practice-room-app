/**
 * Notion API client, jam-reservation, and user-profile helpers.
 *
 * Uses dual Notion integrations via {@link getNotionClientForRealm} — calendar
 * (jam, practice) vs profile (people, profile log). Exposes helpers to:
 * - Create and cancel jam reservations in the Notion data source.
 * - Mark practice bookings cancelled in the Fillout Form Master Database (Custom Event ID +
 *   CSPR Cancel origin when cancelled from the app).
 * - Look up users in the Notion people database by WWU email.
 * - Log and sync profile audit rows in the Notion profile-creation log data source
 *   (`full` vs `metadataOnly` modes; presence fields via `syncProfileLogPresenceToNotion`,
 *   with profile-log page id TTL cache for presence).
 *
 * @see {@link ../lib/google.ts}  — Google Calendar side of the same booking flow.
 * @see {@link ../lib/types.ts}   — shared type definitions.
 */
import type { Client } from "@notionhq/client";
import { unstable_cache } from "next/cache";
import { getNotionClientForRealm } from "@/lib/notion-clients";

export { getNotionClient, getNotionClientForRealm } from "@/lib/notion-clients";
export type { NotionRealm } from "@/lib/notion-clients";
import {
  NOTION_CSPR_CANCEL_ORIGIN_CALENDAR_APP,
  NOTION_CSPR_CANCEL_ORIGIN_PROPERTY,
} from "@/lib/notion-sync-constants";
import {
  getProfileLogPageIdsFromCache,
  invalidateProfileLogPageIdsCache,
  setProfileLogPageIdsCache,
} from "@/lib/profile-log-page-id-cache";
import type { PracticeAssigneeSummary } from "@/lib/types";

/** Parameters for creating a jam reservation page in Notion. */
type CreateJamReservationParams = {
  name: string;
  instrument: string;
  /** ISO-8601 date-time string. */
  start: string;
  /** ISO-8601 date-time string. */
  end: string;
  /** Links the Notion page back to the canonical Google Calendar event. */
  googleEventId: string;
  ownerEmail: string;
};

/**
 * Create a new "Confirmed" jam-reservation page in the Notion data source.
 *
 * Each property maps to a column defined in the Notion data source schema.
 * The Google Event ID acts as the cross-system foreign key.
 */
export async function createJamReservationInNotion({
  name,
  instrument,
  start,
  end,
  googleEventId,
  ownerEmail,
}: CreateJamReservationParams) {
  const dataSourceId = process.env.NOTION_DATA_SOURCE_ID;

  if (!dataSourceId) {
    throw new Error("Missing NOTION_DATA_SOURCE_ID environment variable.");
  }

  const notion = getNotionClientForRealm("calendar");

  return notion.pages.create({
    parent: {
      type: "data_source_id",
      data_source_id: dataSourceId,
    },
    properties: {
      Name: {
        title: [
          {
            text: {
              content: name,
            },
          },
        ],
      },
      Instrument: {
        select: {
          name: instrument,
        },
      },
      Start: {
        date: {
          start,
        },
      },
      End: {
        date: {
          start: end,
        },
      },
      "Google Event ID": {
        rich_text: [
          {
            text: {
              content: googleEventId,
            },
          },
        ],
      },
      "Owner Email": {
        email: ownerEmail,
      },
      Status: {
        select: {
          name: "Confirmed",
        },
      },
    },
  });
}

/**
 * Find a jam-reservation page by its Google Event ID and set its status
 * to "Cancelled". Returns the page ID on success, or `null` if no
 * matching page was found (e.g. it was already deleted).
 */
export async function markJamReservationCancelledInNotion(
  googleEventId: string,
) {
  const dataSourceId = process.env.NOTION_DATA_SOURCE_ID;

  if (!dataSourceId) {
    throw new Error("Missing NOTION_DATA_SOURCE_ID environment variable.");
  }

  const notion = getNotionClientForRealm("calendar");

  const queryData = await notion.dataSources.query({
    data_source_id: dataSourceId,
    filter: {
      property: "Google Event ID",
      rich_text: {
        equals: googleEventId,
      },
    },
  });

  const pageId = queryData.results?.[0]?.id;

  if (!pageId) {
    return null;
  }

  await notion.pages.update({
    page_id: pageId,
    properties: {
      Status: {
        select: {
          name: "Cancelled",
        },
      },
      [NOTION_CSPR_CANCEL_ORIGIN_PROPERTY]: {
        rich_text: [
          {
            text: {
              content: NOTION_CSPR_CANCEL_ORIGIN_CALENDAR_APP,
            },
          },
        ],
      },
    },
  });

  return pageId;
}

/** Notion text column on Fillout Form Master Database (API type is `rich_text`). */
const NOTION_PRACTICE_CUSTOM_EVENT_ID_PROP = "Custom Event ID";

/** Notion relation column on Fillout practice rows (People directory). */
export const NOTION_PRACTICE_ASSIGNEES_PROP = "Assignee(s)";

/**
 * Find a practice-booking row by **Custom Event ID** and set **Session Status** to
 * **Cancelled**. Returns the page ID on success, or `null` if none matched.
 *
 * Logs diagnostics at each step so silent no-match failures are visible in
 * Vercel runtime logs.
 *
 * Requires `NOTION_FILLOUT_MASTER_DATA_SOURCE_ID`.
 */
export async function markPracticeBookingCancelledInNotionByCustomId(
  customEventId: string,
) {
  const dataSourceId = process.env.NOTION_FILLOUT_MASTER_DATA_SOURCE_ID?.trim();

  if (!dataSourceId) {
    throw new Error(
      "Missing NOTION_FILLOUT_MASTER_DATA_SOURCE_ID environment variable.",
    );
  }

  const notion = getNotionClientForRealm("calendar");

  const queryData = await notion.dataSources.query({
    data_source_id: dataSourceId,
    filter: {
      property: NOTION_PRACTICE_CUSTOM_EVENT_ID_PROP,
      rich_text: {
        equals: customEventId,
      },
    },
  });

  const pageId = queryData.results?.[0]?.id;

  if (!pageId) {
    console.warn(
      "[notion] Practice cancel: no Notion page matched Custom Event ID.",
      { customEventId, dataSourceId, resultCount: queryData.results?.length ?? 0 },
    );
    return null;
  }

  console.info("[notion] Practice cancel: matched Notion page, updating.", {
    pageId,
    customEventId,
  });

  await notion.pages.update({
    page_id: pageId,
    properties: {
      "Session Status": {
        status: {
          name: "Cancelled",
        },
      },
      [NOTION_CSPR_CANCEL_ORIGIN_PROPERTY]: {
        rich_text: [
          {
            text: {
              content: NOTION_CSPR_CANCEL_ORIGIN_CALENDAR_APP,
            },
          },
        ],
      },
    },
  });

  return pageId;
}

/* ------------------------------------------------------------------ */
/*  Practice session lookup + admin update helpers                    */
/* ------------------------------------------------------------------ */

/** Loose prop shape for reading practice page properties. */
type PracticePageProp = {
  type: string;
  status?: { name?: string | null } | null;
  rich_text?: Array<{ plain_text?: string }>;
  url?: string | null;
  relation?: Array<{ id?: string }>;
};

/**
 * Read ordered People page IDs from a practice page's **Assignee(s)** relation.
 */
export function extractAssigneePageIdsFromPracticeProperties(
  properties: Record<string, PracticePageProp>,
): string[] {
  const assignProp = properties[NOTION_PRACTICE_ASSIGNEES_PROP];
  if (assignProp?.type !== "relation" || !Array.isArray(assignProp.relation)) {
    return [];
  }
  return assignProp.relation
    .map((r) => (typeof r?.id === "string" ? r.id.trim() : ""))
    .filter((id) => id.length > 0);
}

/**
 * Find the Notion page for a practice booking by its **Custom Event ID**.
 * Returns the page ID, current Session Status, and constructed Notion URL,
 * or `null` fields when no page matches.
 *
 * Requires `NOTION_FILLOUT_MASTER_DATA_SOURCE_ID`.
 */
export async function findPracticeNotionPage(
  customEventId: string,
): Promise<{
  notionPageId: string | null;
  currentStatus: string | null;
  notionPageUrl: string | null;
  patchlistLink: string | null;
  assigneePageIds: string[];
}> {
  const dataSourceId =
    process.env.NOTION_FILLOUT_MASTER_DATA_SOURCE_ID?.trim();

  if (!dataSourceId) {
    throw new Error(
      "Missing NOTION_FILLOUT_MASTER_DATA_SOURCE_ID environment variable.",
    );
  }

  const notion = getNotionClientForRealm("calendar");

  const queryData = await notion.dataSources.query({
    data_source_id: dataSourceId,
    filter: {
      property: NOTION_PRACTICE_CUSTOM_EVENT_ID_PROP,
      rich_text: {
        equals: customEventId,
      },
    },
    page_size: 1,
  });

  const page = queryData.results?.[0];
  if (!page) {
    return {
      notionPageId: null,
      currentStatus: null,
      notionPageUrl: null,
      patchlistLink: null,
      assigneePageIds: [],
    };
  }

  const pageId = page.id;
  let currentStatus: string | null = null;
  let patchlistLink: string | null = null;
  let assigneePageIds: string[] = [];

  if ("properties" in page) {
    const props = page.properties as Record<string, PracticePageProp>;
    assigneePageIds = extractAssigneePageIdsFromPracticeProperties(props);

    const statusProp = props["Session Status"];
    if (statusProp?.type === "status") {
      currentStatus = statusProp.status?.name?.trim() ?? null;
    }

    const linkProp = props["Link to Patchlist"];
    if (linkProp?.type === "url") {
      patchlistLink = linkProp.url?.trim() || null;
    } else if (linkProp?.type === "rich_text") {
      patchlistLink =
        (linkProp.rich_text ?? [])
          .map((c) => c.plain_text ?? "")
          .join("")
          .trim() || null;
    }
  }

  const notionPageUrl = `https://notion.so/${pageId.replace(/-/g, "")}`;

  return {
    notionPageId: pageId,
    currentStatus,
    notionPageUrl,
    patchlistLink,
    assigneePageIds,
  };
}

/** Parameters for {@link updatePracticeSessionInNotion}. */
type UpdatePracticeSessionParams = {
  notionPageId: string;
  /** ISO-8601 datetime for the new start (updates "Start Date/Time"). */
  newStartISO?: string;
  /** Session duration in hours (updates "Session Length (hours)"). */
  sessionLengthHours?: number;
  /** New Custom Event ID string (updates "Custom Event ID" text property). */
  newCustomEventId?: string;
  /** New Session Status name (updates "Session Status"). */
  newStatus?: string;
  /** New URL for "Link to Patchlist" (empty string clears the value). */
  newPatchlistLink?: string;
  /** Replace **Assignee(s)** relation; empty array clears. */
  newAssigneeRelation?: { id: string }[];
};

/**
 * Batch-update practice session properties in Notion. Only includes
 * properties whose values are provided (non-undefined).
 */
export async function updatePracticeSessionInNotion({
  notionPageId,
  newStartISO,
  sessionLengthHours,
  newCustomEventId,
  newStatus,
  newPatchlistLink,
  newAssigneeRelation,
}: UpdatePracticeSessionParams) {
  const notion = getNotionClientForRealm("calendar");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Notion SDK property shapes are complex; build dynamically
  const properties: Record<string, any> = {};

  if (newStartISO !== undefined) {
    properties["Start Date/Time"] = { date: { start: newStartISO } };
  }

  if (sessionLengthHours !== undefined) {
    properties["Session Length (hours)"] = { number: sessionLengthHours };
  }

  if (newCustomEventId !== undefined) {
    properties["Custom Event ID"] = {
      rich_text: [{ text: { content: newCustomEventId } }],
    };
  }

  if (newStatus !== undefined) {
    properties["Session Status"] = { status: { name: newStatus } };
  }

  if (newPatchlistLink !== undefined) {
    properties["Link to Patchlist"] = {
      url: newPatchlistLink || null,
    };
  }

  if (newAssigneeRelation !== undefined) {
    properties[NOTION_PRACTICE_ASSIGNEES_PROP] = {
      relation: newAssigneeRelation,
    };
  }

  if (Object.keys(properties).length === 0) {
    return;
  }

  await notion.pages.update({ page_id: notionPageId, properties });
}

/* ------------------------------------------------------------------ */
/*  User-profile helpers (people DB lookup + audit log)               */
/* ------------------------------------------------------------------ */

/** Maps Notion "Service Type" multi-select names to Supabase column keys. */
const DEPT_MAP: Record<string, keyof DepartmentFlags> = {
  Vespers: "dept_vespers",
  Berean: "dept_berean",
  Nuestra: "dept_nuestra",
  Circle: "dept_circle",
  Mosaic: "dept_mosaic",
  "Battle/SpringJam": "dept_battle_springjam",
  Other: "dept_other",
};

/** Boolean flags for each department, derived from the Notion "Service Type" property. */
export type DepartmentFlags = {
  dept_vespers: boolean;
  dept_berean: boolean;
  dept_nuestra: boolean;
  dept_circle: boolean;
  dept_mosaic: boolean;
  dept_battle_springjam: boolean;
  dept_other: boolean;
};

/** Result of a Notion people-DB lookup: page ID, directory name, + department flags. */
export type NotionPersonResult = {
  pageId: string;
  /** Title property "Name" when present; otherwise `null`. */
  displayName: string | null;
  departments: DepartmentFlags;
  sjBand: string | null;
  type: string | null;
};

/** Returns all-false department flags. */
export function emptyDepartments(): DepartmentFlags {
  return {
    dept_vespers: false,
    dept_berean: false,
    dept_nuestra: false,
    dept_circle: false,
    dept_mosaic: false,
    dept_battle_springjam: false,
    dept_other: false,
  };
}

/** Loose shape for people / profile-log property values from the Notion API. */
type NotionPeopleProp = {
  type: string;
  email?: string | null;
  checkbox?: boolean;
  multi_select?: Array<{ name: string }>;
  select?: { name: string } | null;
  rich_text?: Array<{ plain_text?: string }>;
  title?: Array<{ plain_text?: string }>;
};

/**
 * Checkbox on the profile-creation log data source. When checked, the
 * Notion webhook handler deletes the Supabase `profiles` row for the
 * row's Google Email.
 */
export const NOTION_PROFILE_LOG_DELETE_PROP = "Remove from Supabase";

/** Fields read from a people data-source row for Supabase sync. */
export type NotionPersonSyncFields = {
  pageId: string;
  wwuEmail: string | null;
  displayName: string | null;
  departments: DepartmentFlags;
  sjBand: string | null;
  type: string | null;
};

export function getDataSourceIdFromNotionParent(page: {
  parent: { type: string; data_source_id?: string };
}): string | null {
  if (
    page.parent.type === "data_source_id" &&
    page.parent.data_source_id
  ) {
    return page.parent.data_source_id;
  }
  return null;
}

/**
 * Collect parent ids Notion may attach to a page (`data_source_id` and/or
 * `database_id`) for env matching in webhooks.
 */
export function getNotionPageParentIds(page: {
  parent: {
    type: string;
    data_source_id?: string;
    database_id?: string;
  };
}): string[] {
  const p = page.parent;
  const ids: string[] = [];
  if (typeof p.data_source_id === "string" && p.data_source_id) {
    ids.push(p.data_source_id);
  }
  if (typeof p.database_id === "string" && p.database_id) {
    ids.push(p.database_id);
  }
  return ids;
}

function parsePeopleDataSourceProperties(
  pageId: string,
  properties: Record<string, NotionPeopleProp>,
): NotionPersonSyncFields {
  const departments = emptyDepartments();

  let sjBand: string | null = null;
  let type: string | null = null;
  let wwuEmail: string | null = null;
  let displayName: string | null = null;

  const serviceType = properties["Service Type"];

  if (serviceType?.type === "multi_select" && serviceType.multi_select) {
    for (const option of serviceType.multi_select) {
      const col = DEPT_MAP[option.name];
      if (col) departments[col] = true;
    }
  }

  const sjBandProp = properties["SJ Band"];
  if (sjBandProp?.type === "select") {
    sjBand = sjBandProp.select?.name ?? null;
  } else if (sjBandProp?.type === "rich_text") {
    const text = (sjBandProp.rich_text ?? [])
      .map((chunk) => chunk.plain_text ?? "")
      .join("")
      .trim();
    sjBand = text || null;
  } else if (sjBandProp?.type === "title") {
    const text = (sjBandProp.title ?? [])
      .map((chunk) => chunk.plain_text ?? "")
      .join("")
      .trim();
    sjBand = text || null;
  }

  const typeProp = properties["Type"];
  if (typeProp?.type === "select") {
    type = typeProp.select?.name ?? null;
  } else if (typeProp?.type === "rich_text") {
    const text = (typeProp.rich_text ?? [])
      .map((chunk) => chunk.plain_text ?? "")
      .join("")
      .trim();
    type = text || null;
  } else if (typeProp?.type === "title") {
    const text = (typeProp.title ?? [])
      .map((chunk) => chunk.plain_text ?? "")
      .join("")
      .trim();
    type = text || null;
  }

  const wwuProp = properties["Walla Walla Email"];
  if (wwuProp?.type === "email") {
    wwuEmail = wwuProp.email ?? null;
  }

  const nameProp = properties["Name"];
  if (nameProp?.type === "title" && nameProp.title) {
    const text = nameProp.title
      .map((chunk) => chunk.plain_text ?? "")
      .join("")
      .trim();
    displayName = text || null;
  }

  return {
    pageId,
    wwuEmail,
    displayName,
    departments,
    sjBand,
    type,
  };
}

const PEOPLE_DIRECTORY_PAGE_CAP = 2000;
const PEOPLE_DIRECTORY_CACHE_SECONDS = 900;

function parseNotionIconToAssigneeIcon(
  icon: unknown,
): PracticeAssigneeSummary["icon"] {
  if (!icon || typeof icon !== "object" || !("type" in icon)) return null;
  const rec = icon as { type: string; emoji?: string; external?: { url?: string }; file?: { url?: string } };
  if (rec.type === "emoji" && typeof rec.emoji === "string" && rec.emoji) {
    return { kind: "emoji", emoji: rec.emoji };
  }
  if (rec.type === "external" && rec.external?.url) {
    return { kind: "url", url: rec.external.url };
  }
  if (rec.type === "file" && rec.file?.url) {
    return { kind: "url", url: rec.file.url };
  }
  return null;
}

async function fetchPeopleDirectorySummariesUncached(): Promise<
  PracticeAssigneeSummary[]
> {
  const dbId = process.env.NOTION_PEOPLE_DB_ID;
  if (!dbId) {
    throw new Error("Missing NOTION_PEOPLE_DB_ID environment variable.");
  }

  const notion = getNotionClientForRealm("calendar");
  const people: PracticeAssigneeSummary[] = [];
  let cursor: string | undefined;

  while (people.length < PEOPLE_DIRECTORY_PAGE_CAP) {
    const queryData = await notion.dataSources.query({
      data_source_id: dbId,
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });

    for (const page of queryData.results) {
      if (!("properties" in page)) continue;
      const parsed = parsePeopleDataSourceProperties(
        page.id,
        page.properties as Record<string, NotionPeopleProp>,
      );
      const icon =
        "icon" in page && page.icon != null
          ? parseNotionIconToAssigneeIcon(page.icon)
          : null;
      people.push({
        pageId: parsed.pageId,
        name: parsed.displayName?.trim() || "Untitled",
        type: parsed.type,
        icon,
      });
    }

    if (!queryData.has_more || !queryData.next_cursor) break;
    cursor = queryData.next_cursor;
  }

  if (people.length >= PEOPLE_DIRECTORY_PAGE_CAP) {
    console.warn(
      "[notion] People directory assignee picker hit page cap:",
      PEOPLE_DIRECTORY_PAGE_CAP,
    );
  }

  return people;
}

/**
 * Full People directory as assignee summaries, cached ~15 minutes server-side
 * to avoid repeated paginated Notion queries.
 */
export const getCachedPeopleDirectorySummaries = unstable_cache(
  fetchPeopleDirectorySummariesUncached,
  ["notion-people-directory-assignee-picker-v2-calendar"],
  { revalidate: PEOPLE_DIRECTORY_CACHE_SECONDS },
);

/** Join ordered assignee page IDs to a people directory list (unknown IDs get placeholders). */
export function hydrateAssigneesFromOrderedIds(
  assigneePageIds: string[],
  people: PracticeAssigneeSummary[],
): PracticeAssigneeSummary[] {
  const byId = new Map(people.map((p) => [p.pageId, p]));
  return assigneePageIds.map((id) => {
    const hit = byId.get(id);
    if (hit) {
      return { ...hit };
    }
    return {
      pageId: id,
      name: "Unknown",
      type: null,
      icon: null,
    };
  });
}

export async function hydratePracticeAssigneesFromPageIds(
  assigneePageIds: string[],
): Promise<PracticeAssigneeSummary[]> {
  if (assigneePageIds.length === 0) return [];
  const people = await getCachedPeopleDirectorySummaries();
  return hydrateAssigneesFromOrderedIds(assigneePageIds, people);
}

/** True when every id exists in the cached People directory (admin PATCH guard). */
export function assigneePageIdsAreInPeopleDirectory(
  ids: string[],
  people: PracticeAssigneeSummary[],
): boolean {
  const allowed = new Set(people.map((p) => p.pageId));
  return ids.every((id) => allowed.has(id));
}

/**
 * Search the Notion people data source for a user by their Walla Walla
 * University email. Returns the page ID, display name (title "Name"),
 * and department flags from the "Service Type" multi-select, or `null`
 * if no entry is found.
 *
 * Requires `NOTION_PEOPLE_DB_ID` env var (the data source ID).
 */
export async function findNotionPersonByWWUEmail(
  wwuEmail: string,
): Promise<NotionPersonResult | null> {
  const dbId = process.env.NOTION_PEOPLE_DB_ID;
  if (!dbId) {
    throw new Error("Missing NOTION_PEOPLE_DB_ID environment variable.");
  }

  const notion = getNotionClientForRealm("profile");

  const result = await notion.dataSources.query({
    data_source_id: dbId,
    filter: {
      property: "Walla Walla Email",
      email: { equals: wwuEmail },
    },
    page_size: 1,
  });

  const page = result.results[0];
  if (!page || !("properties" in page)) return null;

  const parsed = parsePeopleDataSourceProperties(
    page.id,
    page.properties as Record<string, NotionPeopleProp>,
  );

  return {
    pageId: parsed.pageId,
    displayName: parsed.displayName,
    departments: parsed.departments,
    sjBand: parsed.sjBand,
    type: parsed.type,
  };
}

/** Resolved action for a `page.properties_updated` webhook on profile-related data sources. */
export type NotionProfileWebhookAction =
  | { action: "delete_profile"; googleEmail: string }
  | { action: "sync_profile"; fields: NotionPersonSyncFields }
  | { action: "none" };

/** Page shape for {@link resolveNotionProfileWebhookActionFromPage} (e.g. webhook retrieve). */
export type NotionProfileWebhookPage = {
  id: string;
  parent: {
    type: string;
    data_source_id?: string;
  };
  properties: Record<string, NotionPeopleProp>;
};

/**
 * Same as {@link resolveNotionProfileWebhookAction} but uses an already-retrieved page
 * (avoids a second Notion round-trip when combined with calendar webhook handling).
 */
export function resolveNotionProfileWebhookActionFromPage(
  page: NotionProfileWebhookPage,
): NotionProfileWebhookAction {
  const logDs = process.env.NOTION_PROFILE_LOG_DB_ID;
  const peopleDs = process.env.NOTION_PEOPLE_DB_ID;
  if (!logDs) {
    throw new Error("Missing NOTION_PROFILE_LOG_DB_ID environment variable.");
  }
  if (!peopleDs) {
    throw new Error("Missing NOTION_PEOPLE_DB_ID environment variable.");
  }

  const parentDs = getDataSourceIdFromNotionParent(page);
  const props = page.properties;

  if (parentDs === logDs) {
    const delProp = props[NOTION_PROFILE_LOG_DELETE_PROP];
    const removeFromSupabase =
      delProp?.type === "checkbox" && delProp.checkbox === true;

    const googleProp = props["Google Email"];
    const googleEmail =
      googleProp?.type === "email" ? (googleProp.email ?? null) : null;

    if (removeFromSupabase && googleEmail) {
      return { action: "delete_profile", googleEmail };
    }
    return { action: "none" };
  }

  if (parentDs === peopleDs) {
    return {
      action: "sync_profile",
      fields: parsePeopleDataSourceProperties(page.id, props),
    };
  }

  return { action: "none" };
}

/**
 * Inspect a Notion page once and decide whether to delete or sync a Supabase profile.
 * Uses one `pages.retrieve` call per webhook delivery.
 */
export async function resolveNotionProfileWebhookAction(
  pageId: string,
): Promise<NotionProfileWebhookAction> {
  const notion = getNotionClientForRealm("profile");
  const page = await notion.pages.retrieve({ page_id: pageId });

  if (!("properties" in page)) {
    return { action: "none" };
  }

  return resolveNotionProfileWebhookActionFromPage(
    page as NotionProfileWebhookPage,
  );
}

/** Parameters for {@link syncProfileCreationLogToNotion} and {@link logProfileCreationToNotion}. */
export type ProfileLogSyncParams = {
  displayName: string;
  googleEmail: string;
  wwuEmail: string;
  foundInNotion: boolean;
  /** Notion page ID of the matched people-DB entry (if any). */
  notionPageId: string | null;
};

/**
 * `full` — writes Google + WWU email (setup, manual profile edit).
 * `metadataOnly` — skips email columns (background Notion sync / people webhook).
 */
export type ProfileLogSyncMode = "full" | "metadataOnly";

/** App Profile Creation Logs — presence columns (titles must match the Notion data source). */
export const NOTION_PROFILE_LOG_IS_ACTIVE = "Is Active";
export const NOTION_PROFILE_LOG_LAST_ACTIVE_AT = "Last Active At...";

type ProfileLogPropertyMode = {
  includeCreatedAt: boolean;
  /** On create, omit relation when empty; on update, always set (empty clears). */
  relationMode: "omit_if_empty" | "always";
  /** When `metadataOnly`, email properties are omitted (updates only). */
  syncMode: ProfileLogSyncMode;
};

function buildProfileLogNotionProperties(
  {
    displayName,
    googleEmail,
    wwuEmail,
    foundInNotion,
    notionPageId,
  }: ProfileLogSyncParams,
  { includeCreatedAt, relationMode, syncMode }: ProfileLogPropertyMode,
): Record<string, unknown> {
  const props: Record<string, unknown> = {
    Name: {
      title: [{ text: { content: displayName } }],
    },
    "Found in Notion": {
      checkbox: foundInNotion,
    },
  };

  if (syncMode === "full") {
    props["Google Email"] = {
      email: googleEmail,
    };
    props["WWU Email"] = {
      email: wwuEmail,
    };
  }

  if (notionPageId) {
    props["CSPR Notion Profile"] = {
      relation: [{ id: notionPageId }],
    };
  } else if (relationMode === "always") {
    props["CSPR Notion Profile"] = { relation: [] };
  }

  if (includeCreatedAt) {
    props["Created At"] = {
      date: { start: new Date().toISOString() },
    };
  }

  return props;
}

async function queryProfileLogPageIdsByGoogleEmail(
  notion: Client,
  dataSourceId: string,
  googleEmail: string,
): Promise<string[]> {
  const filterEmail = googleEmail.trim();
  const pageIds: string[] = [];
  let cursor: string | undefined;
  for (;;) {
    const res = await notion.dataSources.query({
      data_source_id: dataSourceId,
      filter: {
        property: "Google Email",
        email: { equals: filterEmail },
      },
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });

    for (const row of res.results) {
      if (row && typeof row === "object" && "id" in row) {
        const id = (row as { id: string }).id;
        if (typeof id === "string") pageIds.push(id);
      }
    }

    if (!res.has_more || !res.next_cursor) break;
    cursor = res.next_cursor;
  }
  return pageIds;
}

/**
 * Sets presence fields on all profile-log rows for the given Google account.
 * No-ops when no matching pages exist.
 *
 * Reuses {@link getProfileLogPageIdsFromCache} after a Notion query so rapid
 * presence pings skip repeat `dataSources.query` until TTL or invalidation.
 */
export async function syncProfileLogPresenceToNotion(
  googleEmail: string,
  active: boolean,
): Promise<void> {
  const dbId = process.env.NOTION_PROFILE_LOG_DB_ID;
  if (!dbId) {
    throw new Error("Missing NOTION_PROFILE_LOG_DB_ID environment variable.");
  }

  const notion = getNotionClientForRealm("profile");
  let pageIds = getProfileLogPageIdsFromCache(dbId, googleEmail);
  if (pageIds === undefined) {
    pageIds = await queryProfileLogPageIdsByGoogleEmail(
      notion,
      dbId,
      googleEmail,
    );
    setProfileLogPageIdsCache(dbId, googleEmail, pageIds);
  }
  if (pageIds.length === 0) return;

  const when = new Date().toISOString();
  const presenceProps = {
    [NOTION_PROFILE_LOG_IS_ACTIVE]: { checkbox: active },
    [NOTION_PROFILE_LOG_LAST_ACTIVE_AT]: { date: { start: when } },
  } as Parameters<typeof notion.pages.update>[0]["properties"];

  for (const pageId of pageIds) {
    await notion.pages.update({
      page_id: pageId,
      properties: presenceProps,
    });
  }
}

/**
 * Upsert the Notion profile-creation log row for this Google account: query by
 * **Google Email**, update all matches, or create one if none exist.
 *
 * When a people-DB match exists, links it via the "CSPR Notion Profile"
 * relation property. On update, an empty relation clears that link in Notion.
 *
 * Intended to be called fire-and-forget after Supabase profile writes — a
 * failure here should never block the primary flow.
 *
 * New rows are always created with {@link ProfileLogSyncMode} `full` (both
 * emails required). {@link ProfileLogSyncMode} `metadataOnly` only affects
 * updates so background sync does not rewrite email columns.
 *
 * Requires `NOTION_PROFILE_LOG_DB_ID` env var.
 */
export async function syncProfileCreationLogToNotion(
  params: ProfileLogSyncParams,
  syncMode: ProfileLogSyncMode = "full",
): Promise<void> {
  const dbId = process.env.NOTION_PROFILE_LOG_DB_ID;
  if (!dbId) {
    throw new Error("Missing NOTION_PROFILE_LOG_DB_ID environment variable.");
  }

  const notion = getNotionClientForRealm("profile");
  const pageIds = await queryProfileLogPageIdsByGoogleEmail(
    notion,
    dbId,
    params.googleEmail,
  );

  if (pageIds.length > 0) {
    const updateProps = buildProfileLogNotionProperties(params, {
      includeCreatedAt: false,
      relationMode: "always",
      syncMode,
    });
    for (const pageId of pageIds) {
      await notion.pages.update({
        page_id: pageId,
        properties: updateProps as Parameters<
          typeof notion.pages.update
        >[0]["properties"],
      });
    }
    return;
  }

  const createProps = buildProfileLogNotionProperties(params, {
    includeCreatedAt: true,
    relationMode: "omit_if_empty",
    syncMode: "full",
  });
  await notion.pages.create({
    parent: { type: "data_source_id", data_source_id: dbId },
    properties: createProps as Parameters<
      typeof notion.pages.create
    >[0]["properties"],
  });
  invalidateProfileLogPageIdsCache(dbId, params.googleEmail);
}

/** @see {@link syncProfileCreationLogToNotion} */
export async function logProfileCreationToNotion(
  params: ProfileLogSyncParams,
): Promise<void> {
  await syncProfileCreationLogToNotion(params, "full");
}