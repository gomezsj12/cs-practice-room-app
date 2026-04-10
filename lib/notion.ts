/**
 * Notion API client, jam-reservation, and user-profile helpers.
 *
 * Manages a singleton Notion client and exposes helpers to:
 * - Create and cancel jam reservations in the Notion data source.
 * - Look up users in the Notion people database by WWU email.
 * - Log profile-creation events to a Notion audit database.
 *
 * @see {@link ../lib/google.ts}  — Google Calendar side of the same booking flow.
 * @see {@link ../lib/types.ts}   — shared type definitions.
 */
import { Client } from "@notionhq/client";

/** Pinned Notion API version to avoid breaking changes from upstream. */
const NOTION_VERSION = "2026-03-11";

/** Singleton — created on first call, reused for the lifetime of the process. */
let _client: Client | null = null;

/**
 * Return a shared Notion client, creating it on first call.
 * Requires `NOTION_TOKEN` env var.
 */
export function getNotionClient() {
  if (!_client) {
    const token = process.env.NOTION_TOKEN;

    if (!token) {
      throw new Error("Missing NOTION_TOKEN environment variable.");
    }

    _client = new Client({
      auth: token,
      notionVersion: NOTION_VERSION,
    });
  }

  return _client;
}

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

  const notion = getNotionClient();

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

  const notion = getNotionClient();

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
    },
  });

  return pageId;
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

/** Result of a Notion people-DB lookup: page ID + department flags. */
export type NotionPersonResult = {
  pageId: string;
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

/**
 * Search the Notion people data source for a user by their Walla Walla
 * University email. Returns the page ID and department flags extracted
 * from the "Service Type" multi-select property, or `null` if no entry
 * is found.
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

  const notion = getNotionClient();

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

/**
 * Inspect a Notion page once and decide whether to delete or sync a Supabase profile.
 * Uses one `pages.retrieve` call per webhook delivery.
 */
export async function resolveNotionProfileWebhookAction(
  pageId: string,
): Promise<NotionProfileWebhookAction> {
  const logDs = process.env.NOTION_PROFILE_LOG_DB_ID;
  const peopleDs = process.env.NOTION_PEOPLE_DB_ID;
  if (!logDs) {
    throw new Error("Missing NOTION_PROFILE_LOG_DB_ID environment variable.");
  }
  if (!peopleDs) {
    throw new Error("Missing NOTION_PEOPLE_DB_ID environment variable.");
  }

  const notion = getNotionClient();
  const page = await notion.pages.retrieve({ page_id: pageId });

  if (!("properties" in page)) {
    return { action: "none" };
  }

  const parentDs = getDataSourceIdFromNotionParent(page);
  const props = page.properties as Record<string, NotionPeopleProp>;

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

/** Parameters for {@link logProfileCreationToNotion}. */
type ProfileLogParams = {
  displayName: string;
  googleEmail: string;
  wwuEmail: string;
  foundInNotion: boolean;
  /** Notion page ID of the matched people-DB entry (if any). */
  notionPageId: string | null;
};

/**
 * Write an audit row to the Notion profile-creation log database.
 *
 * When a people-DB match exists, links it via the "CSPR Notion Profile"
 * relation property (page id of the matched row).
 *
 * Called fire-and-forget from the profile-setup API route — a failure
 * here should never block profile creation in Supabase.
 *
 * Requires `NOTION_PROFILE_LOG_DB_ID` env var.
 */
export async function logProfileCreationToNotion({
  displayName,
  googleEmail,
  wwuEmail,
  foundInNotion,
  notionPageId,
}: ProfileLogParams) {
  const dbId = process.env.NOTION_PROFILE_LOG_DB_ID;
  if (!dbId) {
    throw new Error("Missing NOTION_PROFILE_LOG_DB_ID environment variable.");
  }

  const notion = getNotionClient();

  await notion.pages.create({
    parent: { type: "data_source_id", data_source_id: dbId },
    properties: {
      Name: {
        title: [{ text: { content: displayName } }],
      },
      "Google Email": {
        email: googleEmail,
      },
      "WWU Email": {
        email: wwuEmail,
      },
      "Found in Notion": {
        checkbox: foundInNotion,
      },
      ...(notionPageId
        ? {
            "CSPR Notion Profile": {
              relation: [{ id: notionPageId }],
            },
          }
        : {}),
      "Created At": {
        date: { start: new Date().toISOString() },
      },
    },
  });
}