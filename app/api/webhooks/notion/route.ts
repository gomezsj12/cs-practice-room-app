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
 * Set `NOTION_WEBHOOK_VERIFICATION_TOKEN` to the integration’s verification
 * token (same value Notion uses for `X-Notion-Signature`). Requests are
 * rejected if this env var is unset — the token in the JSON body is never
 * used as the HMAC secret (that would allow forged webhooks). For local-only
 * experiments, `NOTION_WEBHOOK_ALLOW_UNSAFE_DEV=true` may be set when
 * `VERCEL_ENV` is not `production` or `preview` to fall back to the body
 * token for signature verification only.
 *
 * Subscribe to event type: `page.properties_updated`.
 */

import { NextResponse } from "next/server";
import { isEffectiveAppAdmin } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyNotionWebhookSignature } from "@/lib/notion-webhook";
import { processNotionCalendarCancellationFromPage } from "@/lib/notion-calendar-webhook";
import {
  getNotionClient,
  resolveNotionProfileWebhookActionFromPage,
  type NotionPersonSyncFields,
  type NotionProfileWebhookPage,
} from "@/lib/notion";

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
  const vercelEnv = process.env.VERCEL_ENV;
  const allowUnsafeBodyToken =
    process.env.NOTION_WEBHOOK_ALLOW_UNSAFE_DEV === "true" &&
    vercelEnv !== "production" &&
    vercelEnv !== "preview";
  const verificationToken =
    envToken ||
    (allowUnsafeBodyToken && typeof body.verification_token === "string"
      ? body.verification_token
      : "");

  if (!verificationToken) {
    return NextResponse.json(
      {
        error:
          "Missing NOTION_WEBHOOK_VERIFICATION_TOKEN. Set it to your Notion webhook verification token (same value used for X-Notion-Signature).",
      },
      { status: 401 },
    );
  }

  if (!verifyNotionWebhookSignature(rawBody, signature, verificationToken)) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  if (typeof body.verification_token === "string" && body.type === undefined) {
    console.info(
      "[notion webhook] Subscription verify OK (signature validated; token not logged).",
    );
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
      .select("id");
    if (error) {
      console.error("[notion webhook] Supabase update failed:", error);
      return new NextResponse("supabase error", { status: 500 });
    }
    if (data?.length) {
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

  return NextResponse.json({ ok: true });
}
