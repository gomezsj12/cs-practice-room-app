/**
 * @file Practice room booking page (`/booking`).
 *
 * Embeds the external Fillout form inside a full-height iframe when the
 * `NEXT_PUBLIC_FILLOUT_URL` env var is set, or shows a placeholder message
 * prompting the admin to configure it.
 *
 * The layout uses `flex-1` + viewport-height constraints so the iframe fills
 * all available space below the site header without extra scrolling.
 *
 * @see {@link @/lib/siteConfig} — exposes `filloutUrl` from env
 */

import { siteConfig } from "@/lib/siteConfig";

/** Booking page — Fillout form embed or "not configured" fallback. */
export default function BookingPage() {
  const hasEmbedUrl = Boolean(siteConfig.filloutUrl);

  return (
    <main className="px-4 py-4 text-white md:flex md:h-full md:min-h-0 md:flex-1 md:flex-col">
      <div className="mx-auto w-full max-w-7xl md:flex md:h-full md:min-h-0 md:flex-1 md:flex-col">
        {hasEmbedUrl ? (
          <section
            id="booking-form"
            className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-white/10 bg-black/20 md:h-full md:min-h-0"
          >
            <div className="flex shrink-0 justify-end border-b border-white/10 bg-black/30 px-4 py-2.5">
              <a
                href={siteConfig.filloutUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/10"
              >
                Open in browser
              </a>
            </div>

            <div className="flex min-h-0 flex-1 flex-col md:min-h-0 md:flex-1">
              <div
                className="
                  h-[min(820px,88dvh)] w-full max-md:shrink-0 overflow-hidden rounded-none
                  border-0 bg-transparent shadow-none
                  md:flex md:h-full md:min-h-0 md:flex-1 md:flex-col
                  md:min-h-[max(36rem,calc(100dvh-14rem))]
                "
              >
                <iframe
                  src={siteConfig.filloutUrl}
                  title="CS Practice Room booking form"
                  className="h-full min-h-0 w-full flex-1 border-0 bg-transparent"
                />
              </div>
            </div>
          </section>
        ) : (
          <section className="rounded-3xl border border-dashed border-white/15 bg-black/20 p-6">
            <h2 className="text-xl font-semibold">Fillout link still needed</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-300">
              Add `NEXT_PUBLIC_FILLOUT_URL` in local environment variables and in
              Vercel project settings, then this page will render the embedded form.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
