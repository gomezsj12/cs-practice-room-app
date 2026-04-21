/**
 * @file POST /api/webhooks/notion — Notion integration webhooks.
 *
 * Handles `page.properties_updated` for:
 * - Profile log data source: checkbox {@link NOTION_PROFILE_LOG_DELETE_PROP}
 *   deletes the Supabase `profiles` row for that log row's Google Email.
 * - People data source: pushes Notion field changes to the matching profile
 *   (`notion_page_id` = people row page id).
 * - Jam data source: **Status** set to **Cancelled** (without **CSPR Cancel origin**
 *   = `calendar_app`) deletes the Google Calendar jam event.
 * - Fillout master data source: **Session Status** set to **Cancelled** (without
 *   app stamp) parses the **Custom Event ID** and deletes the matching practice
 *   Google Calendar event.
 *
 * Configure in the Notion integration (Webhooks tab): URL must be HTTPS.
 * Set `NOTION_WEBHOOK_VERIFICATION_TOKEN` to the subscription verification
 * token (same secret Notion uses for `X-Notion-Signature`). For the initial
 * subscription verify POST, Notion signs the body using `verification_token`
 * inside that body ([Notion webhooks](https://developers.notion.com/reference/webhooks)),
 * so this route tries both the env var and the body token when verifying the
 * signature.
 *
 * Subscribe to event type: `page.properties_updated`.
 */

import { NextResponse } from "next/server";
import { isEffectiveAppAdmin } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyNotionWebhookSignature } from "@/lib/notion-webhook";
import { processNotionCalendarCancellationFromPage } from "@/lib/notion-calendar-webhook";
import {
  extractAssigneePageIdsFromPracticeProperties,
  getNotionClient,
  getNotionPageParentIds,
  hydratePracticeAssigneesFromPageIds,
  resolveNotionProfileWebhookActionFromPage,
  syncProfileCreationLogToNotion,
  type NotionPersonSyncFields,
  type NotionProfileWebhookPage,
} from "@/lib/notion";
import { upsertCacheByNotionPageId } from "@/lib/practice-session-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type NotionWebhookBody = {
  verification_token?: string;
  type?: string;
  entity?: { id?: string; type?: string };
};

function buildSupabasePatchFromNotionPerson(fields: NotionPersonSyncFields) {
  return {
    ...fields.departments,
    sj_band: fields.sjBand,
    type: fields.type,
    ...(fields.displayName !== null
      ? { display_name: fields.displayName }
      : {}),
    ...(fields.wwuEmail !== null
      ? { walla_walla_email: fields.wwuEmail }
      : {}),
  };
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-notion-signature");

  let body: NotionWebhookBody;
  try {
    body = JSON.parse(rawBody) as NotionWebhookBody;
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  const envToken = process.env.NOTION_WEBHOOK_VERIFICATION_TOKEN?.trim() ?? "";

  /** Notion signs payloads with the subscription’s verification token (see Notion webhook docs). */
  const bodyToken =
    typeof body.verification_token === "string"
      ? body.verification_token.trim()
      : "";

  const candidateSecrets = [...new Set([envToken, bodyToken].filter(Boolean))];

  if (candidateSecrets.length === 0) {
    return NextResponse.json(
      {
        error:
          "missing_signing_secret",
        hint:
          "Set NOTION_WEBHOOK_VERIFICATION_TOKEN in Vercel to your webhook subscription verification token, or trigger a new subscription verify POST from Notion (body must include verification_token).",
      },
      { status: 401 },
    );
  }

  let matchedSecret: string | null = null;
  for (const secret of candidateSecrets) {
    if (verifyNotionWebhookSignature(rawBody, signature, secret)) {
      matchedSecret = secret;
      break;
    }
  }

  if (!matchedSecret) {
    return NextResponse.json(
      {
        error: "invalid_signature",
        hint:
          "NOTION_WEBHOOK_VERIFICATION_TOKEN must equal this integration’s webhook verification token from Notion (same one Notion uses for X-Notion-Signature). For subscription verify, the body’s verification_token is tried automatically.",
      },
      { status: 401 },
    );
  }

  if (typeof body.verification_token === "string" && body.type === undefined) {
    console.info(
      "[notion webhook] Subscription verify OK (signature validated; token not logged).",
    );
    if (!envToken) {
      console.warn(
        "[notion webhook] NOTION_WEBHOOK_VERIFICATION_TOKEN is unset. Copy this subscription verification token from the Notion Webhooks UI into Vercel so signed event deliveries (e.g. page.properties_updated) continue to validate.",
      );
    }
    return new NextResponse(null, { status: 200 });
  }

  if (body.type !== "page.properties_updated") {
    return NextResponse.json({ ok: true });
  }

  if (body.entity?.type !== "page" || !body.entity.id) {
    return NextResponse.json({ ok: true });
  }

  const pageId = body.entity.id;

  let page: Awaited<ReturnType<ReturnType<typeof getNotionClient>["pages"]["retrieve"]>>;
  try {
    page = await getNotionClient().pages.retrieve({ page_id: pageId });
  } catch (err) {
    console.error("[notion webhook] Notion page read failed:", err);
    return new NextResponse("notion error", { status: 500 });
  }

  if (!("properties" in page)) {
    return NextResponse.json({ ok: true });
  }

  let resolved: ReturnType<typeof resolveNotionProfileWebhookActionFromPage>;
  try {
    resolved = resolveNotionProfileWebhookActionFromPage(
      page as NotionProfileWebhookPage,
    );
  } catch (err) {
    console.error("[notion webhook] Profile webhook resolve failed:", err);
    return new NextResponse("notion error", { status: 500 });
  }

  if (resolved.action === "delete_profile") {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("profiles")
      .delete()
      .eq("google_email", resolved.googleEmail);
    if (error) {
      console.error("[notion webhook] Supabase delete failed:", error);
      return new NextResponse("supabase error", { status: 500 });
    }
    return NextResponse.json({ ok: true, action: "deleted_profile" });
  }

  if (resolved.action === "sync_profile") {
    const supabase = getSupabaseAdmin();
    const { data: matchRows } = await supabase
      .from("profiles")
      .select("google_email")
      .eq("notion_page_id", resolved.fields.pageId)
      .limit(1);
    const googleEmail = matchRows?.[0]?.google_email ?? null;
    const patch = {
      ...buildSupabasePatchFromNotionPerson(resolved.fields),
      ...(googleEmail
        ? {
            is_admin: isEffectiveAppAdmin(
              googleEmail,
              resolved.fields.type,
            ),
          }
        : {}),
    };
    const { data, error } = await supabase
      .from("profiles")
      .update(patch)
      .eq("notion_page_id", resolved.fields.pageId)
      .select("id, google_email, display_name, walla_walla_email, notion_page_id");
    if (error) {
      console.error("[notion webhook] Supabase update failed:", error);
      return new NextResponse("supabase error", { status: 500 });
    }
    const updated = data?.[0];
    if (updated) {
      syncProfileCreationLogToNotion(
        {
          displayName: updated.display_name,
          googleEmail: updated.google_email,
          wwuEmail: updated.walla_walla_email,
          foundInNotion: !!updated.notion_page_id,
          notionPageId: updated.notion_page_id,
        },
        "metadataOnly",
      ).catch((err) => {
        console.error(
          "[notion webhook] Notion profile audit log sync failed:",
          err,
        );
      });
      return NextResponse.json({ ok: true, action: "updated_profile" });
    }
  }

  let calendarResult: Awaited<
    ReturnType<typeof processNotionCalendarCancellationFromPage>
  >;
  try {
    calendarResult = await processNotionCalendarCancellationFromPage(page);
  } catch (err) {
    console.error("[notion webhook] Calendar cancel branch failed:", err);
    return new NextResponse("calendar webhook error", { status: 500 });
  }

  if (calendarResult.outcome === "error") {
    console.error(
      "[notion webhook] Calendar cancel error:",
      calendarResult.message,
    );
    return new NextResponse("calendar delete error", { status: 500 });
  }

  if (calendarResult.outcome !== "not_calendar_page") {
    return NextResponse.json({ ok: true, calendar: calendarResult });
  }

  // Sync practice session cache for Fillout/practice pages (non-cancelled)
  try {
    const practiceDs =
      process.env.NOTION_FILLOUT_MASTER_DATA_SOURCE_ID?.trim();
    if (practiceDs && "properties" in page) {
      const parentIds = getNotionPageParentIds(
        page as Parameters<typeof getNotionPageParentIds>[0],
      );
      if (parentIds.includes(practiceDs)) {
        const props = page.properties as Record<
          string,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          any
        >;
        const sessionStatus =
          props["Session Status"]?.status?.name ??
          props["Session Status"]?.select?.name ??
          null;
        const customEventIdProp =
          props["Custom Event ID"]?.rich_text
            ?.map((c: { plain_text?: string }) => c.plain_text ?? "")
            .join("")
            .trim() ??
          props["Custom Event ID"]?.title
            ?.map((c: { plain_text?: string }) => c.plain_text ?? "")
            .join("")
            .trim() ??
          null;
        const patchlistLink =
          props["Link to Patchlist"]?.url ??
          props["Link to Patchlist"]?.rich_text
            ?.map((c: { plain_text?: string }) => c.plain_text ?? "")
            .join("")
            .trim() ??
          null;

        const assigneePageIds = extractAssigneePageIdsFromPracticeProperties(
          props as Parameters<typeof extractAssigneePageIdsFromPracticeProperties>[0],
        );
        const assigneesJson = assigneePageIds.length
          ? await hydratePracticeAssigneesFromPageIds(assigneePageIds)
          : [];

        if (customEventIdProp && pageId) {
          const notionPageUrl = `https://www.notion.so/${pageId.replace(/-/g, "")}`;
          await upsertCacheByNotionPageId({
            notion_page_id: pageId,
            custom_event_id: customEventIdProp,
            notion_page_url: notionPageUrl,
            session_status: sessionStatus,
            patchlist_link: patchlistLink || null,
            assignees_json: assigneesJson,
          });
          console.info(
            "[notion webhook] Practice session cache updated.",
            { pageId, customEventId: customEventIdProp },
          );
        }
      }
    }
  } catch (err) {
    console.warn("[notion webhook] Practice cache sync failed:", err);
  }

  return NextResponse.json({ ok: true });
}
