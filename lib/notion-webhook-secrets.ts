/**
 * Maps Notion webhook `X-Notion-Signature` verification to the API realm whose
 * token should perform follow-up `pages.retrieve` calls.
 */

import type { NotionRealm } from "@/lib/notion-clients";
import {
  NOTION_WEBHOOK_VERIFICATION_TOKEN_CALENDAR,
  NOTION_WEBHOOK_VERIFICATION_TOKEN_PROFILE,
} from "@/lib/notion-dual-integration-env";
import { verifyNotionWebhookSignature } from "@/lib/notion-webhook";

export type NotionWebhookSignatureMatch = {
  matchedSecret: string;
  realm: NotionRealm;
};

function inferRealmForBodyOnlyMatch(
  secret: string,
  cal: string,
  prof: string,
  leg: string,
  isSubscriptionVerify: boolean,
): NotionRealm {
  if (secret === cal) return "calendar";
  if (secret === prof || secret === leg) return "profile";
  if (!isSubscriptionVerify) {
    return "profile";
  }
  // Subscription verify: token may not be in env yet. Prefer calendar when the
  // calendar webhook secret is not configured (common when adding the new bot).
  if (!cal) return "calendar";
  if (!prof && !leg) return "calendar";
  return "profile";
}

/**
 * Validates the webhook HMAC and returns which signing secret matched plus the
 * Notion API realm to use for subsequent reads.
 *
 * Tries, in order: `NOTION_WEBHOOK_VERIFICATION_TOKEN_CALENDAR`,
 * `NOTION_WEBHOOK_VERIFICATION_TOKEN_PROFILE`, legacy `NOTION_WEBHOOK_VERIFICATION_TOKEN`
 * (treated as **profile** integration), then `bodyVerificationToken` when present
 * (subscription verify / bootstrap).
 */
export function matchNotionWebhookSignatureAndRealm(
  rawBody: string,
  signatureHeader: string | null,
  bodyVerificationToken: string,
  isSubscriptionVerify: boolean,
): NotionWebhookSignatureMatch | null {
  const cal =
    process.env[NOTION_WEBHOOK_VERIFICATION_TOKEN_CALENDAR]?.trim() ?? "";
  const prof =
    process.env[NOTION_WEBHOOK_VERIFICATION_TOKEN_PROFILE]?.trim() ?? "";
  const leg = process.env.NOTION_WEBHOOK_VERIFICATION_TOKEN?.trim() ?? "";
  const bodyTok = bodyVerificationToken.trim();

  const ordered: Array<{ secret: string; realm: NotionRealm | null }> = [];
  const seen = new Set<string>();

  const push = (secret: string, realm: NotionRealm | null) => {
    if (!secret || seen.has(secret)) return;
    seen.add(secret);
    ordered.push({ secret, realm });
  };

  push(cal, "calendar");
  push(prof, "profile");
  push(leg, "profile");
  // SEC-04: the body-supplied `verification_token` is attacker-controllable —
  // a forger can put any token in the body AND compute a matching
  // `X-Notion-Signature` with it, self-signing the request. So it must only be
  // honored for the one-time subscription-verify handshake (which has no side
  // effects). For real event deliveries (`page.*`), require a match against an
  // env-configured secret; never accept the body token as a signing key.
  if (isSubscriptionVerify) {
    push(bodyTok, null);
  }

  for (const { secret, realm } of ordered) {
    if (!verifyNotionWebhookSignature(rawBody, signatureHeader, secret)) {
      continue;
    }
    const resolved =
      realm ??
      inferRealmForBodyOnlyMatch(secret, cal, prof, leg, isSubscriptionVerify);
    return { matchedSecret: secret, realm: resolved };
  }

  return null;
}
