import Link from "next/link";
import ContactSupportForm from "@/components/ContactSupportForm";
import { siteConfig } from "@/lib/siteConfig";

const cardClass =
  "rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/20";

function TelegramIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0 text-[#2AABEE]"
      fill="currentColor"
    >
      <path d="M21.2 4.8a1.3 1.3 0 0 0-1.6-.2L3.8 10.9a1.3 1.3 0 0 0 .1 2.4l3.6 1.4 1.4 4.5a1.3 1.3 0 0 0 2.2.5l2.1-2.2 3.6 2.7a1.3 1.3 0 0 0 2.1-.8l2.5-13a1.3 1.3 0 0 0-.4-1.3ZM9.8 16.3l-.8-2.7 7.4-5.8-6.6 6.8v1.7Zm7.4 1-3.1-2.3c-.2-.1-.4-.2-.7-.2l4.9-5.1-1.1 7.6Z" />
    </svg>
  );
}

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
              Send a support request from inside the app. We include your signed-in
              Google name and email so staff can reply faster.
            </p>
            <ContactSupportForm />
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
                  className="inline-flex items-center gap-2 rounded-2xl border border-[#2AABEE]/45 bg-[#2AABEE]/10 px-4 py-4 text-sm font-medium text-[#9DDCFF] transition hover:border-[#2AABEE]/70 hover:bg-[#2AABEE]/15"
                >
                  <TelegramIcon />
                  <span>CS Practice Room group chat</span>
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
