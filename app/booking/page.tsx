/**
 * @file Practice room booking page (`/booking`).
 *
 * Thin server wrapper that renders the reactive {@link BookingContent} client
 * component. All auth gating and profile fetching happens client-side via
 * `useSession()` so the page updates immediately after profile creation
 * without needing a full page refresh.
 *
 * The Fillout base URL is resolved on the server from `FILLOUT_URL` (runtime)
 * with fallbacks so you can change the embedded form in Vercel without relying
 * on `NEXT_PUBLIC_*` values baked into the client bundle at build time.
 *
 * @see {@link @/components/BookingContent}
 */

import BookingContent from "@/components/BookingContent";
import { DEFAULT_FILLOUT_URL } from "@/lib/siteConfig";

function filloutBaseUrl(): string {
  return (
    process.env.FILLOUT_URL ??
    process.env.NEXT_PUBLIC_FILLOUT_URL ??
    DEFAULT_FILLOUT_URL
  );
}

export const dynamic = "force-dynamic";

export default function BookingPage() {
  return <BookingContent filloutBaseUrl={filloutBaseUrl()} />;
}
