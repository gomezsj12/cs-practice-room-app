/**
 * @file Homepage for the CS Practice Room app (`/`).
 *
 * Renders three sections:
 * 1. **Hero banner** (desktop-only) — introduces the app's purpose.
 * 2. **Contact card** — embeds `ContactSupportForm` for quick support.
 * 3. **Resources card** — optional Telegram group chat (shown when
 *    `NEXT_PUBLIC_TELEGRAM_GROUP_URL` is set).
 *
 * This is a server component; dynamic client behaviour comes from
 * `ContactSupportForm` (client component imported within).
 *
 * @see {@link @/components/ContactSupportForm} — inline support form
 * @see {@link @/lib/siteConfig} — centralised public site settings
 */

import Link from "next/link";
import ContactSupportForm from "@/components/ContactSupportForm";
import { siteConfig } from "@/lib/siteConfig";

const cardClass =
  "rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/20";

/** Inline SVG for the Telegram brand icon used in the group-chat link. */
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

/** Document with signature line and pen — Terms & Conditions link. */
function SignedDocumentIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0 text-neutral-500"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M14 2v6h6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M8 12h8M8 16h5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M7.5 20c1.3-.6 2.7-.8 4.2-.4 1.6.4 3 1.2 4.3 2.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="m17.5 18.5 3.5 3.5M19 17l2 2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Video camera — Meet with us / video meeting link. */
function MeetWithUsIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0 text-neutral-500"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="3"
        y="7"
        width="10"
        height="10"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M13 8.5 19.75 6.25V17.75L13 15.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Homepage server component. */
export default function Home() {
  return (
    <main className="px-4 pb-8 pt-5 text-white">
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
            <h2 className="text-2xl font-semibold">Contact Us</h2>
            <div className="mt-3 space-y-3 text-sm leading-6 text-neutral-300">
              <p>
                Send us a message here! Feel free to ask us about reservation
                problems or any questions you may have.
              </p>
              <p>
                Also let us know if you would like to request a room closure or
                use of the CSPR drum set for an external event.
              </p>
            </div>
            <p className="mt-3 text-sm">
              <Link
                href="/support"
                className="text-blue-300 transition hover:text-blue-200"
              >
                View our replies in the support tab.
              </Link>
            </p>
            <ContactSupportForm />
          </article>

          <article className={cardClass}>
            <h2 className="text-2xl font-semibold">Resources</h2>
            <div className="mt-5 grid gap-3">
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
              <a
                href="https://cspracticeroom.fillout.com/terms_and_conditions"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-4 text-sm font-medium text-neutral-200 transition hover:border-white/25 hover:bg-white/[0.14] hover:text-white"
              >
                <SignedDocumentIcon />
                <span>Terms & Conditions</span>
              </a>
              <a
                href="https://book.morgen.so/gomezsj12737/general_meeting"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-4 text-sm font-medium text-neutral-200 transition hover:border-white/25 hover:bg-white/[0.14] hover:text-white"
              >
                <MeetWithUsIcon />
                <span>Meet with us</span>
              </a>
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
