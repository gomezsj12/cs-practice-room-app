import { Client } from "@notionhq/client";

const NOTION_VERSION = "2026-03-11";

let _client: Client | null = null;

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

type CreateJamReservationParams = {
  name: string;
  instrument: string;
  start: string;
  end: string;
  googleEventId: string;
  ownerEmail: string;
};

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