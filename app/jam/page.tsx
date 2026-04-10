/**
 * @file Jam reservation calendar page (`/jam`).
 *
 * Thin wrapper that renders the `CalendarView` client component inside a
 * centred layout section. All calendar data fetching and interaction logic
 * lives in `CalendarView` and the `/api/events` endpoint.
 *
 * @see {@link @/components/CalendarView} — FullCalendar-based interactive calendar
 * @see {@link @/app/api/events/route} — supplies merged Google Calendar + Supabase hold data
 */

import CalendarView from "@/components/CalendarView";

/** Jam reservation page — wraps the interactive CalendarView component. */
export default function JamPage() {
  return (
    <main className="px-4 pb-8 pt-5 text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section id="jam-calendar">
          <CalendarView />
        </section>
      </div>
    </main>
  );
}
