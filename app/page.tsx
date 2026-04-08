import Link from "next/link";
import AuthButton from "@/components/AuthButton";
import { siteConfig } from "@/lib/siteConfig";

export default function Home() {
  return (
    <main className="px-4 py-8 text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/20">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
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
                  simpler front door for practice-room resources.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <p className="mb-3 text-sm text-neutral-300">
                Sign in with Google here so the app can reuse your identity on the
                reservation tools.
              </p>
              <AuthButton />
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <article className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <p className="text-sm font-medium text-blue-300">Booking Form</p>
            <h2 className="mt-3 text-2xl font-semibold">Reserve the practice room</h2>
            <p className="mt-3 text-sm leading-6 text-neutral-300">
              Use the official room booking form for the main reservation workflow.
            </p>
            <Link
              href="/booking"
              className="mt-5 inline-flex rounded-full bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-400"
            >
              Open booking page
            </Link>
          </article>

          <article className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <p className="text-sm font-medium text-blue-300">Jam Scheduler</p>
            <h2 className="mt-3 text-2xl font-semibold">Quick jam reservations</h2>
            <p className="mt-3 text-sm leading-6 text-neutral-300">
              The existing jam scheduler now lives on its own page inside this app.
            </p>
            <Link
              href="/jam"
              className="mt-5 inline-flex rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/15"
            >
              Open jam scheduler
            </Link>
          </article>

          <article className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <p className="text-sm font-medium text-blue-300">Contact</p>
            <h2 className="mt-3 text-2xl font-semibold">Get help or ask a question</h2>
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
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <article className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-2xl font-semibold">Helpful links</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
                  Group chat link can be added later with
                  {" "}
                  `NEXT_PUBLIC_TELEGRAM_GROUP_URL`.
                </div>
              )}
            </div>
          </article>

          <article className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-2xl font-semibold">Phase 1 status</h2>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-neutral-300">
              <li>Homepage added as the new front door for the app.</li>
              <li>Booking and jam pages split into dedicated routes.</li>
              <li>Google sign-in stays global so the jam scheduler keeps working.</li>
              <li>External links stay configurable so we can finish setup safely.</li>
            </ul>
          </article>
        </section>
      </div>
    </main>
  );
}