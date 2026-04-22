import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  NOTION_WEBHOOK_VERIFICATION_TOKEN_CALENDAR,
  NOTION_WEBHOOK_VERIFICATION_TOKEN_PROFILE,
} from "@/lib/notion-dual-integration-env";
import { matchNotionWebhookSignatureAndRealm } from "@/lib/notion-webhook-secrets";

function sign(secret: string, rawBody: string): string {
  const hex = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  return `sha256=${hex}`;
}

describe("matchNotionWebhookSignatureAndRealm", () => {
  afterEach(() => {
    delete process.env[NOTION_WEBHOOK_VERIFICATION_TOKEN_CALENDAR];
    delete process.env[NOTION_WEBHOOK_VERIFICATION_TOKEN_PROFILE];
    delete process.env.NOTION_WEBHOOK_VERIFICATION_TOKEN;
  });

  it("matches calendar env secret and returns realm calendar", () => {
    process.env[NOTION_WEBHOOK_VERIFICATION_TOKEN_CALENDAR] = "cal-secret";
    const raw = JSON.stringify({ type: "page.properties_updated", hello: 1 });
    const sig = sign("cal-secret", raw);
    const m = matchNotionWebhookSignatureAndRealm(raw, sig, "", false);
    expect(m).toEqual({ matchedSecret: "cal-secret", realm: "calendar" });
  });

  it("matches profile env secret and returns realm profile", () => {
    process.env[NOTION_WEBHOOK_VERIFICATION_TOKEN_PROFILE] = "prof-secret";
    const raw = JSON.stringify({ type: "page.properties_updated" });
    const sig = sign("prof-secret", raw);
    const m = matchNotionWebhookSignatureAndRealm(raw, sig, "", false);
    expect(m).toEqual({ matchedSecret: "prof-secret", realm: "profile" });
  });

  it("treats legacy NOTION_WEBHOOK_VERIFICATION_TOKEN as profile realm", () => {
    process.env.NOTION_WEBHOOK_VERIFICATION_TOKEN = "legacy-secret";
    const raw = JSON.stringify({ type: "page.properties_updated" });
    const sig = sign("legacy-secret", raw);
    const m = matchNotionWebhookSignatureAndRealm(raw, sig, "", false);
    expect(m).toEqual({ matchedSecret: "legacy-secret", realm: "profile" });
  });

  it("accepts subscription verify using body verification_token when env empty", () => {
    const bodyTok = "fresh-subscription-token";
    const raw = JSON.stringify({ verification_token: bodyTok });
    const sig = sign(bodyTok, raw);
    const m = matchNotionWebhookSignatureAndRealm(raw, sig, bodyTok, true);
    expect(m?.matchedSecret).toBe(bodyTok);
    expect(m?.realm).toBe("calendar");
  });

  it("returns null when signature wrong", () => {
    process.env[NOTION_WEBHOOK_VERIFICATION_TOKEN_CALENDAR] = "cal-secret";
    const raw = JSON.stringify({ type: "page.properties_updated" });
    const sig = sign("other", raw);
    const m = matchNotionWebhookSignatureAndRealm(raw, sig, "", false);
    expect(m).toBeNull();
  });
});
