/**
 * @file PWA Web App Manifest (`/manifest.webmanifest`).
 *
 * Next.js serves this as a JSON file at the path declared in `metadata.manifest`
 * (see `layout.tsx`). It defines the app name, theme colours, orientation, and
 * icon set used by Android/Chrome "Add to Home Screen" and similar PWA installs.
 *
 * Icons are served dynamically via `/api/pwa-icon?size=<n>` so they're
 * generated at build time from `lib/pwaIcon.ts` rather than being static PNGs.
 *
 * @see {@link @/lib/siteConfig}: supplies `name`, `shortName`, `description`
 * @see {@link @/app/api/pwa-icon/route}: edge-runtime icon renderer
 */

import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/siteConfig";

/** Returns the PWA manifest object consumed by browsers and OS installers. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteConfig.name,
    short_name: siteConfig.shortName,
    description: siteConfig.description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#030303",
    theme_color: "#030303",
    icons: [
      {
        src: "/api/pwa-icon?size=192",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/api/pwa-icon?size=512",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/api/pwa-icon?size=512",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
       },
       {
         src: "/api/pwa-icon?size=512",
         sizes: "512x512",
         type: "image/png",
         purpose: "maskable",
      },
    ],
  };
}