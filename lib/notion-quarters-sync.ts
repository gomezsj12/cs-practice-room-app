/**
 * Full sync of the Notion **WWU Quarters** data source into Supabase `wwu_quarters`.
 *
 * Requires `NOTION_WWU_QUARTERS_DATA_SOURCE_ID` and Notion property names
 * (defaults: **Name**, **Start Date**, **End Date**).
 */
import { getNotionClient } from "@/lib/notion";
import { getSupabaseAdmin } from "@/lib/supabase";

type NotionTitleProp = {
  type: "title";
  title: Array<{ plain_text?: string }>;
};

type NotionDateProp = {
  type: "date";
  date: { start: string; end?: string | null } | null;
};

function readTitle(
  properties: Record<string, unknown>,
  propName: string,
): string | null {
  const raw = properties[propName];
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const p = raw as NotionTitleProp;
  if (p.type !== "title" || !Array.isArray(p.title)) {
    return null;
  }
  const text = p.title.map((t) => t.plain_text ?? "").join("").trim();
  return text || null;
}

/** Notion date values may be `YYYY-MM-DD` or date-time; keep calendar portion. */
function readDateColumn(
  properties: Record<string, unknown>,
  propName: string,
): string | null {
  const raw = properties[propName];
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const p = raw as NotionDateProp;
  if (p.type !== "date" || !p.date?.start) {
    return null;
  }
  return p.date.start.slice(0, 10);
}

type SyncWwuQuartersResult = {
  upserted: number;
  deleted: number;
  skipped: number;
};

/**
 * Pulls all pages from the quarters data source, upserts into Supabase, and
 * deletes rows whose `notion_page_id` no longer exists in Notion.
 */
export async function syncWwuQuartersFromNotion(): Promise<SyncWwuQuartersResult> {
  const dataSourceId = process.env.NOTION_WWU_QUARTERS_DATA_SOURCE_ID?.trim();
  if (!dataSourceId) {
    throw new Error("Missing NOTION_WWU_QUARTERS_DATA_SOURCE_ID environment variable.");
  }

  const nameProp =
    process.env.NOTION_WWU_QUARTERS_NAME_PROP?.trim() || "Name";
  const startProp =
    process.env.NOTION_WWU_QUARTERS_START_DATE_PROP?.trim() || "Start Date";
  const endProp =
    process.env.NOTION_WWU_QUARTERS_END_DATE_PROP?.trim() || "End Date";

  const notion = getNotionClient();
  const pages: Array<{ id: string; properties: Record<string, unknown> }> = [];

  let cursor: string | undefined;
  do {
    const res = await notion.dataSources.query({
      data_source_id: dataSourceId,
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });

    for (const item of res.results) {
      if (!item || typeof item !== "object" || !("id" in item)) {
        continue;
      }
      const id = (item as { id: string }).id;
      if (
        !("properties" in item) ||
        !(item as { properties?: unknown }).properties
      ) {
        continue;
      }
      pages.push({
        id,
        properties: (item as { properties: Record<string, unknown> })
          .properties,
      });
    }

    const next =
      "next_cursor" in res && typeof res.next_cursor === "string"
        ? res.next_cursor
        : null;
    const hasMore =
      "has_more" in res && res.has_more === true && Boolean(next);
    cursor = hasMore ? next! : undefined;
  } while (cursor);

  const supabase = getSupabaseAdmin();
  const fetchedIds = new Set<string>();
  let skipped = 0;
  let upserted = 0;

  const rows: Array<{
    notion_page_id: string;
    name: string;
    start_date: string;
    end_date: string;
    updated_at: string;
  }> = [];

  for (const page of pages) {
    const name = readTitle(page.properties, nameProp);
    const start_date = readDateColumn(page.properties, startProp);
    const end_date = readDateColumn(page.properties, endProp);

    if (!name || !start_date || !end_date) {
      console.warn(
        "[notion-quarters-sync] Skipping page (missing name or dates):",
        page.id,
      );
      skipped += 1;
      continue;
    }

    if (end_date < start_date) {
      console.warn(
        "[notion-quarters-sync] Skipping page (end before start):",
        page.id,
      );
      skipped += 1;
      continue;
    }

    fetchedIds.add(page.id);
    rows.push({
      notion_page_id: page.id,
      name,
      start_date,
      end_date,
      updated_at: new Date().toISOString(),
    });
  }

  if (rows.length > 0) {
    const { error } = await supabase.from("wwu_quarters").upsert(rows, {
      onConflict: "notion_page_id",
    });
    if (error) {
      throw error;
    }
    upserted = rows.length;
  }

  const { data: existing, error: existingErr } = await supabase
    .from("wwu_quarters")
    .select("notion_page_id");

  if (existingErr) {
    throw existingErr;
  }

  let deleted = 0;
  const toRemove =
    existing?.filter((r) => r.notion_page_id && !fetchedIds.has(r.notion_page_id)) ??
    [];

  for (const r of toRemove) {
    const { error: delErr } = await supabase
      .from("wwu_quarters")
      .delete()
      .eq("notion_page_id", r.notion_page_id);
    if (delErr) {
      console.error(
        "[notion-quarters-sync] Failed to delete orphan:",
        r.notion_page_id,
        delErr,
      );
      continue;
    }
    deleted += 1;
  }

  return { upserted, deleted, skipped };
}
