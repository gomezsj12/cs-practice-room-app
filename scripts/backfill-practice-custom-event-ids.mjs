import fs from "node:fs";
import path from "node:path";
import { Client } from "@notionhq/client";

const PREFIX = "GOOGLECALidentifier";
const LOWER_MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

function loadDotEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    return;
  }

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function formatUtcInstantForPracticeCustomEventId(date) {
  const month = LOWER_MONTHS[date.getUTCMonth()];
  const day = date.getUTCDate();
  const year = date.getUTCFullYear();
  const h24 = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const isPm = h24 >= 12;
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  const ampm = isPm ? "pm" : "am";
  const minuteStr = String(minutes).padStart(2, "0");
  return `${month}${day}${year}${h12}${minuteStr}${ampm}(utc)`;
}

function normalizePhoneDigits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function richTextPlain(prop) {
  if (!prop) return "";
  if (prop.type === "rich_text") {
    return (prop.rich_text ?? []).map((x) => x.plain_text ?? "").join("").trim();
  }
  if (prop.type === "title") {
    return (prop.title ?? []).map((x) => x.plain_text ?? "").join("").trim();
  }
  return "";
}

function readRollupPhoneDigits(prop) {
  if (!prop) return "";

  if (prop.type === "rollup" && prop.rollup?.type === "array") {
    for (const item of prop.rollup.array ?? []) {
      if (item?.type === "phone_number" && item.phone_number) {
        const digits = normalizePhoneDigits(item.phone_number);
        if (digits) return digits;
      }
      if (item?.type === "rich_text") {
        const digits = normalizePhoneDigits(
          (item.rich_text ?? []).map((x) => x.plain_text ?? "").join(""),
        );
        if (digits) return digits;
      }
    }
  }

  if (prop.type === "phone_number" && prop.phone_number) {
    return normalizePhoneDigits(prop.phone_number);
  }

  return normalizePhoneDigits(richTextPlain(prop));
}

function buildCanonicalCustomEventId({ startIso, sessionLengthHours, phoneDigits, attendeeCount }) {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return null;
  if (!Number.isFinite(sessionLengthHours)) return null;
  const end = new Date(start.getTime() + sessionLengthHours * 3_600_000);
  if (Number.isNaN(end.getTime())) return null;
  if (!phoneDigits) return null;
  if (!Number.isInteger(attendeeCount) || attendeeCount < 0) return null;

  const startSeg = formatUtcInstantForPracticeCustomEventId(start);
  const endSeg = formatUtcInstantForPracticeCustomEventId(end);
  return `${PREFIX}-${startSeg}-${endSeg}${phoneDigits}${attendeeCount}`;
}

async function main() {
  loadDotEnvLocal();

  const write = process.argv.includes("--write");
  const notionToken = process.env.NOTION_TOKEN_CALENDAR || process.env.NOTION_TOKEN;
  const dataSourceId = process.env.NOTION_FILLOUT_MASTER_DATA_SOURCE_ID?.trim();

  if (!notionToken) {
    throw new Error("Missing NOTION_TOKEN_CALENDAR or NOTION_TOKEN.");
  }
  if (!dataSourceId) {
    throw new Error("Missing NOTION_FILLOUT_MASTER_DATA_SOURCE_ID.");
  }

  const notion = new Client({ auth: notionToken });

  let cursor = undefined;
  let scanned = 0;
  let matched = 0;
  let updated = 0;
  let skipped = 0;

  for (;;) {
    const res = await notion.dataSources.query({
      data_source_id: dataSourceId,
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });

    for (const page of res.results) {
      if (!("properties" in page)) continue;
      scanned += 1;

      const props = page.properties;
      const currentCustomEventId = richTextPlain(props["Custom Event ID"]);
      const title = richTextPlain(props["Practice Name"]) || page.id;
      const startIso = props["Start Date/Time"]?.date?.start ?? "";
      const sessionLengthHours = props["Session Length (hours)"]?.number;
      const attendeeCount = props["# of Session Attendees"]?.number;
      const phoneDigits = readRollupPhoneDigits(props["Contact phone"]);

      const canonical = buildCanonicalCustomEventId({
        startIso,
        sessionLengthHours,
        phoneDigits,
        attendeeCount,
      });

      if (!canonical) {
        skipped += 1;
        console.log(`SKIP\t${title}\t${page.id}\tmissing_required_fields`);
        continue;
      }

      if (currentCustomEventId === canonical) {
        matched += 1;
        continue;
      }

      console.log(
        `${write ? "UPDATE" : "WOULD_UPDATE"}\t${title}\t${page.id}\n  from: ${currentCustomEventId}\n  to:   ${canonical}`,
      );

      if (write) {
        await notion.pages.update({
          page_id: page.id,
          properties: {
            "Custom Event ID": {
              rich_text: [{ text: { content: canonical } }],
            },
          },
        });
        updated += 1;
      }
    }

    if (!res.has_more || !res.next_cursor) break;
    cursor = res.next_cursor;
  }

  console.log("");
  console.log(
    JSON.stringify(
      {
        mode: write ? "write" : "dry-run",
        scanned,
        alreadyCanonical: matched,
        updated,
        skipped,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
