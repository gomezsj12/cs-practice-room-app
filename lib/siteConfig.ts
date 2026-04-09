/**
 * Global site configuration.
 *
 * Centralises app-wide constants (name, description, external URLs) so they
 * can be referenced from metadata, manifest, and UI components without
 * duplicating strings. Values fall back to hard-coded defaults when the
 * corresponding `NEXT_PUBLIC_*` env vars are not set.
 *
 * @module
 */

/** App-wide constants consumed by metadata helpers, the PWA manifest, and UI chrome. */
export const siteConfig = {
  name: "CS Practice Room App",
  shortName: "Practice Room",
  description:
    "A shared home for practice-room booking, jam reservations, and future student support tools.",
  filloutUrl:
    process.env.NEXT_PUBLIC_FILLOUT_URL ?? "https://form.fillout.com/t/jVgTDpCFPAus",
  telegramContactUrl: process.env.NEXT_PUBLIC_TELEGRAM_CONTACT_URL ?? "",
  telegramGroupUrl: process.env.NEXT_PUBLIC_TELEGRAM_GROUP_URL ?? "",
};
