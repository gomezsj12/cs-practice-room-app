import { createHmac, timingSafeEqual } from "crypto";

function hmacSha256Hex(secret: string, message: string): string {
  return createHmac("sha256", secret).update(message, "utf8").digest("hex");
}

/**
 * Validate `X-Notion-Signature` for a webhook POST body using the subscription
 * verification token (see Notion integration → Webhooks).
 *
 * Notion’s own examples sign `JSON.stringify(parsedBody)`; the wire body can
 * differ by whitespace, so we try the raw body and a canonical re-stringified
 * payload.
 */
export function verifyNotionWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  verificationToken: string,
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return false;
  }

  const variants = new Set<string>([rawBody]);
  try {
    variants.add(JSON.stringify(JSON.parse(rawBody) as object));
  } catch {
    /* rawBody may not be JSON; only raw variant applies */
  }

  for (const payload of variants) {
    const expected = `sha256=${hmacSha256Hex(verificationToken, payload)}`;
    try {
      if (
        timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader))
      ) {
        return true;
      }
    } catch {
      /* length mismatch */
    }
  }
  return false;
}
