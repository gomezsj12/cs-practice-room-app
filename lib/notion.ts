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
  if (!page) return null;

  const departments = emptyDepartments();

  let sjBand: string | null = null;
  let type: string | null = null;

  if ("properties" in page) {
    const properties = page.properties as Record<
      string,
      {
        type: string;
        multi_select?: Array<{ name: string }>;
        select?: { name: string } | null;
        rich_text?: Array<{ plain_text?: string }>;
        title?: Array<{ plain_text?: string }>;
      }
    >;

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
  }

  return { pageId: page.id, departments, sjBand, type };
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

  const notionProfileUrl = notionPageId
    ? `https://www.notion.so/${notionPageId.replace(/-/g, "")}`
    : "";

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
      ...(notionProfileUrl
        ? {
            "Notion Profile": {
              rich_text: [
                {
                  text: { content: notionProfileUrl },
                },
              ],
            },
          }
        : {}),
      "Created At": {
        date: { start: new Date().toISOString() },
      },
    },
  });
}