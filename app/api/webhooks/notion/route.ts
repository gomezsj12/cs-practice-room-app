/**
 * @file POST /api/webhooks/notion — Notion integration webhooks.
 *
 * Handles `page.properties_updated` for:
 * - Profile log data source: checkbox {@link NOTION_PROFILE_LOG_DELETE_PROP}
 *   deletes the Supabase `profiles` row for that log row's Google Email.
 * - People data source: pushes Notion field changes to the matching profile
 *   (`notion_page_id` = people row page id).
 *
 * Configure in the Notion integration (Webhooks tab): URL must be HTTPS.
 * Set `NOTION_WEBHOOK_VERIFICATION_TOKEN` to the verification token from the
 * subscription handshake (same secret used for `X-Notion-Signature`).
 *
 * Subscribe to event type: `page.properties_updated`.
 */

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyNotionWebhookSignature } from "@/lib/notion-webhook";
import {
  resolveNotionProfileWebhookAction,
  type NotionPersonSyncFields,
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

  const verificationToken =
    process.env.NOTION_WEBHOOK_VERIFICATION_TOKEN ??
    (typeof body.verification_token === "string" ? body.verification_token : "");

  if (
    !verificationToken ||
    !verifyNotionWebhookSignature(rawBody, signature, verificationToken)
  ) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  if (typeof body.verification_token === "string" && body.type === undefined) {
    console.info(
      "[notion webhook] Subscription verify OK. Paste this exact value into Notion:",
      body.verification_token,
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

  let resolved: Awaited<ReturnType<typeof resolveNotionProfileWebhookAction>>;
  try {
    resolved = await resolveNotionProfileWebhookAction(pageId);
  } catch (err) {
    console.error("[notion webhook] Notion page read failed:", err);
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
    const patch = buildSupabasePatchFromNotionPerson(resolved.fields);
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

  return NextResponse.json({ ok: true });
}
