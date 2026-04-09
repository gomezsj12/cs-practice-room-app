import Link from "next/link";
import { siteConfig } from "@/lib/siteConfig";

const cardClass =
  "rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/20";

export default function Home() {
  return (
    <main className="px-4 py-8 text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className={`${cardClass} hidden md:block`}>
          <div className="max-w-3xl space-y-4">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-blue-300">
              CS Practice Room
            </p>
            <div className="space-y-3">
              <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                One home for room booking, jam reservations, and student support.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-neutral-300 sm:text-lg">
                This new app keeps the existing jam reservation workflow, adds a
                dedicated booking page for the Fillout form, and gives students a
                simpler front door for practice-room resources. Sign in from the
                header when you want one Google identity across jam scheduling and
                future tools.
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <article className={cardClass}>
            <p className="text-sm font-medium text-blue-300">Contact</p>
            <h2 className="mt-3 text-2xl font-semibold">
              Get help or ask a question
            </h2>
            <p className="mt-3 text-sm leading-6 text-neutral-300">
              We can later turn this into a fuller support flow. For Phase 1, this
              gives us a simple place for contact links and student guidance.
            </p>
            {siteConfig.telegramContactUrl ? (
              <a
                href={siteConfig.telegramContactUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-5 inline-flex rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/15"
              >
                Contact on Telegram
              </a>
            ) : (
              <p className="mt-5 rounded-2xl border border-dashed border-white/15 px-4 py-3 text-sm text-neutral-400">
                Add `NEXT_PUBLIC_TELEGRAM_CONTACT_URL` later to turn this into a live
                contact button.
              </p>
            )}
          </article>

          <article className={cardClass}>
            <p className="text-sm font-medium text-blue-300">Helpful links</p>
            <h2 className="mt-3 text-2xl font-semibold">Practice room resources</h2>
            <p className="mt-3 text-sm leading-6 text-neutral-300">
              Jump to the booking form, jam calendar, or group chat when the links
              below are configured.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Link
                href="/booking"
                className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-neutral-200 transition hover:border-white/20 hover:bg-black/30"
              >
                Practice room booking form
              </Link>
              <Link
                href="/jam"
                className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-neutral-200 transition hover:border-white/20 hover:bg-black/30"
              >
                Jam reservation calendar
              </Link>
              {siteConfig.telegramGroupUrl ? (
                <a
                  href={siteConfig.telegramGroupUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-neutral-200 transition hover:border-white/20 hover:bg-black/30"
                >
                  CS Practice Room group chat
                </a>
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-4 py-4 text-sm text-neutral-400">
                  Group chat link can be added later with{" "}
                  `NEXT_PUBLIC_TELEGRAM_GROUP_URL`.
                </div>
              )}
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
