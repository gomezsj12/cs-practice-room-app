/**
 * @file Support inbox page (`/support`).
 *
 * Renders the `SupportInbox` client component inside a card that is
 * borderless on mobile (full-bleed) and gains the standard glass-card
 * styling on `md:` breakpoints and above.
 *
 * @see {@link @/components/SupportInbox}: thread list + message view
 */

import SupportInbox from "@/components/SupportInbox";

const cardClass =
  "border-0 bg-transparent p-0 shadow-none md:rounded-3xl md:border md:border-white/10 md:bg-white/5 md:p-6 md:shadow-2xl md:shadow-black/20";

/** Support page: wraps the SupportInbox in a responsive card layout. */
export default function SupportPage() {
  return (
    <main className="px-4 pb-8 pt-5 text-white">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <section className={cardClass}>
          <SupportInbox />
        </section>
      </div>
    </main>
  );
}
