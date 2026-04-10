/**
 * @file Practice room booking page (`/booking`).
 *
 * Thin server wrapper that renders the reactive {@link BookingContent} client
 * component. All auth gating and profile fetching happens client-side via
 * `useSession()` so the page updates immediately after profile creation
 * without needing a full page refresh.
 *
 * @see {@link @/components/BookingContent}
 */

import BookingContent from "@/components/BookingContent";

export default function BookingPage() {
  return <BookingContent />;
}
