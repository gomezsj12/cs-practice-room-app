/**
 * Notion API client and jam-reservation data-source helpers.
 *
 * Manages a singleton Notion client and exposes helpers to create and
 * cancel jam reservations in the Notion data source that mirrors
 * Google Calendar bookings.
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