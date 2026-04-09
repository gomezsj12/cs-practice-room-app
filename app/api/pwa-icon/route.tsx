/**
 * @file PWA icon generation endpoint (`GET /api/pwa-icon?size=<n>`).
 *
 * Runs on the Edge runtime for fast response times. Returns a dynamically
 * rendered PNG icon at either 192 or 512 px (snapped from the `size` query
 * param). Referenced by the PWA manifest for home-screen and splash icons.
 *
 * @see {@link @/lib/pwaIcon} — `createPwaIcon` (uses `next/og` ImageResponse)
 * @see {@link @/app/manifest} — declares icon URLs pointing here
 */

import { NextRequest } from "next/server";
import { createPwaIcon } from "@/lib/pwaIcon";

export const runtime = "edge";

/**
 * Handles `GET /api/pwa-icon`.
 *
 * Snaps `?size=` to one of two supported dimensions (192 or 512) and returns
 * the generated PNG. Defaults to 512 when no size is provided.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestedSize = Number(searchParams.get("size") ?? "512");

  // Only two icon sizes are used; snap to the nearest supported dimension.
  const size = requestedSize >= 512 ? 512 : 192;

  return createPwaIcon(size);
}