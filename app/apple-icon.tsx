/**
 * @file Apple Touch Icon generator (`/apple-icon.png`).
 *
 * Uses the Next.js file-based metadata convention to produce a 180×180 PNG
 * that iOS uses for the home-screen bookmark icon. Mirrors `icon.tsx` but at
 * the 180 px size Apple expects.
 *
 * @see {@link @/lib/pwaIcon}: shared icon renderer (uses `next/og` ImageResponse)
 * @see {@link @/app/icon}: same pattern at 192×192 for the standard favicon
 */

import { createPwaIcon } from "@/lib/pwaIcon";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

/** Generates the Apple Touch Icon as a 180×180 PNG. */
export default function AppleIcon() {
  return createPwaIcon(180);
}