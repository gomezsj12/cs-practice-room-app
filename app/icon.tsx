/**
 * @file Favicon generator (`/favicon.ico` equivalent).
 *
 * Uses the Next.js file-based metadata convention to generate a 192×192 PNG
 * favicon at build time via `createPwaIcon`. Browsers that support higher-res
 * favicons (e.g. Chrome tab previews) get a crisp icon without a static file.
 *
 * @see {@link @/lib/pwaIcon}: shared icon renderer (uses `next/og` ImageResponse)
 * @see {@link @/app/apple-icon}: same pattern at 180×180 for iOS
 */

import { createPwaIcon } from "@/lib/pwaIcon";

export const size = {
  width: 192,
  height: 192,
};

export const contentType = "image/png";

/** Generates the site favicon as a 192×192 PNG. */
export default function Icon() {
  return createPwaIcon(192);
}